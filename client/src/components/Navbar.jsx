import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { 
  Flame, 
  Users, 
  PlusCircle, 
  LogOut, 
  User, 
  Disc3, 
  Search, 
  ChevronDown,
  Settings,
  Sparkles,
  Plus,
  Music,
  ArrowRight,
  X
} from 'lucide-react';
import { searchFirestoreUnified } from '../services/firestoreService';

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearUserIdentity, setAuthModalOpen } = useAuth();
  const { isPlaying, currentTrack, setIsVisualizerOpen, playTrack } = useAudioPlayer();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState({ tracks: [], users: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchContainerRef = useRef(null);

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search autocomplete
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setAutocompleteResults({ tracks: [], users: [] });
      setShowAutocomplete(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await searchFirestoreUnified({
          query: searchQuery.trim(),
          type: 'all',
          limit: 3
        });
        setAutocompleteResults({
          tracks: (data.tracks || []).slice(0, 3),
          users: (data.users || []).slice(0, 3)
        });
        setShowAutocomplete(true);
      } catch (err) {
        console.warn('Autocomplete fetch notice:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowAutocomplete(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=all`);
    }
  };

  const isFeedActive = location.pathname === '/' || location.pathname === '/feed';
  const isSearchActive = location.pathname === '/search';
  const isFollowingActive = location.pathname === '/following';
  const isDropVibeActive = location.pathname === '/drop-vibe';
  const isProfileActive = location.pathname.startsWith('/profile') || location.pathname === '/settings';

  return (
    <>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-dark-950/90 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none group shrink-0">
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-violet via-brand-blue to-sky-400 p-[2px] shadow-lg shadow-brand-blue/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-dark-900 rounded-[10px] flex items-center justify-center">
                <Disc3 className={`w-5 h-5 sm:w-6 sm:h-6 text-brand-blue ${isPlaying ? 'animate-spin-slow' : ''}`} />
              </div>
              {isPlaying && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-pink opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-full w-full bg-brand-pink"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-blue bg-clip-text text-transparent">
                  SoundVibe
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-semibold bg-brand-blue/20 text-brand-blue rounded-md border border-brand-blue/30 uppercase tracking-wider">
                  Social
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden md:block">Share Your Taste • Feel the Music</p>
            </div>
          </Link>

          {/* Desktop Search Bar with Live Autocomplete */}
          <div ref={searchContainerRef} className="hidden md:flex flex-1 max-w-md mx-2 relative">
            <form onSubmit={handleSearchSubmit} className="w-full relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tracks, @usernames, or vibe tags..."
                value={searchQuery}
                onFocus={() => {
                  if (autocompleteResults.tracks.length || autocompleteResults.users.length) {
                    setShowAutocomplete(true);
                  }
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-full pl-10 pr-10 py-1.5 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/40 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setShowAutocomplete(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Live Autocomplete Dropdown */}
            {showAutocomplete && (autocompleteResults.tracks.length > 0 || autocompleteResults.users.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-dark-900/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl p-3 space-y-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                
                {/* Matched Curators */}
                {autocompleteResults.users.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Curators & Users</p>
                    {autocompleteResults.users.map(u => (
                      <div
                        key={u.id || u.username}
                        onClick={() => {
                          setShowAutocomplete(false);
                          navigate(`/profile/${u.username || u.id}`);
                        }}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <img
                      src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username || u.id}`}
                      alt={u.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username || u.id}`;
                      }}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-brand-blue bg-dark-800"
                    />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white group-hover:text-brand-blue truncate">{u.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">@{u.username}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Matched Songs */}
                {autocompleteResults.tracks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Songs & Tracks</p>
                    {autocompleteResults.tracks.map(t => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setShowAutocomplete(false);
                          navigate(`/search?q=${encodeURIComponent(t.title)}&type=songs`);
                        }}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <img
                          src={t.artwork}
                          alt={t.title}
                          className="w-7 h-7 rounded-lg object-cover bg-dark-800"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white group-hover:text-brand-blue truncate">{t.title}</p>
                          <p className="text-[10px] text-slate-400 truncate">{t.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* View Full Results Action */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAutocomplete(false);
                      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=all`);
                    }}
                    className="w-full py-1.5 rounded-xl bg-brand-blue/15 hover:bg-brand-blue/25 text-brand-blue text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>View all results for "{searchQuery}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <Link
              to="/"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                isFeedActive
                  ? 'bg-white/10 text-white shadow-sm border border-white/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Feed</span>
            </Link>

            <Link
              to="/search"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                isSearchActive
                  ? 'bg-white/10 text-white shadow-sm border border-white/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Search className="w-4 h-4 text-brand-blue" />
              <span>Explore</span>
            </Link>

            <Link
              to="/following"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                isFollowingActive
                  ? 'bg-white/10 text-white shadow-sm border border-white/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4 text-brand-blue" />
              <span>Following</span>
            </Link>
          </nav>

          {/* Action & User Profile Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Visualizer Trigger if audio is loaded */}
            {currentTrack && (
              <button
                onClick={() => setIsVisualizerOpen(true)}
                title="Open Sound Visualizer"
                className="p-2 sm:p-2.5 rounded-full bg-brand-blue/20 text-brand-blue hover:bg-brand-blue/30 border border-brand-blue/30 transition-all flex items-center justify-center"
              >
                <div className="flex items-center gap-[2px] h-3.5 sm:h-4">
                  <span className="sound-bar sound-bar-1" />
                  <span className="sound-bar sound-bar-2" />
                  <span className="sound-bar sound-bar-3" />
                  <span className="sound-bar sound-bar-4" />
                </div>
              </button>
            )}

            {/* Desktop New Post Button */}
            <Link
              to="/drop-vibe"
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-blue hover:bg-sky-400 text-white text-xs sm:text-sm font-bold shadow-md shadow-brand-blue/25 transition-all hover:scale-105 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Drop Vibe</span>
            </Link>

            {/* Profile / Active Identity */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 p-1 pl-2 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10 transition-all group"
                >
                  <img
                    src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`}
                    alt={user.name || 'User'}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`;
                    }}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-2 ring-brand-blue/30 group-hover:ring-brand-blue transition-all bg-dark-800"
                  />
                  <div className="text-left hidden lg:block pr-1">
                    <p className="text-xs font-bold text-white group-hover:text-brand-blue transition-colors max-w-[100px] truncate leading-tight">
                      {user.name || 'Music Explorer'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">@{user.username || 'curator'}</p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                </button>

                {/* Profile Dropdown Menu */}
                {dropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl glass-dropdown border border-white/15 py-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2 border-b border-white/10">
                        <p className="text-xs font-bold text-white truncate">{user.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">@{user.username}</p>
                      </div>

                      <Link
                        to={`/profile/${user.username || user.id}`}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <User className="w-3.5 h-3.5 text-brand-blue" />
                        <span>Your Profile</span>
                      </Link>

                      <Link
                        to="/settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        <span>Settings</span>
                      </Link>

                      <div className="border-t border-white/10 my-1" />

                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          clearUserIdentity();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-md shadow-brand-blue/25 flex items-center gap-1.5 active:scale-95"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

          </div>

        </div>
      </header>

      {/* MOBILE BOTTOM NAVIGATION BAR (Twitter/Instagram Mobile 5-Tab Bar) */}
      <nav aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-dark-950/95 backdrop-blur-2xl border-t border-white/10 px-1 py-1.5 flex items-center justify-around shadow-2xl safe-area-pb">
        
        {/* Feed */}
        <Link
          to="/"
          className={`flex flex-col items-center justify-center p-1 rounded-2xl transition-all min-w-[50px] ${
            isFeedActive ? 'text-brand-blue scale-105' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className={`w-5 h-5 ${isFeedActive ? 'text-amber-400 fill-amber-400/20' : ''}`} />
          <span className="text-[10px] font-semibold mt-0.5">Feed</span>
        </Link>

        {/* Search / Explore */}
        <Link
          to="/search"
          className={`flex flex-col items-center justify-center p-1 rounded-2xl transition-all min-w-[50px] ${
            isSearchActive ? 'text-brand-blue scale-105' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className={`w-5 h-5 ${isSearchActive ? 'text-brand-blue stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-semibold mt-0.5">Explore</span>
        </Link>

        {/* Center: Drop Vibe Action Button */}
        {user ? (
          <Link
            to="/drop-vibe"
            className="flex flex-col items-center justify-center -mt-3.5 group"
          >
            <div className="w-11 h-11 rounded-full bg-brand-blue hover:bg-sky-400 text-white flex items-center justify-center shadow-lg shadow-brand-blue/40 transition-all group-active:scale-90 ring-4 ring-dark-950">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-bold text-white mt-0.5">Drop</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="flex flex-col items-center justify-center -mt-3.5 group"
          >
            <div className="w-11 h-11 rounded-full bg-brand-blue hover:bg-sky-400 text-white flex items-center justify-center shadow-lg shadow-brand-blue/40 transition-all group-active:scale-90 ring-4 ring-dark-950">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-bold text-white mt-0.5">Drop</span>
          </button>
        )}

        {/* Following */}
        <Link
          to="/following"
          className={`flex flex-col items-center justify-center p-1 rounded-2xl transition-all min-w-[50px] ${
            isFollowingActive ? 'text-brand-blue scale-105' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className={`w-5 h-5 ${isFollowingActive ? 'text-brand-blue fill-brand-blue/20' : ''}`} />
          <span className="text-[10px] font-semibold mt-0.5">Following</span>
        </Link>

        {/* Profile */}
        {user ? (
          <Link
            to={`/profile/${user.username || user.id}`}
            className={`flex flex-col items-center justify-center p-1 rounded-2xl transition-all min-w-[50px] ${
              isProfileActive ? 'text-brand-blue scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`}
              alt="Profile"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`;
              }}
              className={`w-5 h-5 rounded-full object-cover ring-1 ${isProfileActive ? 'ring-brand-blue' : 'ring-white/20'}`}
            />
            <span className="text-[10px] font-semibold mt-0.5">Profile</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="flex flex-col items-center justify-center p-1 rounded-2xl transition-all min-w-[50px] text-slate-400 hover:text-white"
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Sign In</span>
          </button>
        )}

      </nav>
    </>
  );
};
