import AudioExtractor from './audioExtractor.js';
import TranscriptionService from './transcription.js';
import TextChunker from './textChunker.js';
import EmbeddingService from './embeddingService.js';
import PineconeService from './pineconeService.js';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs/promises';

class ProcessingService {
  constructor() {
    this.audioExtractor = new AudioExtractor();
    this.transcriptionService = new TranscriptionService();
    this.textChunker = new TextChunker();
    this.embeddingService = new EmbeddingService();
    this.pineconeService = new PineconeService();
    
    // Initialize Supabase client lazily
    this.supabase = null;
    
    this.processingStages = {
      UPLOADING: 'uploading',
      EXTRACTING_AUDIO: 'extracting_audio',
      TRANSCRIBING: 'transcribing',
      CHUNKING: 'chunking',
      EMBEDDING: 'embedding',
      STORING: 'storing',
      COMPLETED: 'completed',
      FAILED: 'failed'
    };
  }

  /**
   * Get Supabase client instance (lazy initialization)
   * @returns {SupabaseClient} - Supabase client
   */
  getSupabase() {
    if (!this.supabase) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
    }
    return this.supabase;
  }

  /**
   * Process uploaded file (video or audio) through the complete RAG pipeline
   * @param {string} filePath - Path to uploaded file
   * @param {Object} metadata - File metadata (title, subject, description)
   * @param {string} videoId - Video ID from database
   * @returns {Promise<Object>} - Processing result
   */
  async processFile(filePath, metadata, videoId) {
    let audioPath = null;
    
    try {
      console.log(`🚀 Starting processing pipeline for video ${videoId}`);
      console.log(`📁 File: ${filePath}`);
      console.log(`📋 Metadata:`, metadata);
      
      // Update status to extracting audio
      await this.updateProcessingStatus(videoId, this.processingStages.EXTRACTING_AUDIO, 10);
      
      // Step 1: Extract or process audio
      console.log('\n🎵 Step 1: Audio Extraction/Processing');
      audioPath = await this.extractAudio(filePath, videoId);
      
      // Update status to transcribing
      await this.updateProcessingStatus(videoId, this.processingStages.TRANSCRIBING, 25);
      
      // Step 2: Transcribe audio to text
      console.log('\n📝 Step 2: Audio Transcription');
      const transcriptionResult = await this.transcribeAudio(audioPath, videoId);
      
      // Update status to chunking
      await this.updateProcessingStatus(videoId, this.processingStages.CHUNKING, 50);
      
      // Step 3: Chunk the transcribed text
      console.log('\n✂️  Step 3: Text Chunking');
      const chunks = await this.chunkText(transcriptionResult, videoId);
      
      // Update status to embedding
      await this.updateProcessingStatus(videoId, this.processingStages.EMBEDDING, 70);
      
      // Step 4: Generate embeddings for chunks
      console.log('\n🧠 Step 4: Embedding Generation');
      const chunksWithEmbeddings = await this.generateEmbeddings(chunks, videoId);
      
      // Update status to storing
      await this.updateProcessingStatus(videoId, this.processingStages.STORING, 85);
      
      // Step 5: Store in Pinecone
      console.log('\n📤 Step 5: Vector Storage');
      const storageResult = await this.storeInPinecone(videoId, chunksWithEmbeddings, metadata);
      
      // Step 6: Save to database
      console.log('\n💾 Step 6: Database Storage');
      await this.saveToDatabase(videoId, transcriptionResult, chunks, storageResult);
      
      // Update status to completed
      await this.updateProcessingStatus(videoId, this.processingStages.COMPLETED, 100);
      
      // Cleanup temporary files
      await this.cleanup(audioPath, filePath);
      
      const result = {
        success: true,
        videoId: videoId,
        transcription: {
          text: transcriptionResult.text,
          duration: transcriptionResult.duration,
          segments: transcriptionResult.segments?.length || 0
        },
        chunks: {
          total: chunks.length,
          withEmbeddings: chunksWithEmbeddings.filter(c => c.embedding).length
        },
        storage: storageResult,
        processingTime: Date.now() - this.startTime
      };
      
      console.log('\n✅ Processing pipeline completed successfully!');
      console.log('📊 Final Results:', result);
      
      return result;
      
    } catch (error) {
      console.error('❌ Processing pipeline failed:', error.message);
      
      // Update status to failed
      await this.updateProcessingStatus(
        videoId, 
        this.processingStages.FAILED, 
        0, 
        error.message
      );
      
      // Cleanup on failure
      if (audioPath) {
        await this.cleanup(audioPath, filePath);
      }
      
      throw new Error(`Processing failed: ${error.message}`);
    }
  }

  /**
   * Extract audio from video file or process audio file directly
   * @param {string} filePath - Input file path
   * @param {string} videoId - Video ID
   * @returns {Promise<string>} - Audio file path
   */
  async extractAudio(filePath, videoId) {
    try {
      const isVideo = await this.audioExtractor.isVideoFile(filePath);
      
      if (isVideo) {
        console.log('🎬 Processing video file - extracting audio...');
        const audioPath = await this.audioExtractor.extractAudio(filePath, videoId);
        console.log(`✅ Audio extracted to: ${audioPath}`);
        return audioPath;
      } else {
        console.log('🎵 Processing audio file directly...');
        // For audio files, we might still need to convert format for Whisper
        const audioInfo = await this.audioExtractor.getAudioInfo(filePath);
        console.log('📊 Audio info:', audioInfo);
        
        // Convert to optimal format for Whisper if needed
        const optimizedPath = await this.audioExtractor.extractAudio(filePath, videoId);
        console.log(`✅ Audio optimized for transcription: ${optimizedPath}`);
        return optimizedPath;
      }
    } catch (error) {
      console.error('❌ Audio extraction failed:', error.message);
      throw new Error(`Audio extraction failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio file to text
   * @param {string} audioPath - Audio file path
   * @param {string} videoId - Video ID
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeAudio(audioPath, videoId) {
    try {
      console.log('🎤 Starting transcription...');
      
      // Estimate cost before transcription
      const costEstimate = await this.transcriptionService.estimateTranscriptionCost(audioPath);
      console.log('💰 Estimated cost:', costEstimate);
      
      // Perform transcription
      const transcriptionResult = await this.transcriptionService.transcribeAudio(audioPath, videoId);
      
      console.log('✅ Transcription completed');
      console.log(`📝 Text length: ${transcriptionResult.text.length} characters`);
      console.log(`⏱️  Duration: ${transcriptionResult.duration} seconds`);
      console.log(`🎯 Segments: ${transcriptionResult.segments?.length || 0}`);
      
      return transcriptionResult;
      
    } catch (error) {
      console.error('❌ Transcription failed:', error.message);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Chunk transcribed text into semantic pieces
   * @param {Object} transcriptionResult - Transcription result
   * @param {string} videoId - Video ID
   * @returns {Promise<Array>} - Text chunks
   */
  async chunkText(transcriptionResult, videoId) {
    try {
      console.log('✂️  Starting text chunking...');
      
      // Get optimal chunking parameters based on text length
      const optimalParams = this.textChunker.getOptimalParameters(transcriptionResult.text.length);
      console.log('🎯 Optimal chunking parameters:', optimalParams);
      
      // Chunk the text
      const chunks = await this.textChunker.chunkText(
        transcriptionResult.text,
        transcriptionResult.segments,
        optimalParams
      );
      
      console.log(`✅ Text chunking completed: ${chunks.length} chunks created`);
      
      return chunks;
      
    } catch (error) {
      console.error('❌ Text chunking failed:', error.message);
      throw new Error(`Text chunking failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text chunks
   * @param {Array} chunks - Text chunks
   * @param {string} videoId - Video ID
   * @returns {Promise<Array>} - Chunks with embeddings
   */
  async generateEmbeddings(chunks, videoId) {
    try {
      console.log('🧠 Starting embedding generation...');
      
      // Estimate cost
      const costEstimate = this.embeddingService.estimateCost(chunks);
      console.log('💰 Estimated embedding cost:', costEstimate);
      
      // Generate embeddings
      const chunksWithEmbeddings = await this.embeddingService.generateEmbeddings(chunks);
      
      console.log(`✅ Embedding generation completed`);
      
      return chunksWithEmbeddings;
      
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Store chunks with embeddings in Pinecone
   * @param {string} videoId - Video ID
   * @param {Array} chunksWithEmbeddings - Chunks with embeddings
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Storage result
   */
  async storeInPinecone(videoId, chunksWithEmbeddings, metadata) {
    try {
      console.log('📤 Starting Pinecone storage...');
      
      // Initialize Pinecone if needed
      const firstChunk = chunksWithEmbeddings.find(c => c.embedding);
      if (firstChunk) {
        await this.pineconeService.initializeIndex(firstChunk.embedding.length);
      }
      
      // Store chunks
      const storageResult = await this.pineconeService.storeChunks(
        videoId,
        chunksWithEmbeddings,
        {
          title: metadata.title,
          subject: metadata.subject,
          description: metadata.description
        }
      );
      
      console.log('✅ Pinecone storage completed');
      
      return storageResult;
      
    } catch (error) {
      console.error('❌ Pinecone storage failed:', error.message);
      throw new Error(`Pinecone storage failed: ${error.message}`);
    }
  }

  /**
   * Save processing results to database
   * @param {string} videoId - Video ID
   * @param {Object} transcriptionResult - Transcription result
   * @param {Array} chunks - Text chunks
   * @param {Object} storageResult - Pinecone storage result
   * @returns {Promise<void>}
   */
  async saveToDatabase(videoId, transcriptionResult, chunks, storageResult) {
    try {
      console.log('💾 Saving to database...');
      
      // Save transcript and get its ID
      const { data: transcriptData, error: transcriptError } = await this.getSupabase()
        .from('transcripts')
        .insert({
          video_id: videoId,
          full_text: transcriptionResult.text,
          language: transcriptionResult.language || 'en',
          processing_time_seconds: Math.round(transcriptionResult.duration || 0),
          word_count: transcriptionResult.text ? transcriptionResult.text.split(' ').length : 0,
          confidence: transcriptionResult.confidence || null
        })
        .select('id')
        .single();
      
      if (transcriptError) {
        console.error('Full transcript error object:', transcriptError);
        throw new Error(`Transcript save failed: ${transcriptError.message || transcriptError.details || JSON.stringify(transcriptError)}`);
      }
      
      const transcriptId = transcriptData.id;
      
      // Save text chunks
      const chunkRecords = chunks.map(chunk => ({
        video_id: videoId,
        transcript_id: transcriptId,
        chunk_index: chunk.index,
        chunk_text: chunk.text,
        start_time: chunk.startTime,
        end_time: chunk.endTime,
        embedding_model: chunk.embeddingModel || 'text-embedding-3-small',
        chunk_length: chunk.text ? chunk.text.length : 0,
        pinecone_id: chunk.pineconeId || null,
        has_embedding: !!(chunk.embedding && chunk.pineconeId)
      }));
      
      const { error: chunksError } = await this.getSupabase()
        .from('text_chunks')
        .insert(chunkRecords);
      
      if (chunksError) {
        console.error('Full chunks error object:', chunksError);
        throw new Error(`Chunks save failed: ${chunksError.message || chunksError.details || JSON.stringify(chunksError)}`);
      }
      
      console.log('✅ Database save completed');
      
    } catch (error) {
      console.error('❌ Database save failed:', error.message);
      throw new Error(`Database save failed: ${error.message}`);
    }
  }

  /**
   * Update processing status in database
   * @param {string} videoId - Video ID
   * @param {string} stage - Processing stage
   * @param {number} progress - Progress percentage
   * @param {string} errorMessage - Error message if any
   * @returns {Promise<void>}
   */
  async updateProcessingStatus(videoId, stage, progress, errorMessage = null) {
    try {
      const updateData = {
        processing_stage: stage,
        processing_progress: progress,
        updated_at: new Date().toISOString()
      };
      
      if (errorMessage) {
        updateData.error_message = errorMessage;
      }
      
      if (stage === this.processingStages.COMPLETED) {
        updateData.status = 'ready';
      } else if (stage === this.processingStages.FAILED) {
        updateData.status = 'failed';
      } else {
        updateData.status = 'processing';
      }
      
      const { error } = await this.getSupabase()
        .from('videos')
        .update(updateData)
        .eq('id', videoId);
      
      if (error) {
        console.error('Status update failed:', error.message);
      } else {
        console.log(`📊 Status updated: ${stage} (${progress}%)`);
      }
      
    } catch (error) {
      console.error('Status update error:', error.message);
    }
  }

  /**
   * Cleanup temporary files
   * @param {string} audioPath - Audio file path
   * @param {string} originalPath - Original file path
   * @returns {Promise<void>}
   */
  async cleanup(audioPath, originalPath) {
    try {
      console.log('🧹 Cleaning up temporary files...');
      
      // Clean up extracted audio file
      if (audioPath && audioPath !== originalPath) {
        await this.audioExtractor.cleanup(audioPath);
      }
      
      console.log('✅ Cleanup completed');
      
    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error.message);
    }
  }

  /**
   * Get processing status for a video
   * @param {string} videoId - Video ID
   * @returns {Promise<Object>} - Processing status
   */
  async getProcessingStatus(videoId) {
    try {
      const { data, error } = await this.getSupabase()
        .from('videos')
        .select('status, processing_stage, processing_progress, error_message')
        .eq('id', videoId)
        .single();
      
      if (error) {
        throw new Error(`Status retrieval failed: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      console.error('❌ Status retrieval error:', error.message);
      throw error;
    }
  }

  /**
   * Test all services connectivity
   * @returns {Promise<Object>} - Service status
   */
  async testServices() {
    const results = {
      supabase: false,
      openai: false,
      pinecone: false,
      ffmpeg: false
    };
    
    try {
      // Test Supabase
      const { error: supabaseError } = await this.getSupabase()
        .from('videos')
        .select('id')
        .limit(1);
      results.supabase = !supabaseError;
      
      // Test OpenAI (both transcription and embedding)
      results.openai = await this.transcriptionService.testConnection() && 
                      await this.embeddingService.testConnection();
      
      // Test Pinecone
      results.pinecone = await this.pineconeService.testConnection();
      
      // Test FFmpeg
      results.ffmpeg = await this.audioExtractor.testFFmpeg();
      
    } catch (error) {
      console.error('Service test error:', error.message);
    }
    
    return results;
  }
}

export default ProcessingService;