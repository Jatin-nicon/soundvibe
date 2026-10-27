import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Users, 
  UserCheck, 
  UserPlus, 
  Search, 
  Disc3,
  ExternalLink
} from 'lucide-react';
import { getFirestoreFollowLists } from '../services/firestoreService';

export const FollowListModal = ({ 
  isOpen, 
  onClose, 
  userId, 
  userName,
  initialTab = 'followers' 
}) => {
  const navigate = useNavigate();
  const { user, toggleFollowUser } = useAuth();

  const [activeTab, setActiveTab] = useState(initialTab); // 'followers' | 'following'
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && userId) {
      setActiveTab(initialTab);
      loadData();
    }
  }, [isOpen, userId, initialTab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFirestoreFollowLists(userId);
      setFollowers(data.followers || []);
      setFollowing(data.following || []);
    } catch (err) {
      console.error('Error loading followers/following:', err);
      setError('Failed to load network');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentList = activeTab === 'followers' ? followers : following;
  const filteredList = currentList.filter(item => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return (
      item.name?.toLowerCase().includes(query) ||
      item.username?.toLowerCase().includes(query) ||
      item.bio?.toLowerCase().includes(query)
    );
  });

  const handleUserClick = (u) => {
    onClose();
    navigate(`/profile/${u.username || u.id}`);
  };

  const handleFollowToggle = async (targetId, e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/settings');
      onClose();
      return;
    }
    try {
      await toggleFollowUser(targetId);
      // Reload updated lists
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="glass-dropdown border border-white/15 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col p-6 shadow-2xl relative custom-scrollbar bg-dark-950/95 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold font-display text-white">
              {userName || 'Community'} Network
            </h3>
            <p className="text-xs text-slate-400">Discover taste connections and curators</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs: Followers vs Following */}
        <div className="flex rounded-2xl bg-dark-900 p-1 my-4 border border-white/5">
          <button
            onClick={() => setActiveTab('followers')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'followers'
                ? 'bg-brand-blue text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Followers ({followers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('following')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'following'
                ? 'bg-brand-blue text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Following ({following.length})</span>
          </button>
        </div>

        {/* Search bar inside modal if list has items */}
        {currentList.length > 3 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder={`Filter ${activeTab}...`}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
          </div>
        )}

        {/* User List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[220px]">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <Disc3 className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading {activeTab}...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-dark-900 border border-white/10 flex items-center justify-center mx-auto text-slate-500">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-white">
                {searchFilter ? 'No curators match your search' : `No ${activeTab} yet`}
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                {activeTab === 'followers'
                  ? 'When other listeners follow this profile, they will appear here.'
                  : 'This listener has not followed anyone yet.'}
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isSelf = user && (user.id === item.id || user.uid === item.id || user.username === item.username);
              const isFollowing = (user?.following || []).some(
                fId => fId === item.id || fId === item.username || (item.username && fId.toLowerCase().includes(item.username.toLowerCase()))
              );

              return (
                <div
                  key={item.id || item.username}
                  onClick={() => handleUserClick(item)}
                  className="p-3 rounded-2xl bg-dark-900/70 hover:bg-dark-900 border border-white/5 hover:border-brand-blue/30 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${item.username || item.id}`}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${item.username || item.id}`;
                      }}
                      className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-brand-blue transition-all shrink-0 bg-dark-800"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white group-hover:text-brand-blue transition-colors truncate">
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">
                        @{item.username || 'curator'}
                      </p>
                      {item.bio && (
                        <p className="text-[10px] text-slate-500 truncate max-w-[200px]">
                          {item.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isSelf && (
                    <button
                      onClick={(e) => handleFollowToggle(item.username || item.id, e)}
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
            })
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};
