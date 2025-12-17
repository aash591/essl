import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check, User, Loader2 } from 'lucide-react';

interface User {
  id: number;
  userId: string;
  name: string;
}

interface UserSearchSelectorProps {
  selectedUserIds: number[];
  onSelectionChange: (userIds: number[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function UserSearchSelector({
  selectedUserIds,
  onSelectionChange,
  disabled = false,
  placeholder = "Search by user ID or name...",
}: UserSearchSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch selected users details
  useEffect(() => {
    const fetchSelectedUsers = async () => {
      if (selectedUserIds.length === 0) {
        setSelectedUsers([]);
        return;
      }

      try {
        const response = await fetch(`/api/db/users?limit=1000`);
        const data = await response.json();
        if (data.success && data.data?.users) {
          const users = data.data.users.filter((u: any) => 
            selectedUserIds.includes(u.id)
          );
          setSelectedUsers(users);
        }
      } catch (error) {
        console.error('Error fetching selected users:', error);
      }
    };

    fetchSelectedUsers();
  }, [selectedUserIds]);

  // Search users
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/db/users?search=${encodeURIComponent(searchTerm)}&limit=50`
        );
        const data = await response.json();
        if (data.success && data.data?.users) {
          // Filter out already selected users
          const filtered = data.data.users.filter(
            (u: any) => !selectedUserIds.includes(u.id)
          );
          setSearchResults(filtered);
          setShowResults(true);
        }
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, selectedUserIds]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUserSelect = (user: User) => {
    if (!selectedUserIds.includes(user.id)) {
      onSelectionChange([...selectedUserIds, user.id]);
    }
    setSearchTerm('');
    setShowResults(false);
  };

  const handleRemoveUser = (userId: number) => {
    onSelectionChange(selectedUserIds.filter(id => id !== userId));
  };

  const handleSelectAll = () => {
    const allIds = searchResults.map(u => u.id);
    onSelectionChange([...selectedUserIds, ...allIds]);
    setSearchTerm('');
    setShowResults(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => searchTerm && setShowResults(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {searchResults.length > 1 && (
            <button
              onClick={handleSelectAll}
              className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-secondary/50 border-b border-border flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Select All ({searchResults.length})
            </button>
          )}
          {searchResults.map((user) => (
            <button
              key={user.id}
              onClick={() => handleUserSelect(user)}
              className="w-full px-4 py-3 text-left hover:bg-secondary/50 border-b border-border/50 last:border-b-0 flex items-center gap-3 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground">ID: {user.userId}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Selected Users ({selectedUsers.length})
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-sm"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground text-xs">({user.userId})</span>
                {!disabled && (
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="ml-1 p-0.5 hover:bg-destructive/10 rounded transition-colors"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
