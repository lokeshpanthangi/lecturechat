import { Pinecone } from '@pinecone-database/pinecone';
import { v4 as uuidv4 } from 'uuid';

class PineconeService {
  constructor() {
    this.pinecone = null;
    
    this.indexName = process.env.PINECONE_INDEX_NAME || 'lecturechat-vectors';
    this.namespace = process.env.PINECONE_NAMESPACE || 'default';
    this.batchSize = 100; // Pinecone batch upsert limit
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Get Pinecone client instance (lazy initialization)
   * @returns {Pinecone} - Pinecone client
   */
  getPinecone() {
    if (!this.pinecone) {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY
      });
    }
    return this.pinecone;
  }

  /**
   * Initialize Pinecone index (create if doesn't exist)
   * @param {number} dimension - Vector dimension (default: 1536 for text-embedding-3-small)
   * @returns {Promise<boolean>} - Success status
   */
  async initializeIndex(dimension = 2048) {
    try {
      console.log(`🔧 Initializing Pinecone index: ${this.indexName}`);
      
      // Check if index exists
      const indexList = await this.getPinecone().listIndexes();
      const existingIndex = indexList.indexes?.find(index => index.name === this.indexName);
      
      if (existingIndex) {
        console.log(`✅ Index '${this.indexName}' already exists`);
        this.index = this.getPinecone().index(this.indexName);
        return true;
      }
      
      console.log(`🔨 Creating new index: ${this.indexName}`);
      
      // Create new index with Dense type and llama-text-embed-v2 model dimensions
      await this.getPinecone().createIndex({
        name: this.indexName,
        dimension: dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      // Wait for index to be ready
      console.log(`⏳ Waiting for index to be ready...`);
      await this.waitForIndexReady();
      
      this.index = this.getPinecone().index(this.indexName);
      console.log(`✅ Index '${this.indexName}' created and ready`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Pinecone initialization error:', error.message);
      throw new Error(`Pinecone initialization failed: ${error.message}`);
    }
  }

  /**
   * Wait for index to be ready
   * @param {number} maxWaitTime - Maximum wait time in milliseconds
   * @returns {Promise<void>}
   */
  async waitForIndexReady(maxWaitTime = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const indexStats = await this.getPinecone().index(this.indexName).describeIndexStats();
        if (indexStats) {
          console.log(`✅ Index is ready`);
          return;
        }
      } catch (error) {
        // Index not ready yet, continue waiting
      }
      
      await this.delay(2000); // Wait 2 seconds before checking again
    }
    
    throw new Error('Index creation timeout');
  }

  /**
   * Store text chunks with embeddings in Pinecone
   * @param {string} videoId - Video ID
   * @param {Array} chunks - Array of chunks with embeddings
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Storage result
   */
  async storeChunks(videoId, chunks, metadata = {}) {
    try {
      console.log(`📤 Storing ${chunks.length} chunks for video ${videoId}`);
      
      if (!this.index) {
        await this.initializeIndex();
      }
      
      // Filter chunks with valid embeddings
      const validChunks = chunks.filter(chunk => 
        chunk.embedding && 
        Array.isArray(chunk.embedding) && 
        chunk.embedding.length > 0
      );
      
      if (validChunks.length === 0) {
        throw new Error('No valid chunks with embeddings to store');
      }
      
      console.log(`✅ Found ${validChunks.length} valid chunks to store`);
      
      // Prepare vectors for Pinecone
      const vectors = validChunks.map(chunk => ({
        id: `${videoId}_chunk_${chunk.index}_${uuidv4()}`,
        values: chunk.embedding,
        metadata: {
          videoId: videoId,
          chunkIndex: chunk.index,
          text: chunk.text,
          startTime: chunk.startTime || 0,
          endTime: chunk.endTime || 0,
          confidence: chunk.confidence || 0,
          wordCount: chunk.wordCount || 0,
          length: chunk.length || 0,
          embeddingModel: chunk.embeddingModel || 'text-embedding-3-small',
          createdAt: new Date().toISOString(),
          ...metadata
        }
      }));
      
      // Store vectors in batches
      const batches = this.createBatches(vectors, this.batchSize);
      const results = {
        totalVectors: vectors.length,
        successfulBatches: 0,
        failedBatches: 0,
        errors: []
      };
      
      console.log(`📦 Processing ${batches.length} batches...`);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          console.log(`🔄 Storing batch ${i + 1}/${batches.length} (${batch.length} vectors)`);
          
          await this.upsertVectors(batch);
          results.successfulBatches++;
          
          // Add delay between batches
          if (i < batches.length - 1) {
            await this.delay(500);
          }
          
        } catch (error) {
          console.error(`❌ Batch ${i + 1} failed:`, error.message);
          results.failedBatches++;
          results.errors.push({
            batch: i + 1,
            error: error.message
          });
        }
      }
      
      console.log(`✅ Storage complete: ${results.successfulBatches}/${batches.length} batches successful`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Pinecone storage error:', error.message);
      throw new Error(`Pinecone storage failed: ${error.message}`);
    }
  }

  /**
   * Upsert vectors to Pinecone with retry logic
   * @param {Array} vectors - Array of vectors to upsert
   * @param {number} retryCount - Current retry count
   * @returns {Promise<void>}
   */
  async upsertVectors(vectors, retryCount = 0) {
    try {
      await this.index.namespace(this.namespace).upsert(vectors);
      
    } catch (error) {
      console.error(`Upsert failed (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.log(`⏳ Retrying in ${delay}ms...`);
        
        await this.delay(delay);
        return this.upsertVectors(vectors, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Search for similar chunks using vector similarity
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Search results
   */
  async searchSimilar(queryEmbedding, options = {}) {
    try {
      if (!this.index) {
        await this.initializeIndex();
      }
      
      const {
        topK = 5,
        videoId = null,
        minScore = 0.7,
        includeMetadata = true
      } = options;
      
      console.log(`🔍 Searching for similar chunks (topK: ${topK})`);
      
      // Build query
      const query = {
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: includeMetadata
      };
      
      // Add video filter if specified
      if (videoId) {
        query.filter = {
          videoId: { $eq: videoId }
        };
        console.log(`🎯 Filtering by video ID: ${videoId}`);
      }
      
      // Perform search
      const searchResponse = await this.index.namespace(this.namespace).query(query);
      
      // Filter results by minimum score
      const filteredResults = searchResponse.matches
        .filter(match => match.score >= minScore)
        .map(match => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata
        }));
      
      console.log(`✅ Found ${filteredResults.length} relevant chunks (score >= ${minScore})`);
      
      return filteredResults;
      
    } catch (error) {
      console.error('❌ Pinecone search error:', error.message);
      throw new Error(`Pinecone search failed: ${error.message}`);
    }
  }

  /**
   * Delete all vectors for a specific video
   * @param {string} videoId - Video ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteVideoVectors(videoId) {
    try {
      if (!this.index) {
        await this.initializeIndex();
      }
      
      console.log(`🗑️  Deleting vectors for video: ${videoId}`);
      
      await this.index.namespace(this.namespace).deleteMany({
        filter: {
          videoId: { $eq: videoId }
        }
      });
      
      console.log(`✅ Deleted vectors for video: ${videoId}`);
      return true;
      
    } catch (error) {
      console.error('❌ Vector deletion error:', error.message);
      throw new Error(`Vector deletion failed: ${error.message}`);
    }
  }

  /**
   * Get index statistics
   * @returns {Promise<Object>} - Index stats
   */
  async getIndexStats() {
    try {
      if (!this.index) {
        await this.initializeIndex();
      }
      
      const stats = await this.index.describeIndexStats();
      
      return {
        totalVectors: stats.totalVectorCount || 0,
        dimension: stats.dimension || 0,
        indexFullness: stats.indexFullness || 0,
        namespaces: stats.namespaces || {}
      };
      
    } catch (error) {
      console.error('❌ Stats retrieval error:', error.message);
      throw new Error(`Stats retrieval failed: ${error.message}`);
    }
  }

  /**
   * Create batches from vectors array
   * @param {Array} vectors - Array of vectors
   * @param {number} batchSize - Size of each batch
   * @returns {Array} - Array of batches
   */
  createBatches(vectors, batchSize) {
    const batches = [];
    
    for (let i = 0; i < vectors.length; i += batchSize) {
      batches.push(vectors.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Delay execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test Pinecone connection
   * @returns {Promise<boolean>} - Connection status
   */
  async testConnection() {
    try {
      console.log('🔌 Testing Pinecone connection...');
      
      const indexList = await this.getPinecone().listIndexes();
      console.log(`✅ Connected to Pinecone. Found ${indexList.indexes?.length || 0} indexes`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Pinecone connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get vector by ID
   * @param {string} vectorId - Vector ID
   * @returns {Promise<Object|null>} - Vector data or null
   */
  async getVector(vectorId) {
    try {
      if (!this.index) {
        await this.initializeIndex();
      }
      
      const response = await this.index.namespace(this.namespace).fetch([vectorId]);
      
      return response.vectors[vectorId] || null;
      
    } catch (error) {
      console.error('❌ Vector fetch error:', error.message);
      return null;
    }
  }
}

export default PineconeService;