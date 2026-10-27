import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { PostCard } from '../components/PostCard';
import { 
  Search, 
  Disc3, 
  Play, 
  Pause, 
  UserCheck, 
  UserPlus, 
  Music, 
  Users, 
  MessageSquare, 
  Hash, 
  Sparkles, 
  PlusCircle, 
  X,
  ArrowRight
} from 'lucide-react';
import { searchFirestoreUnified } from '../services/firestoreService';

const FILTER_TABS = [
  { id: 'all', label: 'All Results', icon: Sparkles },
  { id: 'songs', label: 'Songs & Tracks', icon: Music },
  { id: 'users', label: 'Curators & Users', icon: Users },
  { id: 'posts', label: 'Vibe Reviews', icon: MessageSquare },
  { id: 'tags', label: 'Vibe Tags', icon: Hash }
];

export const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, toggleFollowUser } = useAuth();
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  const rawQuery = searchParams.get('q') || '';
  const rawType = searchParams.get('type') || 'all';

  const [inputQuery, setInputQuery] = useState(rawQuery);
  const [activeTab, setActiveTab] = useState(rawType);
  const [loading, setLoading] = useState(false);
  const lastExecutedRef = React.useRef({ query: '', timestamp: 0 });
  const [results, setResults] = useState({
    tracks: [],
    users: [],
    posts: [],
    tags: []
  });

  const executeFullSearch = async (queryText, bypassCache = false) => {
    const clean = (queryText || '').trim();
    if (!clean) return;

    lastExecutedRef.current = { query: clean, timestamp: Date.now() };
    setLoading(true);
    try {
      const data = await searchFirestoreUnified({
        query: clean,
        type: 'all', // ALWAYS fetch all categories so counts on all tabs remain accurate and synchronized
        limit: 35,
        bypassCache
      });
      setResults({
        tracks: data.tracks || [],
        users: data.users || [],
        posts: data.posts || [],
        tags: data.tags || []
      });
    } catch (err) {
      console.error('Search execution failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize when URL parameters change (e.g. from Navbar search or tab clicking)
  useEffect(() => {
    setInputQuery(rawQuery);
    setActiveTab(rawType);
    const cleanQuery = rawQuery.trim();

    if (cleanQuery) {
      // Prevent duplicate search if just executed by submit handler within 1.5 seconds
      const isRecent = lastExecutedRef.current.query === cleanQuery && (Date.now() - lastExecutedRef.current.timestamp < 1500);
      if (!isRecent) {
        executeFullSearch(cleanQuery, false);
      }
    } else {
      lastExecutedRef.current = { query: '', timestamp: 0 };
      setResults({ tracks: [], users: [], posts: [], tags: [] });
    }
  }, [rawQuery, rawType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const clean = inputQuery.trim();
    if (!clean) return;

    // Immediately trigger fresh live search bypassing cache on Enter
    executeFullSearch(clean, true);
    setSearchParams({ q: clean, type: activeTab });
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (rawQuery.trim()) {
      setSearchParams({ q: rawQuery.trim(), type: tabId });
    }
  };

  const handleFollowToggle = async (targetId, e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/settings');
      return;
    }
    try {
      await toggleFollowUser(targetId);
      if (rawQuery.trim()) {
        executeFullSearch(rawQuery.trim(), true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const totalResultsCount = 
    (results.tracks?.length || 0) + 
    (results.users?.length || 0) + 
    (results.posts?.length || 0) + 
    (results.tags?.length || 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-32 animate-in fade-in duration-200">
      
      {/* Search Header Banner */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-brand-blue/20 via-sky-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
              Explore SoundVibe
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Search songs with audio previews, find music curators & usernames, or explore community vibe reviews.
            </p>
          </div>

          {/* Unified Search Input Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tracks, @usernames, curators, lyrics, or #tags..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="w-full bg-dark-900/90 border border-white/15 rounded-2xl pl-11 pr-24 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/40 shadow-inner transition-all"
              autoFocus
            />
            {inputQuery && (
              <button
                type="button"
                onClick={() => {
                  setInputQuery('');
                  setSearchParams({});
                }}
                className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                title="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold shadow-md transition-all active:scale-95"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Filter Tabs Strip with Category Count Badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = 
            tab.id === 'all' ? totalResultsCount :
            tab.id === 'songs' ? (results.tracks?.length || 0) :
            tab.id === 'users' ? (results.users?.length || 0) :
            tab.id === 'posts' ? (results.posts?.length || 0) :
            tab.id === 'tags' ? (results.tags?.length || 0) : 0;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20 scale-[1.02]'
                  : 'glass-panel text-slate-400 hover:text-white hover:bg-white/5 border border-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {rawQuery.trim() && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Results Container */}
      {loading ? (
        <div className="py-24 text-center space-y-4">
          <Disc3 className="w-10 h-10 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Discovering matching tracks, curators & vibes...</p>
        </div>
      ) : !rawQuery.trim() ? (
        /* Empty Query State / Suggestions */
        <div className="glass-panel rounded-3xl p-12 text-center border border-white/5 space-y-6 max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-dark-900 border border-white/10 flex items-center justify-center mx-auto text-brand-blue shadow-inner">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white font-display">Start Your Discovery</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Search by artist name, track title, curator @username, or browse trending sonic genres.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {['Tame Impala', 'Phoebe Bridgers', 'Daft Punk', 'Neo-Soul', 'Indie Rock', 'Synthwave'].map((pill) => (
              <button
                key={pill}
                onClick={() => {
                  setInputQuery(pill);
                  setSearchParams({ q: pill, type: 'all' });
                }}
                className="px-3 py-1.5 rounded-full bg-dark-900 hover:bg-white/10 border border-white/10 text-xs text-slate-300 transition-colors"
              >
                {pill}
              </button>
            ))}
          </div>
        </div>
      ) : totalResultsCount === 0 ? (
        /* No Results Found */
        <div className="glass-panel rounded-3xl p-12 text-center border border-white/5 space-y-4 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-dark-900 border border-white/10 flex items-center justify-center mx-auto text-slate-500">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white font-display">No Results Found</h3>
          <p className="text-xs text-slate-400">
            We couldn't find any matches for <span className="text-white font-semibold">"{rawQuery}"</span> in {activeTab}. Try checking spelling or search all categories.
          </p>
          <button
            onClick={() => handleTabChange('all')}
            className="px-4 py-2 rounded-xl bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold transition-all shadow"
          >
            Show All Results
          </button>
        </div>
      ) : (
        /* Render Category Results */
        <div className="space-y-8">
          
          {/* SECTION: Curators & Users */}
          {activeTab === 'users' && results.users.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center border border-white/5 space-y-3 max-w-md mx-auto">
              <Users className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white font-display">No Curators Found</h3>
              <p className="text-xs text-slate-400">
                No user profiles matching <span className="text-white font-semibold">"{rawQuery}"</span>.
              </p>
              {results.tracks.length > 0 && (
                <button
                  onClick={() => handleTabChange('songs')}
                  className="px-4 py-2 rounded-xl bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue text-xs font-bold transition-all"
                >
                  Explore matching songs ({results.tracks.length}) →
                </button>
              )}
            </div>
          ) : (activeTab === 'all' || activeTab === 'users') && results.users.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-blue" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Curators & Users ({results.users.length})
                  </h2>
                </div>
                {activeTab === 'all' && results.users.length > 4 && (
                  <button
                    onClick={() => handleTabChange('users')}
                    className="text-xs text-brand-blue hover:underline font-semibold flex items-center gap-1"
                  >
                    View all curators <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(activeTab === 'all' ? results.users.slice(0, 6) : results.users).map((curator) => {
                  const isSelf = user && (user.id === curator.id || user.uid === curator.id || user.username === curator.username);
                  const isFollowing = (user?.following || []).some(
                    fId => fId === curator.id || fId === curator.username || (curator.username && fId.toLowerCase().includes(curator.username.toLowerCase()))
                  );

                  return (
                    <div
                      key={curator.id || curator.username}
                      onClick={() => navigate(`/profile/${curator.username || curator.id}`)}
                      className="p-4 rounded-2xl bg-dark-900/80 hover:bg-dark-900 border border-white/5 hover:border-brand-blue/30 transition-all flex items-start justify-between gap-3 cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                    src={curator.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${curator.username || curator.id}`}
                    alt={curator.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${curator.username || curator.id}`;
                    }}
                    className="w-12 h-12 rounded-2xl object-cover ring-1 ring-white/10 group-hover:ring-brand-blue transition-all shrink-0 bg-dark-800"
                  />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white group-hover:text-brand-blue transition-colors truncate">
                            {curator.name}
                          </h4>
                          <p className="text-xs text-slate-400 font-mono truncate">
                            @{curator.username || 'curator'}
                          </p>
                          <p className="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                            {curator.bio || 'Sharing musical taste on SoundVibe 🎧'}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                            <span>{curator.followers?.length || 0} Followers</span>
                            <span>•</span>
                            <span>{curator.following?.length || 0} Following</span>
                          </div>
                        </div>
                      </div>

                      {!isSelf && (
                        <button
                          onClick={(e) => handleFollowToggle(curator.username || curator.id, e)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                            isFollowing
                              ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                              : 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/30'
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SECTION: Songs & Tracks */}
          {activeTab === 'songs' && results.tracks.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center border border-white/5 space-y-3 max-w-md mx-auto">
              <Music className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white font-display">No Tracks Found</h3>
              <p className="text-xs text-slate-400">
                No songs matching <span className="text-white font-semibold">"{rawQuery}"</span>.
              </p>
              {results.users.length > 0 && (
                <button
                  onClick={() => handleTabChange('users')}
                  className="px-4 py-2 rounded-xl bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue text-xs font-bold transition-all"
                >
                  Explore matching curators ({results.users.length}) →
                </button>
              )}
            </div>
          ) : (activeTab === 'all' || activeTab === 'songs') && results.tracks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-brand-blue" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Songs & Tracks ({results.tracks.length})
                  </h2>
                </div>
                {activeTab === 'all' && results.tracks.length > 4 && (
                  <button
                    onClick={() => handleTabChange('songs')}
                    className="text-xs text-brand-blue hover:underline font-semibold flex items-center gap-1"
                  >
                    View all tracks <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(activeTab === 'all' ? results.tracks.slice(0, 6) : results.tracks).map((track) => {
                  const isThisPlaying = currentTrack?.id === track.id && isPlaying;

                  return (
                    <div
                      key={track.id}
                      className="p-3.5 rounded-2xl bg-dark-900/80 hover:bg-dark-900 border border-white/5 hover:border-brand-blue/30 transition-all flex items-center justify-between gap-3 group shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 group/img bg-dark-800">
                          <img
                            src={track.artwork}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => playTrack(track)}
                            className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                              isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'
                            }`}
                            title={isThisPlaying ? 'Pause preview' : 'Play 30s preview'}
                          >
                            {isThisPlaying ? (
                              <Pause className="w-5 h-5 text-brand-blue fill-brand-blue" />
                            ) : (
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            )}
                          </button>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-brand-blue transition-colors">
                            {track.title}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {track.artist}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/5">
                              {track.genre || 'Music'}
                            </span>
                            {track.album && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {track.album}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/drop-vibe?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`)}
                        className="px-3 py-1.5 rounded-xl bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 shadow-sm active:scale-95"
                        title="Broadcast this song to SoundVibe"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Drop Vibe</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SECTION: Vibe Tags */}
          {activeTab === 'tags' && results.tags.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center border border-white/5 space-y-3 max-w-md mx-auto">
              <Hash className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white font-display">No Vibe Tags Found</h3>
              <p className="text-xs text-slate-400">
                No hashtags matching <span className="text-white font-semibold">"#{rawQuery.replace('#', '')}"</span>.
              </p>
            </div>
          ) : (activeTab === 'all' || activeTab === 'tags') && results.tags.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-brand-blue" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Vibe Tags ({results.tags.length})
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {results.tags.map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => {
                      setInputQuery(t.tag.replace('#', ''));
                      setSearchParams({ q: t.tag.replace('#', ''), type: 'posts' });
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-dark-900 hover:bg-brand-blue/20 border border-white/5 hover:border-brand-blue/30 text-xs font-semibold text-slate-300 hover:text-brand-blue transition-all flex items-center gap-1.5"
                  >
                    <span>{t.tag}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/5 text-slate-400">
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* SECTION: Vibe Reviews / Posts */}
          {activeTab === 'posts' && results.posts.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center border border-white/5 space-y-3 max-w-md mx-auto">
              <MessageSquare className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white font-display">No Vibe Reviews Found</h3>
              <p className="text-xs text-slate-400">
                No posts matching <span className="text-white font-semibold">"{rawQuery}"</span>.
              </p>
              {results.tracks.length > 0 && (
                <button
                  onClick={() => handleTabChange('songs')}
                  className="px-4 py-2 rounded-xl bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue text-xs font-bold transition-all"
                >
                  Check matching tracks ({results.tracks.length}) →
                </button>
              )}
            </div>
          ) : (activeTab === 'all' || activeTab === 'posts') && results.posts.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-brand-blue" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Vibe Posts & Reviews ({results.posts.length})
                  </h2>
                </div>
                {activeTab === 'all' && results.posts.length > 3 && (
                  <button
                    onClick={() => handleTabChange('posts')}
                    className="text-xs text-brand-blue hover:underline font-semibold flex items-center gap-1"
                  >
                    View all posts <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid gap-6">
                {(activeTab === 'all' ? results.posts.slice(0, 4) : results.posts).map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onTagClick={(tag) => {
                      setInputQuery(tag.replace('#', ''));
                      setSearchParams({ q: tag.replace('#', ''), type: 'posts' });
                    }}
                    onAuthorClick={(uid) => navigate(`/profile/${post.author?.username || post.userId}`)}
                    onOpenEditProfile={() => navigate('/settings')}
                    onPostUpdated={(updated) => {
                      setResults(prev => ({
                        ...prev,
                        posts: prev.posts.map(p => p.id === updated.id ? updated : p)
                      }));
                    }}
                    onPostDeleted={(deletedId) => {
                      setResults(prev => ({
                        ...prev,
                        posts: prev.posts.filter(p => p.id !== deletedId)
                      }));
                    }}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}

    </div>
  );
};