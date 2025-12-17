import React, { useState, useEffect } from 'react';
import { Search, Download, AlertCircle, Monitor, Edit } from 'lucide-react';
import { User, Device } from '@/types';
import DataTable, { Column } from '@/components/DataTable';
import Popover from '@/components/Popover';
import UserModal from '@/components/UserModal';

interface UsersTabProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  usersPage: number;
  setUsersPage: (page: number) => void;
  usersTotalPages: number;
  dbStats: { totalUsers: number };
  sortedUsers: User[];
  isLoading: boolean;
  PAGE_SIZE: number;
  userSortField: string | null;
  userSortDirection: 'asc' | 'desc';
  handleUserSort: (field: string) => void;
  fetchDbUsers: (page: number, search: string) => Promise<void>;
  exportUsers: () => void;
  selectedDevice: Device | null;
  showNotification?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const getUserColumns = (
  usersPage: number, 
  PAGE_SIZE: number,
  AdminDevicePopover: React.ComponentType<{ deviceIds: string[] }>,
  onEditUser: (user: User) => void
): Column<User>[] => [
  { 
    header: '#', 
    width: '60px',
    render: (_, index) => (usersPage - 1) * PAGE_SIZE + index + 1,
    className: 'text-muted-foreground'
  },
  { 
    header: 'User ID', 
    accessorKey: 'userId', 
    sortable: true, 
    width: '120px', 
    className: 'font-mono text-primary' 
  },
  { 
    header: 'Name', 
    accessorKey: 'name', 
    sortable: true,
    render: (user) => (
      <div className="flex items-center gap-3">
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
    sortable: true, 
    width: '120px',
    render: (user) => {
      const roleStr = String(user.role || '0');
      const isAdmin = roleStr.startsWith('14');
      const deviceIds = isAdmin && roleStr.includes(',') 
        ? roleStr.split(',').slice(1) 
        : [];
      
      return (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            !isAdmin ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'
          }`}>
            {!isAdmin ? 'User' : 'Admin'}
          </span>
          {isAdmin && deviceIds.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <AdminDevicePopover deviceIds={deviceIds} />
            </div>
          )}
        </div>
      );
    }
  },
  { 
    header: 'Card No', 
    accessorKey: 'cardNo', 
    sortable: true, 
    width: '120px', 
    className: 'text-muted-foreground font-mono',
    render: (user) => user.cardNo || '-'
  },
  { 
    header: 'Designation', 
    accessorKey: 'designation', 
    sortable: true, 
    width: '180px',
    render: (user) => {
      if (!user.designation) {
        return <span className="text-muted-foreground">-</span>;
      }
      return (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{user.designation}</span>
          {user.designationDepartment && (
            <span className="text-xs text-muted-foreground">{user.designationDepartment}</span>
          )}
        </div>
      );
    }
  },
  {
    header: 'Actions',
    width: '100px',
    render: (user) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditUser(user);
        }}
        className="p-2 hover:bg-secondary rounded-lg transition-colors text-primary hover:text-primary/80"
        title="Edit user"
      >
        <Edit className="w-4 h-4" />
      </button>
    )
  }
];

export default function UsersTab({
  searchTerm,
  setSearchTerm,
  usersPage,
  setUsersPage,
  usersTotalPages,
  dbStats,
  sortedUsers,
  isLoading,
  PAGE_SIZE,
  userSortField,
  userSortDirection,
  handleUserSort,
  fetchDbUsers,
  exportUsers,
  selectedDevice,
  showNotification
}: UsersTabProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Fetch devices on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await fetch('/api/devices');
        const data = await response.json();
        if (data.success && data.data) {
          setDevices(data.data);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
      }
    };
    fetchDevices();
  }, []);

  // Admin Device Popover Component
  const AdminDevicePopover = ({ deviceIds }: { deviceIds: string[] }) => {
    const adminDevices = deviceIds
      .map(id => {
        const device = devices.find(d => d.id === parseInt(id));
        return device ? { ...device, id: parseInt(id) } : null;
      })
      .filter((d): d is Device => d !== null);

    return (
      <Popover
        trigger={
          <button
            className="text-yellow-500 hover:text-yellow-600 transition-colors"
            title="Click to see admin devices"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
        }
        position="top"
        align="center"
        className="max-w-xs"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Monitor className="w-4 h-4 text-primary" />
              Admin Devices
            </h3>
          </div>
          
          {adminDevices.length > 0 ? (
            <div className="space-y-2 max-h-[100px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
              {adminDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-start gap-3 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {device.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {device.ip}
                    </p>
                    {device.serialNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        SN: {device.serialNumber}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">
              <p>Device IDs: {deviceIds.join(', ')}</p>
              <p className="text-xs mt-1">(Devices not found in database)</p>
            </div>
          )}
        </div>
      </Popover>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setUsersPage(1);
                  fetchDbUsers(1, searchTerm);
                }
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => {
              setUsersPage(1);
              fetchDbUsers(1, searchTerm);
            }}
            className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium"
          >
            Search
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportUsers}
            disabled={sortedUsers.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 hover:bg-secondary border border-border rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <DataTable
        columns={getUserColumns(usersPage, PAGE_SIZE, AdminDevicePopover, (user) => {
          setSelectedUser(user);
          setShowUserModal(true);
        })}
        data={sortedUsers}
        keyField="id"
        isLoading={isLoading}
        height="calc(100vh - 280px)"
        minHeight="400px"
        pagination={{
          currentPage: usersPage,
          totalPages: usersTotalPages,
          totalItems: dbStats.totalUsers,
          pageSize: PAGE_SIZE,
          onPageChange: setUsersPage
        }}
        sorting={{
          field: userSortField,
          direction: userSortDirection,
          onSort: handleUserSort
        }}
        emptyMessage="No users in database. Sync from device first."
      />

      <UserModal
        show={showUserModal}
        onClose={() => {
          setShowUserModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        selectedDevice={selectedDevice}
        onUserUpdated={() => {
          // Refresh users list after designation update
          fetchDbUsers(usersPage, searchTerm);
        }}
        showNotification={showNotification}
      />
    </div>
  );
}

