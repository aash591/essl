import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Loader2, Plus, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import UserSearchSelector from '@/components/UserSearchSelector';
import DeleteModal from '@/components/DeleteModal';

interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface User {
  id: number;
  userId: string;
  name: string;
  role: string | number;
  cardNo?: string;
  shiftId?: number | null;
}

interface ManageShiftUsersModalProps {
  show: boolean;
  onClose: () => void;
  shift: Shift | null;
  onUsersUpdated?: () => void;
}

const PAGE_SIZE = 20;

export default function ManageShiftUsersModal({
  show,
  onClose,
  shift,
  onUsersUpdated,
}: ManageShiftUsersModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [usersToAdd, setUsersToAdd] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all users assigned to this shift
  const fetchAllShiftUsers = async () => {
    if (!shift) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/db/users?limit=10000`);
      const data = await response.json();

      if (data.success && data.data?.users) {
        const shiftUsers = data.data.users.filter((u: any) => u.shiftId === shift.id);
        setAllUsers(shiftUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Paginate and filter users based on search and page
  useEffect(() => {
    if (!shift) return;

    let filteredUsers = allUsers;
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredUsers = allUsers.filter((u) =>
        u.userId.toLowerCase().includes(searchLower) ||
        u.name.toLowerCase().includes(searchLower)
      );
    }

    const totalFiltered = filteredUsers.length;
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    setUsers(paginatedUsers);
    setTotal(totalFiltered);
    setTotalPages(Math.ceil(totalFiltered / PAGE_SIZE));
  }, [allUsers, searchTerm, page, shift]);

  // Fetch users when modal opens / reset when closes
  useEffect(() => {
    if (show && shift) {
      fetchAllShiftUsers();
      setSearchTerm('');
      setPage(1);
    } else if (!show) {
      setAllUsers([]);
      setUsers([]);
      setSearchTerm('');
      setPage(1);
      setUsersToAdd([]);
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  }, [show, shift]);

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || !shift) return;

    setIsDeleting(true);
    try {
      const response = await fetch('/api/db/users/batch-shift', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userToDelete.id],
          shiftId: null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAllUsers(allUsers.filter(u => u.id !== userToDelete.id));

        if (onUsersUpdated) {
          onUsersUpdated();
        }

        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        alert(data.error || 'Failed to remove user from shift');
      }
    } catch (error) {
      console.error('Error removing user from shift:', error);
      alert('Failed to remove user from shift');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  const handleAddSelectedUsers = async () => {
    if (!shift || usersToAdd.length === 0) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/db/users/batch-shift', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: usersToAdd,
          shiftId: shift.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchAllShiftUsers();
        setUsersToAdd([]);

        if (onUsersUpdated) {
          onUsersUpdated();
        }
      } else {
        alert(data.error || 'Failed to add users to shift');
      }
    } catch (error) {
      console.error('Error adding users to shift:', error);
      alert('Failed to add users to shift');
    } finally {
      setIsSaving(false);
    }
  };

  if (!show || typeof window === 'undefined' || !shift) return null;

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
      ),
    },
    {
      header: 'Role',
      accessorKey: 'role',
      width: '100px',
      render: (user) => {
        const roleStr = String(user.role || '0');
        const isAdmin = roleStr.startsWith('14');
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              !isAdmin ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'
            }`}
          >
            {!isAdmin ? 'User' : 'Admin'}
          </span>
        );
      },
    },
    {
      header: 'Card No',
      accessorKey: 'cardNo',
      width: '120px',
      className: 'text-muted-foreground font-mono',
      render: (user) => user.cardNo || '-',
    },
    {
      header: 'Actions',
      width: '100px',
      render: (user) => (
        <button
          onClick={() => handleDeleteClick(user)}
          className="p-1.5 hover:bg-destructive/10 rounded transition-all"
          title="Remove from shift"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>
      ),
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
                {shift.name} ({shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)})
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

        {/* Add Users */}
        <div className="px-6 pt-4 pb-4 border-b border-border/50 flex-shrink-0 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Add Users to Shift
          </label>
          <UserSearchSelector
            selectedUserIds={usersToAdd}
            onSelectionChange={setUsersToAdd}
            disabled={isSaving}
            placeholder="Add users to this shift..."
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
                  Add {usersToAdd.length} user{usersToAdd.length !== 1 ? 's' : ''} to shift
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
              onPageChange: setPage,
            }}
            emptyMessage={
              searchTerm
                ? 'No users found matching your search.'
                : 'No users assigned to this shift yet.'
            }
          />
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
          <div className="text-sm text-muted-foreground">
            {total} user{total !== 1 ? 's' : ''} assigned to this shift
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
        title="Remove User from Shift"
        customMessage={`Are you sure you want to remove this user "${userToDelete?.name || ''}" from "${shift?.name}" shift?`}
        isDeleting={isDeleting}
      />
    </div>,
    document.body
  );
}


