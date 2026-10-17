import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Disc3 } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { Navbar } from './components/Navbar';
import { PlayerBar } from './components/PlayerBar';
import { AudioVisualizerModal } from './components/AudioVisualizerModal';
import { AuthModal } from './components/AuthModal';
import { useAuth } from './context/AuthContext';

// Route-based dynamic code splitting for lightweight initial load
const FeedPage = lazy(() => import('./pages/FeedPage').then(m => ({ default: m.FeedPage })));
const FollowingPage = lazy(() => import('./pages/FollowingPage').then(m => ({ default: m.FollowingPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then(m => ({ default: m.PostDetailPage })));
const CreatePostPage = lazy(() => import('./pages/CreatePostPage').then(m => ({ default: m.CreatePostPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// Sleek fallback during route chunk loading
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center py-28 sm:py-36 space-y-3.5 animate-in fade-in duration-150">
    <div className="relative w-10 h-10 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin" />
      <Disc3 className="w-5 h-5 text-brand-purple/80 animate-pulse" />
    </div>
    <p className="text-xs text-slate-400 font-medium tracking-wide">Tuning into sound vibe...</p>
  </div>
);

function AppContent() {
  const { authModalOpen, setAuthModalOpen } = useAuth();

  useEffect(() => {
    try {
      localStorage.removeItem('soundvibe_cached_posts');
    } catch (e) {}
  }, []);

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 flex flex-col selection:bg-brand-blue/30 selection:text-white">
      {/* Persistent Multi-Page Navigation Header */}
      <Navbar />

      {/* Main Multi-Page Routed Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-36 md:pb-24">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/feed" element={<Navigate to="/" replace />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/following" element={<FollowingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="/post/:id" element={<PostDetailPage />} />
            <Route path="/vibe/:id" element={<PostDetailPage />} />
            <Route path="/drop-vibe" element={<CreatePostPage />} />
            <Route path="/create" element={<Navigate to="/drop-vibe" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/edit-profile" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      {/* Persistent Audio Player & Visualizer across page navigations */}
      <PlayerBar />
      <AudioVisualizerModal />

      {/* Global Firebase Auth Modal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AudioPlayerProvider>
          <AppContent />
        </AudioPlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
