import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { EditPostModal } from './EditPostModal';
import { 
  Play, 
  Pause, 
  Heart, 
  MessageCircle, 
  Share2, 
  Star, 
  Sparkles, 
  Quote, 
  ExternalLink,
  Send,
  UserPlus,
  UserCheck,
  Disc3,
  Bookmark,
  Check,
  Pencil,
  Flame,
  Waves,
  Repeat,
  Zap,
  ThumbsDown,
  LogIn,
  Trash2,
  X
} from 'lucide-react';
import { 
  reactToFirestorePost, 
  addCommentToFirestorePost, 
  updateCommentInFirestorePost, 
  deleteCommentFromFirestorePost 
} from '../services/firestoreService';
import { formatPostDate, formatFullDate } from '../utils/dateUtils';

const REACTION_CONFIG = [
  { key: 'fire', label: 'Fire', icon: Flame, color: 'text-amber-400', activeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  { key: 'vibe', label: 'Vibe', icon: Waves, color: 'text-sky-400', activeBg: 'bg-sky-500/15 border-sky-500/30 text-sky-300' },
  { key: 'heart', label: 'Love', icon: Heart, color: 'text-rose-400', activeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  { key: 'repeat', label: 'Loop', icon: Repeat, color: 'text-indigo-400', activeBg: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' },
  { key: 'mindblown', label: 'Electric', icon: Zap, color: 'text-emerald-400', activeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  { key: 'overrated', label: 'Skip', icon: ThumbsDown, color: 'text-slate-400', activeBg: 'bg-slate-500/20 border-slate-500/30 text-slate-200' }
];

export const PostCard = ({ 
  post, 
  onTagClick, 
  onAuthorClick, 
  onOpenAuth,
  onPostUpdated,
  onPostDeleted,
  defaultShowComments = false
}) => {
  const { user, token, toggleFollowUser, setAuthModalOpen } = useAuth();
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  const initialComments = Array.isArray(post?.comments) ? post.comments : [];
  const [currentPost, setCurrentPost] = useState(post);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [reactions, setReactions] = useState(post?.reactions || {});
  const [comments, setComments] = useState(initialComments);
  const [commentsCount, setCommentsCount] = useState(initialComments.length);
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [commentInput, setCommentInput] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Edit & Delete Comment State
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [updatingComment, setUpdatingComment] = useState(false);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState(null);

  useEffect(() => {
    setCurrentPost(post);
    setReactions(post?.reactions || {});
    const postComments = Array.isArray(post?.comments) ? post.comments : [];
    setComments(postComments);
    setCommentsCount(postComments.length);
    if (defaultShowComments) {
      setShowComments(true);
    }
  }, [post, defaultShowComments]);

  const isThisTrackPlaying = currentTrack?.id === post?.track?.id && isPlaying;
  const author = post.author || { id: post.userId, name: 'Music Explorer', avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${post.userId}` };
  const authorIdentifier = author.id || author.username;
  const isFollowingAuthor = (user?.following || []).some(
    fId => fId === author.id || fId === author.username || (author.username && fId.toLowerCase().includes(author.username.toLowerCase()))
  );
  const isSelf = user && (
    user.id === author.id || 
    user.uid === author.id || 
    user.id === post.userId || 
    user.uid === post.userId || 
    (user.username && author.username && user.username.toLowerCase() === author.username.toLowerCase())
  );

  const handlePlaySong = () => {
    playTrack(post.track);
  };

  const handleFollow = async () => {
    if (!user) {
      if (onOpenEditProfile) onOpenEditProfile();
      return;
    }
    try {
      await toggleFollowUser(author.id || author.username);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReaction = async (reactionKey) => {
    const activeUserId = user?.id || user?.uid || user?.username || 'guest_listener';

    // Optimistic UI update
    setReactions(prev => {
      const currentList = Array.isArray(prev[reactionKey]) ? prev[reactionKey] : [];
      const hasReacted = currentList.includes(activeUserId);
      return {
        ...prev,
        [reactionKey]: hasReacted
          ? currentList.filter(id => id !== activeUserId)
          : [...currentList, activeUserId]
      };
    });

    try {
      const updatedReactions = await reactToFirestorePost(post.id, reactionKey, activeUserId);
      if (updatedReactions) {
        setReactions(updatedReactions);
      }
    } catch (err) {
      console.warn('Reaction error:', err);
    }
  };

  const toggleCommentsDrawer = () => {
    setShowComments(prev => !prev);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    if (!commentInput.trim()) return;

    const authorUsername = user.username || user.email?.split('@')[0] || 'listener';
    const authorDisplayName = user.name || user.displayName || 'Music Explorer';
    const authorPhoto = user.avatar || user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id || user.uid}`;

    setSubmittingComment(true);
    try {
      const newComment = await addCommentToFirestorePost(post.id, {
        text: commentInput.trim(),
        userId: user.id || user.uid,
        userName: authorDisplayName,
        userAvatar: authorPhoto,
        username: authorUsername
      });

      if (newComment) {
        const updatedList = [...(comments || []), newComment];
        setComments(updatedList);
        setCommentsCount(updatedList.length);
        setCommentInput('');
        if (onPostUpdated) {
          onPostUpdated({
            ...currentPost,
            comments: updatedList,
            commentsCount: updatedList.length
          });
        }
      }
    } catch (err) {
      console.error('Comment error:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleStartEditComment = (comm) => {
    setEditingCommentId(comm.id);
    setEditingCommentText(comm.text);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  const handleSaveEditComment = async (commentId) => {
    if (!editingCommentText.trim()) return;
    setUpdatingComment(true);
    try {
      const userIdentifier = user?.id || user?.uid || user?.username;
      await updateCommentInFirestorePost(post.id, commentId, editingCommentText.trim(), userIdentifier);

      const updatedComments = comments.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            text: editingCommentText.trim(),
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });

      setComments(updatedComments);
      setEditingCommentId(null);
      setEditingCommentText('');
      if (onPostUpdated) {
        onPostUpdated({
          ...currentPost,
          comments: updatedComments
        });
      }
    } catch (err) {
      console.error('Error saving comment:', err);
    } finally {
      setUpdatingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      const userIdentifier = user?.id || user?.uid || user?.username;
      await deleteCommentFromFirestorePost(post.id, commentId, userIdentifier);

      const updatedComments = comments.filter(c => c.id !== commentId);
      setComments(updatedComments);
      setCommentsCount(updatedComments.length);
      setDeleteConfirmCommentId(null);
      if (onPostUpdated) {
        onPostUpdated({
          ...currentPost,
          comments: updatedComments,
          commentsCount: updatedComments.length
        });
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const handleShare = () => {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard?.writeText(postUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < fullStars
              ? 'text-amber-400 fill-amber-400'
              : i < rating
              ? 'text-amber-400 fill-amber-400/50'
              : 'text-slate-600'
          }`}
        />
      );
    }
    return stars;
  };

  return (
    <article className="glass-panel glass-panel-hover rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 transition-all relative overflow-hidden border border-white/10">
      
      {/* Top Bar: Author info & Actions */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <Link 
          to={`/profile/${author.username || author.id}`}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group min-w-0"
        >
          <img
            src={author.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${author.username || author.id || 'listener'}`}
            alt={author.name}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${author.username || author.id || 'listener'}`;
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ring-white/10 group-hover:ring-brand-blue transition-all shrink-0 bg-dark-800"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-brand-blue transition-colors truncate">
                {author.name || 'Anonymous Listener'}
              </h4>
              {(author.badges || []).slice(0, 1).map((b, i) => (
                <span key={i} className="hidden sm:inline-block text-[9px] px-1.5 py-0.2 rounded-full bg-brand-blue/20 text-brand-blue border border-brand-blue/30 font-medium shrink-0">
                  {b}
                </span>
              ))}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              @{author.username || 'user'} •{' '}
              <span 
                className="text-[10px] sm:text-[11px] text-slate-500" 
                title={formatFullDate(currentPost?.createdAt)}
              >
                {formatPostDate(currentPost?.createdAt)}
              </span>
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {isSelf ? (
            <button
              onClick={() => setEditModalOpen(true)}
              className="px-2 sm:px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all border border-white/10 shadow-sm"
              title="Edit Vibe Drop"
            >
              <Pencil className="w-3 h-3 text-brand-blue" />
              <span>Edit</span>
            </button>
          ) : (
            <button
              onClick={handleFollow}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                isFollowingAuthor
                  ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                  : 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/30'
              }`}
            >
              {isFollowingAuthor ? (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Following</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Follow</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleShare}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
            title="Share post"
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Track Player Card */}
      <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-dark-900/90 border border-white/5 mb-3 sm:mb-4 flex items-center justify-between gap-3 sm:gap-4 group">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
          <div className="relative shrink-0">
            <img
              src={post.track.artwork}
              alt={post.track.title}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl object-cover shadow-md group-hover:scale-105 transition-transform"
            />
            <button
              onClick={handlePlaySong}
              className={`absolute inset-0 m-auto w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
                isThisTrackPlaying
                  ? 'bg-brand-pink ring-2 ring-white/50 scale-100'
                  : 'bg-black/60 hover:bg-brand-blue opacity-90 group-hover:opacity-100'
              }`}
            >
              {isThisTrackPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ml-0.5" />}
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h5 className="text-xs sm:text-sm font-bold text-white truncate hover:text-brand-blue cursor-pointer" onClick={handlePlaySong}>
                {post.track.title}
              </h5>
              {isThisTrackPlaying && (
                <span className="flex items-center gap-[2px] h-3 shrink-0">
                  <span className="sound-bar sound-bar-1 !h-2.5" />
                  <span className="sound-bar sound-bar-2 !h-3.5" />
                  <span className="sound-bar sound-bar-3 !h-2" />
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300 truncate">{post.track.artist}</p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">{post.track.album} • {post.track.genre || 'Single'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <a
            href={post.track.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(post.track.artist + ' ' + post.track.title)}`}
            target="_blank"
            rel="noreferrer"
            title="Listen on Spotify"
            className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-all flex items-center gap-1.5 border border-emerald-500/20 active:scale-95 shadow-sm"
          >
            <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 5.524 4.477 10 10 10s10-4.476 10-10c0-5.523-4.477-10-10-10zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.436-5.308-1.76-8.793-.964-.335.077-.67-.13-.746-.465-.077-.336.13-.67.466-.747 3.816-.872 7.09-.5 9.723 1.11.294.18.387.564.207.859zm1.224-2.718c-.226.368-.707.484-1.076.258-2.69-1.654-6.79-2.133-9.972-1.166-.418.127-.864-.108-.991-.527-.127-.418.108-.864.527-.991 3.633-1.103 8.147-.568 11.254 1.349.369.227.485.708.258 1.077zm.106-2.834C14.692 8.95 8.7 8.752 5.24 9.803c-.499.152-1.028-.13-1.18-.629-.152-.499.13-1.028.629-1.18 3.99-1.21 10.597-.98 14.498 1.336.449.266.595.85.328 1.299-.266.449-.85.595-1.299.329z"/>
            </svg>
            <span className="text-[11px] sm:text-xs">Spotify</span>
          </a>
          <a
            href={post.track.youtubeMusicUrl || `https://music.youtube.com/search?q=${encodeURIComponent(post.track.artist + ' ' + post.track.title)}`}
            target="_blank"
            rel="noreferrer"
            title="Listen on YouTube Music"
            className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 text-xs font-semibold transition-all flex items-center gap-1.5 border border-red-500/20 active:scale-95 shadow-sm"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span className="text-[11px] sm:text-xs">YT Music</span>
          </a>
        </div>
      </div>

      {/* Review Content */}
      <div className="space-y-2 sm:space-y-2.5 mb-3 sm:mb-4">
        {/* Rating & Mood */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex">{renderStars(currentPost.rating)}</div>
            <span className="text-xs font-bold text-amber-400 ml-1">{currentPost.rating?.toFixed(1)}</span>
          </div>
          {currentPost.mood && (
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue border border-brand-blue/30 font-medium flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3 h-3 text-brand-blue" />
              <span>{currentPost.mood.replace(/[^\w\s&/-]/g, '').trim()}</span>
            </span>
          )}
        </div>

        {/* Headline */}
        {currentPost.headline && (
          <Link to={`/post/${currentPost.id}`} className="block group/head">
            <h3 className="text-sm sm:text-base font-bold text-white font-display group-hover/head:text-brand-blue transition-colors">
              {currentPost.headline}
            </h3>
          </Link>
        )}

        {/* Review Text */}
        {currentPost.review && (
          <Link to={`/post/${currentPost.id}`} className="block group/rev">
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal group-hover/rev:text-white transition-colors">
              {currentPost.review}
            </p>
          </Link>
        )}

        {/* Favorite Lyric Highlight */}
        {currentPost.favoriteLyric && (
          <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-brand-blue/10 border-l-4 border-brand-blue my-2 sm:my-3">
            <div className="flex items-start gap-2">
              <Quote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm italic text-slate-200 font-medium">
                "{currentPost.favoriteLyric}"
              </p>
            </div>
          </div>
        )}

        {/* Vibe Tags */}
        {(currentPost.vibeTags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-1.5 pt-1">
            {currentPost.vibeTags.map((tag, idx) => (
              <button
                key={idx}
                onClick={() => onTagClick(tag)}
                className="text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-dark-850 text-brand-blue hover:bg-brand-blue/20 hover:text-white border border-brand-blue/20 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reaction Bar & Comments Trigger */}
      <div className="pt-2.5 sm:pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
        {/* Sleek Vector Reactions */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {REACTION_CONFIG.map(({ key, label, icon: Icon, color, activeBg }) => {
            const userList = Array.isArray(reactions[key]) ? reactions[key] : [];
            const count = userList.length;
            const activeUserId = user?.id || user?.uid || user?.username;
            const hasReacted = activeUserId ? userList.includes(activeUserId) : false;

            return (
              <button
                key={key}
                onClick={() => handleReaction(key)}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-semibold transition-all group active:scale-95 ${
                  hasReacted
                    ? `${activeBg} border shadow-sm scale-105`
                    : count > 0
                    ? 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                    : 'bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
                title={label}
              >
                <Icon className={`w-3.5 h-3.5 transition-transform group-hover:scale-110 ${hasReacted ? color : 'text-slate-400 group-hover:' + color} ${hasReacted ? 'fill-current' : ''}`} />
                <span className="text-[11px] font-medium">{label}</span>
                {count > 0 && <span className="font-mono text-[10px] opacity-80 font-bold">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Comment Drawer Button */}
        <button
          onClick={toggleCommentsDrawer}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
            showComments ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>{commentsCount} {commentsCount === 1 ? 'Thought' : 'Thoughts'}</span>
        </button>
      </div>

      {/* Copied link toast */}
      {copiedLink && (
        <div className="absolute top-3 right-3 bg-brand-purple text-white text-xs px-3 py-1 rounded-full shadow-lg animate-in fade-in">
          Link copied!
        </div>
      )}

      {/* Comments Drawer */}
      {showComments && (
        <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
          <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Discussion & Music Opinions ({commentsCount})
          </h5>

          {/* Comment Form or Sign In Prompt */}
          {user ? (
            <form onSubmit={handleAddComment} className="flex items-center gap-2.5">
              <img
                src={user.avatar || user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id || 'listener'}`}
                alt={user.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id || 'listener'}`;
                }}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-blue/30 shrink-0 bg-dark-800"
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={`Share thoughts as @${user.username || 'listener'}...`}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  disabled={submittingComment}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors"
                />
                <button
                  type="submit"
                  disabled={!commentInput.trim() || submittingComment}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-brand-blue hover:bg-sky-400 text-white disabled:opacity-40 transition-all shadow-sm active:scale-95"
                  title="Send comment"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          ) : (
            <div className="p-3.5 rounded-2xl bg-dark-900/90 border border-brand-blue/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div>
                <p className="text-xs font-bold text-white">Join the Music Conversation</p>
                <p className="text-[11px] text-slate-400">Sign in to share your thoughts, rate tracks, and connect with curators.</p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-brand-blue hover:bg-sky-400 text-white text-xs font-bold shadow-md transition-all shrink-0 flex items-center gap-1.5 active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In to Comment</span>
              </button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
            {loadingComments ? (
              <p className="text-xs text-slate-500 text-center py-2">Loading conversation...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">No thoughts shared yet. Be the first to start the vibe!</p>
            ) : (
              comments.map((comm) => {
                const commentAvatar = comm.userAvatar || comm.authorAvatar || comm.author?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${comm.userId || comm.username || 'listener'}`;
                const commentName = comm.userName || comm.authorName || comm.author?.name || 'Music Explorer';
                const commentHandle = comm.username || comm.author?.username || 'listener';
                const isCommentOwner = user && (
                  user.id === comm.userId || 
                  user.uid === comm.userId || 
                  (user.username && comm.username && user.username.toLowerCase() === comm.username.toLowerCase())
                );
                const isEditing = editingCommentId === comm.id;

                return (
                  <div key={comm.id} className="p-3 rounded-2xl bg-dark-900/90 border border-white/5 flex items-start gap-3 group">
                    <Link to={`/profile/${commentHandle}`} className="shrink-0">
                      <img
                        src={commentAvatar}
                        alt={commentName}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${commentHandle || 'listener'}`;
                        }}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-brand-blue transition-all bg-dark-800"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <Link to={`/profile/${commentHandle}`} className="text-xs font-bold text-white hover:text-brand-blue truncate transition-colors">
                            {commentName}
                          </Link>
                          <span className="text-[10px] text-slate-400 truncate">@{commentHandle}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span 
                            className="text-[10px] text-slate-500"
                            title={formatFullDate(comm.createdAt)}
                          >
                            {comm.updatedAt ? 'Edited · ' : ''}
                            {formatPostDate(comm.createdAt)}
                          </span>
                          {isCommentOwner && !isEditing && deleteConfirmCommentId !== comm.id && (
                            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmCommentId(null);
                                  handleStartEditComment(comm);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Edit comment"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleCancelEditComment();
                                  setDeleteConfirmCommentId(comm.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete comment"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {deleteConfirmCommentId === comm.id ? (
                        <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row items-center justify-between gap-2 animate-in fade-in duration-150">
                          <p className="text-[11px] text-rose-300 font-medium">Are you sure you want to delete this comment?</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmCommentId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-medium transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comm.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      ) : isEditing ? (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            disabled={updatingComment}
                            className="w-full bg-dark-800 border border-brand-blue/50 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={handleCancelEditComment}
                              disabled={updatingComment}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditComment(comm.id)}
                              disabled={!editingCommentText.trim() || updatingComment}
                              className="px-2.5 py-1 rounded-lg bg-brand-blue hover:bg-sky-400 text-white text-[11px] font-bold shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-200 mt-1 leading-relaxed break-words">{comm.text}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit Post Modal with Locked Track */}
      <EditPostModal
        post={currentPost}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onPostUpdated={(updated) => {
          setCurrentPost(updated);
          if (onPostUpdated) onPostUpdated(updated);
        }}
        onPostDeleted={(deletedId) => {
          if (onPostDeleted) onPostDeleted(deletedId);
        }}
      />

    </article>
  );
};
