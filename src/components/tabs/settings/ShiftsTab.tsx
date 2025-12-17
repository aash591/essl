import React, { useEffect, useState } from 'react';
import { Clock, Edit, Plus, Trash2, Users } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import FormModal, { FormField } from '@/components/FormModal';
import DeleteModal from '@/components/DeleteModal';
import ManageShiftUsersModal from '@/components/ManageShiftUsersModal';

interface Shift {
  id: number;
  name: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;   // "HH:MM:SS"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ShiftsTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Delete state
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manage users modal state
  const [showManageUsersModal, setShowManageUsersModal] = useState(false);
  const [shiftForUsers, setShiftForUsers] = useState<Shift | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('18:00');
  const [formIsActive, setFormIsActive] = useState(true);

  const formatTimeToAmPm = (time: string) => {
    if (!time) return '-';
    const [hourStr, minuteStr] = time.split(':');
    const hourNum = parseInt(hourStr || '0', 10);
    if (Number.isNaN(hourNum)) return time;

    const suffix = hourNum >= 12 ? 'PM' : 'AM';
    let displayHour = hourNum % 12;
    if (displayHour === 0) displayHour = 12;

    const minutes = minuteStr ?? '00';
    return `${displayHour.toString().padStart(2, '0')}:${minutes.padStart(2, '0')} ${suffix}`;
  };

