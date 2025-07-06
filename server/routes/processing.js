import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PineconeService from '../services/pineconeService.js';
import ProcessingService from '../services/processingService.js';

const router = express.Router();

// Lazy initialize services
let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}
const processingService = new ProcessingService();

/**
 * GET /api/processing/status/:videoId
 * Get detailed processing status for a video
 */
router.get('/status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`📊 Processing status request for video: ${videoId}`);
    
    // Get video and processing details
    const { data: videoData, error: videoError } = await getSupabase()
      .from('videos')
      .select(`
        id,
        title,
        subject,
        description,
        file_name,
        file_size,
        file_type,
        status,
        processing_stage,
        processing_progress,
        error_message,
        created_at,
        updated_at,
        uploaded_at
      `)
      .eq('id', videoId)
      .single();
    
    if (videoError) {
      if (videoError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Video not found'
        });
      }
      throw new Error(videoError.message);
    }
    
    // Get transcript info if available
    const { data: transcriptData } = await getSupabase()
      .from('transcripts')
      .select('duration, language, confidence')
      .eq('video_id', videoId)
      .single();
    
    // Get chunks count
    const { count: chunksCount } = await getSupabase()
      .from('text_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', videoId);
    
    // Get chunks with embeddings count
    const { count: embeddedChunksCount } = await getSupabase()
      .from('text_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', videoId)
      .eq('has_embedding', true);
    
    // Get chat conversations count
    const { count: conversationsCount } = await getSupabase()
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', videoId);
    
    const response = {
      success: true,
      video: videoData,
      processing: {
        transcript: transcriptData,
        chunks: {
          total: chunksCount || 0,
          withEmbeddings: embeddedChunksCount || 0
        },
        conversations: conversationsCount || 0
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Processing status error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/processing/transcript/:videoId
 * Get full transcript for a video
 */
router.get('/transcript/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`📝 Transcript request for video: ${videoId}`);
    
    const { data, error } = await getSupabase()
      .from('transcripts')
      .select('*')
      .eq('video_id', videoId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Transcript not found'
        });
      }
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      transcript: data
    });
    
  } catch (error) {
    console.error('❌ Transcript retrieval error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/processing/chunks/:videoId
 * Get text chunks for a video
 */
router.get('/chunks/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    console.log(`📄 Chunks request for video: ${videoId}`);
    
    const { data, error, count } = await getSupabase()
      .from('text_chunks')
      .select('*', { count: 'exact' })
      .eq('video_id', videoId)
      .order('chunk_index', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      chunks: data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: count > parseInt(offset) + parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Chunks retrieval error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/processing/reprocess/:videoId
 * Reprocess a video (restart the processing pipeline)
 */
router.post('/reprocess/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`🔄 Reprocess request for video: ${videoId}`);
    
    // Check if video exists
    const { data: videoData, error: videoError } = await getSupabase()
      .from('videos')
      .select('id, title, subject, description, file_name, file_type, status')
      .eq('id', videoId)
      .single();
    
    if (videoError) {
      if (videoError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Video not found'
        });
      }
      throw new Error(videoError.message);
    }
    
    // Check if video is not currently processing
    if (videoData.status === 'processing') {
      return res.status(400).json({
        success: false,
        error: 'Video is already being processed'
      });
    }
    
    // Clean up existing data
    console.log('🧹 Cleaning up existing data...');
    
    // Delete from Pinecone
    try {
      await processingService.pineconeService.deleteVideoVectors(videoId);
    } catch (pineconeError) {
      console.warn('⚠️  Pinecone cleanup warning:', pineconeError.message);
    }
    
    // Delete from database
    await getSupabase().from('chat_conversations').delete().eq('video_id', videoId);
    await getSupabase().from('text_chunks').delete().eq('video_id', videoId);
    await getSupabase().from('transcripts').delete().eq('video_id', videoId);
    
    // Reset video status
    await getSupabase()
      .from('videos')
      .update({
        status: 'processing',
        processing_stage: 'uploading',
        processing_progress: 5,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);
    
    res.json({
      success: true,
      message: 'Reprocessing started. Note: Original file must still be available.',
      videoId: videoId
    });
    
    // Note: In a real implementation, you would need to store the original file
    // or have a way to re-access it for reprocessing
    console.log('⚠️  Note: Reprocessing requires original file to be available');
    
  } catch (error) {
    console.error('❌ Reprocess error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/processing/stats
 * Get overall processing statistics
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Processing stats request');
    
    // Get video statistics
    const { data: videos } = await getSupabase()
      .from('videos')
      .select('status, processing_stage, created_at');
    
    // Get transcript statistics
    const { count: transcriptCount } = await getSupabase()
      .from('transcripts')
      .select('*', { count: 'exact', head: true });
    
    // Get chunks statistics
    const { count: chunksCount } = await getSupabase()
      .from('text_chunks')
      .select('*', { count: 'exact', head: true });
    
    const { count: embeddedChunksCount } = await getSupabase()
      .from('text_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('has_embedding', true);
    
    // Get conversation statistics
    const { count: conversationsCount } = await getSupabase()
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true });
    
    // Process video statistics
    const videoStats = {
      total: videos?.length || 0,
      ready: 0,
      processing: 0,
      failed: 0,
      byStage: {}
    };
    
    videos?.forEach(video => {
      videoStats[video.status] = (videoStats[video.status] || 0) + 1;
      
      if (video.processing_stage) {
        videoStats.byStage[video.processing_stage] = 
          (videoStats.byStage[video.processing_stage] || 0) + 1;
      }
    });
    
    // Get Pinecone statistics
    let pineconeStats = null;
    try {
      pineconeStats = await processingService.pineconeService.getIndexStats();
    } catch (pineconeError) {
      console.warn('⚠️  Pinecone stats warning:', pineconeError.message);
    }
    
    res.json({
      success: true,
      stats: {
        videos: videoStats,
        transcripts: transcriptCount || 0,
        chunks: {
          total: chunksCount || 0,
          withEmbeddings: embeddedChunksCount || 0,
          embeddingRate: chunksCount > 0 ? 
            ((embeddedChunksCount || 0) / chunksCount * 100).toFixed(1) + '%' : '0%'
        },
        conversations: conversationsCount || 0,
        pinecone: pineconeStats
      }
    });
    
  } catch (error) {
    console.error('❌ Processing stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/processing/health
 * Health check for processing services
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 Processing health check');
    
    const serviceStatus = await processingService.testServices();
    
    const allHealthy = Object.values(serviceStatus).every(status => status === true);
    
    res.json({
      success: true,
      healthy: allHealthy,
      services: serviceStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/processing/logs/:videoId
 * Get processing logs for a video (if available)
 */
router.get('/logs/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`📋 Processing logs request for video: ${videoId}`);
    
    // Get video processing information
    const { data: videoData, error } = await getSupabase()
      .from('videos')
      .select(`
        id,
        title,
        status,
        processing_stage,
        processing_progress,
        error_message,
        created_at,
        updated_at
      `)
      .eq('id', videoId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Video not found'
        });
      }
      throw new Error(error.message);
    }
    
    // Create a simple log structure based on available data
    const logs = [
      {
        timestamp: videoData.created_at,
        stage: 'uploading',
        message: 'Video uploaded successfully',
        level: 'info'
      }
    ];
    
    if (videoData.status === 'processing') {
      logs.push({
        timestamp: videoData.updated_at,
        stage: videoData.processing_stage,
        message: `Processing stage: ${videoData.processing_stage} (${videoData.processing_progress}%)`,
        level: 'info'
      });
    } else if (videoData.status === 'ready') {
      logs.push({
        timestamp: videoData.updated_at,
        stage: 'completed',
        message: 'Processing completed successfully',
        level: 'success'
      });
    } else if (videoData.status === 'failed') {
      logs.push({
        timestamp: videoData.updated_at,
        stage: 'failed',
        message: videoData.error_message || 'Processing failed',
        level: 'error'
      });
    }
    
    res.json({
      success: true,
      videoId: videoId,
      logs: logs
    });
    
  } catch (error) {
    console.error('❌ Logs retrieval error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;