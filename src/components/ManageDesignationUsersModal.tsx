import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Loader2, Search, Plus, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import UserSearchSelector from '@/components/UserSearchSelector';
import DeleteModal from '@/components/DeleteModal';

interface Designation {
  id: number;
  name: string;
  description: string | null;
}

interface User {
  id: number;
  userId: string;
  name: string;
  role: string | number;
  cardNo?: string;
  designationId?: number | null;
}

interface ManageDesignationUsersModalProps {
  show: boolean;
  onClose: () => void;
  designation: Designation | null;
  onUsersUpdated?: () => void;
}

const PAGE_SIZE = 20;

export default function ManageDesignationUsersModal({
  show,
  onClose,
  designation,
  onUsersUpdated,
}: ManageDesignationUsersModalProps) {
  const [currentUserIds, setCurrentUserIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]); // All users for this designation
  const [users, setUsers] = useState<User[]>([]); // Paginated users to display
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [usersToAdd, setUsersToAdd] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all users assigned to this designation
  const fetchAllDesignationUsers = async () => {
    if (!designation) return;
    
    setIsLoading(true);
    try {
      // Fetch all users (with high limit to get all)
      const response = await fetch(`/api/db/users?limit=10000`);
      const data = await response.json();
      
      if (data.success && data.data?.users) {
        // Filter to only users assigned to this designation
        const designationUsers = data.data.users.filter((u: any) => u.designationId === designation.id);
        setAllUsers(designationUsers);
        
        // Set initial user IDs (only those currently assigned)
        const userIds = designationUsers.map((u: any) => u.id);
        setCurrentUserIds(userIds);
        
        // Refresh the display
        setAllUsers(designationUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Paginate and filter users based on search and page
  useEffect(() => {
    if (!designation) return;

    // Filter users by search term
    let filteredUsers = allUsers;
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredUsers = allUsers.filter((u) => 
        u.userId.toLowerCase().includes(searchLower) ||
        u.name.toLowerCase().includes(searchLower)
      );
    }

    // Calculate pagination
    const totalFiltered = filteredUsers.length;
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    setUsers(paginatedUsers);
    setTotal(totalFiltered);
    setTotalPages(Math.ceil(totalFiltered / PAGE_SIZE));
  }, [allUsers, searchTerm, page, designation]);

  // Fetch users when modal opens
  useEffect(() => {
    if (show && designation) {
      fetchAllDesignationUsers();
      setSearchTerm('');
      setPage(1);
    } else if (!show) {
      // Reset when modal closes
      setCurrentUserIds([]);
      setAllUsers([]);
      setUsers([]);
      setSearchTerm('');
      setPage(1);
      setUsersToAdd([]);
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  }, [show, designation]);

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || !designation) return;

    setIsDeleting(true);
    try {
      const response = await fetch('/api/db/users/batch-designation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userToDelete.id],
          designationId: null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Remove user from local state
        setAllUsers(allUsers.filter(u => u.id !== userToDelete.id));
        setCurrentUserIds(currentUserIds.filter(id => id !== userToDelete.id));
        
        // Refresh user list if callback provided
        if (onUsersUpdated) {
          onUsersUpdated();
        }
        
        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        alert(data.error || 'Failed to remove user from designation');
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user from designation');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  const handleAddSelectedUsers = async () => {
    if (!designation || usersToAdd.length === 0) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/db/users/batch-designation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: usersToAdd,
          designationId: designation.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh the user list to show newly added users
        await fetchAllDesignationUsers();
        setUsersToAdd([]);
        
        // Refresh user list if callback provided
        if (onUsersUpdated) {
          onUsersUpdated();
        }
      } else {
        alert(data.error || 'Failed to add users to designation');
      }
    } catch (error) {
      console.error('Error adding users:', error);
      alert('Failed to add users to designation');
    } finally {
      setIsSaving(false);
    }
  };

  if (!show || typeof window === 'undefined' || !designation) return null;

  // Table columns
  const userColumns: Column<User>[] = [
    {
      header: 'User ID',
      accessorKey: 'userId',
      width: '120px',
      className: 'font-mono text-primary',
    },
    {
      header: 'Name',
      accessorKey: 'name',
      render: (user) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium">{user.name}</span>
        </div>
      )
    },
    {
      header: 'Role',
      accessorKey: 'role',
      width: '100px',
      render: (user) => {
        const roleStr = String(user.role || '0');
        const isAdmin = roleStr.startsWith('14');
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            !isAdmin ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'
          }`}>
            {!isAdmin ? 'User' : 'Admin'}
          </span>
        );
      }
    },
    {
      header: 'Card No',
      accessorKey: 'cardNo',
      width: '120px',
      className: 'text-muted-foreground font-mono',
      render: (user) => user.cardNo || '-'
    },
    {
      header: 'Actions',
      width: '100px',
      render: (user) => (
        <button
          onClick={() => handleDeleteClick(user)}
          className="p-1.5 hover:bg-destructive/10 rounded transition-all"
          title="Remove from designation"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>
      )
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        className="bg-card rounded-xl border border-border flex flex-col animate-slide-in-up"
        style={{ 
          width: 'min(90vw, 1000px)',
          height: 'min(90vh, 800px)',
        }}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Manage Users</h3>
              <p className="text-sm text-muted-foreground">
                {designation.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar and Add Users */}
        <div className="px-6 pt-4 pb-4 border-b border-border/50 flex-shrink-0 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Add Users to Designation
          </label>
          <UserSearchSelector
            selectedUserIds={usersToAdd}
            onSelectionChange={setUsersToAdd}
            disabled={isSaving}
            placeholder="Add users to this designation..."
          />
          {usersToAdd.length > 0 && (
            <button
              onClick={handleAddSelectedUsers}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add {usersToAdd.length} user{usersToAdd.length !== 1 ? 's' : ''} to designation
                </>
              )}
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden px-6 pb-4">
          <DataTable
            columns={userColumns}
            data={users}
            keyField="id"
            isLoading={isLoading}
            height="100%"
            pagination={{
              currentPage: page,
              totalPages,
              totalItems: total,
              pageSize: PAGE_SIZE,
              onPageChange: setPage
            }}
            emptyMessage={searchTerm ? "No users found matching your search." : "No users assigned to this designation yet."}
          />
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
          <div className="text-sm text-muted-foreground">
            {total} user{total !== 1 ? 's' : ''} assigned to this designation
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteModal
        show={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        itemName={userToDelete?.name || ''}
        itemType="User"
        title="Remove User from Designation"
        customMessage={`Are you sure you want to remove this user "${userToDelete?.name || ''}" from "${designation?.name}" designation?`}
        isDeleting={isDeleting}
      />
    </div>,
    document.body
  );
}
