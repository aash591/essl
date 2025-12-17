import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  User, Fingerprint, RefreshCw, Check, X,
  AlertCircle, Download, Loader2, Briefcase, Server, Trash2, Edit2, Clock
} from 'lucide-react';
import { User as UserType, Device, ApiResponse } from '@/types';
import Dropdown, { DropdownOption } from '@/components/Dropdown';
import ConfirmationModal from '@/components/ConfirmationModal';
import { DatePicker } from '@/components/ui/DatePicker';
import { showResultDialog } from '@/components/ResultDialog';

interface UserModalProps {
  show: boolean;
  onClose: () => void;
  user: UserType | null;
  selectedDevice: Device | null;
  onUserUpdated?: () => void;
  showNotification?: (type: 'success' | 'error' | 'info', message: string) => void;
}

export default function UserModal({
  show,
  onClose,
  user,
  selectedDevice,
  onUserUpdated,
  showNotification
}: UserModalProps) {
  const [fpDevices, setFpDevices] = useState<Device[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [isLoadingFpDevice, setIsLoadingFpDevice] = useState(false);
  const [syncingDeviceId, setSyncingDeviceId] = useState<number | null>(null);
  const [syncingAction, setSyncingAction] = useState<'add' | 'remove' | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<{ deviceId: number; fingerIdx: number } | null>(null);
  const [addingTemplate, setAddingTemplate] = useState<{ deviceId: number; fingerIdx: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [designations, setDesignations] = useState<DropdownOption[]>([]);
  const [selectedDesignationId, setSelectedDesignationId] = useState<number | null>(null);
  const [originalDesignationId, setOriginalDesignationId] = useState<number | null>(null);
  const [isLoadingDesignations, setIsLoadingDesignations] = useState(false);
  const [isSavingDesignation, setIsSavingDesignation] = useState(false);
  const [joinDate, setJoinDate] = useState<Date | undefined>(undefined);
  const [relievingDate, setRelievingDate] = useState<Date | undefined>(undefined);
  const [originalJoinDate, setOriginalJoinDate] = useState<Date | undefined>(undefined);
  const [originalRelievingDate, setOriginalRelievingDate] = useState<Date | undefined>(undefined);
  const [isSavingDates, setIsSavingDates] = useState(false);
  const saveDatesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Shift state
  const [shifts, setShifts] = useState<DropdownOption[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [originalShiftId, setOriginalShiftId] = useState<number | null>(null);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [freshUser, setFreshUser] = useState<UserType | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [fingerprintData, setFingerprintData] = useState<Record<number, {
    templates: Array<{
      uid: number;
      fingerIdx: number;
      valid: number;
      template: string;
      size: number;
      onDevice?: boolean; // true if on device, false if only in DB
    }>;
    isLoading: boolean;
    error: string | null;
  }>>({});
  const [aggregatedTemplates, setAggregatedTemplates] = useState<Array<{
    fingerIdx: number;
    template: string;
    size: number;
    valid: number;
    deviceIds: number[];
    onDeviceByDevice: Record<number, boolean>;
  }>>([]);
  const [isLoadingAggregated, setIsLoadingAggregated] = useState(false);
  // Global operation lock - prevents concurrent read/write operations
  const [isOperationInProgress, setIsOperationInProgress] = useState(false);
  const operationLockRef = useRef<boolean>(false);

  // Confirmation modal states
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<{ device: Device; fingerIdx: number } | null>(null);
  const [confirmAddUser, setConfirmAddUser] = useState<Device | null>(null);
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<Device | null>(null);
  const [confirmAddTemplate, setConfirmAddTemplate] = useState<{ device: Device; fingerIdx: number } | null>(null);
  
  // Name/Role change confirmation modal state
  const [showNameRoleConfirmModal, setShowNameRoleConfirmModal] = useState(false);
  const [selectedDevicesForWrite, setSelectedDevicesForWrite] = useState<number[]>([]);
  const [isWritingToDevices, setIsWritingToDevices] = useState(false);
  const [deviceWriteStatus, setDeviceWriteStatus] = useState<Record<number, { status: 'pending' | 'writing' | 'success' | 'failed' | 'timeout' }>>({});
  
  // Edit name modal state
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [editedName, setEditedName] = useState<string | null>(null); // Track edited name (not saved to DB yet)
  const [isSavingName, setIsSavingName] = useState(false);
  const [editedRole, setEditedRole] = useState<string | null>(null); // Track edited role (not saved to DB yet)
  const [originalRole, setOriginalRole] = useState<string>('0'); // Track original role (full string, e.g. "14,3,4")
  const [isSavingRole, setIsSavingRole] = useState(false);
  const normalizeRole = (roleValue: string | number | null | undefined) =>
    String(roleValue ?? '0').startsWith('14') ? '14' : '0';

  // Fetch fresh user data when modal opens
  useEffect(() => {
    if (show && user?.userId) {
      setIsLoadingUser(true);
      fetchFreshUserData(user.userId);
    } else if (!show) {
      // Reset when modal closes
      setFreshUser(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, user?.userId]);

  // Fetch fresh user data from API
  const fetchFreshUserData = async (userId: string) => {
    try {
      const response = await fetch(`/api/db/users?search=${encodeURIComponent(userId)}&limit=1`);
      const data: ApiResponse<{ users: UserType[] }> = await response.json();

      if (data.success && data.data?.users && data.data.users.length > 0) {
        const fetchedUser = data.data.users.find(u => u.userId === userId);
        if (fetchedUser) {
          setFreshUser(fetchedUser);
          // Update dates when fresh user data is fetched
          const currentJoinDate = fetchedUser.joinDate
            ? (typeof fetchedUser.joinDate === 'string'
              ? new Date(fetchedUser.joinDate)
              : new Date(fetchedUser.joinDate))
            : undefined;
          const currentRelievingDate = fetchedUser.relievingDate
            ? (typeof fetchedUser.relievingDate === 'string'
              ? new Date(fetchedUser.relievingDate)
              : new Date(fetchedUser.relievingDate))
            : undefined;
          setJoinDate(currentJoinDate);
          setRelievingDate(currentRelievingDate);
          setOriginalJoinDate(currentJoinDate);
          setOriginalRelievingDate(currentRelievingDate);
        } else {
          // Fallback to passed user if not found
          setFreshUser(user || null);
        }
      } else {
        // Fallback to passed user if API fails
        setFreshUser(user || null);
      }
    } catch (error) {
      console.error('Error fetching fresh user data:', error);
      // Fallback to passed user on error
      setFreshUser(user || null);
    } finally {
      setIsLoadingUser(false);
    }
  };

  // Use freshUser if available, otherwise fallback to user prop
  const displayUser = freshUser || user;

  // Fetch devices from stored_devices and designations when modal opens
  useEffect(() => {
    if (show && displayUser) {
      setFpDevices([]);
      setAllDevices([]);
      setFingerprintData({});
      // Reset operation lock when modal opens
      operationLockRef.current = false;
      setIsOperationInProgress(false);
      fetchAllDevices();
      fetchDesignations();
      fetchShifts();
      // Set current designation if user has one
      const currentDesignationId = (displayUser as any).designationId || null;
      setSelectedDesignationId(currentDesignationId);
      setOriginalDesignationId(currentDesignationId);
      // Set current shift if user has one
      const currentShiftId = (displayUser as any).shiftId || null;
      setSelectedShiftId(currentShiftId);
      setOriginalShiftId(currentShiftId);
      // Set join date and relieving date
      const currentJoinDate = displayUser.joinDate
        ? (typeof displayUser.joinDate === 'string'
          ? new Date(displayUser.joinDate)
          : new Date(displayUser.joinDate))
        : undefined;
      const currentRelievingDate = displayUser.relievingDate
        ? (typeof displayUser.relievingDate === 'string'
          ? new Date(displayUser.relievingDate)
          : new Date(displayUser.relievingDate))
        : undefined;
      setJoinDate(currentJoinDate);
      setRelievingDate(currentRelievingDate);
      setOriginalJoinDate(currentJoinDate);
      setOriginalRelievingDate(currentRelievingDate);
      // Set current role from DB (full string)
      const currentRole = String(displayUser.role || '0');
      setOriginalRole(currentRole);
      setEditedRole(null);
      // Reset edited name when modal opens
      setEditedName(null);
    } else if (!show) {
      // Reset operation lock when modal closes
      operationLockRef.current = false;
      setIsOperationInProgress(false);
      // Clear any pending date save timeout
      if (saveDatesTimeoutRef.current) {
        clearTimeout(saveDatesTimeoutRef.current);
        saveDatesTimeoutRef.current = null;
      }
      // Reset edited name and role when modal closes
      setEditedName(null);
      setEditedRole(null);
    }
  }, [show, displayUser]);


  // Fetch fingerprint data from a device
  const fetchFingerprintData = useCallback(async (device: Device, forceRefresh: boolean = false) => {
    if (!displayUser?.userId) return;

    // Check if operation is already in progress (only for force refresh)
    if (forceRefresh && (operationLockRef.current || isOperationInProgress)) {
      if (showNotification) {
        showNotification('info', 'Please wait for the current operation to complete');
      }
      return;
    }

    // Check if we already have data and not forcing refresh
    if (!forceRefresh && fingerprintData[device.id] && !fingerprintData[device.id].error) {
      return;
    }

    // Acquire operation lock for force refresh
    if (forceRefresh) {
      operationLockRef.current = true;
      setIsOperationInProgress(true);
    }

    // Set loading state for this device
    setFingerprintData(prev => ({
      ...prev,
      [device.id]: {
        templates: prev[device.id]?.templates || [],
        isLoading: true,
        error: null,
      }
    }));

    try {
      const forceParam = forceRefresh ? '&force=true' : '';
      const response = await fetch(
        `/api/fingerprint/read?userId=${encodeURIComponent(displayUser.userId)}&deviceIp=${encodeURIComponent(device.ip)}&devicePort=${device.port}${forceParam}`
      );
      const data: ApiResponse<{
        userId: string;
        templates: Array<{
          uid: number;
          fingerIdx: number;
          valid: number;
          template: string;
          size: number;
          onDevice?: boolean; // true if on device, false if only in DB
        }>;
        skipped?: boolean;
      }> = await response.json();

      if (data.success && data.data) {
        const wasSkipped = data.data.skipped === true;
        const templates = data.data.templates || [];
        const templateCount = templates.length;

        // Count templates on device vs only in DB
        const onDeviceCount = templates.filter(t => t.onDevice !== false).length;
        const dbOnlyCount = templates.filter(t => t.onDevice === false).length;

        setFingerprintData(prev => ({
          ...prev,
          [device.id]: {
            templates: templates,
            isLoading: false,
            error: null,
          }
        }));

        // Show notification if fresh data was fetched (not skipped)
        if (forceRefresh && !wasSkipped && showNotification) {
          if (templateCount > 0) {
            let message = '';
            if (onDeviceCount > 0 && dbOnlyCount > 0) {
              message = `Found ${onDeviceCount} fingerprint${onDeviceCount !== 1 ? 's' : ''} from device ${device.name}. Database has ${templateCount} available (${onDeviceCount} on device, ${dbOnlyCount} in DB only).`;
            } else if (onDeviceCount > 0) {
              message = `Found ${onDeviceCount} fingerprint${onDeviceCount !== 1 ? 's' : ''} from device ${device.name} and saved to database.`;
            } else if (dbOnlyCount > 0) {
              message = `No fingerprints found on device ${device.name}. Database has ${dbOnlyCount} template${dbOnlyCount !== 1 ? 's' : ''} available (not on device) - can be added back.`;
            }
            showNotification('success', message);
          } else {
            showNotification('info', `No fingerprints found on device ${device.name}. Any existing templates in database are preserved.`);
          }
        } else if (forceRefresh && wasSkipped && showNotification) {
          // This shouldn't happen with force=true, but handle it gracefully
          let message = `Fingerprint data loaded from database: ${templateCount} fingerprint${templateCount !== 1 ? 's' : ''} available`;
          if (dbOnlyCount > 0) {
            message += ` (${dbOnlyCount} in DB but not on device)`;
          }
          showNotification('info', message);
        }
      } else {
        setFingerprintData(prev => ({
          ...prev,
          [device.id]: {
            templates: prev[device.id]?.templates || [],
            isLoading: false,
            error: data.error || 'Failed to fetch fingerprint data',
          }
        }));

        // Show error notification
        if (forceRefresh && showNotification) {
          showNotification('error', data.error || 'Failed to fetch fingerprint data from device');
        }
      }
    } catch (error: any) {
      console.error(`Error fetching fingerprint data from device ${device.id}:`, error);
      setFingerprintData(prev => ({
        ...prev,
        [device.id]: {
          templates: prev[device.id]?.templates || [],
          isLoading: false,
          error: error.message || 'Failed to fetch fingerprint data',
        }
      }));

      // Show error notification
      if (forceRefresh && showNotification) {
        showNotification('error', error.message || 'Failed to fetch fingerprint data from device');
      }
    } finally {
      // Release operation lock for force refresh
      if (forceRefresh) {
        operationLockRef.current = false;
        setIsOperationInProgress(false);
      }
    }
  }, [displayUser?.userId, fingerprintData, showNotification, isOperationInProgress]);

  // Fetch aggregated templates across all devices
  const fetchAggregatedTemplates = useCallback(async () => {
    if (!displayUser?.userId) return;

    setIsLoadingAggregated(true);
    try {
      const response = await fetch(`/api/db/fingerprint?userId=${encodeURIComponent(displayUser.userId)}&aggregated=true`);
      const data: ApiResponse<Array<{
        fingerIdx: number;
        template: string;
        size: number;
        valid: number;
        deviceIds: number[];
        onDeviceByDevice: Record<number, boolean>;
      }>> = await response.json();

      if (data.success && data.data) {
        setAggregatedTemplates(data.data);
      } else {
        setAggregatedTemplates([]);
      }
    } catch (error: any) {
      console.error('Error fetching aggregated templates:', error);
      setAggregatedTemplates([]);
    } finally {
      setIsLoadingAggregated(false);
    }
  }, [displayUser?.userId]);

  // Load aggregated templates from database when modal opens to show fingerprint buttons (F5, F6, etc.)
  // This loads from DB only, NOT from devices - device fetching only happens on refresh button click
  useEffect(() => {
    if (show && displayUser?.userId) {
      fetchAggregatedTemplates();
    }
  }, [show, displayUser?.userId, fetchAggregatedTemplates]);

  // Reset aggregated templates when modal closes
  useEffect(() => {
    if (!show) {
      setAggregatedTemplates([]);
    }
  }, [show]);

  // Note: Fingerprint data from DEVICES is only fetched when user clicks the refresh button
  // Aggregated templates are loaded from DATABASE when modal opens to show buttons (F5, F6, etc.)
  // This allows buttons to be displayed without fetching from devices automatically

  const fetchAllDevices = async () => {
    setIsLoadingFpDevice(true);
    try {
      // Get all devices
      const devicesResponse = await fetch('/api/devices');
      const devicesData: ApiResponse<Device[]> = await devicesResponse.json();

      if (!devicesData.success || !devicesData.data) {
        setAllDevices([]);
        setFpDevices([]);
        return;
      }

      const devices = devicesData.data;
      setAllDevices(devices);

      // Parse stored device IDs from user (comma-separated)
      if (!displayUser?.storedDevices) {
        setFpDevices([]);
        return;
      }

      const storedDeviceIds = displayUser.storedDevices
        .split(',')
        .map(id => id.trim())
        .filter(id => id !== '');

      if (storedDeviceIds.length === 0) {
        setFpDevices([]);
        return;
      }

      // Find all devices from stored_devices
      const storedDevices = devices.filter(d =>
        storedDeviceIds.includes(d.id.toString())
      );

      setFpDevices(storedDevices);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setAllDevices([]);
      setFpDevices([]);
    } finally {
      setIsLoadingFpDevice(false);
    }
  };

  const fetchDesignations = async () => {
    setIsLoadingDesignations(true);
    try {
      const response = await fetch('/api/db/designations?type=designations&limit=1000');
      const data: ApiResponse<{ designations: any[] }> = await response.json();

      if (data.success && data.data) {
        const options: DropdownOption[] = [
          { value: 0, label: 'No Designation' },
          ...data.data.designations.map((d) => ({
            value: d.id,
            label: (d.name || d.designation) + (d.departmentName ? ` (${d.departmentName})` : ''),
          }))
        ];
        setDesignations(options);
      }
    } catch (error) {
      console.error('Error fetching designations:', error);
    } finally {
      setIsLoadingDesignations(false);
    }
  };

  const fetchShifts = async () => {
    setIsLoadingShifts(true);
    try {
      const response = await fetch('/api/db/shifts?page=1&limit=1000');
      const data: ApiResponse<{ shifts: any[] }> = await response.json();

      if (data.success && data.data) {
        const options: DropdownOption[] = [
          { value: 0, label: 'No Shift' },
          ...data.data.shifts.map((s) => ({
            value: s.id,
            label: `${s.name} (${(s.startTime || '').slice(0, 5)} - ${(s.endTime || '').slice(0, 5)})`,
          })),
        ];
        setShifts(options);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    } finally {
      setIsLoadingShifts(false);
    }
  };

  const handleAddUserToDevice = (device: Device) => {
    if (!displayUser) return;

    // Check if operation is already in progress
    if (operationLockRef.current || isOperationInProgress) {
      if (showNotification) {
        showNotification('info', 'Please wait for the current operation to complete');
      }
      return;
    }

    // Show confirmation modal
    setConfirmAddUser(device);
  };

  const handleConfirmAddUser = async () => {
    const device = confirmAddUser;
    if (!device || !displayUser) return;

    // Acquire operation lock
    operationLockRef.current = true;
    setIsOperationInProgress(true);
    setConfirmAddUser(null);

    // Save scroll position before update
    const scrollPosition = scrollContainerRef.current?.scrollTop ?? 0;

    setSyncingDeviceId(device.id);
    setSyncingAction('add');
    try {
      const response = await fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: displayUser.userId,
          deviceIp: device.ip,
          devicePort: device.port,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Sequential updates to avoid race conditions
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }

        await fetchAllDevices();
        // Force refresh fingerprint data to get the latest state
        await fetchFingerprintData(device, true);
        // Also refresh aggregated templates
        await fetchAggregatedTemplates();

        // Restore scroll position after update
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollPosition;
          }
        });

        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }

        // Show success notification with fingerprint info if available
        let fpMessage = `User added to device ${device.name}`;
        if (data.data?.fingerprintsWritten !== undefined) {
          fpMessage += `. ${data.data.fingerprintsWritten} fingerprint${data.data.fingerprintsWritten !== 1 ? 's' : ''} written to device`;
          if (data.data.fingerprintsFailed > 0) {
            fpMessage += `, ${data.data.fingerprintsFailed} failed`;
          }
          // Check if there are templates in DB that weren't written (e.g., only in DB, not on device)
          const dbTemplates = fingerprintData[device.id]?.templates || [];
          const dbOnlyTemplates = dbTemplates.filter(t => t.onDevice === false);
          if (dbOnlyTemplates.length > 0) {
            fpMessage += `. ${dbOnlyTemplates.length} template${dbOnlyTemplates.length !== 1 ? 's' : ''} in DB preserved (not on device)`;
          }
        } else {
          fpMessage += ' successfully';
        }

        if (showNotification) {
          showNotification('success', fpMessage);
        }
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to add user to device');
        }
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to add user to device');
      }
    } finally {
      setSyncingDeviceId(null);
      setSyncingAction(null);
    }
  };

  const handleDeleteTemplate = (device: Device, fingerIdx: number) => {
    if (!displayUser?.userId) return;

    // Check if operation is already in progress
    if (operationLockRef.current || isOperationInProgress) {
      if (showNotification) {
        showNotification('info', 'Please wait for the current operation to complete');
      }
      return;
    }

    // Show confirmation modal
    setConfirmDeleteTemplate({ device, fingerIdx });
  };

  const handleConfirmDeleteTemplate = async () => {
    const confirmation = confirmDeleteTemplate;
    if (!confirmation || !displayUser?.userId) return;

    const { device, fingerIdx } = confirmation;

    // Acquire operation lock
    operationLockRef.current = true;
    setIsOperationInProgress(true);
    setConfirmDeleteTemplate(null);

    setDeletingTemplate({ deviceId: device.id, fingerIdx });

    try {
      const response = await fetch('/api/fingerprint/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: displayUser.userId,
          deviceIp: device.ip,
          devicePort: device.port,
          fingerIndex: fingerIdx,
        }),
      });

      const data: ApiResponse<any> = await response.json();

      if (data.success) {
        // Refresh fingerprint data to reflect the deletion
        await fetchFingerprintData(device, true);
        // Also refresh aggregated templates
        await fetchAggregatedTemplates();

        if (showNotification) {
          showNotification('success', `finger ${fingerIdx} deleted from device ${device.name}.`);
        }
      } else {
        if (showNotification) {
          showNotification('error', data.error || 'Failed to delete fingerprint template from device');
        }
      }
    } catch (error: any) {
      console.error('Error deleting template:', error);
      if (showNotification) {
        showNotification('error', error.message || 'Failed to delete fingerprint template from device');
      }
    } finally {
      setDeletingTemplate(null);
      // Release operation lock
      operationLockRef.current = false;
      setIsOperationInProgress(false);
    }
  };

  const handleAddTemplate = (device: Device, fingerIdx: number) => {
    if (!displayUser?.userId) return;

    // Check if user is registered on this device
    const isInStoredDevices = fpDevices.some(d => d.id === device.id);
    if (!isInStoredDevices) {
      if (showNotification) {
        showNotification('error', `User must be registered on device "${device.name}" before adding fingerprint templates. Please add the user to the device first.`);
      }
      return;
    }

    // Check if operation is already in progress
    if (operationLockRef.current || isOperationInProgress) {
      if (showNotification) {
        showNotification('info', 'Please wait for the current operation to complete');
      }
      return;
    }

    // Show confirmation modal
    setConfirmAddTemplate({ device, fingerIdx });
  };

  const handleConfirmAddTemplate = async () => {
    const confirmation = confirmAddTemplate;
    if (!confirmation || !displayUser?.userId) return;

    const { device, fingerIdx } = confirmation;

    // Double-check if user is registered on this device (safety check)
    const isInStoredDevices = fpDevices.some(d => d.id === device.id);
    if (!isInStoredDevices) {
      if (showNotification) {
        showNotification('error', `User must be registered on device "${device.name}" before adding fingerprint templates. Please add the user to the device first.`);
      }
      setConfirmAddTemplate(null);
      return;
    }

    // Acquire operation lock
    operationLockRef.current = true;
    setIsOperationInProgress(true);
    setConfirmAddTemplate(null);

    setAddingTemplate({ deviceId: device.id, fingerIdx });

    try {
      const response = await fetch('/api/fingerprint/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: displayUser.userId,
          deviceIp: device.ip,
          devicePort: device.port,
          fingerIndex: fingerIdx,
        }),
      });

      const data: ApiResponse<any> = await response.json();

      if (data.success) {
        // Refresh fingerprint data to reflect the addition
        await fetchFingerprintData(device, true);
        // Also refresh aggregated templates
        await fetchAggregatedTemplates();

        if (showNotification) {
          showNotification('success', `Fingerprint template for finger ${fingerIdx} added to device ${device.name} successfully.`);
        }
      } else {
        if (showNotification) {
          showNotification('error', data.error || 'Failed to add fingerprint template to device');
        }
      }
    } catch (error: any) {
      console.error('Error adding template:', error);
      if (showNotification) {
        showNotification('error', error.message || 'Failed to add fingerprint template to device');
      }
    } finally {
      setAddingTemplate(null);
      // Release operation lock
      operationLockRef.current = false;
      setIsOperationInProgress(false);
    }
  };

  const handleRemoveUserFromDevice = (device: Device) => {
    if (!displayUser) return;

    // Check if operation is already in progress
    if (operationLockRef.current || isOperationInProgress) {
      if (showNotification) {
        showNotification('info', 'Please wait for the current operation to complete');
      }
      return;
    }

    // Show confirmation modal
    setConfirmRemoveUser(device);
  };

  const handleConfirmRemoveUser = async () => {
    const device = confirmRemoveUser;
    if (!device || !displayUser) return;

    // Acquire operation lock
    operationLockRef.current = true;
    setIsOperationInProgress(true);
    setConfirmRemoveUser(null);

    // Save scroll position before update
    const scrollPosition = scrollContainerRef.current?.scrollTop ?? 0;

    setSyncingDeviceId(device.id);
    setSyncingAction('remove');
    try {
      const response = await fetch('/api/device/register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: displayUser.userId,
          deviceIp: device.ip,
          devicePort: device.port,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // IMPORTANT: Do NOT remove fingerprint data from state. 
        // Logic: Database preserves it, so UI should reflect that availability.

        // Update user data and devices
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }

        await fetchAllDevices();

        // Restore scroll position after update
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollPosition;
          }
        });

        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        // Show success notification
        if (showNotification) {
          showNotification('success', `User removed from device ${device.name}. Fingerprint data preserved in database.`);
        }
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to remove user from device');
        }
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to remove user from device');
      }
    } finally {
      setSyncingDeviceId(null);
      setSyncingAction(null);
      // Release operation lock
      operationLockRef.current = false;
      setIsOperationInProgress(false);
    }
  };

  const handleSaveDesignation = async (designationId: number | null) => {
    if (!displayUser) return false;

    setIsSavingDesignation(true);
    try {
      const response = await fetch('/api/db/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayUser.id,
          designationId: designationId,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Update original designationId to track the new state
        setOriginalDesignationId(designationId);
        // Fetch fresh user data to reflect the update
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }
        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        return true;
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to update designation');
        }
        return false;
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to update designation');
      }
      return false;
    } finally {
      setIsSavingDesignation(false);
    }
  };

  const handleSaveShift = async (shiftId: number | null) => {
    if (!displayUser) return false;

    setIsSavingShift(true);
    try {
      const response = await fetch('/api/db/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayUser.id,
          shiftId: shiftId,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Update original shiftId to track the new state
        setOriginalShiftId(shiftId);
        // Fetch fresh user data to reflect the update
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }
        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        return true;
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to update shift');
        }
        return false;
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to update shift');
      }
      return false;
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleSaveDates = async () => {
    if (!displayUser) return false;

    // Check if dates have changed
    const joinDateChanged = joinDate?.getTime() !== originalJoinDate?.getTime();
    const relievingDateChanged = relievingDate?.getTime() !== originalRelievingDate?.getTime();

    if (!joinDateChanged && !relievingDateChanged) {
      return false; // No changes
    }

    setIsSavingDates(true);
    try {
      const response = await fetch('/api/db/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayUser.id,
          joinDate: joinDate ? joinDate.toISOString() : null,
          relievingDate: relievingDate ? relievingDate.toISOString() : null,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Update original dates to track the new state
        setOriginalJoinDate(joinDate);
        setOriginalRelievingDate(relievingDate);
        // Fetch fresh user data to reflect the update
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }
        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        return true;
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to update dates');
        }
        return false;
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to update dates');
      }
      return false;
    } finally {
      setIsSavingDates(false);
    }
  };

  const handleSaveName = () => {
    if (!displayUser) return;

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      if (showNotification) {
        showNotification('error', 'Name cannot be empty');
      }
      return;
    }

    if (trimmedName === originalName) {
      setShowEditNameModal(false);
      setEditedName(null); // Reset if no change
      return; // No changes
    }

    // Just update local state, don't save to DB yet
    setEditedName(trimmedName);
    setShowEditNameModal(false);
  };

  const handleSaveNameToDB = async () => {
    if (!displayUser || !editedName) return false;

    setIsSavingName(true);
    try {
      const response = await fetch('/api/db/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayUser.id,
          name: editedName,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Fetch fresh user data to reflect the update
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }
        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        // Reset edited name state
        setEditedName(null);
        return true;
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to update name');
        }
        return false;
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to update name');
      }
      return false;
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveRoleToDB = async () => {
    if (!displayUser || editedRole === null) return false;

    setIsSavingRole(true);
    try {
      const response = await fetch('/api/db/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayUser.id,
          role: editedRole,
        }),
      });

      const data: ApiResponse<any> = await response.json();
      if (data.success) {
        // Fetch fresh user data to reflect the update
        if (displayUser?.userId) {
          await fetchFreshUserData(displayUser.userId);
        }
        // Update user data locally
        if (onUserUpdated) {
          onUserUpdated();
        }
        // Reset edited role state
        setOriginalRole(editedRole);
        setEditedRole(null);
        return true;
      } else {
        // Show error notification
        if (showNotification) {
          showNotification('error', data.error || 'Failed to update role');
        }
        return false;
      }
    } catch (error) {
      // Show error notification
      if (showNotification) {
        showNotification('error', 'Failed to update role');
      }
      return false;
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleSaveAllChanges = async () => {
    let hasChanges = false;
    
    // Save name if it has changed
    const nameChanged = editedName !== null && editedName !== (displayUser?.name || '');
    if (nameChanged) {
      const saved = await handleSaveNameToDB();
      if (saved) hasChanges = true;
    }
    
    // Save role if it has changed
    const roleChanged = editedRole !== null && normalizeRole(editedRole) !== normalizeRole(originalRole);
    if (roleChanged) {
      // IMPORTANT: Do NOT write role to DB directly.
      // Role changes must go through "Write to Devices" so that the device is updated first.
      if (showNotification) {
        showNotification('info', 'Role changes are only saved after successfully writing to at least one device. Please use "Write to Devices".');
      }
    }
    
    // Save designation if it has changed
    const designationChanged = selectedDesignationId !== originalDesignationId;
    if (designationChanged) {
      const saved = await handleSaveDesignation(selectedDesignationId);
      if (saved) hasChanges = true;
    }
    // Save shift if it has changed
    const shiftChanged = selectedShiftId !== originalShiftId;
    if (shiftChanged) {
      const saved = await handleSaveShift(selectedShiftId);
      if (saved) hasChanges = true;
    }
    
    // Save dates if they have changed
    const joinDateChanged = joinDate?.getTime() !== originalJoinDate?.getTime();
    const relievingDateChanged = relievingDate?.getTime() !== originalRelievingDate?.getTime();
    if (joinDateChanged || relievingDateChanged) {
      const saved = await handleSaveDates();
      if (saved) hasChanges = true;
    }
    
    // Refresh users table if anything changed
    if (hasChanges) {
      onUserUpdated?.();
      showResultDialog({
        title: 'Changes saved',
        message: 'Changes were saved to the database.',
        type: 'success',
        onClose: onClose,
      });
    } else {
      onClose();
    }
  };

  const handleWriteToDevices = async () => {
    if (!displayUser || selectedDevicesForWrite.length === 0) {
      setShowNameRoleConfirmModal(false);
      return;
    }
    
    setIsWritingToDevices(true);
    const nameChanged = editedName !== null && editedName !== (displayUser?.name || '');
    const roleChanged = editedRole !== null && normalizeRole(editedRole) !== normalizeRole(originalRole);
    const desiredRole = roleChanged ? normalizeRole(editedRole) : normalizeRole(originalRole);
    
    // First, save name to DB (role will be saved per-device AFTER successful device writes)
    let nameSaved = false;
    
    if (nameChanged) {
      nameSaved = await handleSaveNameToDB();
    }
    
    // Track role string as stored in DB for incremental per-device updates.
    // Start from the current DB value (may contain device IDs like "14,3,4").
    let currentRoleForDb = String(displayUser.role || '0');
    
    // Initialize device status (local map to avoid async state lag)
    const localStatus: Record<number, { status: 'pending' | 'writing' | 'success' | 'failed' | 'timeout' }> = {};
    selectedDevicesForWrite.forEach(deviceId => {
      localStatus[deviceId] = { status: 'pending' };
    });
    setDeviceWriteStatus(localStatus);
    
    // Write to each device with timeout
    for (const deviceId of selectedDevicesForWrite) {
      const device = allDevices.find(d => d.id === deviceId);
      if (!device) continue;
      
      // Update status to writing
      localStatus[deviceId] = { status: 'writing' };
      setDeviceWriteStatus({ ...localStatus });
      
      try {
        // Create promise with timeout
        // IMPORTANT: Use the same logic as manual \"Add user to device\" flow.
        // That flow calls /api/device/register, which:
        //  - Reads users from device
        //  - Resolves device-specific UID by userId
        //  - Deletes/recreates the user with that UID (matching sync-user-fp-linux.ts)
        const writePromise = fetch('/api/device/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: displayUser.userId,
            deviceIp: device.ip,
            devicePort: device.port,
            // Send desired role explicitly so device gets the new role even
            // before DB role string is updated.
            role: roleChanged ? desiredRole : undefined,
          }),
        });
        
        const timeoutPromise = new Promise<Response>((_, reject) => 
          // Increase timeout to 2 minutes for slow devices
          setTimeout(() => reject(new Error('Timeout')), 120000)
        );
        
        const response = await Promise.race([writePromise, timeoutPromise]);
        
        if (response.ok) {
          const data: ApiResponse<any> = await response.json();
          if (data.success) {
            localStatus[deviceId] = { status: 'success' };
            setDeviceWriteStatus({ ...localStatus });

            // After a successful device write, update role in DB for THIS device only.
            if (roleChanged) {
              let newRoleForDb = currentRoleForDb;

              if (desiredRole === '14') {
                // Grant admin on this device.
                if (!currentRoleForDb.startsWith('14')) {
                  newRoleForDb = `14,${deviceId}`;
                } else {
                  const roleParts = currentRoleForDb.split(',');
                  const deviceIds = roleParts.slice(1); // Skip "14"
                  if (!deviceIds.includes(String(deviceId))) {
                    newRoleForDb = `14,${deviceIds.concat(String(deviceId)).join(',')}`;
                  }
                }
              } else {
                // desiredRole === '0' → remove admin on this device.
                if (currentRoleForDb.startsWith('14')) {
                  const roleParts = currentRoleForDb.split(',');
                  const deviceIds = roleParts.slice(1); // Skip "14"
                  const filteredDeviceIds = deviceIds.filter(id => id !== String(deviceId));

                  if (filteredDeviceIds.length === 0) {
                    newRoleForDb = '0';
                  } else {
                    newRoleForDb = `14,${filteredDeviceIds.join(',')}`;
                  }
                } else {
                  newRoleForDb = '0';
                }
              }

              // Persist role change for this device if it actually changed.
              if (newRoleForDb !== currentRoleForDb) {
                try {
                  const roleResponse = await fetch('/api/db/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: displayUser.id,
                      role: newRoleForDb,
                    }),
                  });

                  const roleData: ApiResponse<any> = await roleResponse.json();
                  if (roleResponse.ok && roleData.success) {
                    currentRoleForDb = newRoleForDb;
                  } else if (showNotification) {
                    showNotification('error', roleData.error || 'Failed to update role in database for this device');
                  }
                } catch (err: any) {
                  console.error('Error updating role in DB for device', deviceId, err);
                  if (showNotification) {
                    showNotification('error', err.message || 'Failed to update role in database for this device');
                  }
                }
              }
            }
          } else {
            localStatus[deviceId] = { status: 'failed' };
            setDeviceWriteStatus({ ...localStatus });
          }
        } else {
          localStatus[deviceId] = { status: 'failed' };
          setDeviceWriteStatus({ ...localStatus });
        }
      } catch (error) {
        localStatus[deviceId] = { status: 'timeout' };
        setDeviceWriteStatus({ ...localStatus });
      }
    }
    
    setIsWritingToDevices(false);

    // Build device status summary
    // Build device status summary from localStatus (reflects latest writes)
    const successDevices = selectedDevicesForWrite
      .filter(id => localStatus[id]?.status === 'success')
      .map(id => allDevices.find(d => d.id === id)?.name || `Device ${id}`);
    const failedDevices = selectedDevicesForWrite
      .filter(id => localStatus[id]?.status === 'failed')
      .map(id => allDevices.find(d => d.id === id)?.name || `Device ${id}`);
    const timeoutDevices = selectedDevicesForWrite
      .filter(id => localStatus[id]?.status === 'timeout')
      .map(id => allDevices.find(d => d.id === id)?.name || `Device ${id}`);

    const changeLines: string[] = [];
    if (nameChanged) {
      changeLines.push(`Name: ${displayUser.name} → ${editedName ?? displayUser.name}`);
    }
    if (roleChanged) {
      const fromRole = normalizeRole(originalRole).startsWith('14') ? 'Admin' : 'User';
      const toRole = normalizeRole(editedRole).startsWith('14') ? 'Admin' : 'User';
      changeLines.push(`Role: ${fromRole} → ${toRole}`);
    }

    const deviceLines: string[] = [];
    if (successDevices.length) {
      deviceLines.push(`Success: ${successDevices.join(', ')}`);
    }
    if (failedDevices.length) {
      deviceLines.push(`Failed: ${failedDevices.join(', ')}`);
    }
    if (timeoutDevices.length) {
      deviceLines.push(`Timeout: ${timeoutDevices.join(', ')}`);
    }
    if (!deviceLines.length) {
      deviceLines.push('No devices selected or no write attempts.');
    }

    const anyFailureOrTimeout = failedDevices.length > 0 || timeoutDevices.length > 0;

    // Save other changes (designation, dates)
    const designationChanged = selectedDesignationId !== originalDesignationId;
    if (designationChanged) {
      await handleSaveDesignation(selectedDesignationId);
    }
    
    const joinDateChanged = joinDate?.getTime() !== originalJoinDate?.getTime();
    const relievingDateChanged = relievingDate?.getTime() !== originalRelievingDate?.getTime();
    if (joinDateChanged || relievingDateChanged) {
      await handleSaveDates();
    }
    
    // Refresh users table on success
    onUserUpdated?.();
    showResultDialog({
      title: anyFailureOrTimeout && roleChanged ? 'Changes partially saved' : 'Changes saved',
      message: `User: ${displayUser.userId} - ${editedName ?? displayUser.name}\n${changeLines.join('\n') || 'No name/role changes.'}\n\nDevices:\n${deviceLines.join('\n')}`,
      type: anyFailureOrTimeout && roleChanged ? 'warning' : 'success',
      onClose: onClose,
    });
    
    setShowNameRoleConfirmModal(false);
    onClose();
  };


  if (!show || typeof window === 'undefined' || !displayUser) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
    >
      {/* Operation in progress overlay */}
      {isOperationInProgress && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Operation in progress, please wait...</span>
          </div>
        </div>
      )}
      <div
        className="glass-card rounded-xl w-full max-w-md animate-slide-in-up flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0 sticky top-0 bg-card/95 backdrop-blur-sm z-10 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">User Details</h3>
              <p className="text-sm text-muted-foreground">View and manage user information</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isOperationInProgress) {
                if (showNotification) {
                  showNotification('info', 'Please wait for the current operation to complete before closing');
                }
                return;
              }
              onClose();
            }}
            className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
            disabled={isSavingDesignation || isOperationInProgress}
            title={isOperationInProgress ? 'Please wait for the current operation to complete' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="space-y-4">
            {/* User Information */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  User ID
                </label>
                {isLoadingUser ? (
                  <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading user data...
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono text-primary">
                    {displayUser.userId}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Name
                </label>
                {isLoadingUser ? (
                  <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading user data...
                  </div>
                ) : (
                  <div className="relative">
                    <div className="px-4 py-3 pr-10 bg-secondary/50 border border-border rounded-lg text-sm">
                      {editedName !== null ? editedName : displayUser.name}
                    </div>
                    <button
                      onClick={() => {
                        // Use edited name if exists, otherwise use current name
                        const currentName = editedName !== null ? editedName : (displayUser.name || '');
                        setEditingName(currentName);
                        setOriginalName(displayUser.name || '');
                        setShowEditNameModal(true);
                      }}
                      disabled={isOperationInProgress}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-secondary rounded-lg transition-all disabled:opacity-50"
                      title="Edit name"
                    >
                      <Edit2 className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Role
                  </label>
                  {isLoadingUser ? (
                    <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <Dropdown
                      options={[
                        { value: '0', label: 'User' },
                        { value: '14', label: 'Admin' },
                      ]}
                      value={(() => {
                        const currentRole = editedRole !== null ? editedRole : String(displayUser.role || '0');
                        return currentRole.startsWith('14') ? '14' : '0';
                      })()}
                      onChange={(val) => {
                        const newRole = val === '14' ? '14' : '0';
                        setEditedRole(newRole);
                      }}
                      placeholder="Select Role"
                      disabled={isSavingRole || isOperationInProgress}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Card No
                  </label>
                  {isLoadingUser ? (
                    <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono">
                      {displayUser.cardNo || '-'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Designation */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-primary" />
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Designation
                </label>
              </div>
              {isLoadingDesignations ? (
                <div className="p-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground">
                  Loading designations...
                </div>
              ) : (
                <div className="space-y-3">
                  <Dropdown
                    options={designations}
                    value={selectedDesignationId || 0}
                    onChange={(val) => {
                      const newDesignationId = val && val !== 0 ? Number(val) : null;
                      setSelectedDesignationId(newDesignationId);
                    }}
                    placeholder="Select Designation"
                    disabled={isSavingDesignation || isOperationInProgress}
                    searchable
                  />
                </div>
              )}
            </div>

            {/* Shift */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Shift
                </label>
              </div>
              {isLoadingShifts ? (
                <div className="p-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground">
                  Loading shifts...
                </div>
              ) : (
                <div className="space-y-3">
                  <Dropdown
                    options={shifts}
                    value={selectedShiftId || 0}
                    onChange={(val) => {
                      const newShiftId = val && val !== 0 ? Number(val) : null;
                      setSelectedShiftId(newShiftId);
                    }}
                    placeholder="Select Shift"
                    disabled={isSavingShift || isOperationInProgress}
                    searchable
                  />
                </div>
              )}
            </div>

            {/* Join Date and Relieving Date */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-primary" />
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Employment Dates
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DatePicker
                  label="Join Date"
                  value={joinDate}
                  onChange={(date) => {
                    setJoinDate(date);
                    // If relieving date is before the new join date, clear it
                    if (relievingDate && date && relievingDate < date) {
                      setRelievingDate(undefined);
                    }
                  }}
                  placeholder="Select join date"
                  disabled={isSavingDates || isOperationInProgress}
                />
                <DatePicker
                  label="Relieving Date"
                  value={relievingDate}
                  onChange={(date) => {
                    setRelievingDate(date);
                  }}
                  min={joinDate ? `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}-${String(joinDate.getDate()).padStart(2, '0')}` : undefined}
                  placeholder="Select relieving date"
                  disabled={isSavingDates || isOperationInProgress}
                />
              </div>
              {isSavingDates && (
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving dates...
                </div>
              )}
            </div>

            {/* Registered Devices Section */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-primary" />
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Registered Devices
                </label>
              </div>

              {isLoadingFpDevice ? (
                <div className="p-3 bg-secondary/50 border border-border rounded-lg text-sm text-muted-foreground min-h-[200px]">
                  Loading device information...
                </div>
              ) : allDevices.length === 0 ? (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg min-h-[200px]">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      No devices registered. Please add devices first.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 min-h-[200px]">
                  <div className="space-y-2">
                    {allDevices
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((device) => {
                        const isInStoredDevices = fpDevices.some(d => d.id === device.id);
                        const isPrimary = fpDevices.length > 0 && fpDevices[0].id === device.id;

                        return (
                          <div key={device.id} className={`px-4 py-3 rounded-lg border ${isInStoredDevices
                            ? 'bg-primary/10 border-primary/20'
                            : 'bg-secondary/50 border-border'
                            }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className={`font-medium text-sm ${isInStoredDevices ? 'text-primary' : 'text-foreground'}`}>
                                  {device.name}
                                </div>
                                <div className="text-muted-foreground font-mono text-xs mt-1">{device.ip}:{device.port}</div>
                                {device.serialNumber && (
                                  <div className="text-muted-foreground text-xs mt-1">SN: {device.serialNumber}</div>
                                )}
                                <div className="mt-2 min-h-[60px]">
                                  {isLoadingAggregated ? (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground min-h-[60px]">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>Loading aggregated fingerprints...</span>
                                    </div>
                                  ) : aggregatedTemplates.length > 0 ? (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <Fingerprint className="w-3 h-3 text-primary" />
                                        <span className="text-primary font-medium">
                                          Available Fingers (across all devices):
                                        </span>
                                      </div>
                                      <div className="flex flex-nowrap gap-1.5 min-h-[40px] overflow-x-auto">
                                        {aggregatedTemplates.map((aggTemplate) => {
                                          // Check if this template exists on the current device
                                          const existsOnThisDevice = aggTemplate.deviceIds.includes(device.id);
                                          const isOnDevice = existsOnThisDevice
                                            ? (aggTemplate.onDeviceByDevice[device.id] !== false)
                                            : false;

                                          // Count how many devices have this template
                                          const deviceCount = aggTemplate.deviceIds.length;
                                          const onDeviceCount = Object.values(aggTemplate.onDeviceByDevice).filter(v => v).length;

                                          // Determine badge style based on status
                                          let badgeStyle = 'bg-primary/20 text-primary border border-primary/30';
                                          let statusText = `Finger ${aggTemplate.fingerIdx}`;

                                          if (!existsOnThisDevice) {
                                            // Template exists on other devices but not on this device
                                            badgeStyle = 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30';
                                            statusText = `Finger ${aggTemplate.fingerIdx}: Available on ${deviceCount} other device(s) - can be added to this device`;
                                          } else if (!isOnDevice) {
                                            // Template only in DB for this device, not on device
                                            badgeStyle = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border border-gray-500/30';
                                            statusText = `Finger ${aggTemplate.fingerIdx}: In DB only (not on device)`;
                                          } else {
                                            // Template is on this device
                                            if (deviceCount > 1) {
                                              badgeStyle = 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30';
                                              statusText = `Finger ${aggTemplate.fingerIdx}: Same template on ${deviceCount} device(s)`;
                                            } else {
                                              statusText = `Finger ${aggTemplate.fingerIdx}: Only on this device`;
                                            }
                                          }

                                          const isDeleting = deletingTemplate?.deviceId === device.id && deletingTemplate?.fingerIdx === aggTemplate.fingerIdx;
                                          const isAdding = addingTemplate?.deviceId === device.id && addingTemplate?.fingerIdx === aggTemplate.fingerIdx;

                                          return (
                                            <div
                                              key={aggTemplate.fingerIdx}
                                              className={`px-1.5 py-0 rounded text-xs font-medium flex items-center gap-0.5 leading-none ${badgeStyle} group`}
                                              style={{ height: '30px' }}
                                              title={statusText}
                                            >
                                              <Fingerprint className="w-2 h-2" />
                                              <span className="leading-none">F{aggTemplate.fingerIdx}</span>
                                              {!existsOnThisDevice && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddTemplate(device, aggTemplate.fingerIdx);
                                                  }}
                                                  disabled={isAdding || isOperationInProgress || !isInStoredDevices}
                                                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity hover:text-green-500 disabled:opacity-50"
                                                  title={
                                                    !isInStoredDevices
                                                      ? 'User must be registered on device to add fingerprint templates'
                                                      : isOperationInProgress
                                                        ? 'Operation in progress, please wait'
                                                        : `Add fingerprint ${aggTemplate.fingerIdx} to this device from other device(s)`
                                                  }
                                                >
                                                  {isAdding ? (
                                                    <Loader2 className="w-2 h-2 animate-spin" />
                                                  ) : (
                                                    <Download className="w-2 h-2" />
                                                  )}
                                                </button>
                                              )}
                                              {existsOnThisDevice && !isOnDevice && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddTemplate(device, aggTemplate.fingerIdx);
                                                  }}
                                                  disabled={isAdding || isOperationInProgress || !isInStoredDevices}
                                                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity hover:text-green-500 disabled:opacity-50"
                                                  title={
                                                    !isInStoredDevices
                                                      ? 'User must be registered on device to add fingerprint templates'
                                                      : isOperationInProgress
                                                        ? 'Operation in progress, please wait'
                                                        : `Add fingerprint ${aggTemplate.fingerIdx} to device from database`
                                                  }
                                                >
                                                  {isAdding ? (
                                                    <Loader2 className="w-2 h-2 animate-spin" />
                                                  ) : (
                                                    <Download className="w-2 h-2" />
                                                  )}
                                                </button>
                                              )}
                                              {existsOnThisDevice && deviceCount > 1 && (
                                                <span title={`Same template on ${deviceCount} device(s)`}>
                                                  <Check className="w-2 h-2" />
                                                </span>
                                              )}
                                              {isOnDevice && isInStoredDevices && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTemplate(device, aggTemplate.fingerIdx);
                                                  }}
                                                  disabled={isDeleting || isOperationInProgress}
                                                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity hover:text-red-500 disabled:opacity-50"
                                                  title={isOperationInProgress ? 'Operation in progress, please wait' : `Delete fingerprint ${aggTemplate.fingerIdx} from device (preserved in DB)`}
                                                >
                                                  {isDeleting ? (
                                                    <Loader2 className="w-2 h-2 animate-spin" />
                                                  ) : (
                                                    <Trash2 className="w-2 h-2" />
                                                  )}
                                                </button>
                                              )}
                                              {isOnDevice && !isInStoredDevices && (
                                                <span className="ml-0.5 opacity-30" title="User must be registered on device to delete fingerprint">
                                                  <Trash2 className="w-2 h-2 text-muted-foreground" />
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground min-h-[60px]">
                                      No fingerprints found across any device
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isInStoredDevices ? (
                                  <>
                                    <button
                                      onClick={async () => {
                                        await fetchFingerprintData(device, true);
                                        // Also refresh aggregated templates after a delay
                                        setTimeout(() => {
                                          fetchAggregatedTemplates();
                                        }, 1000);
                                      }}
                                      disabled={fingerprintData[device.id]?.isLoading || isLoadingAggregated || isOperationInProgress}
                                      className="p-1 hover:bg-secondary rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                      title={isOperationInProgress ? 'Operation in progress, please wait' : 'Refresh fingerprint data from device and update database'}
                                    >
                                      {fingerprintData[device.id]?.isLoading || isLoadingAggregated || isOperationInProgress ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                      ) : (
                                        <RefreshCw className="w-3.5 h-3.5 text-primary" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleRemoveUserFromDevice(device)}
                                      disabled={syncingDeviceId === device.id || isOperationInProgress}
                                      className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 min-w-[104px] justify-center"
                                      title={isOperationInProgress ? 'Operation in progress, please wait' : 'Remove user from this device (fingerprint data will be preserved)'}
                                    >
                                      {syncingDeviceId === device.id && syncingAction === 'remove' ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Removing...</span>
                                        </>
                                      ) : (
                                        <>
                                          <X className="w-3 h-3" />
                                          <span>Remove</span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {/* Show fingerprint refresh button but disabled for unregistered devices */}
                                    <button
                                      disabled={true}
                                      className="p-1 rounded-lg transition-all opacity-30 cursor-not-allowed"
                                      title="User must be registered on device to refresh fingerprint data"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                    <button
                                      onClick={() => handleAddUserToDevice(device)}
                                      disabled={syncingDeviceId === device.id || isOperationInProgress}
                                      className="px-2.5 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 min-w-[104px] justify-center"
                                      title={isOperationInProgress ? 'Operation in progress, please wait' : 'Add user to this device'}
                                    >
                                      {syncingDeviceId === device.id && syncingAction === 'add' ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Adding...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Check className="w-3 h-3" />
                                          <span>Add to Device</span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0 sticky bottom-0 bg-card/95 backdrop-blur-sm rounded-b-xl">
          <button
            onClick={async () => {
              if (isOperationInProgress) {
                if (showNotification) {
                  showNotification('info', 'Please wait for the current operation to complete before closing');
                }
                return;
              }
              
              // Check if name or role has changed
              const nameChanged = editedName !== null && editedName !== displayUser.name;
              const roleChanged = editedRole !== null && editedRole !== originalRole;
              
              // If name or role changed, show confirmation modal
              if (nameChanged || roleChanged) {
                // Initialize selected devices with devices where user is registered
                const userDeviceIds = fpDevices.map(d => d.id);
                setSelectedDevicesForWrite(userDeviceIds);
                setDeviceWriteStatus({});
                setShowNameRoleConfirmModal(true);
                return;
              }
              
              // Otherwise, proceed with normal save
              await handleSaveAllChanges();
            }}
            disabled={isSavingDesignation || isSavingDates || isSavingName || isSavingRole || isOperationInProgress}
            className="flex-1 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            title={isOperationInProgress ? 'Please wait for the current operation to complete' : 'Save and close'}
          >
            {isSavingDesignation || isSavingDates || isSavingName || isSavingRole ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Modals */}
      {/* Delete Fingerprint Template Confirmation */}
      <ConfirmationModal
        show={confirmDeleteTemplate !== null}
        onClose={() => setConfirmDeleteTemplate(null)}
        onConfirm={handleConfirmDeleteTemplate}
        title="Delete Fingerprint Template"
        message={confirmDeleteTemplate ? `Are you sure you want to delete fingerprint template for finger ${confirmDeleteTemplate.fingerIdx} from device "${confirmDeleteTemplate.device.name}"?\n\nThe template will be preserved in the database and can be added back later.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        icon={Trash2}
        isProcessing={deletingTemplate !== null}
      />

      {/* Add User to Device Confirmation */}
      <ConfirmationModal
        show={confirmAddUser !== null}
        onClose={() => setConfirmAddUser(null)}
        onConfirm={handleConfirmAddUser}
        title="Add User to Device"
        message={confirmAddUser ? `Are you sure you want to add user "${displayUser?.name}" (${displayUser?.userId}) to device "${confirmAddUser.name}"?\n\nThis will register the user on the device and sync any available fingerprint templates.` : ''}
        confirmText="Add to Device"
        cancelText="Cancel"
        type="info"
        icon={Server}
        isProcessing={syncingDeviceId === confirmAddUser?.id && syncingAction === 'add'}
      />

      {/* Remove User from Device Confirmation */}
      <ConfirmationModal
        show={confirmRemoveUser !== null}
        onClose={() => setConfirmRemoveUser(null)}
        onConfirm={handleConfirmRemoveUser}
        title="Remove User from Device"
        message={confirmRemoveUser ? `Are you sure you want to remove user "${displayUser?.name}" (${displayUser?.userId}) from device "${confirmRemoveUser.name}"?\n\nThe user's fingerprint data will be preserved in the database.` : ''}
        confirmText="Remove"
        cancelText="Cancel"
        type="warning"
        icon={X}
        isProcessing={syncingDeviceId === confirmRemoveUser?.id && syncingAction === 'remove'}
      />

      {/* Add Fingerprint Template Confirmation */}
      <ConfirmationModal
        show={confirmAddTemplate !== null}
        onClose={() => setConfirmAddTemplate(null)}
        onConfirm={handleConfirmAddTemplate}
        title="Add Fingerprint Template"
        message={confirmAddTemplate ? `Are you sure you want to add fingerprint template for finger ${confirmAddTemplate.fingerIdx} to device "${confirmAddTemplate.device.name}"?\n\nThis will copy the template from another device or database and add it to this device.\n\nNote: The user must be registered on this device to add fingerprint templates.` : ''}
        confirmText="Add Template"
        cancelText="Cancel"
        type="info"
        icon={Download}
        isProcessing={addingTemplate?.deviceId === confirmAddTemplate?.device.id && addingTemplate?.fingerIdx === confirmAddTemplate?.fingerIdx}
      />

      {/* Edit Name Modal */}
      {showEditNameModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingName) {
              // Reset editing name when closing without saving
              setEditingName('');
              setShowEditNameModal(false);
            }
          }}
        >
          <div
            className="glass-card rounded-xl w-full max-w-md animate-slide-in-up flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Edit Name</h3>
                  <p className="text-sm text-muted-foreground">Update user name</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isSavingName) {
                    // Reset editing name when closing without saving
                    setEditingName('');
                    setShowEditNameModal(false);
                  }
                }}
                className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0 disabled:opacity-50"
                disabled={isSavingName}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              <div className="space-y-4">
                {/* Caution Message */}
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-1">
                        Caution
                      </p>
                      <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">
                        Changing the name will only update it in the database. The name may not be saved on all devices, especially if the user is not registered on those devices. You may need to sync the user to devices after updating the name.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Name Input */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSavingName) {
                        handleSaveName();
                      }
                      if (e.key === 'Escape' && !isSavingName) {
                        // Reset editing name when canceling with Escape
                        setEditingName('');
                        setShowEditNameModal(false);
                      }
                    }}
                    disabled={isSavingName}
                    className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter user name"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
              <button
                onClick={() => {
                  if (!isSavingName) {
                    // Reset editing name when canceling
                    setEditingName('');
                    setShowEditNameModal(false);
                  }
                }}
                disabled={isSavingName}
                className="flex-1 px-6 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg font-medium text-sm transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                disabled={isSavingName || !editingName.trim()}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingName ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  'Change'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Name/Role Change Confirmation Modal */}
      {showNameRoleConfirmModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isWritingToDevices) {
              setShowNameRoleConfirmModal(false);
            }
          }}
        >
          <div
            className="bg-card rounded-xl w-full max-w-md animate-slide-in-up border border-border flex flex-col shadow-xl"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-4 p-6 pb-4 border-b border-border/50 flex-shrink-0">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground mb-1">Write Changes to Devices</h3>
              </div>
              <button
                onClick={() => {
                  if (!isWritingToDevices) {
                    setShowNameRoleConfirmModal(false);
                  }
                }}
                disabled={isWritingToDevices}
                className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              <div className="space-y-4">
                {/* Change Details */}
                <div className="p-4 bg-secondary/50 border border-border rounded-lg">
                  <p className="text-sm font-medium mb-2">Changes to be written:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {editedName !== null && editedName !== displayUser.name && (
                      <li>• Name: <span className="text-foreground">{displayUser.name}</span> → <span className="text-foreground font-medium">{editedName}</span></li>
                    )}
                    {editedRole !== null && editedRole !== originalRole && (
                      <li>• Role: <span className="text-foreground">{originalRole.startsWith('14') ? 'Admin' : 'User'}</span> → <span className="text-foreground font-medium">{editedRole.startsWith('14') ? 'Admin' : 'User'}</span></li>
                    )}
                  </ul>
                </div>

                {/* Device Selection */}
                <div>
                  <p className="text-sm font-medium mb-3">Select devices to write changes:</p>
                  {allDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No devices available</p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {allDevices.map((device) => {
                        const isSelected = selectedDevicesForWrite.includes(device.id);
                        const deviceStatus = deviceWriteStatus[device.id]?.status;
                        const isUserOnDevice = fpDevices.some(d => d.id === device.id);
                        
                        return (
                          <label
                            key={device.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-primary/10 border-primary/30'
                                : 'bg-secondary/50 border-border hover:bg-secondary'
                            } ${isWritingToDevices ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (isWritingToDevices) return;
                                if (e.target.checked) {
                                  setSelectedDevicesForWrite([...selectedDevicesForWrite, device.id]);
                                } else {
                                  setSelectedDevicesForWrite(selectedDevicesForWrite.filter(id => id !== device.id));
                                }
                              }}
                              disabled={isWritingToDevices}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{device.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{device.ip}:{device.port}</div>
                              {!isUserOnDevice && (
                                <div className="text-xs text-yellow-500 mt-1">User not registered on this device</div>
                              )}
                            </div>
                            {deviceStatus === 'writing' && (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            )}
                            {deviceStatus === 'success' && (
                              <Check className="w-4 h-4 text-green-500" />
                            )}
                            {(deviceStatus === 'failed' || deviceStatus === 'timeout') && (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0">
              <button
                onClick={handleWriteToDevices}
                disabled={isWritingToDevices || selectedDevicesForWrite.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWritingToDevices ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Writing to devices...
                  </>
                ) : (
                  'Write to Devices'
                )}
              </button>
      <button
        onClick={() => {
          if (!isWritingToDevices) {
            // Save without writing to devices (role changes will NOT be written to DB here)
            handleSaveAllChanges();
          }
        }}
        disabled={isWritingToDevices}
        className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Save Only
      </button>
              <button
                onClick={() => {
                  if (!isWritingToDevices) {
                    setShowNameRoleConfirmModal(false);
                  }
                }}
                disabled={isWritingToDevices}
                className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}

