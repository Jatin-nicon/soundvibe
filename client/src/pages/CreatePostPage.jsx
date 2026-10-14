import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Flame,
  Headphones,
  Lock,
  LogIn,
  Music,
  Pause,
  Play,
  Quote,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tag,
  UserCheck
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useAuth } from '../context/AuthContext';
import { searchMusicCached } from '../services/cacheService';
import { createFirestorePost } from '../services/firestoreService';

const SUGGESTED_VIBE_TAGS = [
  '#MidnightDrive', '#HeavyRotation', '#HiddenGem', '#Nostalgia',
  '#BasslineHeaven', '#GoldenHour', '#HeartbreakAnthem', '#StudyFlow',
  '#GymHype', '#RainyDay', '#Chillhop', '#Masterpiece'
];

const MOODS = [
  'Euphoric', 'Melancholy', 'Reflective', 'Energetic', 
  'Chill / Relaxed', 'Nostalgic', 'Psychedelic', 'Aggressive / Hype'
];

export const CreatePostPage = () => {
  const navigate = useNavigate();
  const { user, loading, setAuthModalOpen } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlay, currentTime, duration } = useAudioPlayer();

  // Track & Review State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [rating, setRating] = useState(5);
  const [headline, setHeadline] = useState('');
  const [review, setReview] = useState('');
  const [favoriteLyric, setFavoriteLyric] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [vibeTagsInput, setVibeTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parseHashtags = (str) => {
    return (str || '')
      .split(/[\s,]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : `#${t}`);
  };

  const resetSelectedTrack = () => {
    setSelectedTrack(null);
    setRating(5);
    setHeadline('');
    setReview('');
    setFavoriteLyric('');
    setVibeTagsInput('');
    setSelectedMood('');
  }
  const handleSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError('');
    try {
      const results = await searchMusicCached(searchQuery.trim());
      setSearchResults(results || []);
      if (!results || results.length === 0) {
        setError(`No songs found matching "${searchQuery.trim()}". Try another title or artist.`);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search tracks.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTrack = (track) => {
    setSelectedTrack(track);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleToggleSuggestedTag = (tag) => {
    const currentTags = parseHashtags(vibeTagsInput);
    const tagClean = tag.toLowerCase();

    if (currentTags.some(t => t.toLowerCase() === tagClean)) {
      const filtered = currentTags.filter(t => t.toLowerCase() !== tagClean);
      setVibeTagsInput(filtered.join(' '));
    } else {
      if (currentTags.length < 8) {
        setVibeTagsInput([...currentTags, tag].join(' '));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (!selectedTrack) {
      setError('Please search and select a track to review');
      return;
    }

    if (!selectedMood) {
      setError('Please select a mood for your review');
      return;
    }

    if (!headline.trim()) {
      setError('Please add a headline for your review');
      return;
    }

    if (!review.trim()) {
      setError('Please write a brief review or thoughts on this track');
      return;
    }

    if (!vibeTagsInput.trim()) {
      setError('Please add at least one vibe tag (e.g. #MidnightDrive)');
      return;
    } 

    const parsedTags = parseHashtags(vibeTagsInput);

    setSubmitting(true);
    setError('');
    try {
      const postPayload = {
        userId: user.id || user.uid,
        author: {
          id: user.id || user.uid,
          username: user.username,
          name: user.name,
          avatar: user.avatar,
          badges: user.badges || ['Curator']
        },
        track: selectedTrack,
        rating: Number(rating),
        headline: headline.trim(),
        review: review.trim(),
        favoriteLyric: favoriteLyric.trim(),
        mood: selectedMood,
        vibeTags: parsedTags
      };

      await createFirestorePost(postPayload);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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
            <h2 className="text-xl font-bold font-display text-white">Sign In to Drop a Vibe</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Only signed-in listeners can broadcast reviews, rate songs, and share musical discoveries with the community.
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
    <div className="space-y-4 sm:space-y-6 pb-28 max-w-2xl mx-auto animate-in fade-in duration-200">
      
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to timeline</span>
      </button>

      {/* Main Composer Box */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-white/10 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-2xl bg-brand-blue text-white shadow-lg shadow-brand-blue/20">
            <Flame className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-white">Drop a Musical Vibe</h1>
            <p className="text-[11px] sm:text-xs text-slate-400">Preview tracks, share your review, and rate songs</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Authenticated Author Badge */}
        {user && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-dark-900/90 border border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                alt={user.name}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-brand-blue/40 shrink-0 bg-dark-800"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[11px] text-slate-400 truncate">@{user.username}</p>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Verified Creator</span>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          
          {/* STEP: Search and Pick Track with Live Audio Preview */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-dark-900/90 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-brand-blue uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                <span>Choose & Preview Track</span>
              </label>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Headphones className="w-3 h-3 text-brand-blue" />
                <span>30s Audio Previews</span>
              </span>
            </div>

            {!selectedTrack ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search song title, artist, or album (Press Enter)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSearch(e);
                        }
                      }}
                      className="w-full bg-dark-850 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-2.5 bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-all shadow shrink-0 flex items-center gap-1.5 active:scale-95"
                  >
                    {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Search</span>}
                  </button>
                </div>

                {/* Search Results Dropdown with Interactive Preview */}
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar pt-2">
                    <p className="text-[11px] text-slate-400 font-medium px-1">
                      Found {searchResults.length} matches — tap <strong className="text-white">Preview</strong> to listen or <strong className="text-brand-blue">Select</strong> to review:
                    </p>

                    {searchResults.map((t) => {
                      const isThisPlaying = currentTrack?.id === t.id && isPlaying;
                      return (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-dark-850 hover:bg-white/10 border border-white/5 flex items-center justify-between gap-3 transition-all group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Artwork with 1-Click Audio Preview Play/Pause */}
                            <div className="relative shrink-0 w-11 h-11 rounded-lg overflow-hidden group/thumb shadow-sm">
                              <img src={t.artwork} alt={t.title} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isThisPlaying) {
                                    togglePlay();
                                  } else {
                                    playTrack(t);
                                  }
                                }}
                                className={`absolute inset-0 flex items-center justify-center transition-all ${
                                  isThisPlaying 
                                    ? 'bg-brand-blue/85 opacity-100 text-white' 
                                    : 'bg-black/60 opacity-0 group-hover/thumb:opacity-100 text-white hover:scale-105'
                                }`}
                                title={isThisPlaying ? 'Pause Audio Preview' : 'Play Audio Preview'}
                              >
                                {isThisPlaying ? (
                                  <Pause className="w-4 h-4 fill-current animate-pulse" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                )}
                              </button>
                            </div>

                            {/* Track details (clicking selects track) */}
                            <div 
                              className="min-w-0 flex-1 cursor-pointer"
                              onClick={() => handleSelectTrack(t)}
                            >
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-white group-hover:text-brand-blue truncate">{t.title}</p>
                                {isThisPlaying && (
                                  <span className="flex items-center gap-0.5 text-brand-blue text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-brand-blue/15 shrink-0 border border-brand-blue/30">
                                    <span className="w-0.5 h-2 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-0.5 h-3 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                                    <span className="w-0.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                                    <span className="ml-0.5">Playing</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">{t.artist} • {t.album}</p>
                            </div>
                          </div>

                          {/* Quick Preview and Select Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isThisPlaying) {
                                  togglePlay();
                                } else {
                                  playTrack(t);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                                isThisPlaying 
                                  ? 'bg-brand-blue text-white shadow-sm' 
                                  : 'bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/5'
                              }`}
                            >
                              {isThisPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                              <span>{isThisPlaying ? 'Pause' : 'Preview'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSelectTrack(t)}
                              className="px-3 py-1 rounded-lg bg-brand-blue/20 hover:bg-brand-blue text-brand-blue hover:text-white text-xs font-bold transition-all border border-brand-blue/30 hover:border-transparent shadow-sm active:scale-95"
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Selected Track Card with Full Interactive Preview Player */
              <div className="p-4 rounded-2xl bg-dark-850 border border-brand-blue/40 shadow-xl space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  
                  {/* Track Artwork & Metadata */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden shadow-md group">
                      <img src={selectedTrack.artwork} alt={selectedTrack.title} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          if (currentTrack?.id === selectedTrack.id && isPlaying) {
                            togglePlay();
                          } else {
                            playTrack(selectedTrack);
                          }
                        }}
                        className={`absolute inset-0 flex items-center justify-center transition-all ${
                          currentTrack?.id === selectedTrack.id && isPlaying 
                            ? 'bg-brand-blue/85 text-white opacity-100' 
                            : 'bg-black/60 text-white opacity-90 hover:opacity-100 hover:scale-105'
                        }`}
                        title={currentTrack?.id === selectedTrack.id && isPlaying ? 'Pause Preview' : 'Play 30s Audio Preview'}
                      >
                        {currentTrack?.id === selectedTrack.id && isPlaying ? (
                          <Pause className="w-6 h-6 fill-current animate-pulse" />
                        ) : (
                          <Play className="w-6 h-6 fill-current ml-0.5" />
                        )}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-brand-blue bg-brand-blue/15 px-2 py-0.5 rounded-full border border-brand-blue/30">
                          Selected Track
                        </span>
                        {currentTrack?.id === selectedTrack.id && isPlaying && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            <span>Playing Preview</span>
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white truncate mt-0.5">{selectedTrack.title}</h3>
                      <p className="text-xs text-slate-300 truncate">{selectedTrack.artist}</p>
                      <p className="text-[11px] text-slate-500 truncate">{selectedTrack.album} • {selectedTrack.genre || 'Music'}</p>
                    </div>
                  </div>

                  {/* Change Song Button */}
                  <button
                    type="button"
                    onClick={() => resetSelectedTrack()}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold transition-colors shrink-0 border border-white/10"
                  >
                    Change Song
                  </button>
                </div>

                {/* Audio Preview Control Bar */}
                <div className="p-2.5 rounded-xl bg-dark-900/90 border border-white/10 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentTrack?.id === selectedTrack.id && isPlaying) {
                        togglePlay();
                      } else {
                        playTrack(selectedTrack);
                      }
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 ${
                      currentTrack?.id === selectedTrack.id && isPlaying
                        ? 'bg-brand-blue hover:bg-sky-400 text-white shadow-md shadow-brand-blue/30'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                    }`}
                  >
                    {currentTrack?.id === selectedTrack.id && isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Pause Preview</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Listen to Preview</span>
                      </>
                    )}
                  </button>

                  {/* Equalizer animation & timestamp */}
                  <div className="flex items-center gap-2 min-w-0">
                    {currentTrack?.id === selectedTrack.id && isPlaying ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-blue/15 rounded-lg border border-brand-blue/20">
                        <div className="flex items-end gap-0.5 h-3.5">
                          <span className="w-0.5 h-2 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-0.5 h-3.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                          <span className="w-0.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                          <span className="w-0.5 h-3 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-[10px] text-brand-blue font-mono font-bold">
                          {Math.floor(currentTime)}s / {Math.floor(duration || 30)}s
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Music className="w-3.5 h-3.5 text-slate-500" />
                        <span>30s audio snippet ready</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rating & Mood */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Rating Stars */}
            <div className="p-3.5 rounded-xl bg-dark-900/90 border border-white/10 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Vibe Rating ({rating.toFixed(1)} / 5.0)
              </label>
              <div className="flex items-center gap-1.5 pt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-125 transition-transform focus:outline-none"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-600 hover:text-amber-400/50'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Mood Dropdown */}
            <div className="p-3.5 rounded-xl bg-dark-900/90 border border-white/10 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Listening Mood *
              </label>
              <select
                value={selectedMood}
                required
                onChange={(e) => setSelectedMood(e.target.value)}
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-blue"
              >
                <option key="empty" value="" disabled hidden>Select a mood</option>
                {MOODS.map((m) => (
                  <option key={m} value={m} className="bg-dark-900 text-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Headline */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Headline *
            </label>
            <input
              type="text"
              placeholder="e.g. The best guitar solo of the decade"
              value={headline}
              required
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Your Review / Sonic Thoughts *
            </label>
            <textarea
              required
              rows={3}
              placeholder="What makes this track special? Production, vocals, emotional resonance..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue resize-none"
            />
          </div>

          {/* Standout Lyric */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Favorite Lyric Snippet (Optional)
            </label>
            <div className="relative">
              <Quote className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue" />
              <input
                type="text"
                placeholder="e.g. And we will never be alone again..."
                value={favoriteLyric}
                onChange={(e) => setFavoriteLyric(e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          {/* Vibe Tags */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand-pink" />
                <span>Vibe Tags (Editable Hashtags) *</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Space-separated</span>
            </label>

            {/* Manual Hashtag Text Input */}
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. #MidnightDrive #Synthwave #IndieGems"
                value={vibeTagsInput}
                required
                onChange={(e) => setVibeTagsInput(e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-all"
              />
            </div>

            {/* Quick Add Suggested Tags */}
            <div className="pt-1">
              <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Click to toggle suggested tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_VIBE_TAGS.map((tag) => {
                  const currentTags = parseHashtags(vibeTagsInput).map(t => t.toLowerCase());
                  const active = currentTags.includes(tag.toLowerCase());

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleSuggestedTag(tag)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                        active
                          ? 'bg-brand-blue text-white shadow-sm'
                          : 'bg-dark-900 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      <span>{tag}</span>
                      {active && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !selectedTrack}
            className="w-full py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-brand-blue hover:bg-sky-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-brand-blue/30 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 active:scale-98"
          >
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? 'Broadcasting...' : 'Broadcast to SoundVibe Feed'}</span>
          </button>

        </form>

      </div>
    </div>
  );
};
