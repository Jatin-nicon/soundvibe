import { 
  db, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  serverTimestamp, 
  arrayUnion, 
  arrayRemove, 
  increment 
} from '../firebase';
import { cacheService, searchMusicCached } from './cacheService';

const USERS_COL = 'users';
const POSTS_COL = 'posts';

// Helper to generate a clean safe ID
export const generateId = (prefix = 'item') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// ================= USER OPERATIONS =================

/**
 * Get or sync user in Firestore
 */
export const getFirestoreUser = async (uidOrUsername) => {
  if (!uidOrUsername) return null;
  try {
    if (!db) return null;
    // 1. Try by document ID (Auth UID)
    const docRef = doc(db, USERS_COL, uidOrUsername);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    // 2. Query by username
    const q = query(
      collection(db, USERS_COL),
      where('username', '==', uidOrUsername.toLowerCase().trim())
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const docData = querySnap.docs[0];
      return { id: docData.id, ...docData.data() };
    }

    return null;
  } catch (err) {
    console.warn('Firestore get user notice:', err);
    return null;
  }
};

/**
 * Check if a username is available (or belongs to current user)
 */
export const isUsernameAvailable = async (username, currentUid) => {
  if (!username) return false;
  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (!clean) return false;
  const existingUser = await getFirestoreUser(clean);
  if (!existingUser) return true;
  return existingUser.id === currentUid || existingUser.uid === currentUid;
};

/**
 * Save or update user profile in Firestore
 */
export const saveFirestoreUser = async (uid, userData) => {
  if (!uid) return null;
  try {
    if (!db) return userData;
    const userRef = doc(db, USERS_COL, uid);
    const existing = await getDoc(userRef);

    const payload = {
      ...userData,
      updatedAt: serverTimestamp()
    };

    if (!existing.exists()) {
      payload.createdAt = serverTimestamp();
      payload.followers = payload.followers || [];
      payload.following = payload.following || [];
      payload.favoriteGenres = payload.favoriteGenres || ['Indie Rock', 'Electronic'];
      payload.topTracks = payload.topTracks || [];
      payload.badges = payload.badges || ['Curator'];
    }

    await setDoc(userRef, payload, { merge: true });
    const updatedSnap = await getDoc(userRef);

    // Also cascade author profile updates to user's existing posts in Firestore
    if (userData.username || userData.name || userData.avatar) {
      try {
        const postsQuery = query(collection(db, POSTS_COL), where('userId', '==', uid));
        const postsSnap = await getDocs(postsQuery);
        const updatePromises = postsSnap.docs.map(async (pDoc) => {
          const pData = pDoc.data();
          const updatedAuthor = {
            ...(pData.author || {}),
            id: uid,
            username: userData.username || pData.author?.username,
            name: userData.name || pData.author?.name,
            avatar: userData.avatar || pData.author?.avatar
          };
          return updateDoc(doc(db, POSTS_COL, pDoc.id), {
            author: updatedAuthor
          });
        });
        await Promise.all(updatePromises);
        invalidateFirestoreRawCache();
        cacheService.invalidateFeed();
      } catch (postSyncErr) {
        console.warn('Silent post author sync notice:', postSyncErr);
      }
    }

    return { id: updatedSnap.id, ...updatedSnap.data() };
  } catch (err) {
    console.error('Error saving user to Firestore:', err);
    return null;
  }
};

/**
 * Toggle follow/unfollow in Firestore
 */
