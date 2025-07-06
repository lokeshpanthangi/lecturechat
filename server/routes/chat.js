import express from 'express';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import EmbeddingService from '../services/embeddingService.js';
import PineconeService from '../services/pineconeService.js';

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

const embeddingService = new EmbeddingService();
const pineconeService = new PineconeService();
let openai = null;

/**
 * Get OpenAI client instance (lazy initialization)
 * @returns {OpenAI} - OpenAI client
 */
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * POST /api/chat
 * Handle chat messages and provide RAG-based responses
 */
router.post('/', async (req, res) => {
  try {
    const { message, videoId, conversationId } = req.body;
    
    console.log('💬 Chat request received:');
    console.log(`   • Message: ${message}`);
    console.log(`   • Video ID: ${videoId}`);
    console.log(`   • Conversation ID: ${conversationId}`);
    
    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Video ID is required'
      });
    }
    
    // Check if video exists and is ready
    const { data: videoData, error: videoError } = await getSupabase()
      .from('videos')
      .select('id, title, subject, status, processing_stage')
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
    
    if (videoData.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Video is not ready for chat. Current status: ${videoData.status}`,
        processingStage: videoData.processing_stage
      });
    }
    
    // Generate response using RAG
    const response = await generateRAGResponse(message, videoId, videoData);
    
    // Save conversation to database
    const conversationRecord = await saveConversation(
      videoId, 
      conversationId, 
      message, 
      response
    );
    
    res.json({
      success: true,
      response: response.text,
      timestamps: response.timestamps,
      sources: response.sources,
      conversationId: conversationRecord.conversation_id,
      messageId: conversationRecord.id
    });
    
  } catch (error) {
    console.error('❌ Chat error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate RAG-based response
 * @param {string} message - User message
 * @param {string} videoId - Video ID
 * @param {Object} videoData - Video metadata
 * @returns {Promise<Object>} - Response with text, timestamps, and sources
 */
async function generateRAGResponse(message, videoId, videoData) {
  try {
    console.log('🧠 Generating RAG response...');
    
    // Step 1: Generate embedding for the user's message
    console.log('🔍 Step 1: Generating query embedding...');
    const queryEmbedding = await embeddingService.generateQueryEmbedding(message);
    
    // Step 2: Search for relevant chunks in Pinecone
    console.log('📊 Step 2: Searching for relevant content...');
    const searchResults = await pineconeService.searchSimilar(queryEmbedding, {
      videoId: videoId,
      topK: 5,
      minScore: 0.3
    });
    
    if (searchResults.length === 0) {
      console.log('⚠️  No relevant content found with current threshold, trying with lower threshold...');
      
      // Try again with an even lower threshold
      const fallbackResults = await pineconeService.searchSimilar(queryEmbedding, {
        videoId: videoId,
        topK: 3,
        minScore: 0.1
      });
      
      if (fallbackResults.length === 0) {
        console.log('⚠️  No content found even with low threshold');
        return {
          text: "I couldn't find relevant information in this video to answer your question. This might be because the video hasn't been fully processed yet, or your question is about content not covered in this video. Could you try rephrasing your question or asking about a different topic?",
          timestamps: [],
          sources: []
        };
      }
      
      console.log(`✅ Found ${fallbackResults.length} chunks with fallback search`);
      // Use fallback results
      searchResults.push(...fallbackResults);
    }
    
    console.log(`✅ Found ${searchResults.length} relevant chunks`);
    
    // Log similarity scores for debugging
    searchResults.forEach((result, index) => {
      console.log(`   Chunk ${index + 1}: Score ${result.score.toFixed(3)} - "${result.metadata.text.substring(0, 100)}..."`);
    });
    
    // Step 3: Prepare context from search results
    const context = searchResults.map((result, index) => {
      const metadata = result.metadata;
      const contextChunk = {
        index: index + 1,
        text: metadata.text,
        startTime: metadata.startTime || 0,
        endTime: metadata.endTime || 0,
        confidence: metadata.confidence || 0,
        score: result.score
      };
      
      // Log timestamp info for debugging
      console.log(`   Context ${index + 1}: ${formatTime(contextChunk.startTime)} - ${formatTime(contextChunk.endTime)}`);
      
      return contextChunk;
    });
    
    // Step 4: Generate response using OpenAI
    console.log('🤖 Step 3: Generating AI response...');
    const aiResponse = await generateAIResponse(message, context, videoData);
    
    // Step 5: Extract timestamps from response
    const timestamps = extractTimestamps(aiResponse, context);
    
    console.log('🕐 Generated timestamps:', timestamps);
    console.log('📊 Context chunks with timestamps:', context.map(c => ({
      startTime: c.startTime,
      endTime: c.endTime,
      text: c.text.substring(0, 50) + '...'
    })));
    
    console.log('✅ RAG response generated successfully');
    
    return {
      text: aiResponse,
      timestamps: timestamps,
      sources: context.map(c => ({
        text: c.text.substring(0, 200) + '...',
        startTime: c.startTime,
        endTime: c.endTime,
        score: c.score
      }))
    };
    
  } catch (error) {
    console.error('❌ RAG generation error:', error.message);
    throw new Error(`RAG response generation failed: ${error.message}`);
  }
}

/**
 * Generate AI response using OpenAI
 * @param {string} message - User message
 * @param {Array} context - Relevant context chunks
 * @param {Object} videoData - Video metadata
 * @returns {Promise<string>} - AI response
 */
async function generateAIResponse(message, context, videoData) {
  try {
    const contextText = context
      .map((chunk, index) => 
        `[Context ${index + 1}] (${formatTime(chunk.startTime)} - ${formatTime(chunk.endTime)}): ${chunk.text}`
      )
      .join('\n\n');
    
    const systemPrompt = `You are an AI assistant helping users understand video content. You have access to transcribed segments from a video titled "${videoData.title}" in the subject area of "${videoData.subject}".

Your task is to answer the user's question based ONLY on the provided context from the video transcript. Follow these guidelines:

1. Answer directly and concisely based on the provided context
2. ALWAYS reference the time range where information appears using the format [MM:SS] or [HH:MM:SS]
3. If the context doesn't contain enough information to answer the question, say so clearly
4. Use natural language and be conversational
5. When mentioning specific concepts or information, include the timestamp from the context
6. Don't make up information that's not in the provided context
7. If multiple time ranges are relevant, mention all of them

Example: "The concept of machine learning is explained at [05:30], and practical examples are shown at [12:45]."

Context from video transcript:
${contextText}`
    
    const userPrompt = `Question: ${message}`;
    
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    });
    
    return response.choices[0].message.content;
    
  } catch (error) {
    console.error('❌ OpenAI API error:', error.message);
    throw new Error(`AI response generation failed: ${error.message}`);
  }
}

/**
 * Extract timestamps mentioned in the AI response
 * @param {string} response - AI response text
 * @param {Array} context - Context chunks with timestamps
 * @returns {Array} - Array of timestamp objects
 */
function extractTimestamps(response, context) {
  const timestamps = [];
  
  // Look for timestamp patterns in the response [MM:SS] or [HH:MM:SS]
  const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  let match;
  
  while ((match = timestampRegex.exec(response)) !== null) {
    const timeString = match[1];
    const seconds = parseTimeString(timeString);
    
    // Find the corresponding context chunk
    const contextChunk = context.find(chunk => 
      seconds >= chunk.startTime && seconds <= chunk.endTime
    );
    
    if (contextChunk) {
      timestamps.push({
        time: seconds,
        timeString: timeString,
        text: contextChunk.text.substring(0, 100) + '...',
        startTime: contextChunk.startTime,
        endTime: contextChunk.endTime
      });
    }
  }
  
  // If no explicit timestamps in response, include timestamps from all relevant chunks
  if (timestamps.length === 0 && context.length > 0) {
    console.log('⚠️  No explicit timestamps found in AI response, using context chunks');
    
    // Add timestamps for all context chunks that have valid timestamps
    context.forEach((chunk, index) => {
      // Ensure we have valid timestamp data
      const startTime = chunk.startTime || 0;
      const endTime = chunk.endTime || startTime + 30; // Default 30 second duration if no end time
      
      if (startTime >= 0) {
        timestamps.push({
          time: startTime,
          timeString: formatTime(startTime),
          text: chunk.text.substring(0, 100) + '...',
          startTime: startTime,
          endTime: endTime
        });
        
        console.log(`   Added timestamp: ${formatTime(startTime)} - "${chunk.text.substring(0, 50)}..."`);
      }
    });
  }
  
  // Remove duplicates based on time
  const uniqueTimestamps = timestamps.filter((timestamp, index, self) => 
    index === self.findIndex(t => Math.abs(t.time - timestamp.time) < 5) // Within 5 seconds
  );
  
  console.log(`📍 Extracted ${uniqueTimestamps.length} unique timestamps`);
  
  return uniqueTimestamps;
}

/**
 * Save conversation to database
 * @param {string} videoId - Video ID
 * @param {string} conversationId - Conversation ID (optional)
 * @param {string} userMessage - User message
 * @param {Object} aiResponse - AI response object
 * @returns {Promise<Object>} - Saved conversation record
 */
async function saveConversation(videoId, conversationId, userMessage, aiResponse) {
  try {
    // Generate conversation ID if not provided
    if (!conversationId) {
      conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // First, ensure the chat_conversations table exists with correct schema
    await ensureChatConversationsTable();
    
    const { data, error } = await getSupabase()
      .from('chat_conversations')
      .insert({
        conversation_id: conversationId,
        video_id: videoId,
        user_message: userMessage,
        ai_response: aiResponse.text,
        timestamps: aiResponse.timestamps,
        sources: aiResponse.sources,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Conversation save failed: ${error.message}`);
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ Conversation save error:', error.message);
    throw error;
  }
}

