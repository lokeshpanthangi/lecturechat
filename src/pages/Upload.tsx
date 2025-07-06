
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Upload as UploadIcon, FileVideo, FileAudio, Play, ArrowLeft, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingStep {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed';
}

const Upload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: 'upload', title: 'Uploading file...', status: 'pending' },
    { id: 'extract', title: 'Processing audio...', status: 'pending' },
    { id: 'transcript', title: 'Generating transcript...', status: 'pending' },
    { id: 'embeddings', title: 'Creating embeddings...', status: 'pending' },
    { id: 'ready', title: 'Ready for chat!', status: 'pending' }
  ]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFiles = (files: FileList) => {
    const file = files[0];
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/mov', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac'
    ];
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload video files (MP4, AVI, MOV) or audio files (MP3, WAV, M4A, AAC).',
        variant: 'destructive'
      });
      return;
    }
    
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Please upload files smaller than 2GB.',
        variant: 'destructive'
      });
      return;
    }
    
    setFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const uploadVideo = async () => {
    if (!file || !title.trim()) return;
    
    setIsUploading(true);
    setCurrentStep(0);
    
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('subject', subject.trim() || '');
      formData.append('description', description.trim() || '');
      
      // Upload to backend API with progress tracking
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });
      
      // Handle response
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
      });
      
      // Start upload
      xhr.open('POST', 'http://localhost:3001/api/upload');
      xhr.send(formData);
      
      const uploadResponse = await uploadPromise;
      
      if (!uploadResponse.success) {
        throw new Error(uploadResponse.error || 'Upload failed');
      }
      
      const videoId = uploadResponse.videoId;
      console.log('Upload successful, video ID:', videoId);
      
      // Move to processing steps
      setCurrentStep(1);
      
      // Poll for processing status
      await pollProcessingStatus(videoId);
      
      toast({
        title: 'Processing complete!',
        description: 'Your video is ready for chat.',
      });
      
      // Navigate to chat with the actual video ID
      setTimeout(() => {
        navigate(`/chat/${videoId}`);
      }, 1000);
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'There was an error uploading your video. Please try again.',
        variant: 'destructive'
      });
      setIsUploading(false);
      setCurrentStep(0);
      setUploadProgress(0);
    }
  };
  
  const pollProcessingStatus = async (videoId: string) => {
    const maxPollingTime = 10 * 60 * 1000; // 10 minutes
    const pollingInterval = 3000; // 3 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxPollingTime) {
      try {
        const response = await fetch(`http://localhost:3001/api/processing/status/${videoId}`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to get processing status');
        }
        
        const video = data.video;
        const stage = video.processing_stage;
        const progress = video.processing_progress || 0;
        
        // Update UI based on processing stage
        if (stage === 'audio_extraction') {
          setCurrentStep(1);
        } else if (stage === 'transcription') {
          setCurrentStep(2);
        } else if (stage === 'chunking' || stage === 'embedding') {
          setCurrentStep(3);
        } else if (stage === 'completed' || video.status === 'ready') {
          setCurrentStep(4);
          return; // Processing complete
        } else if (video.status === 'failed') {
          throw new Error(video.error_message || 'Processing failed');
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        
      } catch (error) {
        console.error('Status polling error:', error);
        throw error;
      }
    }
    
    throw new Error('Processing timeout - please check the video status later');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please select a file and enter a title.',
        variant: 'destructive'
      });
      return;
    }
    uploadVideo();
  };

  const getStepStatus = (index: number): 'pending' | 'active' | 'completed' => {
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/')}
              className="mr-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Play className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">LectureChat</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Upload Your Lecture</h1>
          <p className="text-lg text-slate-600">Transform your video or audio into an interactive learning experience</p>
        </div>

        {!isUploading ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Upload Area */}
            <Card>
              <CardHeader>
                <CardTitle>Select Video or Audio File</CardTitle>
                <CardDescription>
                  Drag and drop your lecture file or click to browse. Supports video (MP4, AVI, MOV) and audio (MP3, WAV, M4A, AAC) up to 2GB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : file 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-slate-300 hover:border-slate-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="video/mp4,video/avi,video/mov,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/m4a,audio/aac"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  
                  {file ? (
                    <div className="space-y-4">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
                      <div>
                        <p className="text-lg font-medium text-slate-900">{file.name}</p>
                        <p className="text-sm text-slate-600">
                          {(file.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => setFile(null)}>
                        Choose Different File
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <UploadIcon className="w-12 h-12 text-slate-400 mx-auto" />
                      <div>
                        <p className="text-lg font-medium text-slate-900">
                          Choose files or drag and drop
                        </p>
                        <p className="text-sm text-slate-600">Video or Audio files up to 2GB</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                        <div className="text-center">
                          <p className="text-xs font-medium text-slate-700 mb-2">Video Formats</p>
                          <div className="space-y-1 text-sm text-slate-500">
                            <div className="flex items-center justify-center">
                              <FileVideo className="w-4 h-4 mr-1" />
                              MP4, AVI, MOV
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium text-slate-700 mb-2">Audio Formats</p>
                          <div className="space-y-1 text-sm text-slate-500">
                            <div className="flex items-center justify-center">
                              <FileAudio className="w-4 h-4 mr-1" />
                              MP3, WAV, M4A, AAC
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Video Details */}
            <Card>
              <CardHeader>
                <CardTitle>Lecture Details</CardTitle>
                <CardDescription>
                  Add information about your lecture to help organize your content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Introduction to Machine Learning - Lecture 1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject/Course</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Computer Science, Mathematics, Physics"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the lecture content..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={!file || !title.trim()}
            >
              Upload and Process {file?.type.startsWith('video/') ? 'Video' : file?.type.startsWith('audio/') ? 'Audio' : 'File'}
            </Button>
          </form>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Processing Your {file?.type.startsWith('video/') ? 'Video' : 'Audio'}</CardTitle>
              <CardDescription className="text-center">
                Please wait while we prepare your lecture for interactive chat
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {currentStep === 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
              
              <div className="space-y-4">
                {processingSteps.map((step, index) => {
                  const status = getStepStatus(index);
                  return (
                    <div key={step.id} className={`flex items-center space-x-3 p-3 rounded-lg ${
                      status === 'completed' ? 'bg-green-50' : 
                      status === 'active' ? 'bg-blue-50' : 'bg-slate-50'
                    }`}>
                      {status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : status === 'active' ? (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      ) : (
                        <Clock className="w-5 h-5 text-slate-400" />
                      )}
                      <span className={`font-medium ${
                        status === 'completed' ? 'text-green-700' :
                        status === 'active' ? 'text-blue-700' : 'text-slate-500'
                      }`}>
                        {step.title}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {currentStep >= processingSteps.length && (
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <p className="text-lg font-medium text-green-700">Lecture ready for chat!</p>
                  <p className="text-sm text-slate-600">Redirecting to chat interface...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Upload;
