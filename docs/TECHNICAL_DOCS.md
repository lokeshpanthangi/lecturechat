# 📋 LectureChat Technical Documentation

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema](#database-schema)
3. [API Reference](#api-reference)
4. [Processing Pipeline](#processing-pipeline)
5. [Configuration](#configuration)
6. [Deployment Guide](#deployment-guide)
7. [Troubleshooting](#troubleshooting)
8. [Performance Optimization](#performance-optimization)

## System Architecture

### Overview

LectureChat follows a microservices-inspired architecture with clear separation between frontend, backend, and external services.

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│ • React Router for navigation                               │
│ • React Query for server state management                   │
│ • Tailwind CSS + Shadcn/ui for styling                    │
│ • TypeScript for type safety                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Express.js)                     │
├─────────────────────────────────────────────────────────────┤
│ • RESTful API endpoints                                     │
│ • File upload handling (Multer)                            │
│ • Audio processing (FFmpeg)                                │
│ • Vector operations (Pinecone)                             │
│ • Database operations (Supabase)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                        │
├─────────────────────────────────────────────────────────────┤
│ • OpenAI API (Whisper + GPT)                              │
│ • Pinecone Vector Database                                  │
│ • Supabase PostgreSQL                                      │
│ • FFmpeg (Audio/Video Processing)                          │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Frontend Components
- **Pages**: Index, Upload, Dashboard, Chat, NotFound
- **UI Components**: Reusable components from Shadcn/ui
- **Hooks**: Custom hooks for mobile detection and toast notifications
- **Integrations**: Supabase client configuration
- **Utils**: Helper functions and utilities

#### Backend Services
- **Routes**: API endpoint handlers
- **Services**: Core business logic modules
- **Middleware**: CORS, file upload, error handling
- **Utils**: Helper functions and validators

## Database Schema

### Supabase Tables

#### `videos` Table
```sql
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    duration REAL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_progress INTEGER DEFAULT 0,
    error_message TEXT,
    transcript_id UUID REFERENCES transcripts(id)
);
```

#### `transcripts` Table
```sql
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    confidence REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `text_chunks` Table
```sql
CREATE TABLE text_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID REFERENCES transcripts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding_id TEXT, -- Pinecone vector ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `chat_conversations` Table
```sql
CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    context_chunks JSONB,
    timestamps JSONB,
    similarity_scores REAL[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Pinecone Vector Storage

- **Namespace**: Organized by video ID
- **Dimensions**: 1536 (OpenAI text-embedding-3-small)
- **Metadata**: 
  - `video_id`: UUID reference
  - `chunk_id`: Text chunk UUID
  - `start_time`: Timestamp start
  - `end_time`: Timestamp end
  - `text`: Original text content

## API Reference

### Upload Endpoints

#### `POST /api/upload`
Upload and process a video/audio file.

**Request:**
```javascript
// FormData with file
const formData = new FormData();
formData.append('file', file);
```

**Response:**
```json
{
  "success": true,
  "videoId": "uuid",
  "message": "File uploaded successfully",
  "filename": "processed_filename.mp4"
}
```

#### `GET /api/upload/status/:videoId`
Get processing status for a video.

**Response:**
```json
{
  "status": "processing",
  "progress": 75,
  "stage": "generating_embeddings",
  "message": "Processing text chunks..."
}
```

### Chat Endpoints

#### `POST /api/chat`
Send a chat message and get RAG response.

**Request:**
```json
{
  "message": "What is the main topic discussed?",
  "videoId": "uuid"
}
```

**Response:**
```json
{
  "response": "The main topic discussed is...",
  "sources": [
    {
      "text": "Relevant chunk text...",
      "startTime": 120.5,
      "endTime": 145.2,
      "score": 0.85
    }
  ],
  "timestamps": [
    {
      "time": 120.5,
      "timeString": "2:00",
      "text": "Reference text..."
    }
  ]
}
```

### Processing Endpoints

#### `GET /api/processing/transcript/:videoId`
Get the full transcript for a video.

**Response:**
```json
{
  "transcript": "Full transcript text...",
  "language": "en",
  "confidence": 0.92,
  "duration": 1800.5
}
```

#### `GET /api/processing/chunks/:videoId`
Get text chunks with pagination.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**
```json
{
  "chunks": [
    {
      "id": "uuid",
      "content": "Chunk text...",
      "startTime": 0,
      "endTime": 30,
      "chunkIndex": 0
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

## Processing Pipeline

### 1. File Upload & Validation

```javascript
// Multer configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/mp4'
    ];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});
```

### 2. Audio Extraction

```javascript
// FFmpeg audio extraction
ffmpeg(inputPath)
  .output(outputPath)
  .audioCodec('libmp3lame')
  .audioBitrate('128k')
  .audioChannels(1)
  .audioFrequency(16000)
  .on('end', () => resolve(outputPath))
  .on('error', reject)
  .run();
```

### 3. Transcription

```javascript
// OpenAI Whisper API
const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream(audioPath),
  model: 'whisper-1',
  language: 'en',
  response_format: 'verbose_json',
  timestamp_granularities: ['segment']
});
```

### 4. Text Chunking

```javascript
// Semantic chunking with overlap
const chunkText = (text, options = {}) => {
  const {
    chunkSize = 1000,
    overlap = 200,
    preserveSentences = true
  } = options;
  
  // Implementation details...
};
```

### 5. Embedding Generation

```javascript
// OpenAI embeddings
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: chunkText,
  encoding_format: 'float'
});
```

### 6. Vector Storage

```javascript
// Pinecone upsert
await index.upsert({
  vectors: [{
    id: chunkId,
    values: embedding.data[0].embedding,
    metadata: {
      video_id: videoId,
      chunk_id: chunkId,
      start_time: startTime,
      end_time: endTime,
      text: chunkText
    }
  }]
});
```

## Configuration

### Environment Variables

#### Root Directory (.env)
```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-key
PINECONE_ENVIRONMENT=your-environment
PINECONE_INDEX_NAME=lecturechat-vectors

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# File Upload Configuration
MAX_FILE_SIZE=2147483648
UPLOAD_DIR=uploads
TEMP_DIR=temp

# Processing Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
BATCH_SIZE=100
MAX_RETRIES=3
```

**Note**: The application now uses a single `.env` file in the root directory. The server automatically loads environment variables from `../env` relative to the server directory. Frontend environment variables (VITE_*) are handled separately by Vite during build time.

### Pinecone Index Configuration

```javascript
// Index creation
const indexConfig = {
  name: 'lecturechat-vectors',
  dimension: 1536,
  metric: 'cosine',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1'
    }
  }
};
```

## Deployment Guide

### Frontend Deployment (Vercel/Netlify)

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Configure environment variables:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. **Deploy the `dist` folder**

### Backend Deployment (Railway/Heroku/DigitalOcean)

1. **Prepare the application:**
   ```bash
   cd server
   npm install --production
   ```

2. **Configure environment variables**

3. **Ensure FFmpeg availability:**
   - Most platforms include FFmpeg
   - For custom deployments, install FFmpeg

4. **Set up file storage:**
   - Configure persistent storage for uploads
   - Consider using cloud storage (AWS S3, etc.)

### Database Setup (Supabase)

1. **Create a new Supabase project**

2. **Run migrations:**
   ```sql
   -- Run each migration file in order
   -- 20250106000000_add_rag_tables.sql
   -- 20250115000000_add_missing_video_fields.sql
   -- 20250116000000_update_chat_conversations_schema.sql
   ```

3. **Configure Row Level Security (RLS) if needed**

### Vector Database Setup (Pinecone)

1. **Create a Pinecone account**

2. **Create an index:**
   - Dimension: 1536
   - Metric: Cosine
   - Cloud: AWS (recommended)

3. **Note the API key and environment**

## Troubleshooting

### Common Issues

#### 1. FFmpeg Not Found
```bash
# Error: FFmpeg not found
# Solution: Install FFmpeg or use ffmpeg-static
npm install ffmpeg-static
```

#### 2. OpenAI API Rate Limits
```javascript
// Implement retry logic with exponential backoff
const retryWithBackoff = async (fn, retries = 3) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && error.status === 429) {
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, 3 - retries) * 1000)
      );
      return retryWithBackoff(fn, retries - 1);
    }
    throw error;
  }
};
```

#### 3. Pinecone Connection Issues
```javascript
// Check Pinecone connection
const testPineconeConnection = async () => {
  try {
    const indexes = await pinecone.listIndexes();
    console.log('✅ Pinecone connected:', indexes);
  } catch (error) {
    console.error('❌ Pinecone connection failed:', error);
  }
};
```

#### 4. Large File Processing
```javascript
// Increase timeout for large files
app.use('/api/upload', (req, res, next) => {
  req.setTimeout(30 * 60 * 1000); // 30 minutes
  res.setTimeout(30 * 60 * 1000);
  next();
});
```

### Debug Logging

```javascript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === 'development';

const debugLog = (message, data = null) => {
  if (DEBUG) {
    console.log(`🐛 ${message}`, data || '');
  }
};
```

### Health Checks

```javascript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      pinecone: 'unknown',
      openai: 'unknown'
    }
  };
  
  // Check each service...
  
  res.json(health);
});
```

## Performance Optimization

### 1. Chunking Strategy

```javascript
// Optimize chunk size based on content type
const getOptimalChunkSize = (contentType) => {
  switch (contentType) {
    case 'lecture': return 1200;
    case 'conversation': return 800;
    case 'technical': return 1500;
    default: return 1000;
  }
};
```

### 2. Vector Search Optimization

```javascript
// Use namespace filtering for better performance
const searchVectors = async (queryVector, videoId, topK = 5) => {
  return await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter: {
      video_id: { $eq: videoId }
    }
  });
};
```

### 3. Caching Strategy

```javascript
// Cache embeddings for common queries
const embeddingCache = new Map();

const getCachedEmbedding = async (text) => {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  
  if (embeddingCache.has(hash)) {
    return embeddingCache.get(hash);
  }
  
  const embedding = await generateEmbedding(text);
  embeddingCache.set(hash, embedding);
  
  return embedding;
};
```

### 4. Database Indexing

```sql
-- Add indexes for better query performance
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_text_chunks_transcript_id ON text_chunks(transcript_id);
CREATE INDEX idx_chat_conversations_video_id ON chat_conversations(video_id);
CREATE INDEX idx_chat_conversations_created_at ON chat_conversations(created_at);
```

### 5. Memory Management

```javascript
// Stream large files instead of loading into memory
const processLargeFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const chunks = [];
    
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    
    stream.on('error', reject);
  });
};
```

---

**Last Updated:** January 2025
**Version:** 1.0.0