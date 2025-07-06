-- Add new tables for RAG functionality

-- Transcripts table to store full transcription text
CREATE TABLE public.transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  processing_time_seconds INTEGER,
  word_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Text chunks table to store chunked text with embeddings metadata
CREATE TABLE public.text_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_time FLOAT,
  end_time FLOAT,
  pinecone_id VARCHAR(255) UNIQUE,
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  chunk_length INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Chat conversations table to store chat history
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  total_messages INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add processing status to videos table
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50) DEFAULT 'uploaded',
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Update the status check constraint to include new stages
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_status_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_status_check 
CHECK (status IN ('processing', 'ready', 'failed', 'transcribing', 'chunking', 'embedding'));

-- Enable Row Level Security for new tables
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Create policies for transcripts table
CREATE POLICY "Anyone can view transcripts" 
ON public.transcripts 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create transcripts" 
ON public.transcripts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update transcripts" 
ON public.transcripts 
FOR UPDATE 
USING (true);

-- Create policies for text_chunks table
CREATE POLICY "Anyone can view text_chunks" 
ON public.text_chunks 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create text_chunks" 
ON public.text_chunks 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update text_chunks" 
ON public.text_chunks 
FOR UPDATE 
USING (true);

-- Create policies for chat_conversations table
CREATE POLICY "Anyone can view chat_conversations" 
ON public.chat_conversations 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create chat_conversations" 
ON public.chat_conversations 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update chat_conversations" 
ON public.chat_conversations 
FOR UPDATE 
USING (true);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_transcripts_updated_at
BEFORE UPDATE ON public.transcripts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_transcripts_video_id ON public.transcripts(video_id);
CREATE INDEX idx_text_chunks_video_id ON public.text_chunks(video_id);
CREATE INDEX idx_text_chunks_transcript_id ON public.text_chunks(transcript_id);
CREATE INDEX idx_text_chunks_pinecone_id ON public.text_chunks(pinecone_id);
CREATE INDEX idx_chat_conversations_video_id ON public.chat_conversations(video_id);
CREATE INDEX idx_videos_status ON public.videos(status);
CREATE INDEX idx_videos_processing_stage ON public.videos(processing_stage);