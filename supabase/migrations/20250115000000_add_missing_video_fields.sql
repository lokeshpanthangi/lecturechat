-- Add missing fields to videos table that are referenced in the code

-- Add file metadata fields
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add has_embedding field to text_chunks table (referenced in processing route)
ALTER TABLE public.text_chunks 
ADD COLUMN IF NOT EXISTS has_embedding BOOLEAN DEFAULT false;

-- Add confidence field to transcripts table (referenced in processing route)
ALTER TABLE public.transcripts 
ADD COLUMN IF NOT EXISTS confidence FLOAT;

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_videos_file_size ON public.videos(file_size);
CREATE INDEX IF NOT EXISTS idx_videos_file_type ON public.videos(file_type);
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_at ON public.videos(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_text_chunks_has_embedding ON public.text_chunks(has_embedding);

-- Update existing records to set uploaded_at to created_at for consistency
UPDATE public.videos 
SET uploaded_at = created_at 
WHERE uploaded_at IS NULL;

-- Update existing text_chunks to mark them as having embeddings if they have a pinecone_id
UPDATE public.text_chunks 
SET has_embedding = true 
WHERE pinecone_id IS NOT NULL AND has_embedding = false;