/**
 * Ensure chat_conversations table exists with correct schema
 */
async function ensureChatConversationsTable() {
  try {
    // Check if table exists by trying to select from it
    const { error: selectError } = await getSupabase()
      .from('chat_conversations')
      .select('id')
      .limit(1);
    
    if (selectError && selectError.code === '42P01') {
      console.warn('⚠️  chat_conversations table does not exist. Please run Supabase migrations.');
      throw new Error('chat_conversations table not found. Please run: supabase db reset or supabase migration up');
    } else if (selectError) {
      console.warn('⚠️  Error checking chat_conversations table:', selectError.message);
    } else {
      console.log('✅ chat_conversations table exists');
    }
  } catch (error) {
    console.warn('⚠️  Could not verify chat_conversations table:', error.message);
    throw error;
  }
}

/**
 * GET /api/chat/history/:videoId
 * Get chat history for a video
 */
router.get('/history/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { conversationId, limit = 50 } = req.query;
    
    console.log(`📜 Chat history request for video: ${videoId}`);
    
    let query = getSupabase()
      .from('chat_conversations')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: true })
      .limit(parseInt(limit));
    
    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      conversations: data
    });
    
  } catch (error) {
    console.error('❌ Chat history error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/chat/conversation/:conversationId
 * Delete a conversation
 */
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    console.log(`🗑️  Delete conversation: ${conversationId}`);
    
    const { error } = await getSupabase()
      .from('chat_conversations')
      .delete()
      .eq('conversation_id', conversationId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Conversation deletion error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Utility functions
 */

/**
 * Format seconds to MM:SS or HH:MM:SS
 * @param {number} seconds - Seconds
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Parse time string (MM:SS or HH:MM:SS) to seconds
 * @param {string} timeString - Time string
 * @returns {number} - Seconds
 */
function parseTimeString(timeString) {
  const parts = timeString.split(':').map(Number);
  
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

export default router;