/**
 * SoundVibe Client-Side Caching Service
 * 
 * Provides high-speed multi-tier caching (In-Memory + SessionStorage) for:
 * 1. Music searches & track previews (eliminates repeated server requests for music)
 * 2. Clustered feed posts (instant tab & genre switching with zero lag)
 * 3. Unified discovery searches
 * 4. Individual track metadata
 */

const MEMORY_CACHE = new Map();

// Helper to safely access sessionStorage
const safeStorage = {
  get: (key) => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return null;
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (item.expiry && Date.now() > item.expiry) {
        window.sessionStorage.removeItem(key);
        return null;
      }
      return item.data;
    } catch (e) {
      return null;
    }
  },
  set: (key, data, ttlMs) => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const payload = {
        data,
        expiry: ttlMs ? Date.now() + ttlMs : null
      };
      window.sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      // Storage quota or private mode: fail gracefully without crashing
    }
  },
  remove: (key) => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {}
  },
  clearPrefix: (prefix) => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const keysToRemove = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => window.sessionStorage.removeItem(k));
    } catch (e) {}
  }
};

export const cacheService = {
  // ================= MUSIC CACHE =================
  /**
   * Get cached music search results
   * @param {string} query Search query string
   * @returns {Array|null}
   */
  getMusicSearch: (query) => {
    const clean = (query || '').trim().toLowerCase();
    if (!clean) return null;
    const key = `sv_music_${clean}`;

    // 1. Check memory cache (fastest: 0ms)
    const memItem = MEMORY_CACHE.get(key);
    if (memItem) {
      if (memItem.expiry && Date.now() > memItem.expiry) {
        MEMORY_CACHE.delete(key);
      } else {
        return memItem.data;
      }
    }

    // 2. Check sessionStorage
    const stored = safeStorage.get(key);
    if (stored) {
      // Backfill memory cache
      MEMORY_CACHE.set(key, { data: stored, expiry: Date.now() + 30 * 60 * 1000 });
      return stored;
    }

    return null;
  },

  /**
   * Cache music search results
   * @param {string} query Search query string
   * @param {Array} results Array of track objects
   * @param {number} ttlMs TTL in milliseconds (default 30 mins)
   */
  setMusicSearch: (query, results, ttlMs = 30 * 60 * 1000) => {
    const clean = (query || '').trim().toLowerCase();
    if (!clean || !Array.isArray(results)) return;
    const key = `sv_music_${clean}`;

    MEMORY_CACHE.set(key, { data: results, expiry: Date.now() + ttlMs });
    safeStorage.set(key, results, ttlMs);

    // Also index each individual track for instant lookup
    results.forEach(track => {
      if (track && track.id) {
        cacheService.setTrack(track.id, track);
      }
    });
  },

  /**
   * Get individual track metadata from cache
   */
  getTrack: (trackId) => {
    if (!trackId) return null;
    const key = `sv_track_${trackId}`;
    const memItem = MEMORY_CACHE.get(key);
    if (memItem && (!memItem.expiry || Date.now() <= memItem.expiry)) {
      return memItem.data;
    }
    return safeStorage.get(key);
  },

  /**
   * Cache individual track metadata
   */
  setTrack: (trackId, track, ttlMs = 60 * 60 * 1000) => {
    if (!trackId || !track) return;
    const key = `sv_track_${trackId}`;
    MEMORY_CACHE.set(key, { data: track, expiry: Date.now() + ttlMs });
    safeStorage.set(key, track, ttlMs);
  },

  // ================= FEED POSTS CLUSTER CACHE =================
  /**
   * Generate cache key for a specific feed cluster
   */
  getFeedKey: (sort = 'all', genre = 'All', userId = 'all', page = 1) => {
    const cleanGenre = (genre || 'All').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanUser = (userId || 'all').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return `sv_feed_${sort}_${cleanGenre}_${cleanUser}_p${page}`;
  },

  /**
   * Get cached cluster of feed posts
   */
  getFeedCluster: (sort, genre, userId, page = 1) => {
    const key = cacheService.getFeedKey(sort, genre, userId, page);
    const memItem = MEMORY_CACHE.get(key);
    if (memItem && (!memItem.expiry || Date.now() <= memItem.expiry)) {
      return memItem.data;
    }
    return safeStorage.get(key);
  },

  /**
   * Save a cluster of feed posts to cache
   */
  setFeedCluster: (sort, genre, userId, page = 1, data, ttlMs = 5 * 60 * 1000) => {
    const key = cacheService.getFeedKey(sort, genre, userId, page);
    MEMORY_CACHE.set(key, { data, expiry: Date.now() + ttlMs });
    safeStorage.set(key, data, ttlMs);
  },

  /**
   * Invalidate all cached feed posts (called after creating/updating a post or refreshing)
   */
  invalidateFeed: () => {
    // Clear from in-memory cache
    for (const k of MEMORY_CACHE.keys()) {
      if (k.startsWith('sv_feed_') || k.startsWith('sv_search_unified_')) {
        MEMORY_CACHE.delete(k);
      }
    }
    // Clear from sessionStorage
    safeStorage.clearPrefix('sv_feed_');
    safeStorage.clearPrefix('sv_search_unified_');
  },

  // ================= UNIFIED SEARCH CACHE =================
  getUnifiedSearch: (query, type = 'all') => {
    const clean = (query || '').trim().toLowerCase();
    if (!clean) return null;
    const key = `sv_search_unified_v3_${type}_${clean}`;
    const memItem = MEMORY_CACHE.get(key);
    if (memItem && (!memItem.expiry || Date.now() <= memItem.expiry)) {
      return memItem.data;
    }
    return safeStorage.get(key);
  },

  setUnifiedSearch: (query, type, data, ttlMs = 15 * 60 * 1000) => {
    const clean = (query || '').trim().toLowerCase();
    if (!clean || !data) return;
    const key = `sv_search_unified_v3_${type}_${clean}`;
    MEMORY_CACHE.set(key, { data, expiry: Date.now() + ttlMs });
    safeStorage.set(key, data, ttlMs);
  }
};

/**
 * High-level cached music search function.
 * First checks client-side cache; only hits the server on a cache miss.
 * 
 * @param {string} query Song or artist search query
 * @param {number} limit Max results (default 25)
 * @returns {Promise<Array>} Track results list
 */
export const searchMusicCached = async (query, limit = 25) => {
  const clean = (query || '').trim();
  if (!clean) return [];

  // 1. Check client cache
  const cached = cacheService.getMusicSearch(clean);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  // 2. Query SoundVibe server (which has its own in-memory cache)
  try {
    const encoded = encodeURIComponent(clean);
    const res = await fetch(`/api/music/search?q=${encoded}&limit=${limit}`);
    if (!res.ok) throw new Error(`Search failed with status ${res.status}`);
    const data = await res.json();
    const results = data.results || [];

    // 3. Cache the loaded results on the client
    if (results.length > 0) {
      cacheService.setMusicSearch(clean, results);
    }

    return results;
  } catch (err) {
    console.warn('Music search error, falling back to local search:', err);
    throw err;
  }
};
