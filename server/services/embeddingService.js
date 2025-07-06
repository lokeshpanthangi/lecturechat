import OpenAI from 'openai';

class EmbeddingService {
  constructor() {
    this.openai = null;
    this.model = 'text-embedding-3-large'; // High-quality embedding model
    this.dimensions = 2048; // Match Pinecone index dimensions
    this.batchSize = 100; // Process embeddings in batches
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
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
   * Generate embeddings for text chunks
   * @param {Array} chunks - Array of text chunks
   * @param {Object} options - Embedding options
   * @returns {Promise<Array>} - Array of chunks with embeddings
   */
  async generateEmbeddings(chunks, options = {}) {
    try {
      console.log(`🧠 Starting embedding generation for ${chunks.length} chunks...`);
      console.log(`📊 Using model: ${this.model}`);
      
      if (!chunks || chunks.length === 0) {
        throw new Error('No chunks provided for embedding generation');
      }

      // Validate chunks
      const validChunks = this.validateChunks(chunks);
      console.log(`✅ Validated ${validChunks.length}/${chunks.length} chunks`);

      // Process chunks in batches to avoid rate limits
      const chunksWithEmbeddings = [];
      const batches = this.createBatches(validChunks, this.batchSize);
      
      console.log(`📦 Processing ${batches.length} batches...`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} chunks)`);
        
        try {
          const batchResults = await this.processBatch(batch, options);
          chunksWithEmbeddings.push(...batchResults);
          
          // Add delay between batches to respect rate limits
          if (i < batches.length - 1) {
            await this.delay(500);
          }
          
        } catch (error) {
          console.error(`❌ Batch ${i + 1} failed:`, error.message);
          
          // Try to process chunks individually as fallback
          console.log(`🔄 Retrying batch ${i + 1} with individual processing...`);
          const individualResults = await this.processIndividually(batch, options);
          chunksWithEmbeddings.push(...individualResults);
        }
      }

      console.log(`✅ Generated embeddings for ${chunksWithEmbeddings.length} chunks`);
      this.logEmbeddingStats(chunksWithEmbeddings);
      
      return chunksWithEmbeddings;

    } catch (error) {
      console.error('❌ Embedding generation error:', error.message);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Process a batch of chunks for embedding
   * @param {Array} batch - Batch of chunks
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} - Chunks with embeddings
   */
  async processBatch(batch, options = {}) {
    try {
      // Prepare texts for embedding
      const texts = batch.map(chunk => this.prepareTextForEmbedding(chunk.text));
      
      // Generate embeddings
      const response = await this.callEmbeddingAPI(texts);
      
      // Combine chunks with their embeddings
      const chunksWithEmbeddings = batch.map((chunk, index) => ({
        ...chunk,
        embedding: response.data[index].embedding,
        embeddingModel: this.model,
        embeddingDimensions: response.data[index].embedding.length,
        processedAt: new Date().toISOString()
      }));

      return chunksWithEmbeddings;

    } catch (error) {
      console.error('Batch processing error:', error.message);
      throw error;
    }
  }

  /**
   * Process chunks individually (fallback method)
   * @param {Array} chunks - Array of chunks
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} - Chunks with embeddings
   */
  async processIndividually(chunks, options = {}) {
    const results = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        console.log(`🔄 Processing individual chunk ${i + 1}/${chunks.length}`);
        
        const text = this.prepareTextForEmbedding(chunk.text);
        const response = await this.callEmbeddingAPI([text]);
        
        results.push({
          ...chunk,
          embedding: response.data[0].embedding,
          embeddingModel: this.model,
          embeddingDimensions: response.data[0].embedding.length,
          processedAt: new Date().toISOString()
        });
        
        // Small delay between individual requests
        await this.delay(200);
        
      } catch (error) {
        console.error(`❌ Failed to process chunk ${i + 1}:`, error.message);
        
        // Add chunk without embedding (will be marked as failed)
        results.push({
          ...chunk,
          embedding: null,
          embeddingError: error.message,
          processedAt: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  /**
   * Call OpenAI Embedding API with retry logic
   * @param {Array} texts - Array of texts to embed
   * @returns {Promise<Object>} - API response
   */
  async callEmbeddingAPI(texts, retryCount = 0) {
    try {
      const response = await this.getOpenAI().embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
        encoding_format: 'float'
      });

      return response;

    } catch (error) {
      console.error(`API call failed (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        
        await this.delay(delay);
        return this.callEmbeddingAPI(texts, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Prepare text for embedding (clean and optimize)
   * @param {string} text - Raw text
   * @returns {string} - Prepared text
   */
  prepareTextForEmbedding(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Clean and normalize text
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[\r\n]+/g, ' ') // Replace line breaks with spaces
      .substring(0, 8000); // Limit length for embedding model
  }

  /**
   * Validate chunks before processing
   * @param {Array} chunks - Array of chunks
   * @returns {Array} - Valid chunks
   */
  validateChunks(chunks) {
    return chunks.filter(chunk => {
      if (!chunk || typeof chunk !== 'object') {
        console.warn('Invalid chunk: not an object');
        return false;
      }
      
      if (!chunk.text || typeof chunk.text !== 'string') {
        console.warn('Invalid chunk: missing or invalid text');
        return false;
      }
      
      if (chunk.text.trim().length === 0) {
        console.warn('Invalid chunk: empty text');
        return false;
      }
      
      if (chunk.text.length > 8000) {
        console.warn(`Chunk too long (${chunk.text.length} chars), truncating...`);
        chunk.text = chunk.text.substring(0, 8000);
      }
      
      return true;
    });
  }

  /**
   * Create batches from chunks array
   * @param {Array} chunks - Array of chunks
   * @param {number} batchSize - Size of each batch
   * @returns {Array} - Array of batches
   */
  createBatches(chunks, batchSize) {
    const batches = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
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
   * Log embedding statistics
   * @param {Array} chunks - Chunks with embeddings
   */
  logEmbeddingStats(chunks) {
    const successful = chunks.filter(chunk => chunk.embedding && chunk.embedding.length > 0);
    const failed = chunks.filter(chunk => !chunk.embedding);
    const totalTokens = chunks.reduce((sum, chunk) => {
      return sum + (chunk.text ? chunk.text.split(/\s+/).length : 0);
    }, 0);

    console.log('🧠 Embedding Statistics:');
    console.log(`   • Successful embeddings: ${successful.length}/${chunks.length}`);
    console.log(`   • Failed embeddings: ${failed.length}`);
    console.log(`   • Total tokens processed: ~${totalTokens}`);
    console.log(`   • Model used: ${this.model}`);
    
    if (successful.length > 0) {
      console.log(`   • Embedding dimensions: ${successful[0].embeddingDimensions}`);
    }
    
    if (failed.length > 0) {
      console.log(`   • Failed chunks will be retried or skipped`);
    }
  }

  /**
   * Estimate embedding cost
   * @param {Array} chunks - Array of chunks
   * @returns {Object} - Cost estimation
   */
  estimateCost(chunks) {
    const totalTokens = chunks.reduce((sum, chunk) => {
      return sum + (chunk.text ? chunk.text.split(/\s+/).length : 0);
    }, 0);

    // OpenAI text-embedding-3-small pricing: $0.00002 per 1K tokens
    const estimatedCost = (totalTokens / 1000) * 0.00002;

    return {
      totalTokens,
      estimatedCostUSD: estimatedCost,
      model: this.model
    };
  }

  /**
   * Generate embedding for a single query (for search)
   * @param {string} query - Search query
   * @returns {Promise<Array>} - Query embedding vector
   */
  async generateQueryEmbedding(query) {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid query for embedding');
      }

      const preparedQuery = this.prepareTextForEmbedding(query);
      const response = await this.getOpenAI().embeddings.create({
        model: this.model,
        input: [preparedQuery],
        dimensions: this.dimensions,
        encoding_format: 'float'
      });
      
      return response.data[0].embedding;

    } catch (error) {
      console.error('Query embedding error:', error.message);
      throw new Error(`Query embedding failed: ${error.message}`);
    }
  }

  /**
   * Test OpenAI connection
   * @returns {Promise<boolean>} - Connection status
   */
  async testConnection() {
    try {
      console.log('🔌 Testing OpenAI embedding connection...');
      
      // Test with a simple embedding call
      const response = await this.getOpenAI().embeddings.create({
        model: this.model,
        input: 'test',
        dimensions: this.dimensions,
        encoding_format: 'float'
      });
      
      console.log('✅ OpenAI embedding connection successful');
      return true;
      
    } catch (error) {
      console.error('❌ OpenAI embedding connection test failed:', error.message);
      return false;
    }
  }
}

export default EmbeddingService;