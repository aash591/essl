import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Building2, Briefcase, Users } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import Dropdown from '@/components/Dropdown';
import FormModal, { FormField } from '@/components/FormModal';
import DeleteModal from '@/components/DeleteModal';
import ManageDesignationUsersModal from '@/components/ManageDesignationUsersModal';

interface Designation {
  id: number;
  name: string;
  description: string | null;
  departmentId: number | null;
  departmentName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DepartmentsDesignationsTabProps {
  PAGE_SIZE: number;
  activeSection: 'departments' | 'designations';
}

type SectionType = 'departments' | 'designations';
type ModalType = 'add' | 'edit' | null;

export default function DepartmentsDesignationsTab({
  PAGE_SIZE,
  activeSection,
}: DepartmentsDesignationsTabProps) {
  const [departments, setDepartments] = useState<Designation[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingItem, setEditingItem] = useState<Designation | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation popup state
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Designation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manage users modal state
  const [showManageUsersModal, setShowManageUsersModal] = useState(false);
  const [designationForUsers, setDesignationForUsers] = useState<Designation | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDepartmentId, setFormDepartmentId] = useState<string>('');

  // Fetch data
  const fetchData = async (type: SectionType, pageNum: number = 1, search: string = '') => {
    setIsLoading(true);
    try {
      const endpoint = '/api/db/designations';
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
        ...(search && { search }),
        ...(type === 'departments' && { type: 'departments' }),
        ...(type === 'designations' && { type: 'designations' }),
      });

      const response = await fetch(`${endpoint}?${params}`);
      const data = await response.json();