  const fetchShifts = async (pageNum: number = 1, search: string = '') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
        ...(search && { search }),
      });

      const res = await fetch(`/api/db/shifts?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        setShifts(data.data.shifts);
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts(page, searchTerm);
  }, [page, searchTerm]);

  const resetForm = () => {
    setFormName('');
    setFormStartTime('09:00');
    setFormEndTime('18:00');
    setFormIsActive(true);
  };

  const handleAdd = () => {
    setEditingShift(null);
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormName(shift.name);
    setFormStartTime(shift.startTime.slice(0, 5)); // HH:MM
    setFormEndTime(shift.endTime.slice(0, 5));     // HH:MM
    setFormIsActive(shift.isActive);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('Shift name is required');
      return;
    }

    if (!formStartTime || !formEndTime) {
      alert('Start time and End time are required');
      return;
    }

    setIsSaving(true);
    try {
      const method = editingShift ? 'PUT' : 'POST';
      const body: any = {
        name: formName.trim(),
        startTime: `${formStartTime}:00`, // convert HH:MM -> HH:MM:00
        endTime: `${formEndTime}:00`,
        isActive: formIsActive,
      };

      if (editingShift) {
        body.id = editingShift.id;
      }

      const res = await fetch('/api/db/shifts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setShowModal(false);
        setEditingShift(null);
        await fetchShifts(page, searchTerm);
      } else {
        alert(data.error || 'Failed to save shift');
      }
    } catch (error) {
      alert('Failed to save shift');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (shift: Shift) => {
    setShiftToDelete(shift);
    setShowDeletePopup(true);
  };

  const confirmDelete = async () => {
    if (!shiftToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/db/shifts?id=${shiftToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setShowDeletePopup(false);
        setShiftToDelete(null);
        await fetchShifts(page, searchTerm);
      } else {
        alert(data.error || 'Failed to delete shift');
      }
    } catch (error) {
      alert('Failed to delete shift');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeletePopup(false);
    setShiftToDelete(null);
  };

  const handleManageUsers = (shift: Shift) => {
    setShiftForUsers(shift);
    setShowManageUsersModal(true);
  };

  const columns: Column<Shift>[] = [
    {
      header: '#',
      width: '60px',
      render: (_item, index) => (page - 1) * PAGE_SIZE + index + 1,
      className: 'text-muted-foreground',
    },
    {
      header: 'Shift Name',
      accessorKey: 'name',
      width: '220px',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary flex-shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <span className="font-medium">{item.name}</span>
        </div>
      ),
    },
    {
      header: 'Start Time',
      accessorKey: 'startTime',
      width: '120px',
      render: (item) => formatTimeToAmPm(item.startTime.slice(0, 5)),
      className: 'font-mono',
    },
    {
      header: 'End Time',
      accessorKey: 'endTime',
      width: '120px',
      render: (item) => formatTimeToAmPm(item.endTime.slice(0, 5)),
      className: 'font-mono',
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      width: '120px',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            item.isActive
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {item.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Actions',
      width: '200px',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="p-1.5 hover:bg-secondary rounded transition-all"
            title="Edit"
          >
            <Edit className="w-4 h-4 text-primary" />
          </button>
          <button
            onClick={() => handleManageUsers(item)}
            className="p-1.5 hover:bg-secondary rounded transition-all"
            title="Manage Users"
          >
            <Users className="w-4 h-4 text-accent" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 hover:bg-destructive/10 rounded transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      ),
    },
  ];

  const fields: FormField[] = [
    {
      name: 'name',
      label: 'Shift Name',
      type: 'text',
      value: formName,
      onChange: setFormName,
      placeholder: 'e.g., General Shift',
      required: true,
    },
    {
      name: 'startTime',
      label: 'Start Time',
      type: 'custom',
      value: formStartTime,
      onChange: (val) => setFormStartTime(val),
      required: true,
      customComponent: (
        <div className="space-y-1">
          <input
            type="time"
            value={formStartTime}
            onChange={(e) => setFormStartTime(e.target.value)}
            className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
          />
          <p className="text-xs text-muted-foreground">
            {formStartTime ? `Selected: ${formatTimeToAmPm(formStartTime)}` : 'Select start time'}
          </p>
        </div>
      ),
    },
    {
      name: 'endTime',
      label: 'End Time',
      type: 'custom',
      value: formEndTime,
      onChange: (val) => setFormEndTime(val),
      required: true,
      customComponent: (
        <div className="space-y-1">
          <input
            type="time"
            value={formEndTime}
            onChange={(e) => setFormEndTime(e.target.value)}
            className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
          />
          <p className="text-xs text-muted-foreground">
            {formEndTime ? `Selected: ${formatTimeToAmPm(formEndTime)}` : 'Select end time'}
          </p>
        </div>
      ),
    },
    {
      name: 'isActive',
      label: 'Active',
      type: 'custom',
      value: formIsActive,
      onChange: (val) => setFormIsActive(Boolean(val)),
      required: false,
      customComponent: (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formIsActive}
            onChange={(e) => setFormIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
          />
          <span className="text-sm text-foreground">This shift is active</span>
        </label>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Shifts</h3>
            <p className="text-xs text-muted-foreground">
              Configure shift timings used for attendance processing.
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search shifts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-3 pr-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Shift
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={shifts}
        keyField="id"
        isLoading={isLoading}
        height="calc(100vh - 380px)"
        minHeight="400px"
        pagination={{
          currentPage: page,
          totalPages,
          totalItems: total,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
        emptyMessage="No shifts configured yet."
      />

      <FormModal
        show={showModal}
        onClose={() => !isSaving && setShowModal(false)}
        title={editingShift ? 'Edit Shift' : 'Add Shift'}
        icon={Clock}
        fields={fields}
        onSubmit={handleSave}
        submitLabel={editingShift ? 'Update' : 'Create'}
        isSubmitting={isSaving}
        isValid={!!formName.trim() && !!formStartTime && !!formEndTime}
      />

      <DeleteModal
        show={showDeletePopup}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        itemName={shiftToDelete?.name || ''}
        itemType="Shift"
        isDeleting={isDeleting}
      />

      <ManageShiftUsersModal
        show={showManageUsersModal}
        onClose={() => {
          setShowManageUsersModal(false);
          setShiftForUsers(null);
        }}
        shift={shiftForUsers}
        onUsersUpdated={() => {
          fetchShifts(page, searchTerm);
        }}
      />
    </div>
  );
}
