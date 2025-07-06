# LectureChat Backend Server

This is the backend server for the LectureChat application that handles video/audio processing, transcription, text chunking, and RAG (Retrieval-Augmented Generation) functionality.

## Features

- **Video/Audio Processing**: Extract audio from video files or process audio files directly
- **Transcription**: Convert audio to text using OpenAI Whisper API
- **Text Chunking**: Split transcribed text into semantic chunks with overlap
- **Vector Embeddings**: Generate embeddings using OpenAI's text-embedding-3-small model
- **Vector Storage**: Store and search embeddings using Pinecone vector database
- **Chat Interface**: RAG-powered chat system for querying video content
- **Database Integration**: Store metadata and chat history in Supabase

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key
- Pinecone account and API key
- Supabase project

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   - Copy `.env.example` to `.env` in the root directory (parent folder)
   - Fill in your API keys and configuration:
   ```bash
   # From the root project directory
   cp .env.example .env
   ```
   
   **Note**: The `.env` file should be placed in the root directory of the project, not in the server folder. The server will automatically load environment variables from `../env`.

3. **Required Environment Variables**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `PINECONE_API_KEY`: Your Pinecone API key
   - `PINECONE_ENVIRONMENT`: Your Pinecone environment
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

4. **Database Setup**
   - Run the migration file `20250106000000_add_rag_tables.sql` in your Supabase project
   - This will create the necessary tables: `videos`, `transcripts`, `text_chunks`, `chat_conversations`

5. **Start the Server**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## API Endpoints

### Upload Routes (`/api/upload`)
- `POST /` - Upload and process video/audio files
- `GET /status/:videoId` - Get processing status
- `DELETE /:videoId` - Delete video and associated data
- `GET /stats` - Get processing statistics
- `GET /test-services` - Test service connections

### Chat Routes (`/api/chat`)
- `POST /` - Send chat message and get RAG response
- `GET /history/:videoId` - Get chat history
- `DELETE /conversation/:conversationId` - Delete conversation

### Processing Routes (`/api/processing`)
- `GET /status/:videoId` - Get detailed processing status
- `GET /transcript/:videoId` - Get full transcript
- `GET /chunks/:videoId` - Get text chunks (paginated)
- `POST /reprocess/:videoId` - Reprocess video
- `GET /stats` - Get processing statistics
- `GET /health` - Health check
- `GET /logs/:videoId` - Get processing logs

## File Processing Pipeline

1. **Upload**: Video/audio file uploaded via `/api/upload`
2. **Audio Extraction**: Extract audio from video (if needed)
3. **Transcription**: Convert audio to text using Whisper
4. **Chunking**: Split text into semantic chunks
5. **Embedding**: Generate vector embeddings for chunks
6. **Storage**: Store embeddings in Pinecone and metadata in Supabase
7. **Ready**: File ready for chat queries

## Supported File Types

- **Video**: MP4, AVI, MOV, Quicktime, MPEG
- **Audio**: MP3, WAV, M4A, AAC

## Error Handling

The server includes comprehensive error handling for:
- File upload errors
- Processing failures
- API rate limits
- Database connection issues
- Service unavailability

## Development

- Use `npm run dev` for development with nodemon
- Check logs for detailed processing information
- Use `/api/upload/test-services` to verify all services are connected
- Monitor processing status via `/api/upload/stats`

## Troubleshooting

1. **FFmpeg Issues**: Ensure FFmpeg is properly installed (included via ffmpeg-static)
2. **API Key Errors**: Verify all API keys are correctly set in `.env`
3. **File Size Limits**: Default limit is 2GB, adjust `MAX_FILE_SIZE` if needed
4. **Processing Failures**: Check logs and use reprocess endpoint if needed