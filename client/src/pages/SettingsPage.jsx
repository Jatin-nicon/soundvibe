import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { processImageFile } from '../utils/imageUpload';
import { isUsernameAvailable } from '../services/firestoreService';
import { 
  ArrowLeft, 
  User, 
  Check, 
  Upload, 
  Link as LinkIcon,
  LogOut,
  ShieldCheck,
  Lock,
  LogIn
} from 'lucide-react';

const AVAILABLE_GENRES = [
  'Indie Rock', 'Shoegaze', 'Dream Pop', 'Hip-Hop', 'Neo-Soul', 
  'Synthwave', 'French House', 'City Pop', 'Lofi', 'Psychedelic Rock',
  'Post-Punk', 'Electronic', 'Jazz Fusion', 'R&B', 'Alt-Rock', 'Ambient'
];

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { 
    user, 
    firebaseUser, 
    loading,
    updateUserProfile, 
    logout, 
    setAuthModalOpen 
  } = useAuth();
  
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [favoriteGenres, setFavoriteGenres] = useState(['Indie Rock', 'Electronic']);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setName(user.name || '');
      setBio(user.bio || '');
      setAvatar(user.avatar || '');
      setFavoriteGenres(user.favoriteGenres || ['Indie Rock', 'Electronic']);
    }
  }, [user]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError('');
    try {
      const dataUrl = await processImageFile(file);
      setAvatar(dataUrl);
    } catch (err) {
      setError(err.message || 'Failed to process image file');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRandomAvatar = () => {
    const seed = Math.random().toString(36).substring(2, 8);
    setAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`);
  };

  const toggleGenre = (genre) => {
    if (favoriteGenres.includes(genre)) {
      setFavoriteGenres(favoriteGenres.filter(g => g !== genre));
    } else {
      if (favoriteGenres.length < 6) {
        setFavoriteGenres([...favoriteGenres, genre]);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    if (!name.trim()) {
      setError('Please enter your display name');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUsername && cleanUsername !== user?.username) {
        const available = await isUsernameAvailable(cleanUsername, user?.id || user?.uid);
        if (!available) {
          setError(`Username @${cleanUsername} is already taken by another curator. Please choose another.`);
          setSaving(false);
          return;
        }
      }

      await updateUserProfile({
        username: cleanUsername || user?.username || 'curator',
        name: name.trim(),
        avatar: avatar.trim(),
        bio: bio.trim(),
        favoriteGenres
      });
      setSuccess(true);
      setTimeout(() => {
        navigate(`/profile/${cleanUsername || user?.username}`);
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // If user is not logged in, show access restricted sign-in view
  if (!loading && !user) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-28 max-w-md mx-auto animate-in fade-in duration-200">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to timeline</span>
        </button>

        <div className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-brand-blue/15 border border-brand-blue/30 text-brand-blue flex items-center justify-center mx-auto shadow-lg shadow-brand-blue/20">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold font-display text-white">Sign In Required</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Profile settings and listener customization are only accessible to authenticated users. Please sign in with your Google account.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="w-full py-3.5 rounded-2xl bg-brand-blue hover:bg-sky-400 text-white font-bold text-xs sm:text-sm shadow-xl shadow-brand-blue/30 transition-all flex items-center justify-center gap-2 active:scale-98"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In / Join</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 max-w-xl mx-auto animate-in fade-in duration-200">
      
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to timeline</span>
      </button>

      {/* Main Container */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-white/10 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-brand-blue text-white shadow-lg shadow-brand-blue/20">
              <User className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-white">
                Edit Profile Settings
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Manage your listener identity & musical tastes
              </p>
            </div>
          </div>
        </div>

        {/* Authenticated Firebase Account Card */}
        <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-dark-900/90 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Verified Account</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full">Active</span>
              </p>
              <p className="text-[11px] text-slate-400 truncate">{firebaseUser?.email || user?.email || `@${user?.username}`}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border border-red-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>Profile saved successfully! Redirecting...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Handle */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Username (@handle)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">@</span>
              <input
                type="text"
                required
                placeholder="your_handle"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full bg-dark-900 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Display Name
            </label>
            <input
              type="text"
              required
              placeholder="Your full listener name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Avatar Picture */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Profile Picture
            </label>
            
            <div className="flex items-center gap-4 p-3 rounded-xl bg-dark-900/90 border border-white/10">
              <img
                src={avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || user?.id || 'user'}`}
                alt="Avatar Preview"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || user?.id || 'user'}`;
                }}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-brand-blue/30 shrink-0 bg-dark-800"
              />
              
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="px-3 py-1.5 rounded-xl bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue text-xs font-semibold border border-brand-blue/30 transition-all flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? 'Processing...' : 'Upload Image'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRandomAvatar}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
                >
                  Random Bot
                </button>

                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <LinkIcon className="w-3 h-3" />
                  <span>URL</span>
                </button>
              </div>
            </div>

            {showUrlInput && (
              <div className="mt-2">
                <input
                  type="url"
                  placeholder="https://..."
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
                />
              </div>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Bio / Music Philosophy
            </label>
            <textarea
              rows={2}
              placeholder="What sonic frequencies or artists are you into?"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue resize-none"
            />
          </div>

          {/* Favorite Genres */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Favorite Genres ({favoriteGenres.length}/6)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_GENRES.map((genre) => {
                const active = favoriteGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                      active
                        ? 'bg-brand-blue text-white shadow-sm'
                        : 'bg-dark-900 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {genre} {active && '✓'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-xl sm:rounded-2xl bg-brand-blue hover:bg-sky-400 text-white font-bold text-xs sm:text-sm shadow-xl shadow-brand-blue/30 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
          </button>

        </form>

      </div>
    </div>
  );
};
