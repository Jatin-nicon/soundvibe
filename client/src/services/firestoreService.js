/**
 * Database Service Adapter
 * 
 * SoundVibe's database has migrated to Supabase PostgreSQL.
 * This adapter cleanly exposes the service interface backed 100% by Supabase,
 * while maintaining existing function contracts across UI components.
 */

import { cacheService } from './cacheService';
import { 
  getSupabaseUser, 
  saveSupabaseUser, 
  isSupabaseUsernameAvailable,
  getSupabasePosts, 
  getSupabasePostById,
  createSupabasePost, 
  updateSupabasePost, 
  deleteSupabasePost, 
  reactToSupabasePost, 
  addCommentToSupabasePost, 
  updateSupabaseComment,
  deleteSupabaseComment,
  toggleFollowSupabase, 
  getSupabaseFollowLists, 
  searchSupabaseUnified 
} from './supabaseService';

// Helper to generate a clean safe ID
export const generateId = (prefix = 'item') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// ================= USER OPERATIONS =================

export const getFirestoreUser = async (uidOrUsername) => {
  return getSupabaseUser(uidOrUsername);
};

export const isUsernameAvailable = async (username, currentUid) => {
  return isSupabaseUsernameAvailable(username, currentUid);
};

export const saveFirestoreUser = async (uid, userData) => {
  return saveSupabaseUser(uid, userData);
};

export const toggleFollowFirestore = async (currentUid, targetUidOrUsername) => {
  return toggleFollowSupabase(currentUid, targetUidOrUsername);
};

export const getFirestoreFollowLists = async (uidOrUsername) => {
  return getSupabaseFollowLists(uidOrUsername);
};

export const invalidateFirestoreRawCache = () => {
  cacheService.invalidateFeed();
};

// ================= POST OPERATIONS =================

export const getFirestorePosts = async (params = {}) => {
  return getSupabasePosts(params);
};

export const getFirestorePostById = async (postId) => {
  return getSupabasePostById(postId);
};

export const createFirestorePost = async (postData) => {
  return createSupabasePost(postData);
};

export const updateFirestorePost = async (postId, updateData, currentUserId) => {
  return updateSupabasePost(postId, updateData, currentUserId);
};

export const deleteFirestorePost = async (postId, currentUserId) => {
  return deleteSupabasePost(postId, currentUserId);
};

// ================= REACTIONS & COMMENTS =================

export const reactToFirestorePost = async (postId, reactionKey, userId) => {
  return reactToSupabasePost(postId, reactionKey, userId);
};

export const addCommentToFirestorePost = async (postId, commentData) => {
  const userId = commentData.userId || 'listener';
  return addCommentToSupabasePost(postId, userId, commentData.text, {
    name: commentData.userName || commentData.authorName,
    username: commentData.username
  });
};

export const updateCommentInFirestorePost = async (postId, commentId, newText, userIdentifier) => {
  return updateSupabaseComment(commentId, newText, userIdentifier);
};

export const deleteCommentFromFirestorePost = async (postId, commentId, userIdentifier) => {
  return deleteSupabaseComment(commentId, userIdentifier);
};

// ================= UNIFIED DISCOVERY SEARCH =================

export const searchFirestoreUnified = async ({ query: searchQuery, type = 'all', limit = 25, bypassCache = false } = {}) => {
  return searchSupabaseUnified({ query: searchQuery, type, limit, bypassCache });
};
