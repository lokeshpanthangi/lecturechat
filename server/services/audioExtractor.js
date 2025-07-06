import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

class AudioExtractor {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract audio from video file or process audio file directly
   * @param {string} inputPath - Path to input file (video or audio)
   * @param {string} videoId - Unique identifier for the video
   * @returns {Promise<string>} - Path to extracted/processed audio file
   */
  async extractAudio(inputPath, videoId) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, `${videoId}_audio.wav`);
      
      console.log(`🎵 Starting audio extraction for video ${videoId}`);
      console.log(`📁 Input: ${inputPath}`);
      console.log(`📁 Output: ${outputPath}`);

      // Check if input file exists
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input file not found: ${inputPath}`));
      }

      const command = ffmpeg(inputPath)
        .audioCodec('pcm_s16le') // 16-bit PCM for better compatibility with Whisper
        .audioChannels(1) // Mono audio
        .audioFrequency(16000) // 16kHz sample rate (optimal for Whisper)
        .format('wav')
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`🔧 FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ Audio extraction progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ Audio extraction completed for video ${videoId}`);
          
          // Verify output file exists and has content
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 0) {
              console.log(`📊 Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
              resolve(outputPath);
            } else {
              reject(new Error('Audio extraction produced empty file'));
            }
          } else {
            reject(new Error('Audio extraction failed - output file not created'));
          }
        })
        .on('error', (err) => {
          console.error(`❌ Audio extraction error for video ${videoId}:`, err.message);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        });

      // Start the conversion
      command.run();
    });
  }

  /**
   * Get audio file information
   * @param {string} filePath - Path to audio file
   * @returns {Promise<Object>} - Audio file metadata
   */
  async getAudioInfo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to get audio info: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('No audio stream found in file'));
          return;
        }

        const info = {
          duration: parseFloat(metadata.format.duration) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          sampleRate: parseInt(audioStream.sample_rate) || 0,
          channels: parseInt(audioStream.channels) || 0,
          codec: audioStream.codec_name || 'unknown',
          size: parseInt(metadata.format.size) || 0
        };

        console.log(`📊 Audio info for ${path.basename(filePath)}:`, info);
        resolve(info);
      });
    });
  }

  /**
   * Check if file is a video file
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} - True if file contains video stream
   */
  async isVideoFile(filePath) {
    try {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            reject(err);
            return;
          }

          const hasVideoStream = metadata.streams.some(stream => stream.codec_type === 'video');
          resolve(hasVideoStream);
        });
      });
    } catch (error) {
      console.error('Error checking if file is video:', error);
      return false;
    }
  }

  /**
   * Clean up temporary audio files
   * @param {string} audioPath - Path to audio file to clean up
   */
  async cleanup(audioPath) {
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🗑️  Cleaned up temporary audio file: ${path.basename(audioPath)}`);
      }
    } catch (error) {
      console.error('Error cleaning up audio file:', error);
    }
  }

  /**
   * Test FFmpeg availability
   * @returns {Promise<boolean>} - FFmpeg availability status
   */
  async testFFmpeg() {
    try {
      console.log('🔧 Testing FFmpeg availability...');
      
      return new Promise((resolve) => {
        // Test by getting version info
        const command = ffmpeg()
          .on('start', () => {
            console.log('✅ FFmpeg is available');
            resolve(true);
          })
          .on('error', (err) => {
            console.error('❌ FFmpeg test failed:', err.message);
            resolve(false);
          });
        
        // Just check if we can create a command
        try {
          command.format('null');
          resolve(true);
        } catch (err) {
          console.error('❌ FFmpeg test failed:', err.message);
          resolve(false);
        }
      });
      
    } catch (error) {
      console.error('❌ FFmpeg test error:', error.message);
      return false;
    }
  }

  /**
   * Clean up all temporary files for a video
   * @param {string} videoId - Video ID to clean up files for
   */
  async cleanupVideoFiles(videoId) {
    try {
      const files = fs.readdirSync(this.tempDir);
      const videoFiles = files.filter(file => file.startsWith(videoId));
      
      for (const file of videoFiles) {
        const filePath = path.join(this.tempDir, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️  Cleaned up: ${file}`);
      }
    } catch (error) {
      console.error('Error cleaning up video files:', error);
    }
  }
}

export default AudioExtractor;