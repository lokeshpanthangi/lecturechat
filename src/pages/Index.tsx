
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, MessageCircle, Clock, Play, ArrowRight } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState<string | null>(null);

  const features = [
    {
      id: 'upload',
      icon: Upload,
      title: 'Upload Your Lectures',
      description: 'Simply drag and drop your video files. We support MP4, AVI, and MOV formats up to 2GB.',
      color: 'text-blue-600'
    },
    {
      id: 'chat',
      icon: MessageCircle,
      title: 'AI-Powered Conversations',
      description: 'Ask questions about your lecture content and get intelligent responses with relevant context.',
      color: 'text-purple-600'
    },
    {
      id: 'timestamps',
      icon: Clock,
      title: 'Smart Timestamps',
      description: 'Click on timestamps in AI responses to jump directly to relevant moments in your video.',
      color: 'text-green-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Play className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">LectureChat</h1>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>Dashboard</Button>
              <Button variant="ghost" onClick={() => navigate('/upload')}>Upload</Button>
              <Button onClick={() => navigate('/upload')}>Get Started</Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold text-slate-900 mb-6 animate-fade-in">
              Transform Your Lectures into
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent block">
                Interactive Learning
              </span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto animate-fade-in">
              Upload your lecture videos and have intelligent conversations with the content. 
              Ask questions, get timestamped responses, and never miss important details again.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3"
                onClick={() => navigate('/upload')}
              >
                Start Learning Now
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 py-3"
                onClick={() => navigate('/dashboard')}
              >
                View Dashboard
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How LectureChat Works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Our AI-powered platform makes it easy to interact with your educational content
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature) => {
              const IconComponent = feature.icon;
              return (
                <Card 
                  key={feature.id}
                  className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer ${
                    isHovered === feature.id ? 'shadow-lg' : ''
                  }`}
                  onMouseEnter={() => setIsHovered(feature.id)}
                  onMouseLeave={() => setIsHovered(null)}
                >
                  <CardHeader className="text-center pb-4">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-4 ${
                      isHovered === feature.id ? 'scale-110' : ''
                    } transition-transform duration-300`}>
                      <IconComponent className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <CardTitle className="text-xl font-semibold text-slate-900">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-slate-600 text-center leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Revolutionize Your Learning?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of students who are already learning smarter with LectureChat
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            className="bg-white text-blue-600 hover:bg-slate-50 px-8 py-3"
            onClick={() => navigate('/upload')}
          >
            Upload Your First Video
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">LectureChat</h3>
              </div>
              <p className="text-sm">Transform your educational videos into interactive learning experiences.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Features</h4>
              <ul className="space-y-2 text-sm">
                <li>Video Upload</li>
                <li>AI Chat</li>
                <li>Smart Timestamps</li>
                <li>Dashboard</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>Help Center</li>
                <li>Contact Us</li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Connect</h4>
              <ul className="space-y-2 text-sm">
                <li>Twitter</li>
                <li>LinkedIn</li>
                <li>GitHub</li>
                <li>Discord</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2024 LectureChat. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
