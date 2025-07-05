
import { useState } from 'react';
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

interface Video {
  id: string;
  title: string;
  subject: string;
  duration: string;
  uploadDate: string;
  status: 'processing' | 'ready' | 'failed';
  thumbnail: string;
  description: string;
  chatCount: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');

  // Mock data - in a real app, this would come from an API
  const [videos] = useState<Video[]>([
    {
      id: 'demo-video',
      title: 'Introduction to Machine Learning',
      subject: 'Computer Science',
      duration: '45:32',
      uploadDate: '2024-01-15',
      status: 'ready',
      thumbnail: '/placeholder.svg',
      description: 'Basic concepts of ML, supervised and unsupervised learning',
      chatCount: 12
    },
    {
      id: 'physics-101',
      title: 'Newton\'s Laws of Motion',
      subject: 'Physics',
      duration: '38:15',
      uploadDate: '2024-01-14',
      status: 'ready',
      thumbnail: '/placeholder.svg',
      description: 'Understanding the three fundamental laws of motion',
      chatCount: 8
    },
    {
      id: 'calc-derivatives',
      title: 'Calculus: Derivatives and Applications',
      subject: 'Mathematics',
      duration: '52:08',
      uploadDate: '2024-01-13',
      status: 'processing',
      thumbnail: '/placeholder.svg',
      description: 'Chain rule, product rule, and real-world applications',
      chatCount: 0
    },
    {
      id: 'history-wwii',
      title: 'World War II: European Theater',
      subject: 'History',
      duration: '41:25',
      uploadDate: '2024-01-12',
      status: 'ready',
      thumbnail: '/placeholder.svg',
      description: 'Major battles and turning points in WWII Europe',
      chatCount: 5
    },
    {
      id: 'chemistry-bonds',
      title: 'Chemical Bonding and Molecular Structure',
      subject: 'Chemistry',
      duration: '35:47',
      uploadDate: '2024-01-11',
      status: 'failed',
      thumbnail: '/placeholder.svg',
      description: 'Ionic, covalent, and metallic bonds explained',
      chatCount: 0
    }
  ]);

  const subjects = ['all', ...Array.from(new Set(videos.map(v => v.subject)))];

  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         video.subject.toLowerCase().includes(searchTerm.toLowerCase());
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
    totalDuration: videos.reduce((acc, video) => {
      const [minutes, seconds] = video.duration.split(':').map(Number);
      return acc + minutes + (seconds / 60);
    }, 0),
    totalChats: videos.reduce((acc, video) => acc + video.chatCount, 0),
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
              <div className="text-2xl font-bold text-slate-900">{Math.floor(stats.totalDuration)}h</div>
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
        {filteredVideos.length === 0 ? (
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
                  <img 
                    src={video.thumbnail} 
                    alt={video.title}
                    className="w-full h-40 object-cover bg-slate-200"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute top-2 right-2">
                    {getStatusBadge(video.status)}
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {video.duration}
                  </div>
                </div>
                
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {video.subject}
                    </Badge>
                    <div className="flex items-center text-xs text-slate-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(video.uploadDate).toLocaleDateString()}
                    </div>
                  </div>
                  <CardTitle className="text-lg line-clamp-2">{video.title}</CardTitle>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <CardDescription className="line-clamp-2 mb-4">
                    {video.description}
                  </CardDescription>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-sm text-slate-600">
                      <MessageCircle className="w-4 h-4 mr-1" />
                      {video.chatCount} chats
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
