import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

class TextChunker {
  constructor() {
    this.defaultChunkSize = 1000;
    this.defaultOverlap = 200;
    this.separators = ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' ', ''];
  }

  /**
   * Split text into semantic chunks with timestamps
   * @param {string} text - Full transcription text
   * @param {Array} segments - Array of segments with timestamps
   * @param {Object} options - Chunking options
   * @returns {Promise<Array>} - Array of text chunks with metadata
   */
  async chunkText(text, segments = [], options = {}) {
    try {
      console.log(`📝 Starting text chunking...`);
      console.log(`📊 Input text length: ${text.length} characters`);
      console.log(`🎯 Target chunk size: ${options.chunkSize || this.defaultChunkSize} characters`);

      const chunkSize = options.chunkSize || this.defaultChunkSize;
      const overlap = options.overlap || this.defaultOverlap;

      // Create text splitter with semantic awareness
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: chunkSize,
        chunkOverlap: overlap,
        separators: this.separators,
        keepSeparator: true
      });

      // Split the text
      const textChunks = await splitter.splitText(text);
      
      console.log(`✂️  Created ${textChunks.length} text chunks`);

      // Map chunks with timestamps and metadata
      const chunksWithMetadata = textChunks.map((chunk, index) => {
        const timestamps = this.mapChunkToTimestamps(chunk, text, segments);
        
        return {
          index: index,
          text: chunk.trim(),
          length: chunk.length,
          wordCount: this.countWords(chunk),
          startTime: timestamps.start,
          endTime: timestamps.end,
          confidence: timestamps.confidence
        };
      });

      // Log chunking statistics
      this.logChunkingStats(chunksWithMetadata);

      return chunksWithMetadata;

    } catch (error) {
      console.error('❌ Text chunking error:', error.message);
      throw new Error(`Text chunking failed: ${error.message}`);
    }
  }

  /**
   * Map text chunk to corresponding timestamps from segments
   * @param {string} chunk - Text chunk
   * @param {string} fullText - Complete transcription text
   * @param {Array} segments - Segments with timestamps
   * @returns {Object} - Timestamp information for the chunk
   */
  mapChunkToTimestamps(chunk, fullText, segments) {
    if (!segments || segments.length === 0) {
      return { start: 0, end: 0, confidence: 0 };
    }

    try {
      // Find the position of this chunk in the full text
      const chunkStart = fullText.indexOf(chunk.trim());
      const chunkEnd = chunkStart + chunk.length;

      if (chunkStart === -1) {
        // Fallback: try to find partial matches
        return this.findApproximateTimestamps(chunk, fullText, segments);
      }

      // Find segments that overlap with this chunk
      let startTime = null;
      let endTime = null;
      let totalConfidence = 0;
      let segmentCount = 0;
      let currentPos = 0;

      for (const segment of segments) {
        const segmentStart = currentPos;
        const segmentEnd = currentPos + segment.text.length;

        // Check if this segment overlaps with our chunk
        if (segmentEnd > chunkStart && segmentStart < chunkEnd) {
          if (startTime === null) {
            startTime = segment.start;
          }
          endTime = segment.end;
          totalConfidence += segment.confidence || 0;
          segmentCount++;
        }

        currentPos = segmentEnd;
      }

      return {
        start: startTime || 0,
        end: endTime || 0,
        confidence: segmentCount > 0 ? totalConfidence / segmentCount : 0
      };

    } catch (error) {
      console.warn('Warning: Could not map chunk to timestamps:', error.message);
      return { start: 0, end: 0, confidence: 0 };
    }
  }

  /**
   * Find approximate timestamps when exact matching fails
   * @param {string} chunk - Text chunk
   * @param {string} fullText - Complete transcription text
   * @param {Array} segments - Segments with timestamps
   * @returns {Object} - Approximate timestamp information
   */
  findApproximateTimestamps(chunk, fullText, segments) {
    try {
      // Use the first few words of the chunk to find approximate position
      const chunkWords = chunk.trim().split(/\s+/).slice(0, 5).join(' ');
      const approximateStart = fullText.indexOf(chunkWords);

      if (approximateStart === -1) {
        // If we can't find the chunk, return default timestamps
        return { start: 0, end: 0, confidence: 0 };
      }

      // Find the segment that contains this approximate position
      let currentPos = 0;
      for (const segment of segments) {
        const segmentEnd = currentPos + segment.text.length;
        
        if (approximateStart >= currentPos && approximateStart < segmentEnd) {
          return {
            start: segment.start,
            end: segment.end,
            confidence: (segment.confidence || 0) * 0.7 // Reduced confidence
          };
        }
        
        currentPos = segmentEnd;
      }

      return { start: 0, end: 0, confidence: 0 };

    } catch (error) {
      return { start: 0, end: 0, confidence: 0 };
    }
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
   * Log chunking statistics
   * @param {Array} chunks - Array of chunks with metadata
   */
  logChunkingStats(chunks) {
    if (chunks.length === 0) {
      console.log('📊 No chunks created');
      return;
    }

    const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
    const avgChunkLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length;
    const avgWordCount = totalWords / chunks.length;
    const chunksWithTimestamps = chunks.filter(chunk => chunk.startTime > 0 || chunk.endTime > 0).length;

    console.log('📊 Chunking Statistics:');
    console.log(`   • Total chunks: ${chunks.length}`);
    console.log(`   • Average chunk length: ${Math.round(avgChunkLength)} characters`);
    console.log(`   • Average words per chunk: ${Math.round(avgWordCount)}`);
    console.log(`   • Chunks with timestamps: ${chunksWithTimestamps}/${chunks.length}`);
    console.log(`   • Total words processed: ${totalWords}`);
  }

  /**
   * Validate chunking parameters
   * @param {Object} options - Chunking options
   * @returns {Object} - Validation result
   */
  validateOptions(options = {}) {
    const errors = [];
    const warnings = [];

    const chunkSize = options.chunkSize || this.defaultChunkSize;
    const overlap = options.overlap || this.defaultOverlap;

    if (chunkSize < 100) {
      errors.push('Chunk size too small (minimum 100 characters)');
    }

    if (chunkSize > 4000) {
      warnings.push('Large chunk size may affect embedding quality');
    }

    if (overlap >= chunkSize) {
      errors.push('Overlap must be smaller than chunk size');
    }

    if (overlap < 0) {
      errors.push('Overlap cannot be negative');
    }

    if (overlap > chunkSize * 0.5) {
      warnings.push('Large overlap may cause excessive duplication');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get optimal chunking parameters based on text length
   * @param {number} textLength - Length of text to chunk
   * @returns {Object} - Recommended chunking parameters
   */
  getOptimalParameters(textLength) {
    if (textLength < 2000) {
      return { chunkSize: 500, overlap: 100 };
    } else if (textLength < 10000) {
      return { chunkSize: 1000, overlap: 200 };
    } else if (textLength < 50000) {
      return { chunkSize: 1500, overlap: 300 };
    } else {
      return { chunkSize: 2000, overlap: 400 };
    }
  }
}

export default TextChunker;