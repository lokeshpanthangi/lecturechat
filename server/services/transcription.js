import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeStatic from 'ffprobe-static';

// Set ffprobe path
ffmpeg.setFfprobePath(ffprobeStatic.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TranscriptionService {
  constructor() {
    this.openai = null;
    this.maxFileSize = 25 * 1024 * 1024; // 25MB limit for Whisper API
  }

  /**
   * Get OpenAI client instance (lazy initialization)
   * @returns {OpenAI} - OpenAI client instance
   */
  getOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return this.openai;
  }

  /**
   * Transcribe audio file using OpenAI Whisper
   * @param {string} audioPath - Path to audio file
   * @param {string} videoId - Video ID for logging
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result with text and timestamps
   */
  async transcribeAudio(audioPath, videoId, options = {}) {
    try {
      console.log(`🎤 Starting transcription for video ${videoId}`);
      console.log(`📁 Audio file: ${audioPath}`);

      // Check if file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Check file size
      const stats = fs.statSync(audioPath);
      console.log(`📊 Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      if (stats.size > this.maxFileSize) {
        console.log(`⚠️  File too large for single request, splitting...`);
        return await this.transcribeLargeFile(audioPath, videoId, options);
      }

      // Perform transcription
      const transcription = await this.performTranscription(audioPath, options);
      
      console.log(`✅ Transcription completed for video ${videoId}`);
      console.log(`📝 Transcribed ${transcription.text.length} characters`);
      
      return {
        text: transcription.text,
        segments: this.parseSegments(transcription),
        language: transcription.language || 'en',
        duration: transcription.duration || 0,
        wordCount: this.countWords(transcription.text)
      };

    } catch (error) {
      console.error(`❌ Transcription error for video ${videoId}:`, error.message);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Perform actual transcription using OpenAI Whisper API
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Raw transcription response
   */
  async performTranscription(audioPath, options = {}) {
    const defaultOptions = {
      model: 'whisper-1',
      language: 'en', // Can be auto-detected if not specified
      response_format: 'verbose_json', // Get timestamps
      temperature: 0.0 // More deterministic results
    };

    const transcriptionOptions = { ...defaultOptions, ...options };

    try {
      const audioFile = fs.createReadStream(audioPath);
      
      console.log(`🔄 Sending to OpenAI Whisper API...`);
      console.log(`⚙️  Options:`, transcriptionOptions);

      const response = await this.getOpenAI().audio.transcriptions.create({
        file: audioFile,
        ...transcriptionOptions
      });

      return response;

    } catch (error) {
      if (error.status === 413) {
        throw new Error('Audio file too large for Whisper API');
      } else if (error.status === 400) {
        throw new Error('Invalid audio file format');
      } else if (error.status === 401) {
        throw new Error('Invalid OpenAI API key');
      } else {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
    }
  }

  /**
   * Handle large files by splitting them (placeholder for future implementation)
   * @param {string} audioPath - Path to large audio file
   * @param {string} videoId - Video ID
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Combined transcription result
   */
  async transcribeLargeFile(audioPath, videoId, options = {}) {
    // For now, we'll try to transcribe as-is and let the API handle it
    // In the future, we could implement audio splitting here
    console.log(`⚠️  Large file detected, attempting direct transcription...`);
    
    try {
      return await this.performTranscription(audioPath, options);
    } catch (error) {
      throw new Error(`Large file transcription failed: ${error.message}. Consider splitting the audio file.`);
    }
  }

  /**
   * Parse segments from transcription response
   * @param {Object} transcription - Raw transcription response
   * @returns {Array} - Array of segments with timestamps
   */
  parseSegments(transcription) {
    if (!transcription.segments) {
      return [];
    }

    return transcription.segments.map((segment, index) => ({
      id: index,
      start: segment.start || 0,
      end: segment.end || 0,
      text: segment.text || '',
      confidence: segment.avg_logprob || 0
    }));
  }

  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Estimate transcription cost
   * @param {number} durationMinutes - Audio duration in minutes
   * @returns {number} - Estimated cost in USD
   */
  estimateCost(durationMinutes) {
    // OpenAI Whisper pricing: $0.006 per minute
    const costPerMinute = 0.006;
    return durationMinutes * costPerMinute;
  }

  /**
   * Estimate transcription cost from audio file
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} - Cost estimation with duration info
   */
  async estimateTranscriptionCost(audioPath) {
    try {
      // Get audio duration using ffprobe
      
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Failed to get audio duration: ${err.message}`));
            return;
          }
          
          const durationSeconds = parseFloat(metadata.format.duration) || 0;
          const durationMinutes = durationSeconds / 60;
          const estimatedCost = this.estimateCost(durationMinutes);
          
          resolve({
            durationSeconds,
            durationMinutes: Math.round(durationMinutes * 100) / 100,
            estimatedCost: Math.round(estimatedCost * 1000) / 1000,
            currency: 'USD'
          });
        });
      });
    } catch (error) {
      throw new Error(`Cost estimation failed: ${error.message}`);
    }
  }

  /**
   * Validate audio file for transcription
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} - Validation result
   */
  async validateAudioFile(audioPath) {
    try {
      if (!fs.existsSync(audioPath)) {
        return { valid: false, error: 'File does not exist' };
      }

      const stats = fs.statSync(audioPath);
      
      if (stats.size === 0) {
        return { valid: false, error: 'File is empty' };
      }

      if (stats.size > this.maxFileSize) {
        return { 
          valid: true, 
          warning: `File size (${(stats.size / 1024 / 1024).toFixed(2)} MB) exceeds recommended limit (25 MB)` 
        };
      }

      return { valid: true };

    } catch (error) {
      return { valid: false, error: `Validation error: ${error.message}` };
    }
  }

  /**
   * Test OpenAI connection
   * @returns {Promise<boolean>} - Connection status
   */
  async testConnection() {
    try {
      console.log('🔌 Testing OpenAI connection...');
      
      // Test with a simple API call
      const response = await this.getOpenAI().models.list();
      console.log('✅ OpenAI connection successful');
      
      return true;
      
    } catch (error) {
      console.error('❌ OpenAI connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get supported audio formats
   * @returns {Array} - List of supported formats
   */
  getSupportedFormats() {
    return [
      'mp3', 'mp4', 'm4a', 'wav', 'webm', 
      'mpga', 'mpeg', 'ogg', 'oga', 'flac'
    ];
  }
}

export default TranscriptionService;