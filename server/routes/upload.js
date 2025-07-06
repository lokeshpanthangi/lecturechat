import express from 'express';
import multer from 'multer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import ProcessingService from '../services/processingService.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB limit
  },
  fileFilter: function (req, file, cb) {
    // Allowed file types
    const allowedTypes = [
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/quicktime',
      'video/mpeg',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'audio/aac'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video and audio files are allowed.'), false);
    }
  }
});

/**
 * POST /api/upload
 * Handle file upload and start processing pipeline
 */
router.post('/', upload.single('file'), async (req, res) => {
  let videoId = null;
  let filePath = null;
  
  try {
    console.log('📤 Upload request received');
    
    // Validate request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const { title, subject, description } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }
    
    filePath = req.file.path;
    const fileSize = req.file.size;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    console.log('📁 File details:');
    console.log(`   • Original name: ${originalName}`);
    console.log(`   • Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   • Type: ${mimeType}`);
    console.log(`   • Path: ${filePath}`);
    
    // Upload file to Supabase storage
    console.log('☁️ Uploading to Supabase storage...');
    const fileBuffer = await fs.readFile(filePath);
    const storageFileName = `${uuidv4()}-${originalName}`;
    
    const { data: uploadData, error: uploadError } = await getSupabase()
      .storage
      .from('lecture-videos')
      .upload(storageFileName, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });
    
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
    
    console.log(`✅ File uploaded to storage: ${storageFileName}`);
    
    // Clean up local file after successful upload
    await fs.unlink(filePath);
    
    // Create video record in database
    console.log('💾 Creating video record...');
    
    const { data: videoData, error: insertError } = await getSupabase()
      .from('videos')
      .insert({
        title: title,
        subject: subject,
        description: description || '',
        file_name: originalName,
        file_path: storageFileName,
        file_size: fileSize,
        file_type: mimeType,
        status: 'processing',
        processing_stage: 'uploading',
        processing_progress: 5,
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }
    
    videoId = videoData.id;
    console.log(`✅ Video record created with ID: ${videoId}`);
    
    // Return immediate response to client
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully. Processing started.',
      videoId: videoId,
      fileName: originalName,
      fileSize: fileSize,
      processingStatus: {
        stage: 'uploading',
        progress: 5
      }
    });
    
    // Start processing pipeline asynchronously
    console.log('🚀 Starting processing pipeline...');
    
    setImmediate(async () => {
      try {
        const metadata = {
          title: title,
          subject: subject,
          description: description || '',
          originalName: originalName,
          fileSize: fileSize,
          mimeType: mimeType
        };
        
        // Download file from storage for processing
        const { data: fileData, error: downloadError } = await getSupabase()
          .storage
          .from('lecture-videos')
          .download(storageFileName);
        
        if (downloadError) {
          throw new Error(`Failed to download file for processing: ${downloadError.message}`);
        }
        
        // Ensure temp directory exists
        await fs.mkdir('temp', { recursive: true });
        
        // Create temporary file for processing
        const tempFilePath = path.join('temp', `processing-${videoId}-${originalName}`);
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(tempFilePath, buffer);
        
        await processingService.processFile(tempFilePath, metadata, videoId);
        
        // Clean up temporary file after processing
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn('Temp file cleanup warning:', cleanupError.message);
        }
        
        console.log(`✅ Processing completed for video ${videoId}`);
        
      } catch (processingError) {
        console.error(`❌ Processing failed for video ${videoId}:`, processingError.message);
        
        // Update status to failed
        await getSupabase()
          .from('videos')
          .update({
            status: 'failed',
            processing_stage: 'failed',
            error_message: processingError.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', videoId);
        
        // Clean up storage file on processing failure
        try {
          await getSupabase()
            .storage
            .from('lecture-videos')
            .remove([storageFileName]);
        } catch (cleanupError) {
          console.error('Storage cleanup error:', cleanupError.message);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    
    // Clean up on error
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError.message);
      }
    }
    
    // Update database if video record was created
    if (videoId) {
      try {
        await getSupabase()
          .from('videos')
          .update({
            status: 'failed',
            processing_stage: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', videoId);
      } catch (dbError) {
        console.error('Database update error:', dbError.message);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/upload/status/:videoId
 * Get processing status for a video
 */
router.get('/status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`📊 Status request for video: ${videoId}`);
    
    const { data, error } = await getSupabase()
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
    
    res.json({
      success: true,
      video: data
    });
    
  } catch (error) {
    console.error('❌ Status retrieval error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/upload/test-services
 * Test all service connections
 */
router.get('/test-services', async (req, res) => {
  try {
    console.log('🔧 Testing service connections...');
    
    const serviceStatus = await processingService.testServices();
    
    const allServicesWorking = Object.values(serviceStatus).every(status => status === true);
    
    res.json({
      success: true,
      allServicesWorking: allServicesWorking,
      services: serviceStatus
    });
    
  } catch (error) {
    console.error('❌ Service test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/upload/:videoId
 * Delete a video and its associated data
 */
router.delete('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`🗑️  Delete request for video: ${videoId}`);
    
    // Delete from Pinecone first
    try {
      await processingService.pineconeService.deleteVideoVectors(videoId);
      console.log('✅ Pinecone vectors deleted');
    } catch (pineconeError) {
      console.warn('⚠️  Pinecone deletion warning:', pineconeError.message);
    }
    
    // Delete from database (cascading deletes will handle related records)
    const { error: deleteError } = await getSupabase()
      .from('videos')
      .delete()
      .eq('id', videoId);
    
    if (deleteError) {
      throw new Error(`Database deletion failed: ${deleteError.message}`);
    }
    
    console.log('✅ Video deleted successfully');
    
    res.json({
      success: true,
      message: 'Video deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Deletion error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/upload/stats
 * Get upload and processing statistics
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Stats request received');
    
    // Get video counts by status
    const { data: statusCounts, error: statusError } = await getSupabase()
      .from('videos')
      .select('status')
      .then(result => {
        if (result.error) throw result.error;
        
        const counts = {
          total: result.data.length,
          ready: 0,
          processing: 0,
          failed: 0
        };
        
        result.data.forEach(video => {
          counts[video.status] = (counts[video.status] || 0) + 1;
        });
        
        return { data: counts, error: null };
      });
    
    if (statusError) {
      throw new Error(statusError.message);
    }
    
    // Get Pinecone stats
    let pineconeStats = null;
    try {
      pineconeStats = await processingService.pineconeService.getIndexStats();
    } catch (pineconeError) {
      console.warn('⚠️  Pinecone stats warning:', pineconeError.message);
    }
    
    res.json({
      success: true,
      stats: {
        videos: statusCounts,
        pinecone: pineconeStats
      }
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;