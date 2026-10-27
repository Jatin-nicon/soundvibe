const express = require('express');
const https = require('https');
const db = require('./db');

const router = express.Router();

// ================= IN-MEMORY TTL CACHE =================
class MemoryCache {
  constructor(defaultTTLMs = 60 * 1000, maxItems = 500) {
    this.cache = new Map();
    this.defaultTTLMs = defaultTTLMs;
    this.maxItems = maxItems;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    // Refresh recency (LRU property)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTTLMs) {
    if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }

  clear() {
    this.cache.clear();
  }

  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

// Instantiate specific caches
const musicSearchCache = new MemoryCache(60 * 60 * 1000, 1000); // 60 min TTL for music searches
const unifiedSearchCache = new MemoryCache(15 * 60 * 1000, 500); // 15 min TTL for unified searches
const trendingMusicCache = new MemoryCache(60 * 60 * 1000, 50);   // 60 min TTL for trending music
const postsCache = new MemoryCache(60 * 1000, 200);               // 60s TTL for feed post clusters

const invalidatePostCaches = () => {
  postsCache.clear();
  unifiedSearchCache.clear();
};

// Helper to get active user from request header or query
const getReqUser = (req) => {
  const userId = req.headers['x-user-id'] || req.query.userId || req.query.currentUserId;
  if (userId) {
    const user = db.getUserById(userId) || db.getUserByUsername(userId);
    if (user) return user;
    return { id: `user-${userId.toLowerCase().replace(/[^a-z0-9_]/g, '')}`, username: userId };
  }
  return null;
};

// ================= USER & PERSONA ROUTES =================

// Get all personas / users
router.get('/users', (req, res) => {
  res.json({ users: db.getUsers() });
});

// Get User Profile
router.get('/users/:id', (req, res) => {
  const identifier = req.params.id;
  const user = db.getUserById(identifier) || db.getUserByUsername(identifier);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const currentUser = getReqUser(req);
  const userPosts = db.getPosts({ userId: user.id });
  let isFollowing = false;

  if (currentUser && currentUser.id !== user.id && currentUser.username !== user.username) {
    isFollowing = (currentUser.following || []).includes(user.id) || (currentUser.following || []).includes(user.username);
  }

  res.json({
    user,
    posts: userPosts,
    isFollowing
  });
});

// Create or Quick-Switch User Persona
router.post('/users/persona', (req, res) => {
  try {
    const { name, username, bio, avatar, favoriteGenres, topTracks } = req.body;
    const cleanUsername = (username || name || 'listener').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = `${cleanUsername}@soundvibe.io`;
    
    // Check if exists
    let existing = db.data.users.find(u => u.username === cleanUsername || u.id === req.body.id);
    if (existing) {
      const { passwordHash, ...safeUser } = existing;
      return res.json({ user: safeUser });
    }

    const newUser = db.createUser({
      username: cleanUsername,
      email,
      password: 'nopassword',
      name: name || 'Music Explorer',
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
      bio: bio || 'Music lover exploring new sounds on SoundVibe 🎧',
      favoriteGenres: favoriteGenres || ['Indie Rock', 'Electronic'],
      topTracks: topTracks || []
    });

    res.status(201).json({ user: newUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update Profile
router.put('/users/profile', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    if (!currentUser) return res.status(400).json({ error: 'User not identified' });

    const updated = db.updateUserProfile(currentUser.id, req.body);
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle Follow
router.post('/users/:id/follow', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    if (!currentUser) return res.status(400).json({ error: 'User not identified' });

    const result = db.toggleFollow(currentUser.id, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get User Followers List
router.get('/users/:id/followers', (req, res) => {
  try {
    const followers = db.getUserFollowers(req.params.id);
    res.json({ followers });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get User Following List
router.get('/users/:id/following', (req, res) => {
  try {
    const following = db.getUserFollowing(req.params.id);
    res.json({ following });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Calculate Taste Compatibility Match
router.get('/users/:id/match', (req, res) => {
  const currentUser = getReqUser(req);
  if (!currentUser) return res.status(400).json({ error: 'User not identified' });

  const match = db.calculateTasteMatch(currentUser.id, req.params.id);
  if (!match) {
    return res.status(404).json({ error: 'Could not calculate taste match' });
  }
  res.json(match);
});

// ================= POST ROUTES =================

// Get Feed Posts in Clusters (with Caching & Pagination)
router.get('/posts', (req, res) => {
  const { filter, genre, userId, page, limit } = req.query;
  const currentUser = getReqUser(req);
  const currentUserId = currentUser ? currentUser.id : null;

  const cacheKey = `posts:${filter || 'all'}:${genre || 'all'}:${userId || 'none'}:${currentUserId || 'guest'}:${page || '1'}:${limit || 'all'}`;
  const cached = postsCache.get(cacheKey);
  if (cached) {
    res.setHeader('X-SoundVibe-Cache', 'HIT');
    return res.json(cached);
  }

  const allPosts = db.getPosts({ filter, genre, currentUserId, userId });
  const total = allPosts.length;

  // If limit is omitted or 'all', return all posts for backwards compatibility
  if (!limit || limit === 'all') {
    const responsePayload = {
      posts: allPosts,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasMore: false
    };
    postsCache.set(cacheKey, responsePayload);
    res.setHeader('X-SoundVibe-Cache', 'MISS');
    return res.json(responsePayload);
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, parseInt(limit) || 10);
  const startIndex = (pageNum - 1) * limitNum;
  const cluster = allPosts.slice(startIndex, startIndex + limitNum);
  const totalPages = Math.ceil(total / limitNum) || 1;
  const hasMore = startIndex + limitNum < total;

  const responsePayload = {
    posts: cluster,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
    hasMore
  };

  postsCache.set(cacheKey, responsePayload);
  res.setHeader('X-SoundVibe-Cache', 'MISS');
  res.json(responsePayload);
});

// Get Single Post
router.get('/posts/:id', (req, res) => {
  const post = db.getPostById(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json({ post });
});

// Lookup User by Username / Unique ID
router.get('/users/lookup/:username', (req, res) => {
  const user = db.getUserByUsername(req.params.username);
  if (user) {
    return res.json({ exists: true, user });
  }
  res.json({ exists: false });
});

// Create Post (Vibe Drop)
router.post('/posts', (req, res) => {
  try {
    const { track, rating, headline, review, favoriteLyric, vibeTags, mood, username, authorName, authorAvatar, authorBio, author } = req.body;
    if (!track || !track.title || !track.artist) {
      return res.status(400).json({ error: 'Track information (title and artist) is required' });
    }

    const reqUser = getReqUser(req);
    const passedAuthor = author || reqUser || {};

    const rawId = passedAuthor.id || passedAuthor.uid || req.headers['x-user-id'] || 'curator_guest';
    const rawUsername = passedAuthor.username || username || `user_${String(rawId).substring(0, 6)}`;
    const rawName = passedAuthor.name || authorName || rawUsername;
    const rawAvatar = passedAuthor.avatar || authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${rawUsername}`;

    const authorRecord = db.upsertUser({
      id: rawId,
      username: rawUsername,
      name: rawName,
      avatar: rawAvatar,
      bio: passedAuthor.bio || authorBio,
      favoriteGenres: passedAuthor.favoriteGenres || ['Indie Rock', 'Electronic']
    });

    const post = db.createPost({
      userId: authorRecord.id,
      track,
      rating,
      headline,
      review,
      favoriteLyric,
      vibeTags,
      mood,
      authorInfo: authorRecord
    });

    invalidatePostCaches();
    res.status(201).json({ post, author: authorRecord });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit / Update Post (Music track is locked and cannot be changed)
router.put('/posts/:id', (req, res) => {
  try {
    const { rating, headline, review, favoriteLyric, vibeTags, mood, username, userId: providedUserId } = req.body;
    const reqUser = getReqUser(req);
    const userIdentifier = (reqUser && (reqUser.username || reqUser.id)) || username || providedUserId || req.headers['x-user-id'];

    if (!userIdentifier) {
      return res.status(401).json({ error: 'User identification required to edit post' });
    }

    const updatedPost = db.updatePost(req.params.id, userIdentifier, {
      rating,
      headline,
      review,
      favoriteLyric,
      vibeTags,
      mood
    });

    invalidatePostCaches();
    res.json({ post: updatedPost });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Post
router.delete('/posts/:id', (req, res) => {
  try {
    const { username, userId: providedUserId } = req.body;
    const reqUser = getReqUser(req);
    const userIdentifier = (reqUser && (reqUser.username || reqUser.id)) || username || providedUserId || req.headers['x-user-id'];

    if (!userIdentifier) {
      return res.status(401).json({ error: 'User identification required to delete post' });
    }

    db.deletePost(req.params.id, userIdentifier);
    invalidatePostCaches();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle Reaction on Post
router.post('/posts/:id/react', (req, res) => {
  try {
    const { reactionType, username, userId: providedUserId } = req.body;
    if (!reactionType) {
      return res.status(400).json({ error: 'Reaction type is required' });
    }

    let userId = providedUserId || req.headers['x-user-id'];
    if (!userId && username) {
      const user = db.getOrCreateUserByUsername({ username });
      userId = user.id;
    }
    if (!userId) {
      userId = 'listener_guest';
    }

    const reactions = db.toggleReaction(req.params.id, userId, reactionType);
    invalidatePostCaches();
    res.json({ reactions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Comments for Post
router.get('/posts/:id/comments', (req, res) => {
  const comments = db.getComments(req.params.id);
  res.json({ comments });
});

// Add Comment to Post
router.post('/posts/:id/comments', (req, res) => {
  try {
    const { text, username, authorName, authorAvatar } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    let author = null;
    if (username && username.trim()) {
      author = db.getOrCreateUserByUsername({
        username,
        name: authorName,
        avatar: authorAvatar
      });
    } else {
      author = getReqUser(req);
    }

    const comment = db.addComment(req.params.id, author ? author.id : 'listener_guest', text.trim());
    invalidatePostCaches();
    res.status(201).json({ comment, author });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update Comment on Post
router.put('/posts/:postId/comments/:commentId', (req, res) => {
  try {
    const { text, username, userId: providedUserId } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const reqUser = getReqUser(req);
    const userIdentifier = (reqUser && (reqUser.username || reqUser.id)) || username || providedUserId || req.headers['x-user-id'];

    if (!userIdentifier) {
      return res.status(401).json({ error: 'User identification required to edit comment' });
    }

    const updatedComment = db.updateComment(req.params.commentId, userIdentifier, text.trim());
    invalidatePostCaches();
    res.json({ comment: updatedComment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Comment on Post
router.delete('/posts/:postId/comments/:commentId', (req, res) => {
  try {
    const { username, userId: providedUserId } = req.body;
    const reqUser = getReqUser(req);
    const userIdentifier = (reqUser && (reqUser.username || reqUser.id)) || username || providedUserId || req.headers['x-user-id'];

    db.deleteComment(req.params.commentId, userIdentifier);
    invalidatePostCaches();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Like Comment
router.post('/comments/:id/like', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    const userId = currentUser ? currentUser.id : 'user-1';
    const result = db.toggleCommentLike(req.params.id, userId);
    invalidatePostCaches();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= MUSIC SEARCH & DISCOVERY =================

// Search tracks via iTunes Search API with In-Memory Caching and Fallback
router.get('/music/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ results: [] });
  }

  const cacheKey = query.toLowerCase();
  const cached = musicSearchCache.get(cacheKey);
  if (cached) {
    res.setHeader('X-SoundVibe-Cache', 'HIT');
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    return res.json({ results: cached });
  }

  const encodedQuery = encodeURIComponent(query);
  const limit = Math.min(50, parseInt(req.query.limit) || 25);
  const url = `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=${limit}`;

  https.get(url, { headers: { 'User-Agent': 'SoundVibe/1.0' } }, (apiRes) => {
    let rawData = '';
    apiRes.on('data', chunk => rawData += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(rawData);
        const results = (parsed.results || []).map(item => ({
          id: `itunes-${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName || 'Single',
          artwork: (item.artworkUrl100 || '').replace('100x100bb.jpg', '600x600bb.jpg'),
          previewUrl: item.previewUrl,
          genre: item.primaryGenreName || 'Music',
          durationMs: item.trackTimeMillis,
          trackViewUrl: item.trackViewUrl,
          spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(item.artistName + ' ' + item.trackName)}`,
          youtubeMusicUrl: `https://music.youtube.com/search?q=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`,
          youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName + ' official audio')}`,
          youtubeEmbedUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(item.artistName + ' ' + item.trackName)}&autoplay=1`
        }));
        musicSearchCache.set(cacheKey, results);
        res.setHeader('X-SoundVibe-Cache', 'MISS');
        res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
        res.json({ results });
      } catch (e) {
        const fallbackResults = searchLocalCatalog(query);
        musicSearchCache.set(cacheKey, fallbackResults);
        res.setHeader('X-SoundVibe-Cache', 'FALLBACK');
        res.json({ results: fallbackResults });
      }
    });
  }).on('error', (err) => {
    const fallbackResults = searchLocalCatalog(query);
    musicSearchCache.set(cacheKey, fallbackResults);
    res.setHeader('X-SoundVibe-Cache', 'FALLBACK');
    res.json({ results: fallbackResults });
  });
});

function searchLocalCatalog(query) {
  const q = query.toLowerCase();
  const allTracks = [
    {
      id: 't-101',
      title: 'The Less I Know The Better',
      artist: 'Tame Impala',
      album: 'Currents',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bf/25/74/bf257404-e3fb-c7db-c8ff-3c8f2b84279a/00602547306777.rgb.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/b0/02/76/b00276bb-1250-9bb4-b384-cb5f87b64c67/mzaf_6122606558832857416.plus.aac.p.m4a',
      genre: 'Psychedelic Pop'
    },
    {
      id: 't-102',
      title: 'Kyoto',
      artist: 'Phoebe Bridgers',
      album: 'Punisher',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/cb/2d/75/cb2d75f2-9599-4c60-a2fa-be3e6e885c3c/656605151564.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/44/b3/f9/44b3f9dc-cff5-a131-01f1-3ffbf5326756/mzaf_16422329241940989399.plus.aac.p.m4a',
      genre: 'Indie Rock'
    },
    {
      id: 't-105',
      title: 'Pink + White',
      artist: 'Frank Ocean',
      album: 'Blonde',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/31/59/e6/3159e6c4-7fa7-0ea8-48b4-02ff0cbdf138/859717967919_cover.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/fa/ec/88/faec886d-0ee5-9cf2-7aa7-be708e0850fe/mzaf_6772714449887754388.plus.aac.p.m4a',
      genre: 'Neo-Soul'
    },
    {
      id: 't-107',
      title: 'Instant Crush',
      artist: 'Daft Punk',
      album: 'Random Access Memories',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/58/b0/a0/58b0a05a-5264-9a84-0a30-22c608f62f83/886443919639.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/91/9f/f0/919ff0f1-4fc3-3ff1-8848-d3ec62b0e9f6/mzaf_11333734685794503770.plus.aac.p.m4a',
      genre: 'Synthpop'
    }
  ];
  return allTracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
}

// ================= UNIFIED MULTI-FILTER SEARCH ENDPOINT =================

// Unified Search: Songs, Users, Posts, Tags (with In-Memory Caching)
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  const type = (req.query.type || 'all').toLowerCase(); // 'all' | 'songs' | 'users' | 'posts' | 'tags'
  const limit = parseInt(req.query.limit) || 25;

  if (!query) {
    return res.json({
      query: '',
      type,
      tracks: [],
      users: [],
      posts: [],
      tags: []
    });
  }

  const cacheKey = `search:${type}:${limit}:${query.toLowerCase()}`;
  const cached = unifiedSearchCache.get(cacheKey);
  if (cached) {
    res.setHeader('X-SoundVibe-Cache', 'HIT');
    return res.json(cached);
  }

  const qLower = query.toLowerCase();
  const cleanHandle = qLower.replace(/^@/, '');

  // 1. Search Users
  let matchedUsers = [];
  if (type === 'all' || type === 'users') {
    matchedUsers = db.data.users.filter(u => 
      (u.name && u.name.toLowerCase().includes(cleanHandle)) ||
      (u.username && u.username.toLowerCase().includes(cleanHandle)) ||
      (u.bio && u.bio.toLowerCase().includes(qLower)) ||
      (u.favoriteGenres || []).some(g => g.toLowerCase().includes(qLower))
    ).map(u => {
      const { passwordHash, ...safe } = u;
      return safe;
    }).slice(0, limit);
  }

  // 2. Search Posts & Reviews
  let matchedPosts = [];
  let matchedTags = [];
  if (type === 'all' || type === 'posts' || type === 'tags') {
    const allPosts = db.getPosts({});
    matchedPosts = allPosts.filter(p => 
      (p.headline && p.headline.toLowerCase().includes(qLower)) ||
      (p.review && p.review.toLowerCase().includes(qLower)) ||
      (p.favoriteLyric && p.favoriteLyric.toLowerCase().includes(qLower)) ||
      (p.track?.title && p.track.title.toLowerCase().includes(qLower)) ||
      (p.track?.artist && p.track.artist.toLowerCase().includes(qLower)) ||
      (p.vibeTags || []).some(t => t.toLowerCase().includes(qLower))
    ).slice(0, limit);

    // Extract matching unique tags
    const tagCountMap = {};
    allPosts.forEach(p => {
      (p.vibeTags || []).forEach(t => {
        const cleanTag = t.startsWith('#') ? t : `#${t}`;
        if (cleanTag.toLowerCase().includes(qLower)) {
          tagCountMap[cleanTag] = (tagCountMap[cleanTag] || 0) + 1;
        }
      });
    });

    matchedTags = Object.entries(tagCountMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }

  // 3. Search Tracks
  let matchedTracks = [];
  if (type === 'all' || type === 'songs') {
    try {
      const encodedQuery = encodeURIComponent(query);
      const itunesUrl = `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=${limit}`;
      
      const tracksPromise = new Promise((resolve) => {
        https.get(itunesUrl, { headers: { 'User-Agent': 'SoundVibe/1.0' } }, (apiRes) => {
          let rawData = '';
          apiRes.on('data', chunk => rawData += chunk);
          apiRes.on('end', () => {
            try {
              const parsed = JSON.parse(rawData);
              const mapped = (parsed.results || []).map(item => ({
                id: `itunes-${item.trackId}`,
                title: item.trackName,
                artist: item.artistName,
                album: item.collectionName || 'Single',
                artwork: (item.artworkUrl100 || '').replace('100x100bb.jpg', '600x600bb.jpg'),
                previewUrl: item.previewUrl,
                genre: item.primaryGenreName || 'Music',
                durationMs: item.trackTimeMillis,
                trackViewUrl: item.trackViewUrl,
                spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(item.artistName + ' ' + item.trackName)}`,
                youtubeMusicUrl: `https://music.youtube.com/search?q=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`,
                youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName + ' official audio')}`,
                youtubeEmbedUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(item.artistName + ' ' + item.trackName)}&autoplay=1`
              }));
              resolve(mapped);
            } catch (e) {
              resolve(searchLocalCatalog(query));
            }
          });
        }).on('error', () => {
          resolve(searchLocalCatalog(query));
        });
      });

      matchedTracks = await tracksPromise;
    } catch (e) {
      matchedTracks = searchLocalCatalog(query);
    }
  }

  const searchResponse = {
    query,
    type,
    tracks: matchedTracks,
    users: matchedUsers,
    posts: matchedPosts,
    tags: matchedTags
  };
  unifiedSearchCache.set(cacheKey, searchResponse);
  res.setHeader('X-SoundVibe-Cache', 'MISS');
  res.json(searchResponse);
});

// Get Trending Curation (with In-Memory Caching)
router.get('/music/trending', (req, res) => {
  const cached = trendingMusicCache.get('trending');
  if (cached) {
    res.setHeader('X-SoundVibe-Cache', 'HIT');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json({ trending: cached });
  }

  const trending = [
    {
      id: 't-101',
      title: 'The Less I Know The Better',
      artist: 'Tame Impala',
      album: 'Currents',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bf/25/74/bf257404-e3fb-c7db-c8ff-3c8f2b84279a/00602547306777.rgb.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/b0/02/76/b00276bb-1250-9bb4-b384-cb5f87b64c67/mzaf_6122606558832857416.plus.aac.p.m4a',
      genre: 'Psychedelic Pop'
    },
    {
      id: 't-105',
      title: 'Pink + White',
      artist: 'Frank Ocean',
      album: 'Blonde',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/31/59/e6/3159e6c4-7fa7-0ea8-48b4-02ff0cbdf138/859717967919_cover.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/fa/ec/88/faec886d-0ee5-9cf2-7aa7-be708e0850fe/mzaf_6772714449887754388.plus.aac.p.m4a',
      genre: 'Neo-Soul'
    },
    {
      id: 't-107',
      title: 'Instant Crush (feat. Julian Casablancas)',
      artist: 'Daft Punk',
      album: 'Random Access Memories',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/58/b0/a0/58b0a05a-5264-9a84-0a30-22c608f62f83/886443919639.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/91/9f/f0/919ff0f1-4fc3-3ff1-8848-d3ec62b0e9f6/mzaf_11333734685794503770.plus.aac.p.m4a',
      genre: 'Synthpop'
    },
    {
      id: 't-108',
      title: 'Nightcall',
      artist: 'Kavinsky',
      album: 'OutRun',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/aa/e4/c4/aae4c49d-6490-50d4-1188-75c1a79fa4f5/00602537299003.rgb.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/e5/94/db/e594dbf0-f925-5026-6169-2313d4b68e91/mzaf_15783307584166299905.plus.aac.p.m4a',
      genre: 'Synthwave'
    },
    {
      id: 't-110',
      title: 'Plastic Love',
      artist: 'Mariya Takeuchi',
      album: 'VARIETY',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/9c/c5/4b/9cc54be4-a82f-2d93-3d02-eeec830e0dc5/4943674343805.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/bb/94/a3/bb94a3e2-5c98-10eb-dc88-df3d82d46e09/mzaf_9957388796853610996.plus.aac.p.m4a',
      genre: 'City Pop'
    },
    {
      id: 't-109',
      title: 'Do I Wanna Know?',
      artist: 'Arctic Monkeys',
      album: 'AM',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5a/bd/91/5abd916c-e0ee-eb22-f19b-640ff1102e3b/887828031795.jpg/600x600bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/58/eb/54/58eb5434-2e40-dc50-6101-71fb2cce16fa/mzaf_8422502621008064506.plus.aac.p.m4a',
      genre: 'Indie Rock'
    }
  ];
  trendingMusicCache.set('trending', trending);
  res.setHeader('X-SoundVibe-Cache', 'MISS');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ trending });
});

// ================= LIVE LOUNGES =================

// Get Lounges
router.get('/lounges', (req, res) => {
  res.json({ lounges: db.getLounges() });
});

// Get Lounge By Id
router.get('/lounges/:id', (req, res) => {
  const lounge = db.getLoungeById(req.params.id);
  if (!lounge) return res.status(404).json({ error: 'Lounge not found' });
  res.json({ lounge });
});

// Send Chat Message in Lounge
router.post('/lounges/:id/messages', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    const userId = currentUser ? currentUser.id : 'user-1';
    const msg = db.addLoungeMessage(req.params.id, userId, text.trim());
    res.status(201).json({ message: msg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add Track to Lounge Queue
router.post('/lounges/:id/queue', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    const { track } = req.body;
    if (!track) return res.status(400).json({ error: 'Track is required' });
    const userId = currentUser ? currentUser.id : 'user-1';
    const item = db.addLoungeTrack(req.params.id, track, userId);
    res.status(201).json({ queueItem: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Vote Track in Lounge Queue
router.post('/lounges/:id/queue/:queueId/vote', (req, res) => {
  try {
    const currentUser = getReqUser(req);
    const userId = currentUser ? currentUser.id : 'user-1';
    const queue = db.voteLoungeTrack(req.params.id, req.params.queueId, userId);
    res.json({ queue });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
