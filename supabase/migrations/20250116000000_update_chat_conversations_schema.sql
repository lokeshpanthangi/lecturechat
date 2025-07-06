-- Update chat_conversations table schema to match chat route expectations

-- Drop the existing chat_conversations table
DROP TABLE IF EXISTS public.chat_conversations CASCADE;

-- Create new chat_conversations table with correct schema
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  timestamps JSONB DEFAULT '[]',
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Anyone can delete chat_conversations" 
ON public.chat_conversations 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_chat_conversations_video_id ON public.chat_conversations(video_id);
CREATE INDEX idx_chat_conversations_conversation_id ON public.chat_conversations(conversation_id);
CREATE INDEX idx_chat_conversations_created_at ON public.chat_conversations(created_at);