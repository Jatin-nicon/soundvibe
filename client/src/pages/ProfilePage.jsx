import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { PostCard } from '../components/PostCard';
import { FollowListModal } from '../components/FollowListModal';
import { 
  User, 
  Disc3, 
  Sparkles, 
  Edit3, 
  UserPlus, 
  UserCheck, 
  ArrowLeft,
  Flame,
  Play,
  Pause,
  Award,
  Users,
  LogIn
} from 'lucide-react';

import { getFirestoreUser, getFirestorePosts } from '../services/firestoreService';

export const ProfilePage = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, toggleFollowUser, setAuthModalOpen } = useAuth();
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState('followers');

  // If param is 'me' or missing, look up currentUser
  const targetHandle = (username === 'me' || !username) ? (currentUser?.username || currentUser?.id) : username;
  const isOwnProfile = currentUser && (
    currentUser.username === targetHandle ||
    currentUser.id === targetHandle ||
    targetHandle === 'me'
  );

  const fetchProfile = async () => {
    if (!targetHandle) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch user from Firestore
      let userObj = await getFirestoreUser(targetHandle);
      if (!userObj && isOwnProfile) {
        userObj = currentUser;
      }

      const uidToQuery = userObj?.id || userObj?.uid || (isOwnProfile ? currentUser?.id : targetHandle);
      
      // 2. Fetch user posts from Firestore (linked permanently to UID and username)
      const userPosts = await getFirestorePosts({
        userId: uidToQuery,
        authorUsername: userObj?.username || targetHandle
      });

      const followingList = currentUser?.following || [];
      const isFollowing = followingList.includes(targetHandle) || (userObj?.id && followingList.includes(userObj.id));

      const postsList = Array.isArray(userPosts) ? userPosts : (userPosts?.posts || []);

      if (userObj) {
        setProfileData({
          user: userObj,
          posts: postsList,
          isFollowing
        });
      } else {
        // Fallback to API
        const res = await fetch(`/api/users/${encodeURIComponent(targetHandle)}`);
        const data = await res.json();
        setProfileData(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [targetHandle, currentUser]);

  const handleFollow = async () => {
    if (!currentUser) {
      navigate('/settings');
      return;
    }
    try {
      await toggleFollowUser(targetHandle);
      fetchProfile();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4 max-w-4xl mx-auto">
        <Disc3 className="w-10 h-10 text-brand-purple animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Loading listener taste profile...</p>
      </div>
    );
  }

  if (!profileData || !profileData.user) {
    return (
      <div className="glass-panel rounded-3xl p-12 text-center border border-white/10 space-y-4 max-w-lg mx-auto my-12">
        <div className="w-16 h-16 rounded-3xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center mx-auto text-brand-purple">
          <User className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white font-display">
            {!currentUser && (!username || username === 'me') ? 'Sign In Required' : 'Listener Profile Not Found'}
          </h3>
          <p className="text-xs text-slate-400">
            {!currentUser && (!username || username === 'me')
              ? 'Please sign in with your Google account to view your personal listener profile and taste collection.'
              : `Handle "@${targetHandle || 'user'}" has not set up a profile or dropped vibes yet.`}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button 
            onClick={() => navigate('/')} 
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all"
          >
            Return to Feed
          </button>
          {!currentUser && (
            <button 
              onClick={() => setAuthModalOpen(true)} 
              className="px-5 py-2 rounded-xl bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const { user, posts = [], isFollowing } = profileData;

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 max-w-4xl mx-auto animate-in fade-in duration-200">
      
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to timeline</span>
      </button>

      {/* Profile Header Banner Card */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-brand-blue/15 via-sky-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
          
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-5 min-w-0">
            <div className="relative shrink-0">
              <img
                src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id || 'listener'}`}
                alt={user.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id || 'listener'}`;
                }}
                className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl object-cover ring-4 ring-brand-blue/30 shadow-2xl bg-dark-850"
              />
              <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 p-1 sm:p-1.5 bg-dark-900 rounded-lg sm:rounded-xl border border-white/10 text-brand-blue">
                <Disc3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-white truncate">{user.name}</h1>
                <span className="text-xs text-slate-400 font-mono">@{user.username}</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md">{user.bio}</p>
              
              {/* Badges */}
              <div className="flex flex-wrap gap-1 pt-1">
                {(user.badges || ['Music Explorer']).map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-blue/20 text-brand-blue border border-brand-blue/30"
                  >
                    <Award className="w-3 h-3" />
                    <span>{b}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2 self-stretch sm:self-center shrink-0">
            {isOwnProfile ? (
              <button
                onClick={() => navigate('/settings')}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 sm:py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all shadow"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                onClick={handleFollow}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all shadow-md ${
                  isFollowing
                    ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                    : 'bg-brand-blue hover:bg-sky-400 text-white shadow-brand-blue/25'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

        {/* Stats & Genres strip */}
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4 sm:gap-6 text-center">
            <div>
              <p className="text-base sm:text-lg font-bold text-white font-mono">{posts.length}</p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider">Vibe Drops</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFollowModalTab('followers');
                setFollowModalOpen(true);
              }}
              className="text-center group cursor-pointer focus:outline-none p-1 rounded-xl hover:bg-white/5 transition-all"
            >
              <p className="text-base sm:text-lg font-bold text-white font-mono group-hover:text-brand-blue transition-colors">
                {user.followers?.length || 0}
              </p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 group-hover:text-white uppercase tracking-wider underline-offset-4 group-hover:underline">
                Followers
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setFollowModalTab('following');
                setFollowModalOpen(true);
              }}
              className="text-center group cursor-pointer focus:outline-none p-1 rounded-xl hover:bg-white/5 transition-all"
            >
              <p className="text-base sm:text-lg font-bold text-white font-mono group-hover:text-brand-blue transition-colors">
                {user.following?.length || 0}
              </p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 group-hover:text-white uppercase tracking-wider underline-offset-4 group-hover:underline">
                Following
              </p>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            {(user.favoriteGenres || ['Indie Rock', 'Electronic']).map((g) => (
              <span
                key={g}
                className="text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-dark-900 text-slate-300 border border-white/5"
              >
                {g}
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* Desert Island Discs / Top 4 Tracks */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold font-display text-white">
            Desert Island Discs (Heavy Rotation Favorites)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(user.topTracks || []).length === 0 ? (
            <div className="col-span-2 p-6 rounded-2xl bg-dark-900/60 border border-white/5 text-center text-xs text-slate-500">
              No desert island tracks selected yet.
            </div>
          ) : (
            user.topTracks.map((track) => {
              const isThisPlaying = currentTrack?.id === track.id && isPlaying;
              return (
                <div
                  key={track.id}
                  className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-dark-900/80 border border-white/5 flex items-center justify-between gap-3 hover:border-brand-blue/40 transition-all group"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img src={track.artwork} alt={track.title} className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover shadow-md" />
                      <button
                        onClick={() => playTrack(track)}
                        className={`absolute inset-0 bg-black/60 rounded-lg sm:rounded-xl flex items-center justify-center text-white transition-all ${
                          isThisPlaying ? 'opacity-100 bg-brand-blue/80' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isThisPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{track.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* User's Vibe Drops */}
      <div className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-bold font-display text-white">
              Vibes Dropped by {user.name} ({posts.length})
            </h2>
          </div>
          {isOwnProfile && (
            <button
              onClick={() => navigate('/drop-vibe')}
              className="text-xs font-bold text-brand-blue hover:underline transition-colors"
            >
              + Drop New Vibe
            </button>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="p-10 rounded-2xl bg-dark-900/60 border border-white/5 text-center space-y-2">
            <p className="text-sm font-semibold text-white">No vibes dropped yet</p>
            <p className="text-xs text-slate-400">
              When {user.name} reviews tracks, their posts will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onTagClick={(tag) => navigate(`/?genre=${encodeURIComponent(tag.replace('#', ''))}`)}
                onAuthorClick={(uid) => navigate(`/profile/${post.author?.username || post.userId}`)}
                onOpenEditProfile={() => navigate('/settings')}
                onPostUpdated={(updated) => {
                  setProfileData(prev => prev ? {
                    ...prev,
                    posts: (prev.posts || []).map(p => p.id === updated.id ? updated : p)
                  } : prev);
                }}
                onPostDeleted={(deletedId) => {
                  setProfileData(prev => prev ? {
                    ...prev,
                    posts: (prev.posts || []).filter(p => p.id !== deletedId)
                  } : prev);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Followers / Following Modal */}
      <FollowListModal
        isOpen={followModalOpen}
        onClose={() => {
          setFollowModalOpen(false);
          fetchProfile();
        }}
        userId={user.id || user.username}
        userName={user.name}
        initialTab={followModalTab}
      />

    </div>
  );
};
