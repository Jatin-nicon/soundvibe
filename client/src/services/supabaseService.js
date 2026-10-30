import { supabase, isSupabaseConfigured } from '../supabase';
import { cacheService, searchMusicCached } from './cacheService';

// Helper to format raw Postgres row with reactions array into client reaction map
const formatPostRow = (row) => {
  if (!row) return null;

  const rawReactions = Array.isArray(row.reactions) ? row.reactions : [];
  const reactionMap = { fire: [], vibe: [], heart: [], repeat: [], mindblown: [], overrated: [] };

  rawReactions.forEach(r => {
    if (r && r.reaction_type && reactionMap[r.reaction_type]) {
      reactionMap[r.reaction_type].push(r.user_id);
    }
  });

  const rawComments = Array.isArray(row.comments) ? row.comments : [];
  const formattedComments = rawComments.map(c => ({
    id: c.id,
    userId: c.user_id,
    text: c.text,
    createdAt: c.created_at,
    author: c.profiles ? {
      id: c.profiles.id,
      name: c.profiles.name,
      username: c.profiles.username,
      avatar: c.profiles.avatar
    } : { id: c.user_id, name: 'Curator' }
  }));

  const authorProfile = row.profiles || {};

  return {
    id: row.id,
    _postgresId: row.id,
    userId: row.user_id,
    track: row.track || {},
    rating: row.rating,
    headline: row.headline || '',
    review: row.review || '',
    favoriteLyric: row.favorite_lyric || '',
    vibeTags: Array.isArray(row.vibe_tags) ? row.vibe_tags : [],
    mood: row.mood || 'Nostalgic',
    reactions: reactionMap,
    comments: formattedComments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.user_id,
      name: authorProfile.name || 'Music Explorer',
      username: authorProfile.username || 'curator',
      avatar: authorProfile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${row.user_id}`,
      badges: authorProfile.badges || ['Curator']
    }
  };
};

// ================= USER OPERATIONS =================

export const getSupabaseUser = async (uidOrUsername) => {
  if (!isSupabaseConfigured || !uidOrUsername) return null;
  const clean = String(uidOrUsername).trim().replace(/^@/, '');

  try {
    // 1. Try by permanent UID (Firebase Auth UID)
    const { data: byId } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', clean)
      .maybeSingle();

    // 2. Try by username
    const profile = byId || (await supabase
      .from('profiles')
      .select('*')
      .ilike('username', clean)
      .maybeSingle()).data;

    if (!profile) return null;

    // 3. Hydrate relational follows (followers & following arrays)
    const [followingRes, followersRes] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      supabase.from('follows').select('follower_id').eq('following_id', profile.id)
    ]);

    const followingIds = (followingRes.data || []).map(r => r.following_id);
    const followerIds = (followersRes.data || []).map(r => r.follower_id);

    return {
      id: profile.id,
      uid: profile.id,
      name: profile.name,
      username: profile.username,
      email: profile.email,
      avatar: profile.avatar,
      bio: profile.bio,
      favoriteGenres: profile.favorite_genres || ['Indie Rock', 'Electronic'],
      badges: profile.badges || ['Curator'],
      followers: followerIds,
      following: followingIds,
      createdAt: profile.created_at
    };
  } catch (err) {
    console.error('Error in getSupabaseUser:', err);
    return null;
  }
};

export const saveSupabaseUser = async (uid, userData) => {
  if (!isSupabaseConfigured || !uid) return null;
  const cleanUsername = (userData.username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

  try {
    const payload = {
      id: uid,
      username: cleanUsername || `user_${uid.substring(0, 6)}`,
      name: userData.name || 'Music Explorer',
      email: userData.email,
      avatar: userData.avatar,
      bio: userData.bio || 'Music enthusiast sharing sonic vibes on SoundVibe 🎧',
      favorite_genres: userData.favoriteGenres || ['Indie Rock', 'Electronic'],
      badges: userData.badges || ['Curator'],
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    cacheService.invalidateFeed();

    return {
      id: data.id,
      uid: data.id,
      name: data.name,
      username: data.username,
      email: data.email,
      avatar: data.avatar,
      bio: data.bio,
      favoriteGenres: data.favorite_genres,
      badges: data.badges,
      createdAt: data.created_at
    };
  } catch (err) {
    console.error('Error in saveSupabaseUser:', err);
    return null;
  }
};

export const isSupabaseUsernameAvailable = async (username, currentUid) => {
  if (!isSupabaseConfigured || !username) return true;
  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (!clean) return false;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', clean)
      .maybeSingle();

    if (!data) return true;
    return data.id === currentUid;
  } catch (err) {
    return true;
  }
};

// ================= POST OPERATIONS =================

export const getSupabasePosts = async ({
  filter = 'all',
  genre = 'All',
  userId,
  authorUsername,
  currentUserId,
  page = 1,
  limit = 10,
  returnCluster = false
} = {}) => {
  if (!isSupabaseConfigured) return returnCluster ? { posts: [], hasMore: false, total: 0 } : [];

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = limit ? Math.max(1, parseInt(limit) || 10) : 10;
  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = startIndex + limitNum - 1;

  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (id, username, name, avatar, badges),
        reactions (reaction_type, user_id),
        comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
      `, { count: 'exact' });

    // Filter by specific user
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (authorUsername) {
      const u = await getSupabaseUser(authorUsername);
      if (u) {
        query = query.eq('user_id', u.id);
      } else {
        return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
      }
    }

    // Filter by Following
    if (filter === 'following') {
      if (!currentUserId) return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
      const { data: followRows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUserId);

      const followingIds = (followRows || []).map(r => r.following_id);
      if (followingIds.length === 0) {
        return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
      }
      query = query.in('user_id', followingIds);
    }

    // Filter by Liked / Reacted
    if (filter === 'liked' || filter === 'reacted') {
      if (!currentUserId) return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
      const { data: reactRows } = await supabase
        .from('reactions')
        .select('post_id, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      const postIds = (reactRows || []).map(r => r.post_id);
      const uniquePostIds = [...new Set(postIds)];
      if (uniquePostIds.length === 0) {
        return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
      }
      query = query.in('id', uniquePostIds);
    }

    // Filter by Genre
    if (genre && genre !== 'All') {
      query = query.or(`track->>genre.ilike.%${genre}%,vibe_tags.cs.{#${genre}},vibe_tags.cs.{${genre}}`);
    }

    // Trending Sort: Rank by community engagement (reactions + comments * 2), tie-break with recency
    if (filter === 'trending') {
      // Query recent candidates matching genre/user filter
      query = query.order('created_at', { ascending: false }).limit(200);

      const { data, error } = await query;
      if (error) throw error;

      const formattedPosts = (data || []).map(formatPostRow);

      formattedPosts.sort((a, b) => {
        const reactionsA = Object.values(a.reactions || {}).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
        const reactionsB = Object.values(b.reactions || {}).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
        const commentsA = Array.isArray(a.comments) ? a.comments.length : 0;
        const commentsB = Array.isArray(b.comments) ? b.comments.length : 0;

        const scoreA = (reactionsA * 1) + (commentsA * 2);
        const scoreB = (reactionsB * 1) + (commentsB * 2);

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      const total = formattedPosts.length;
      const paginatedPosts = formattedPosts.slice(startIndex, endIndex + 1);
      const hasMore = endIndex + 1 < total;
      const totalPages = Math.ceil(total / limitNum) || 1;

      const clusterResult = {
        posts: paginatedPosts,
        hasMore,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      };

      return returnCluster ? clusterResult : paginatedPosts;
    }

    // Top Rated or Chronological (All Vibes)
    if (filter === 'top-rated') {
      query = query.order('rating', { ascending: false }).order('created_at', { ascending: false });
    } else {
      // 'all' / default: strictly sorted by date uploaded (newest first)
      query = query.order('created_at', { ascending: false });
    }

    // Pagination
    query = query.range(startIndex, endIndex);

    const { data, count, error } = await query;
    if (error) throw error;

    const formattedPosts = (data || []).map(formatPostRow);
    const total = count || formattedPosts.length;
    const hasMore = endIndex + 1 < total;
    const totalPages = Math.ceil(total / limitNum) || 1;

    const clusterResult = {
      posts: formattedPosts,
      hasMore,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    };

    return returnCluster ? clusterResult : formattedPosts;
  } catch (err) {
    console.error('Error fetching Supabase posts:', err);
    return returnCluster ? { posts: [], hasMore: false, total: 0, page: pageNum, limit: limitNum, totalPages: 0 } : [];
  }
};

export const getSupabasePostById = async (postId) => {
  if (!isSupabaseConfigured || !postId) return null;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (id, username, name, avatar, badges),
        reactions (reaction_type, user_id),
        comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
      `)
      .eq('id', postId)
      .maybeSingle();

    if (error || !data) return null;
    return formatPostRow(data);
  } catch (err) {
    console.error('Error fetching Supabase post by id:', err);
    return null;
  }
};

export const createSupabasePost = async (postData) => {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const postId = postData.id || (typeof crypto !== 'undefined' && crypto.randomUUID 
    ? 'post_' + crypto.randomUUID().replace(/-/g, '') 
    : `post_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  const payload = {
    id: postId,
    user_id: postData.userId,
    track: postData.track,
    rating: postData.rating || 5,
    headline: postData.headline || '',
    review: postData.review || '',
    favorite_lyric: postData.favoriteLyric || '',
    vibe_tags: postData.vibeTags || [],
    mood: postData.mood || 'Nostalgic'
  };

  const { data, error } = await supabase
    .from('posts')
    .insert(payload)
    .select(`
      *,
      profiles:user_id (id, username, name, avatar, badges),
      reactions (reaction_type, user_id),
      comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
    `)
    .single();

  if (error) throw error;
  cacheService.invalidateFeed();
  return formatPostRow(data);
};

export const updateSupabasePost = async (postId, updateData, currentUserId) => {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const payload = {
    rating: updateData.rating,
    headline: updateData.headline,
    review: updateData.review,
    favorite_lyric: updateData.favoriteLyric,
    vibe_tags: updateData.vibeTags,
    mood: updateData.mood,
    updated_at: new Date().toISOString()
  };

  let query = supabase
    .from('posts')
    .update(payload)
    .eq('id', postId);

  if (currentUserId) {
    query = query.eq('user_id', currentUserId);
  }

  const { data, error } = await query
    .select(`
      *,
      profiles:user_id (id, username, name, avatar, badges),
      reactions (reaction_type, user_id),
      comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
    `)
    .single();

  if (error) throw error;
  cacheService.invalidateFeed();
  return formatPostRow(data);
};

export const deleteSupabasePost = async (postId, currentUserId) => {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  let query = supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (currentUserId) {
    query = query.eq('user_id', currentUserId);
  }

  const { error } = await query;

  if (error) throw error;
  cacheService.invalidateFeed();
  return true;
};

// ================= REACTIONS & COMMENTS =================

export const reactToSupabasePost = async (postId, reactionType, userId) => {
  if (!isSupabaseConfigured || !postId || !reactionType || !userId) return null;

  try {
    // 1. Check if user already has this specific reaction
    const { data: existingSame } = await supabase
      .from('reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (existingSame) {
      // User clicked their active reaction -> toggle off / remove
      await supabase.from('reactions').delete().eq('id', existingSame.id);
    } else {
      // User switched or added new reaction -> clear any previous reaction on this post, then insert new
      await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId);
      await supabase.from('reactions').insert({
        post_id: postId,
        user_id: userId,
        reaction_type: reactionType
      });
    }

    // 2. Return fresh reaction summary for post
    const { data: allReactions } = await supabase
      .from('reactions')
      .select('reaction_type, user_id')
      .eq('post_id', postId);

    const reactionMap = { fire: [], vibe: [], heart: [], repeat: [], mindblown: [], overrated: [] };
    (allReactions || []).forEach(r => {
      if (reactionMap[r.reaction_type]) {
        reactionMap[r.reaction_type].push(r.user_id);
      }
    });

    return reactionMap;
  } catch (err) {
    console.error('Error toggling reaction in Supabase:', err);
    return null;
  }
};

export const getSupabaseUserReactedPosts = async (uidOrUsername) => {
  if (!isSupabaseConfigured || !uidOrUsername) return [];
  try {
    let targetUid = uidOrUsername;
    // Resolve username to permanent UID if needed
    const userProfile = await getSupabaseUser(uidOrUsername);
    if (userProfile && userProfile.id) {
      targetUid = userProfile.id;
    }

    // 1. Fetch user reactions ordered by newest reaction first
    const { data: reactRows, error: reactErr } = await supabase
      .from('reactions')
      .select('post_id, reaction_type, created_at')
      .eq('user_id', targetUid)
      .order('created_at', { ascending: false });

    if (reactErr) throw reactErr;
    if (!reactRows || reactRows.length === 0) return [];

    // Map each post_id to the user's reaction for fast lookup
    const userReactionByPostId = new Map();
    reactRows.forEach(r => {
      if (!userReactionByPostId.has(r.post_id)) {
        userReactionByPostId.set(r.post_id, r.reaction_type);
      }
    });

    const uniquePostIds = Array.from(userReactionByPostId.keys());

    // 2. Fetch full post details
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (id, username, name, avatar, badges),
        reactions (reaction_type, user_id),
        comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
      `)
      .in('id', uniquePostIds);

    if (postsErr) throw postsErr;

    const formattedPosts = (postsData || []).map(row => {
      const formatted = formatPostRow(row);
      formatted.currentUserReaction = userReactionByPostId.get(formatted.id);
      return formatted;
    });

    // 3. Preserve the reaction recency order (newest reaction first)
    const postOrderMap = new Map();
    uniquePostIds.forEach((id, idx) => postOrderMap.set(id, idx));

    formattedPosts.sort((a, b) => {
      const orderA = postOrderMap.has(a.id) ? postOrderMap.get(a.id) : 9999;
      const orderB = postOrderMap.has(b.id) ? postOrderMap.get(b.id) : 9999;
      return orderA - orderB;
    });

    return formattedPosts;
  } catch (err) {
    console.error('Error in getSupabaseUserReactedPosts:', err);
    return [];
  }
};

export const addCommentToSupabasePost = async (postId, userId, text, authorMeta = {}) => {
  if (!isSupabaseConfigured || !postId || !text) throw new Error('Invalid comment data');

  const commentId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? 'comm_' + crypto.randomUUID().replace(/-/g, '')
    : `comm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const { data, error } = await supabase
    .from('comments')
    .insert({
      id: commentId,
      post_id: postId,
      user_id: userId,
      text: text.trim()
    })
    .select(`
      id,
      text,
      user_id,
      created_at,
      profiles:user_id (id, username, name, avatar)
    `)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    text: data.text,
    createdAt: data.created_at,
    author: data.profiles ? {
      id: data.profiles.id,
      name: data.profiles.name,
      username: data.profiles.username,
      avatar: data.profiles.avatar
    } : { id: userId, name: authorMeta.name || 'Curator' }
  };
};

export const updateSupabaseComment = async (commentId, newText, currentUserId) => {
  if (!isSupabaseConfigured || !commentId || !newText) return false;
  try {
    let query = supabase
      .from('comments')
      .update({ text: newText.trim(), updated_at: new Date().toISOString() })
      .eq('id', commentId);

    if (currentUserId) {
      query = query.eq('user_id', currentUserId);
    }
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error updating Supabase comment:', err);
    return false;
  }
};

export const deleteSupabaseComment = async (commentId, currentUserId) => {
  if (!isSupabaseConfigured || !commentId) return false;
  try {
    let query = supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (currentUserId) {
      query = query.eq('user_id', currentUserId);
    }
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting Supabase comment:', err);
    return false;
  }
};

// ================= FOLLOWS =================

export const toggleFollowSupabase = async (currentUid, targetUidOrUsername) => {
  if (!isSupabaseConfigured || !currentUid || !targetUidOrUsername) return null;

  try {
    let targetUid = targetUidOrUsername;
    const targetUser = await getSupabaseUser(targetUidOrUsername);
    if (targetUser) targetUid = targetUser.id;

    if (currentUid === targetUid) throw new Error('Cannot follow yourself');

    const { data: existing } = await supabase
      .from('follows')
      .select('*')
      .eq('follower_id', currentUid)
      .eq('following_id', targetUid)
      .maybeSingle();

    let isFollowing = false;
    if (existing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUid)
        .eq('following_id', targetUid);
      isFollowing = false;
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUid, following_id: targetUid });
      isFollowing = true;
    }

    const { data: followingRows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUid);

    return {
      isFollowing,
      following: (followingRows || []).map(r => r.following_id)
    };
  } catch (err) {
    console.error('Error in toggleFollowSupabase:', err);
    throw err;
  }
};