      if (data.success && data.data) {
        const items = data.data.designations;
        if (type === 'departments') {
          setDepartments(items);
        } else {
          setDesignations(items);
        }
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch departments for dropdown
  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/db/designations?type=departments&limit=1000');
      const data = await response.json();
      return data.success ? data.data.designations : [];
    } catch (error) {
      return [];
    }
  };

  useEffect(() => {
    fetchData(activeSection, page, searchTerm);
  }, [activeSection, page, searchTerm]);

  const handleAdd = () => {
    setModalType('add');
    setEditingItem(null);
    setFormName('');
    setFormDescription('');
    setFormDepartmentId('');
    setShowModal(true);
  };

  const handleEdit = (item: Designation) => {
    setModalType('edit');
    setEditingItem(item);
    const designation = item as Designation;
    setFormName(designation.name);
    setFormDescription(designation.description || '');
    setFormDepartmentId(designation.departmentId?.toString() || '');
    setShowModal(true);
  };

  const handleManageUsers = (item: Designation) => {
    setDesignationForUsers(item);
    setShowManageUsersModal(true);
  };

  const handleDelete = (item: Designation) => {
    setItemToDelete(item);
    setShowDeletePopup(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      const endpoint = '/api/db/designations';
      const response = await fetch(`${endpoint}?id=${itemToDelete.id}&type=${activeSection}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        setShowDeletePopup(false);
        setItemToDelete(null);
        fetchData(activeSection, page, searchTerm);
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      alert('Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeletePopup(false);
    setItemToDelete(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = `/api/db/designations?type=${activeSection}`;
      const method = modalType === 'edit' ? 'PUT' : 'POST';
      const body = {
        ...(modalType === 'edit' && editingItem ? { id: editingItem.id } : {}),
        name: formName.trim(),
        description: formDescription.trim() || null,
        ...(activeSection === 'designations' && formDepartmentId
          ? { departmentId: parseInt(formDepartmentId) }
          : {}),
      };

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        setShowModal(false);
        fetchData(activeSection, page, searchTerm);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      alert('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Department columns
  const departmentColumns: Column<Designation>[] = [
    {
      header: '#',
      width: '60px',
      render: (_, index) => (page - 1) * PAGE_SIZE + index + 1,
      className: 'text-muted-foreground',
    },
    {
      header: 'Name',
      accessorKey: 'name',
      sortable: false,
      width: '250px',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-medium">{item.name}</span>
        </div>
      ),
    },
    {
      header: 'Description',
      accessorKey: 'description',
      render: (item) => item.description || '-',
      className: 'text-muted-foreground',
    },
    {
      header: 'Actions',
      width: '120px',
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
            onClick={() => handleDelete(item)}
            className="p-1.5 hover:bg-destructive/10 rounded transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      ),
    },
  ];

  // Designation columns
  const designationColumns: Column<Designation>[] = [
    {
      header: '#',
      width: '60px',
      render: (_, index) => (page - 1) * PAGE_SIZE + index + 1,
      className: 'text-muted-foreground',
    },
    {
      header: 'Name',
      accessorKey: 'name',
      sortable: false,
      width: '200px',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center text-accent font-semibold text-sm flex-shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
          <span className="font-medium">{item.name}</span>
        </div>
      ),
    },
    {
      header: 'Department',
      accessorKey: 'departmentName',
      width: '180px',
      render: (item) => item.departmentName || '-',
      className: 'text-muted-foreground',
    },
    {
      header: 'Description',
      accessorKey: 'description',
      render: (item) => item.description || '-',
      className: 'text-muted-foreground',
    },
    {
      header: 'Actions',
      width: '180px',
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
            onClick={() => handleDelete(item)}
            className="p-1.5 hover:bg-destructive/10 rounded transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      ),
    },
  ];

  const [availableDepartments, setAvailableDepartments] = useState<Designation[]>([]);

  useEffect(() => {
    if (activeSection === 'designations' && showModal) {
      fetchDepartments().then(setAvailableDepartments);
    }
  }, [activeSection, showModal]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search and Add */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${activeSection}...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add {activeSection === 'departments' ? 'Department' : 'Designation'}
        </button>
      </div>

      {/* Data Table */}
      <DataTable
        columns={activeSection === 'departments' ? departmentColumns : designationColumns}
        data={activeSection === 'departments' ? departments : designations}
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
        emptyMessage={`No ${activeSection} found.`}
      />

      {/* Modal */}
      <FormModal
        show={showModal}
        onClose={() => !isSaving && setShowModal(false)}
        title={`${modalType === 'edit' ? 'Edit' : 'Add'} ${
          activeSection === 'departments' ? 'Department' : 'Designation'
        }`}
        icon={activeSection === 'departments' ? Building2 : Briefcase}
        fields={(() => {
          const baseFields: FormField[] = [];

          baseFields.push({
            name: 'name',
            label: 'Name',
            type: 'text',
            value: formName,
            onChange: (val) => setFormName(val),
            placeholder:
              activeSection === 'departments'
                ? 'e.g., Engineering'
                : 'e.g., Software Developer',
            disabled: isSaving,
            required: true,
          });

          if (activeSection === 'designations') {
            baseFields.push({
              name: 'department',
              label: 'Department',
              type: 'custom',
              value: formDepartmentId,
              onChange: (val) => setFormDepartmentId(val ? val.toString() : ''),
              disabled: isSaving,
              required: false,
              customComponent: (
                <Dropdown
                  label="Department"
                  options={[
                    { value: '', label: 'Select Department' },
                    ...availableDepartments.map((dept) => ({
                      value: dept.id.toString(),
                      label: dept.name,
                    })),
                  ]}
                  value={formDepartmentId || null}
                  onChange={(val) => setFormDepartmentId(val ? val.toString() : '')}
                  placeholder="Select Department"
                  disabled={isSaving}
                />
              ),
            });
          }

          baseFields.push({
            name: 'description',
            label: 'Description',
            type: 'textarea',
            value: formDescription,
            onChange: (val) => setFormDescription(val),
            placeholder: 'Description',
            disabled: isSaving,
            required: false,
            rows: 3,
          });

          return baseFields;
        })()}
        onSubmit={handleSave}
        submitLabel={modalType === 'edit' ? 'Update' : 'Create'}
        isSubmitting={isSaving}
        isValid={!!formName.trim()}
      />

      {/* Delete Confirmation Popup */}
      <DeleteModal
        show={showDeletePopup}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        itemName={(itemToDelete as Designation)?.name || ''}
        itemType={activeSection === 'departments' ? 'Department' : 'Designation'}
        warningMessage={
          activeSection === 'departments'
            ? 'Note: This will also delete all designations under this department.'
            : undefined
        }
        isDeleting={isDeleting}
      />

      {/* Manage Users Modal */}
      <ManageDesignationUsersModal
        show={showManageUsersModal}
        onClose={() => {
          setShowManageUsersModal(false);
          setDesignationForUsers(null);
        }}
        designation={designationForUsers}
        onUsersUpdated={() => {
          fetchData(activeSection, page, searchTerm);
        }}
      />
    </div>
  );
}