export const toggleFollowFirestore = async (currentUid, targetUidOrUsername) => {
  if (!currentUid || !targetUidOrUsername) return null;
  try {
    if (!db) return null;
    const targetUser = await getFirestoreUser(targetUidOrUsername);
    if (!targetUser) throw new Error('Target user not found');
    const targetUid = targetUser.id;

    if (currentUid === targetUid) throw new Error('Cannot follow yourself');

    const currentUserRef = doc(db, USERS_COL, currentUid);
    const targetUserRef = doc(db, USERS_COL, targetUid);

    const currentUserSnap = await getDoc(currentUserRef);
    const currentUserData = currentUserSnap.data() || {};
    const following = currentUserData.following || [];

    const isFollowing = following.includes(targetUid) || (targetUser.username && following.includes(targetUser.username));

    if (isFollowing) {
      const toRemoveCurrent = [targetUid, targetUser.username].filter(Boolean);
      const toRemoveTarget = [currentUid, currentUserData.username].filter(Boolean);
      await updateDoc(currentUserRef, {
        following: arrayRemove(...toRemoveCurrent)
      });
      await updateDoc(targetUserRef, {
        followers: arrayRemove(...toRemoveTarget)
      });
    } else {
      await updateDoc(currentUserRef, {
        following: arrayUnion(targetUid)
      });
      await updateDoc(targetUserRef, {
        followers: arrayUnion(currentUid)
      });
    }

    const updatedUserSnap = await getDoc(currentUserRef);
    return {
      isFollowing: !isFollowing,
      following: updatedUserSnap.data()?.following || []
    };
  } catch (err) {
    console.error('Error in toggleFollowFirestore:', err);
    throw err;
  }
};

/**
 * Fetch full profile objects for followers and following of a user from Firestore
 */
