
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Search, 
  Upload, 
  MessageCircle, 
  Clock, 
  Filter,
  ArrowLeft,
  Video,
  Calendar
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Video {
  id: string;
  title: string;
  subject: string | null;
  duration: string | null;
  created_at: string;
  status: 'processing' | 'ready' | 'failed';
  description: string | null;
  file_path: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setVideos((data || []).map(video => ({
        ...video,
        status: video.status as 'processing' | 'ready' | 'failed'
      })));
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const subjects = ['all', ...Array.from(new Set(videos.map(v => v.subject).filter(Boolean)))];

  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (video.subject && video.subject.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterSubject === 'all' || video.subject === filterSubject;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: Video['status']) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-700">Ready</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-700">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700">Failed</Badge>;
      default:
        return null;
    }
  };

  const stats = {
    totalVideos: videos.length,
    totalDuration: 0, // We'll calculate this when we add duration tracking
    totalChats: 0, // We'll add chat tracking later
    readyVideos: videos.filter(v => v.status === 'ready').length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Button>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/upload')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Video
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <Video className="w-6 h-6 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-slate-900">{stats.totalVideos}</div>
              <div className="text-sm text-slate-600">Total Videos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-slate-900">--</div>
              <div className="text-sm text-slate-600">Total Duration</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <MessageCircle className="w-6 h-6 text-purple-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-slate-900">{stats.totalChats}</div>
              <div className="text-sm text-slate-600">Total Chats</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Play className="w-6 h-6 text-orange-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-slate-900">{stats.readyVideos}</div>
              <div className="text-sm text-slate-600">Ready to Chat</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search videos by title or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {subjects.map(subject => (
                <option key={subject} value={subject}>
                  {subject === 'all' ? 'All Subjects' : subject}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Videos Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="w-full h-40 bg-slate-200 animate-pulse" />
                <CardHeader>
                  <div className="h-4 bg-slate-200 rounded animate-pulse mb-2" />
                  <div className="h-6 bg-slate-200 rounded animate-pulse" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Video className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No videos found</h3>
              <p className="text-slate-600 mb-4">
                {searchTerm || filterSubject !== 'all' 
                  ? 'Try adjusting your search or filter criteria.' 
                  : 'Upload your first lecture video to get started.'}
              </p>
              <Button onClick={() => navigate('/upload')}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First Video
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video) => (
              <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative">
                  <div className="w-full h-40 bg-slate-900 overflow-hidden">
                    <video
                      className="w-full h-full object-cover"
                      src={supabase.storage.from('lecture-videos').getPublicUrl(video.file_path).data.publicUrl}
                      preload="metadata"
                      muted
                      onLoadedMetadata={(e) => {
                        const video = e.target as HTMLVideoElement;
                        video.currentTime = 1; // Seek to 1 second to get a better thumbnail
                      }}
                      onSeeked={(e) => {
                        const video = e.target as HTMLVideoElement;
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(video, 0, 0);
                          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
                          video.poster = thumbnail;
                        }
                      }}
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                       onClick={() => video.status === 'ready' && navigate(`/chat/${video.id}`)}>
                    <Play className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute top-2 right-2">
                    {getStatusBadge(video.status)}
                  </div>
                  {video.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {video.duration}
                    </div>
                  )}
                </div>
                
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {video.subject || 'General'}
                    </Badge>
                    <div className="flex items-center text-xs text-slate-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(video.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <CardTitle className="text-lg line-clamp-2">{video.title}</CardTitle>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <CardDescription className="line-clamp-2 mb-4">
                    {video.description || 'No description provided'}
                  </CardDescription>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-sm text-slate-600">
                      <MessageCircle className="w-4 h-4 mr-1" />
                      0 chats
                    </div>
                    
                    {video.status === 'ready' ? (
                      <Button 
                        size="sm"
                        onClick={() => navigate(`/chat/${video.id}`)}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Chat Now
                      </Button>
                    ) : video.status === 'processing' ? (
                      <Button size="sm" disabled>
                        Processing...
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => navigate('/upload')}
                      >
                        Re-upload
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
