import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { 
  Flame, 
  Users, 
  Star, 
  TrendingUp, 
  Sparkles, 
  PlusCircle, 
  Disc3, 
  RefreshCw,
  Heart 
} from 'lucide-react';

const GENRE_FILTERS = [
  'All', 'Psychedelic Pop', 'Indie Rock', 'Neo-Soul', 'Synthwave', 
  'City Pop', 'Lofi', 'Hip-Hop', 'Electronic', 'Dream Pop'
];

import { getFirestorePosts } from '../services/firestoreService';
import { cacheService } from '../services/cacheService';

export const FeedPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeGenre = searchParams.get('genre') || 'All';
  const activeSort = searchParams.get('sort') || 'all';
  const searchQuery = searchParams.get('q') || '';

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalPosts, setTotalPosts] = useState(0);

  const fetchPosts = async (pageToFetch = 1, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else if (posts.length === 0) {
      setLoading(true);
    }
    try {
      const clusterResult = await getFirestorePosts({
        filter: activeSort,
        genre: activeGenre,
        currentUserId: user?.id || user?.uid || user?.username,
        page: pageToFetch,
        limit: 10,
        returnCluster: true
      });

      const fetchedList = Array.isArray(clusterResult) ? clusterResult : (clusterResult.posts || []);
      const moreAvailable = clusterResult.hasMore ?? false;
      const totalCount = clusterResult.total ?? fetchedList.length;

      if (isLoadMore) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNew = fetchedList.filter(p => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setPosts(fetchedList);
      }
      setHasMore(moreAvailable);
      setTotalPosts(totalCount);
      setPage(pageToFetch);
    } catch (err) {
      console.error('Error fetching Firestore posts:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const userId = user?.id || user?.uid;
  useEffect(() => {
    fetchPosts(1, false);
  }, [activeSort, activeGenre, userId]);

  const handleRefresh = () => {
    cacheService.invalidateFeed();
    fetchPosts(1, false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPosts(page + 1, true);
    }
  };

  const handleSortChange = (sortType) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('sort', sortType);
    setSearchParams(nextParams);
  };

  const handleGenreChange = (genre) => {
    const nextParams = new URLSearchParams(searchParams);
    if (genre === 'All') {
      nextParams.delete('genre');
    } else {
      nextParams.set('genre', genre);
    }
    setSearchParams(nextParams);
  };

  const handleClearSearch = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('q');
    setSearchParams(nextParams);
  };

  const filteredPosts = searchQuery.trim()
    ? posts.filter(p => {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.track?.title?.toLowerCase().includes(q) ||
          p.track?.artist?.toLowerCase().includes(q) ||
          p.headline?.toLowerCase().includes(q) ||
          p.review?.toLowerCase().includes(q) ||
          (p.vibeTags || []).some(t => t.toLowerCase().includes(q))
        );
      })
    : posts;

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 max-w-4xl mx-auto animate-in fade-in duration-200">
      
      {/* Top Banner / Quick Composer Hero */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-brand-blue/15 via-sky-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-1 sm:space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-brand-blue/15 border border-brand-blue/30 text-brand-blue text-[11px] sm:text-xs font-semibold">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Real-Time Music Community</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold font-display text-white tracking-tight">
            What are you listening to right now?
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Share track reviews, favorite lyric lines, and vibe ratings with music lovers worldwide.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Genre Pills */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Main Feed Sub-Tabs */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex bg-dark-900/90 p-1 rounded-2xl border border-white/5 shrink-0">
            <button
              onClick={() => handleSortChange('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeSort === 'all'
                  ? 'bg-brand-blue text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>All Vibes</span>
            </button>

            <button
              onClick={() => handleSortChange('trending')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeSort === 'trending'
                  ? 'bg-brand-blue text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Trending</span>
            </button>

            <button
              onClick={() => handleSortChange('top-rated')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeSort === 'top-rated'
                  ? 'bg-brand-blue text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span>Top Rated</span>
            </button>

            {user && (
              <button
                onClick={() => handleSortChange('liked')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeSort === 'liked'
                    ? 'bg-brand-blue text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400/20" />
                <span>Liked</span>
              </button>
            )}
          </div>

          <button
            onClick={handleRefresh}
            title="Refresh Feed"
            className="p-2 rounded-xl bg-dark-900 border border-white/5 text-slate-400 hover:text-white hover:border-white/10 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Genre Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {GENRE_FILTERS.map((g) => {
            const isSelected = activeGenre === g;
            return (
              <button
                key={g}
                onClick={() => handleGenreChange(g)}
                className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'bg-dark-900/80 text-slate-400 hover:text-slate-200 border border-white/5'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Filter Header Banner */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-brand-purple/15 border border-brand-purple/30 text-xs">
          <p className="text-slate-300">
            Showing vibes matching <span className="font-bold text-white">"{searchQuery}"</span> ({filteredPosts.length} found)
          </p>
          <button
            onClick={handleClearSearch}
            className="text-brand-purple hover:text-brand-pink font-semibold hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Posts List */}
      {loading ? (
        <div className="space-y-4 py-12 text-center">
          <div className="inline-block p-4 rounded-2xl bg-dark-900 border border-white/5 animate-pulse">
            <Disc3 className="w-8 h-8 text-brand-purple animate-spin" />
          </div>
          <p className="text-xs text-slate-400">Tuning into community frequencies...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center border border-white/10 space-y-4 max-w-lg mx-auto my-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand-purple/20 to-brand-pink/20 border border-brand-purple/30 flex items-center justify-center mx-auto text-brand-purple shadow-lg shadow-brand-purple/10">
            <Disc3 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-white font-display">
              {searchQuery.trim() ? 'No matches found' : 'The Vibe Feed is Ready For You'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              {searchQuery.trim()
                ? `No music reviews found matching "${searchQuery}". Try searching another track or artist!`
                : 'No music reviews posted yet. Be the first to search any track, write your thoughts, quote your favorite lyrics, and drop a vibe!'}
            </p>
          </div>
          <button
            onClick={searchQuery.trim() ? handleClearSearch : () => navigate('/drop-vibe')}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-violet via-brand-purple to-brand-pink text-white text-xs font-bold shadow-lg shadow-brand-purple/25 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto"
          >
            <span>{searchQuery.trim() ? 'Clear Search' : 'Drop the First Vibe'}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-6">
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onTagClick={(tag) => handleGenreChange(tag.replace('#', ''))}
                onAuthorClick={(uid) => navigate(`/profile/${post.author?.username || post.userId}`)}
                onOpenEditProfile={() => navigate('/settings')}
                onPostUpdated={(updated) => {
                  setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
                }}
                onPostDeleted={(deletedId) => {
                  setPosts(prev => prev.filter(p => p.id !== deletedId));
                }}
              />
            ))}
          </div>

          {/* Clustered Stream Pagination (Load More) */}
          {hasMore && !searchQuery.trim() && (
            <div className="pt-4 pb-2 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-2xl bg-dark-900/90 hover:bg-dark-850 text-white border border-white/10 hover:border-brand-blue/30 shadow-lg text-xs font-bold transition-all flex items-center gap-2 mx-auto disabled:opacity-60 cursor-pointer active:scale-95"
              >
                {loadingMore ? (
                  <>
                    <Disc3 className="w-4 h-4 text-brand-blue animate-spin" />
                    <span>Streaming Next Cluster...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
                    <span>Load More Vibes</span>
                    {totalPosts > posts.length && (
                      <span className="text-[11px] text-slate-400 font-normal">
                        ({posts.length} of {totalPosts})
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          )}

          {!hasMore && posts.length > 6 && !searchQuery.trim() && (
            <div className="text-center py-6">
              <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                <Sparkles className="w-3 h-3 text-slate-600" />
                <span>You're all caught up with community vibes</span>
              </p>
            </div>
          )}
        </>
      )}

    </div>
  );
};