export const getFirestoreFollowLists = async (uidOrUsername) => {
  if (!uidOrUsername) return { followers: [], following: [] };
  try {
    if (!db) {
      try {
        const [followersRes, followingRes] = await Promise.all([
          fetch(`/api/users/${encodeURIComponent(uidOrUsername)}/followers`),
          fetch(`/api/users/${encodeURIComponent(uidOrUsername)}/following`)
        ]);
        const followersData = await followersRes.json();
        const followingData = await followingRes.json();
        return {
          followers: followersData.followers || [],
          following: followingData.following || []
        };
      } catch (e) {
        return { followers: [], following: [] };
      }
    }

    const targetUser = await getFirestoreUser(uidOrUsername);
    if (!targetUser) return { followers: [], following: [] };

    const followerIds = Array.isArray(targetUser.followers) ? targetUser.followers : [];
    const followingIds = Array.isArray(targetUser.following) ? targetUser.following : [];

    // Fetch ONLY the specific followers/following profiles instead of entire user collection
    const uniqueIds = Array.from(new Set([...followerIds, ...followingIds])).filter(Boolean);
    const allUsersMap = new Map();

    if (uniqueIds.length > 0) {
      const userSnaps = await Promise.allSettled(
        uniqueIds.map(uid => getDoc(doc(db, USERS_COL, uid)))
      );
      userSnaps.forEach(res => {
        if (res.status === 'fulfilled' && res.value && res.value.exists()) {
          const u = { id: res.value.id, ...res.value.data() };
          allUsersMap.set(res.value.id, u);
          if (u.uid) allUsersMap.set(u.uid, u);
          if (u.username) allUsersMap.set(u.username.toLowerCase(), u);
        }
      });
    }

    const resolveProfiles = (idList) => {
      return idList.map(id => {
        const key = typeof id === 'string' ? id.toLowerCase() : String(id);
        const found = allUsersMap.get(id) || allUsersMap.get(key);
        if (found) {
          return {
            id: found.id || found.uid || id,
            name: found.name || found.displayName || found.username || 'Music Explorer',
            username: found.username || 'listener',
            avatar: found.avatar || found.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${found.username || id}`,
            bio: found.bio || 'Sharing sonic vibes on SoundVibe 🎧',
            followers: found.followers || [],
            following: found.following || []
          };
        }
        return {
          id: id,
          name: typeof id === 'string' && id.startsWith('user_') ? id : (typeof id === 'string' && id.length > 15 ? 'Curator' : String(id)),
          username: typeof id === 'string' ? id : 'listener',
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
          bio: 'Music enthusiast on SoundVibe 🎧',
          followers: [],
          following: []
        };
      });
    };

    return {
      followers: resolveProfiles(followerIds),
      following: resolveProfiles(followingIds)
    };
  } catch (err) {
    console.error('Error fetching follow lists:', err);
    return { followers: [], following: [] };
  }
};

// ================= POST OPERATIONS =================

// Local in-memory cache for raw Firestore posts snapshot to prevent reading all documents on every filter/tab toggle
let firestoreRawDocsCache = {
  data: null,
  timestamp: 0,
  ttlMs: 3 * 60 * 1000 // 3 minutes TTL
};

export const invalidateFirestoreRawCache = () => {
  firestoreRawDocsCache.data = null;
  firestoreRawDocsCache.timestamp = 0;
};

/**
 * Fetch posts from Firestore in clusters (pagination) with client-side caching
 */
export const getFirestorePosts = async ({
  filter = 'all',
  genre = 'All',
  userId,
  authorUsername,
  currentUserId,
  page = 1,
  limit = 10,
  returnCluster = false
} = {}) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = limit === null || limit === undefined ? null : Math.max(1, parseInt(limit) || 10);

  // Check client feed cache if clustered format requested
  const cacheKeyUser = filter === 'following' ? (currentUserId || 'guest') : (userId || authorUsername || 'all');
  if (returnCluster && limitNum) {
    const cachedCluster = cacheService.getFeedCluster(filter, genre, cacheKeyUser, pageNum);
    if (cachedCluster) {
      return cachedCluster;
    }
  }

  try {
    if (!db) {
      const queryParams = new URLSearchParams();
      if (filter) queryParams.append('filter', filter);
      if (genre && genre !== 'All') queryParams.append('genre', genre);
      if (userId) queryParams.append('userId', userId);
      if (limitNum) {
        queryParams.append('limit', limitNum);
        queryParams.append('page', pageNum);
      }
      const res = await fetch(`/api/posts?${queryParams.toString()}`);
      const data = await res.json();
      const clusterData = {
        posts: data.posts || [],
        hasMore: data.hasMore ?? false,
        total: data.total ?? (data.posts || []).length,
        page: data.page || pageNum,
        limit: limitNum || (data.posts || []).length,
        totalPages: data.totalPages || 1
      };
      if (returnCluster && limitNum) {
        cacheService.setFeedCluster(filter, genre, cacheKeyUser, pageNum, clusterData);
        return clusterData;
      }
      return data.posts || [];
    }

    let list;
    const now = Date.now();
    // Targeted query when looking up a specific user's posts
    if (userId) {
      const userPostsSnap = await getDocs(
        query(collection(db, POSTS_COL), where('userId', '==', userId))
      );
      list = userPostsSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        _firestoreDocId: d.id
      }));
    } else if (authorUsername) {
      const userPostsSnap = await getDocs(
        query(collection(db, POSTS_COL), where('author.username', '==', authorUsername))
      );
      list = userPostsSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        _firestoreDocId: d.id
      }));
    } else if (firestoreRawDocsCache.data && (now - firestoreRawDocsCache.timestamp < firestoreRawDocsCache.ttlMs)) {
      list = [...firestoreRawDocsCache.data];
    } else {
      let snap;
      try {
        const q = query(collection(db, POSTS_COL), orderBy('createdAt', 'desc'), firestoreLimit(150));
        snap = await getDocs(q);
      } catch (orderErr) {
        snap = await getDocs(query(collection(db, POSTS_COL), firestoreLimit(150)));
      }
      list = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        _firestoreDocId: d.id
      }));
      firestoreRawDocsCache.data = list;
      firestoreRawDocsCache.timestamp = now;
    }

    // Filter by genre
    if (genre && genre !== 'All') {
      const gLower = genre.toLowerCase();
      list = list.filter(p => 
        (p.track?.genre && p.track.genre.toLowerCase().includes(gLower)) ||
        (p.vibeTags || []).some(t => t.toLowerCase().includes(gLower))
      );
    }

    // Filter by specific user (matches by permanent UID or handle)
    if (userId || authorUsername) {
      const targetUid = userId;
      const targetUser = (authorUsername || userId || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
      list = list.filter(p => {
        const pUid = p.userId || p.author?.id || p.author?.uid;
        const pUsername = (p.author?.username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        return (targetUid && (pUid === targetUid || p.userId === targetUid)) ||
               (targetUser && (pUsername === targetUser || pUid === targetUser));
      });
    }

    // Filter following
    if (filter === 'following') {
      if (!currentUserId) {
        list = [];
      } else {
        let following = [];
        const userObj = await getFirestoreUser(currentUserId);
        if (userObj && Array.isArray(userObj.following)) {
          following = userObj.following;
        } else {
          const currentUserSnap = await getDoc(doc(db, USERS_COL, currentUserId));
          following = currentUserSnap.data()?.following || [];
        }
        list = list.filter(p => {
          const pUid = p.userId || p.author?.id || p.author?.uid;
          const pUsername = p.author?.username;
          return following.includes(pUid) || (pUsername && following.includes(pUsername));
        });
      }
    }

    // Sort
    if (filter === 'trending') {
      list.sort((a, b) => {
        const reactionsA = Object.values(a.reactions || {}).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
        const reactionsB = Object.values(b.reactions || {}).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
        return (reactionsB + (b.comments?.length || 0)) - (reactionsA + (a.comments?.length || 0));
      });
    } else if (filter === 'top-rated') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      // Default: Newest first
      list.sort((a, b) => {
        const getTime = (val) => {
          if (!val) return Date.now();
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (typeof val.seconds === 'number') return val.seconds * 1000;
          if (typeof val === 'number') return val;
          const parsed = new Date(val).getTime();
          return isNaN(parsed) ? Date.now() : parsed;
        };
        return getTime(b.createdAt) - getTime(a.createdAt);
      });
    }

    const total = list.length;
    if (returnCluster || limitNum !== null) {
      const effectiveLimit = limitNum || 10;
      const startIndex = (pageNum - 1) * effectiveLimit;
      const cluster = list.slice(startIndex, startIndex + effectiveLimit);
      const hasMore = startIndex + effectiveLimit < total;
      const totalPages = Math.ceil(total / effectiveLimit) || 1;
      const clusterResult = {
        posts: cluster,
        hasMore,
        total,
        page: pageNum,
        limit: effectiveLimit,
        totalPages
      };
      if (effectiveLimit) {
        cacheService.setFeedCluster(filter, genre, cacheKeyUser, pageNum, clusterResult);
      }
      if (returnCluster) {
        return clusterResult;
      }
      return cluster;
    }

    return list;
  } catch (err) {
    console.warn('Error fetching Firestore posts, falling back to API:', err);
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      if (returnCluster) {
        return {
          posts: data.posts || [],
          hasMore: false,
          total: (data.posts || []).length,
          page: 1,
          limit: (data.posts || []).length,
          totalPages: 1
        };
      }
      return data.posts || [];
    } catch (e) {
      return returnCluster ? { posts: [], hasMore: false, total: 0, page: 1, limit: 10, totalPages: 0 } : [];
    }
  }
};

/**
 * Get single post from Firestore
 */
export const getFirestorePostById = async (postId) => {
  try {
    if (!db) {
      const res = await fetch(`/api/posts/${postId}`);
      const data = await res.json();
      return data.post || null;
    }

    let postRef = doc(db, POSTS_COL, postId);
    let snap = await getDoc(postRef);

    if (!snap.exists()) {
      const q = query(collection(db, POSTS_COL), where('id', '==', postId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        snap = qSnap.docs[0];
      }
    }

    if (!snap || !snap.exists()) return null;
    return { ...snap.data(), id: snap.id, _firestoreDocId: snap.id };
  } catch (err) {
    console.error('Error fetching Firestore post by id:', err);
    return null;
  }
};

/**
 * Create a new Post in Firestore
 */
export const createFirestorePost = async (postData) => {
  try {
    if (!db) throw new Error('Firestore database is not connected');

    const payload = {
      ...postData,
      reactions: { fire: [], vibe: [postData.userId], heart: [], repeat: [], mindblown: [], overrated: [] },
      comments: [],
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, POSTS_COL), payload);
    const snap = await getDoc(docRef);

    // Invalidate client feed cache and raw Firestore snapshot so newly dropped vibe appears instantly
    invalidateFirestoreRawCache();
    cacheService.invalidateFeed();

    const data = snap.exists() ? snap.data() : payload;
    return {
      ...data,
      id: snap.id,
      _firestoreDocId: snap.id,
      createdAt: data?.createdAt || new Date().toISOString()
    };
  } catch (err) {
    console.error('Error creating Firestore post:', err);
    throw err;
  }
};

/**
 * Update an existing Post in Firestore
 */
export const updateFirestorePost = async (postId, updateData) => {
  try {
    if (!db) throw new Error('Firestore database is not connected');

    let postRef = doc(db, POSTS_COL, postId);
    let snap = await getDoc(postRef);

    if (!snap.exists()) {
      const q = query(collection(db, POSTS_COL), where('id', '==', postId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        postRef = doc(db, POSTS_COL, qSnap.docs[0].id);
      }
    }

    await setDoc(postRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    }, { merge: true });

    invalidateFirestoreRawCache();
    cacheService.invalidateFeed();
    const updatedSnap = await getDoc(postRef);
    return { ...updatedSnap.data(), id: updatedSnap.id, _firestoreDocId: updatedSnap.id };
  } catch (err) {
    console.error('Error updating Firestore post:', err);
    throw err;
  }
};

/**
 * Delete a Post from Firestore
 */
export const deleteFirestorePost = async (postId) => {
  try {
    if (!db) throw new Error('Firestore database is not connected');

    let postRef = doc(db, POSTS_COL, postId);
    let snap = await getDoc(postRef);

    if (!snap.exists()) {
      const q = query(collection(db, POSTS_COL), where('id', '==', postId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        postRef = doc(db, POSTS_COL, qSnap.docs[0].id);
      }
    }

    await deleteDoc(postRef);
    invalidateFirestoreRawCache();
    cacheService.invalidateFeed();
    return true;
  } catch (err) {
    console.error('Error deleting Firestore post:', err);
    throw err;
  }
};

/**
 * React to a Post in Firestore
 */
export const reactToFirestorePost = async (postId, reactionKey, userId) => {
  try {
    if (!db) throw new Error('Firestore database is not connected');

    let postRef = doc(db, POSTS_COL, postId);
    let snap = await getDoc(postRef);

    if (!snap.exists()) {
      const q = query(collection(db, POSTS_COL), where('id', '==', postId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        snap = qSnap.docs[0];
        postRef = doc(db, POSTS_COL, snap.id);
      }
    }

    if (!snap || !snap.exists()) throw new Error('Post not found');

    const postData = snap.data();
    const reactions = postData.reactions || { fire: [], vibe: [], heart: [], repeat: [], mindblown: [], overrated: [] };
    const currentReactions = Array.isArray(reactions[reactionKey]) ? reactions[reactionKey] : [];

    const hasReacted = currentReactions.includes(userId);

    // Atomic update using arrayRemove or arrayUnion on specific field path
    await updateDoc(postRef, {
      [`reactions.${reactionKey}`]: hasReacted ? arrayRemove(userId) : arrayUnion(userId),
      updatedAt: serverTimestamp()
    });

    invalidateFirestoreRawCache();
    cacheService.invalidateFeed();

    // Return the updated reactions map for instant UI state update
    const updatedReactions = {
      ...reactions,
      [reactionKey]: hasReacted
        ? currentReactions.filter(id => id !== userId)
        : [...currentReactions, userId]
    };

    return updatedReactions;
  } catch (err) {
    console.error('Error reacting to Firestore post:', err);
    throw err;
  }
};

/**
 * Add Comment to a Post in Firestore and Sync with Backend
 */
export const addCommentToFirestorePost = async (postId, commentData) => {
  try {
    if (!postId) throw new Error('postId is required');
    const userId = commentData.userId || 'listener';
    const username = commentData.username || 'listener';
    const userName = commentData.userName || commentData.authorName || 'Music Explorer';
    const userAvatar = commentData.userAvatar || commentData.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

    const newComment = {
      id: generateId('comm'),
      text: (commentData.text || '').trim(),
      userId,
      username,
      userName,
      userAvatar,
      author: {
        id: userId,
        username,
        name: userName,
        avatar: userAvatar
      },
      createdAt: new Date().toISOString()
    };

    if (db) {
      let postRef = doc(db, POSTS_COL, postId);
      let snap = await getDoc(postRef);

      if (!snap.exists()) {
        const q = query(collection(db, POSTS_COL), where('id', '==', postId));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          snap = qSnap.docs[0];
          postRef = doc(db, POSTS_COL, snap.id);
        }
      }

      await updateDoc(postRef, {
        comments: arrayUnion(newComment),
        updatedAt: serverTimestamp()
      });
    }

    cacheService.invalidateFeed();
    return newComment;
  } catch (err) {
    console.error('Error adding comment to post:', err);
    throw err;
  }
};

/**
 * Update Comment in a Post in Firestore
 */
export const updateCommentInFirestorePost = async (postId, commentId, newText, userIdentifier) => {
  try {
    if (!postId || !commentId) throw new Error('postId and commentId are required');

    if (db) {
      let postRef = doc(db, POSTS_COL, postId);
      let snap = await getDoc(postRef);

      if (!snap.exists()) {
        const q = query(collection(db, POSTS_COL), where('id', '==', postId));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          snap = qSnap.docs[0];
          postRef = doc(db, POSTS_COL, snap.id);
        }
      }

      if (snap && snap.exists()) {
        const data = snap.data() || {};
        const existingComments = Array.isArray(data.comments) ? data.comments : [];
        const updatedComments = existingComments.map(c => {
          if (c.id === commentId) {
            return {
              ...c,
              text: newText.trim(),
              updatedAt: new Date().toISOString()
            };
          }
          return c;
        });

        await updateDoc(postRef, {
          comments: updatedComments,
          updatedAt: serverTimestamp()
        });
      }
    }

    cacheService.invalidateFeed();
    return true;
  } catch (err) {
    console.error('Error updating comment in post:', err);
    throw err;
  }
};

/**
 * Delete Comment from a Post in Firestore
 */
export const deleteCommentFromFirestorePost = async (postId, commentId, userIdentifier) => {
  try {
    if (!postId || !commentId) throw new Error('postId and commentId are required');

    if (db) {
      let postRef = doc(db, POSTS_COL, postId);
      let snap = await getDoc(postRef);

      if (!snap.exists()) {
        const q = query(collection(db, POSTS_COL), where('id', '==', postId));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          snap = qSnap.docs[0];
          postRef = doc(db, POSTS_COL, snap.id);
        }
      }

      if (snap && snap.exists()) {
        const data = snap.data() || {};
        const existingComments = Array.isArray(data.comments) ? data.comments : [];
        const updatedComments = existingComments.filter(c => c.id !== commentId);

        await updateDoc(postRef, {
          comments: updatedComments,
          updatedAt: serverTimestamp()
        });
      }
    }

    cacheService.invalidateFeed();
    return true;
  } catch (err) {
    console.error('Error deleting comment in post:', err);
    throw err;
  }
};

/**
 * Unified Discovery Search (Songs, Users, Posts, Tags) with Client-Side Caching & Live Search
 */
export const searchFirestoreUnified = async ({ query: searchQuery, type = 'all', limit = 25, bypassCache = false } = {}) => {
  const qStr = (searchQuery || '').trim();
  if (!qStr) {
    return { query: '', type, tracks: [], users: [], posts: [], tags: [] };
  }

  // 1. Check client unified search cache first (unless explicit bypass requested e.g. on Enter)
  if (!bypassCache) {
    const cachedUnified = cacheService.getUnifiedSearch(qStr, type);
    if (cachedUnified) {
      return cachedUnified;
    }
  }

  const qLower = qStr.toLowerCase();
  const cleanHandle = qLower.replace(/^[@#]/, '').trim();
  const words = cleanHandle.split(/\s+/).filter(Boolean);

  try {
    // 1. Search tracks via cached music search
    let tracks = [];
    if (type === 'all' || type === 'songs') {
      try {
        tracks = await searchMusicCached(qStr, limit);
      } catch (e) {
        console.warn('Tracks search notice:', e);
      }
    }

    // 2. Search users & posts in Firestore
    let users = [];
    let posts = [];
    let tags = [];

    if (db) {
      let allPosts = [];

      // Query posts first if needed for posts, tags, supplemental user search, or track discovery
      if (type === 'all' || type === 'posts' || type === 'tags' || type === 'users' || type === 'songs') {
        const postsSnap = await getDocs(query(collection(db, POSTS_COL), firestoreLimit(100)));
        allPosts = postsSnap.docs.map(d => ({
          ...d.data(),
          id: d.id,
          comments: Array.isArray(d.data().comments) ? d.data().comments : []
        }));
      }

      // Merge community posted tracks into tracks list for comprehensive results
      if (type === 'all' || type === 'songs') {
        const existingTrackKeys = new Set(tracks.map(t => `${(t.title || '').toLowerCase()}::${(t.artist || '').toLowerCase()}`));
        allPosts.forEach(p => {
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
        if (tracks.length > limit) {
          tracks = tracks.slice(0, limit);
        }
      }

      // Search Users in Firestore
      if (type === 'all' || type === 'users') {
        const usersSnap = await getDocs(query(collection(db, USERS_COL), firestoreLimit(100)));
        const primaryUsers = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => {
            const userSearchText = `${u.name || ''} ${u.username || ''} ${u.bio || ''} ${u.email || ''} ${(u.favoriteGenres || []).join(' ')}`.toLowerCase();
            return userSearchText.includes(cleanHandle) || (words.length > 1 && words.every(w => userSearchText.includes(w)));
          });

        // Index seen usernames to avoid duplicates
        const seenUsernames = new Set(primaryUsers.map(u => (u.username || u.id || '').toLowerCase()));
        users = [...primaryUsers];

        // Supplement from post authors who may have posted reviews
        allPosts.forEach(p => {
          const a = p.author;
          if (a && a.username && !seenUsernames.has(a.username.toLowerCase())) {
            const authorSearchText = `${a.name || ''} ${a.username || ''}`.toLowerCase();
            const matches = authorSearchText.includes(cleanHandle) || (words.length > 1 && words.every(w => authorSearchText.includes(w)));
            if (matches) {
              seenUsernames.add(a.username.toLowerCase());
              users.push({
                id: a.id || p.userId || a.username,
                uid: a.id || p.userId || a.username,
                name: a.name || 'Music Explorer',
                username: a.username,
                avatar: a.avatar,
                bio: 'Music enthusiast sharing sonic vibes on SoundVibe 🎧',
                followers: [],
                following: [],
                badges: a.badges || ['Curator']
              });
            }
          }
        });

        users = users.slice(0, limit);
      }

      // Search Posts in Firestore
      if (type === 'all' || type === 'posts' || type === 'tags') {
        posts = allPosts.filter(p => {
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

        // Aggregate matching tags
        const tagMap = {};
        allPosts.forEach(p => {
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
      }
    } else {
      // Fallback to Backend Search API
      const res = await fetch(`/api/search?q=${encodeURIComponent(qStr)}&type=${encodeURIComponent(type)}`);
      const data = await res.json();
      cacheService.setUnifiedSearch(qStr, type, data);
      return data;
    }

    const unifiedResult = {
      query: qStr,
      type,
      tracks,
      users,
      posts,
      tags
    };

    cacheService.setUnifiedSearch(qStr, type, unifiedResult);
    return unifiedResult;
  } catch (err) {
    console.error('Unified search error:', err);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(qStr)}&type=${encodeURIComponent(type)}`);
      const data = await res.json();
      cacheService.setUnifiedSearch(qStr, type, data);
      return data;
    } catch (e) {
      return { query: qStr, type, tracks: [], users: [], posts: [], tags: [] };
    }
  }
};