export const getSupabaseFollowLists = async (uidOrUsername) => {
  if (!isSupabaseConfigured || !uidOrUsername) return { followers: [], following: [] };

  try {
    const user = await getSupabaseUser(uidOrUsername);
    if (!user) return { followers: [], following: [] };

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('follows')
        .select('follower_id, profiles:follower_id (*)')
        .eq('following_id', user.id),
      supabase
        .from('follows')
        .select('following_id, profiles:following_id (*)')
        .eq('follower_id', user.id)
    ]);

    const formatList = (rows) => (rows || []).map(r => {
      const p = r.profiles || {};
      return {
        id: p.id || r.follower_id || r.following_id,
        name: p.name || 'Music Explorer',
        username: p.username || 'curator',
        avatar: p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`,
        bio: p.bio || 'Sharing sonic vibes on SoundVibe 🎧'
      };
    });

    return {
      followers: formatList(followersRes.data),
      following: formatList(followingRes.data)
    };
  } catch (err) {
    console.error('Error in getSupabaseFollowLists:', err);
    return { followers: [], following: [] };
  }
};

// ================= UNIFIED SEARCH =================

export const searchSupabaseUnified = async ({ query: searchQuery, type = 'all', limit = 25, bypassCache = false } = {}) => {
  const qStr = (searchQuery || '').trim();
  if (!qStr) return { query: '', type, tracks: [], users: [], posts: [], tags: [] };

  if (!bypassCache) {
    const cached = cacheService.getUnifiedSearch(qStr, type);
    if (cached) return cached;
  }

  const cleanHandle = qStr.toLowerCase().replace(/^[@#]/, '').trim();

  try {
    // 1. Tracks (iTunes API + cached)
    let tracks = [];
    if (type === 'all' || type === 'songs') {
      try {
        tracks = await searchMusicCached(qStr, limit);
      } catch (e) {}
    }

    // 2. Curators / Users in Supabase
    let users = [];
    if (type === 'all' || type === 'users') {
      const { data: curators } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${cleanHandle}%,name.ilike.%${cleanHandle}%,bio.ilike.%${cleanHandle}%`)
        .limit(limit);

      users = (curators || []).map(u => ({
        id: u.id,
        uid: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio,
        badges: u.badges || ['Curator']
      }));
    }

    // 3. Posts & Reviews in Supabase
    let posts = [];
    let tags = [];
    if (type === 'all' || type === 'posts' || type === 'tags' || type === 'songs') {
      const { data: rawPosts } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (id, username, name, avatar, badges),
          reactions (reaction_type, user_id),
          comments (id, text, user_id, created_at, profiles:user_id (id, username, name, avatar))
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      const allFormatted = (rawPosts || []).map(formatPostRow);
      const words = cleanHandle.split(/\s+/).filter(Boolean);

      posts = allFormatted.filter(p => {
        const postSearchable = [
          p.headline,
          p.review,
          p.favoriteLyric,
          p.track?.title,
          p.track?.artist,
          p.track?.album,
          p.track?.genre,
          p.author?.name,
          p.author?.username,
          p.mood,
          ...(p.vibeTags || [])
        ].filter(Boolean).join(' ').toLowerCase();

        return postSearchable.includes(cleanHandle) ||
               (words.length > 1 && words.every(w => postSearchable.includes(w)));
      }).slice(0, limit);

      // Extract matching tags
      const tagMap = {};
      allFormatted.forEach(p => {
        (p.vibeTags || []).forEach(t => {
          const cleanTag = t.startsWith('#') ? t : `#${t}`;
          const strippedTag = cleanTag.toLowerCase().replace(/^#/, '');
          if (strippedTag.includes(cleanHandle) || cleanTag.toLowerCase().includes(cleanHandle)) {
            tagMap[cleanTag] = (tagMap[cleanTag] || 0) + 1;
          }
        });
      });

      tags = Object.entries(tagMap)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Merge community posted tracks into tracks list for comprehensive results
      if (type === 'all' || type === 'songs') {
        const existingTrackKeys = new Set(tracks.map(t => `${(t.title || '').toLowerCase()}::${(t.artist || '').toLowerCase()}`));
        posts.forEach(p => {
          if (p.track && (p.track.title || p.track.artist)) {
            const trackKey = `${(p.track.title || '').toLowerCase()}::${(p.track.artist || '').toLowerCase()}`;
            const trackText = `${p.track.title || ''} ${p.track.artist || ''} ${p.track.album || ''}`.toLowerCase();
            const matches = trackText.includes(cleanHandle) || (words.length > 1 && words.every(w => trackText.includes(w)));
            if (matches && !existingTrackKeys.has(trackKey)) {
              existingTrackKeys.add(trackKey);
              tracks.unshift({
                id: p.track.id || `post-track-${p.id}`,
                title: p.track.title,
                artist: p.track.artist,
                album: p.track.album || 'SoundVibe Feature',
                artwork: p.track.artwork,
                previewUrl: p.track.previewUrl,
                genre: p.track.genre || p.mood || 'Music',
                durationMs: p.track.durationMs
              });
            }
          }
        });
      }
    }

    const result = {
      query: qStr,
      type,
      tracks,
      users,
      posts,
      tags
    };

    cacheService.setUnifiedSearch(qStr, type, result);
    return result;
  } catch (err) {
    console.error('Error in searchSupabaseUnified:', err);
    return { query: qStr, type, tracks: [], users: [], posts: [], tags: [] };
  }
};
