import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DeviceInfo, AttendanceLog, User, ApiResponse, Device } from '@/types';

type TabType = 'dashboard' | 'attendance' | 'users' | 'device' | 'settings' | 'help';
type UserSortField = 'userId' | 'name' | 'role' | 'cardNo';

export function useDashboard() {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Device management state
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [isEditingDevice, setIsEditingDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  
  // Sync confirmation state
  const [showSyncUsersConfirmation, setShowSyncUsersConfirmation] = useState(false);
  const [pendingSyncAction, setPendingSyncAction] = useState<'single' | 'all' | null>(null);

  // Data state
  const [deviceInfo, setDeviceInfo] = useState<(DeviceInfo & { deviceTime?: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync progress state
  const [syncProgress, setSyncProgress] = useState<{
    progress: number;
    message: string;
    phase: string;
    results?: {
      users: { synced: number; updated: number; skipped: number };
      logs: { synced: number; skipped: number };
      duration: number;
    };
  } | null>(null);

  // Multi-device sync state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{
    current: number;
    total: number;
    deviceName: string;
    results: Array<{
      deviceName: string;
      deviceIp: string;
      success: boolean;
      users: { synced: number; updated: number; skipped: number };
      logs: { synced: number; skipped: number };
      error?: string;
    }>;
  } | null>(null);

  // Store last sync results per device (persists until refresh or new sync)
  const [deviceSyncResults, setDeviceSyncResults] = useState<Map<number, {
    users: { synced: number; updated: number; skipped: number };
    logs: { synced: number; skipped: number };
    fingerprints?: { saved: number; updated: number; errors: number };
    duration: number;
    timestamp: Date;
  }>>(new Map());

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'check-in' | 'check-out'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string, autoClose?: boolean } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  
  // Fingerprint save state
  const [isSavingFingerprint, setIsSavingFingerprint] = useState(false);

  // Database data state
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [dbAttendance, setDbAttendance] = useState<AttendanceLog[]>([]);
  const [dbStats, setDbStats] = useState<{ 
    totalUsers: number; 
    totalLogs: number; 
    todayCheckIns: number; 
    todayCheckOuts: number;
  }>({ 
    totalUsers: 0, 
    totalLogs: 0, 
    todayCheckIns: 0, 
    todayCheckOuts: 0 
  });

  // Pagination state
  const [usersPage, setUsersPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [attendanceTotalPages, setAttendanceTotalPages] = useState(1);
  const PAGE_SIZE = 100;

  // Sorting state for users table
  const [userSortField, setUserSortField] = useState<UserSortField | null>(null);
  const [userSortDirection, setUserSortDirection] = useState<'asc' | 'desc'>('asc');

  // Sorting state for attendance table
  type AttendanceSortField = 'userId' | 'timestamp' | 'state';
  const [attendanceSortField, setAttendanceSortField] = useState<AttendanceSortField | null>(null);
  const [attendanceSortDirection, setAttendanceSortDirection] = useState<'asc' | 'desc'>('desc');

  // Handle column sort click - triggers server-side sort by refetching
  const handleUserSort = (field: string) => {
    const sortField = field as UserSortField;
    if (userSortField === sortField) {
      const newDirection = userSortDirection === 'asc' ? 'desc' : 'asc';
      setUserSortDirection(newDirection);
      // Reset to page 1 when sorting changes
      setUsersPage(1);
      // Fetch with new sort parameters will be triggered by useEffect
    } else {
      setUserSortField(sortField);
      setUserSortDirection('asc');
      // Reset to page 1 when sorting changes
      setUsersPage(1);
      // Fetch with new sort parameters will be triggered by useEffect
    }
  };

  // Show notification
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string, autoClose: boolean = false) => {
    setNotification({ type, message, autoClose });
  }, []);

  // Fetch devices from database
  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const response = await fetch('/api/devices');
      const data: ApiResponse<Device[]> = await response.json();

      if (data.success && data.data) {
        setDevices(data.data);
        if (!selectedDevice && data.data.length > 0) {
          const savedDeviceId = localStorage.getItem('selectedDeviceId');
          const savedDevice = savedDeviceId 
            ? data.data.find(d => d.id.toString() === savedDeviceId) 
            : null;
          
          const deviceToSelect = savedDevice || data.data[0];
          setSelectedDevice(deviceToSelect);
        }
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
      showNotification('error', 'Failed to fetch devices');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  // Check sync status
  const isStreamingRef = useRef(false);

  const checkSyncStatus = async () => {
    try {
      const response = await fetch('/api/sync');
      const data = await response.json();

      if (data.success && data.data && data.data.isSyncing) {
        setIsSyncing(true);
        if (data.data.isMultiDevice) {
            setIsSyncingAll(true);
            setSyncAllProgress({
                current: data.data.currentDeviceIndex || 0,
                total: data.data.totalDevices || 0,
                deviceName: data.data.currentDeviceName || '',
                results: data.data.deviceResults || []
            });
        }
        setIsConnected(true);
        await connectToSyncStream(true);
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const connectToSyncStream = async (resume = false) => {
    // Prevent recursive/re-entrant stream connections that can cause render loops
    if (isStreamingRef.current) {
      return;
    }
    isStreamingRef.current = true;
    setIsSyncing(true);
    if (!resume) {
      setSyncProgress({ progress: 0, message: 'Starting sync...', phase: 'init' });
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const url = resume ? '/api/sync/stream?resume=true' : '/api/sync/stream';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to start sync stream: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('Failed to start sync stream');
      
      // Set syncing state immediately when stream is connected
      setIsSyncing(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Update sync state immediately when we receive any data
              if (data.phase !== undefined) {
                const isCurrentlySyncing = data.phase !== 'idle' && data.phase !== 'complete' && data.phase !== 'error';
                setIsSyncing(isCurrentlySyncing);
                
                // Disconnect on error phase
                if (data.phase === 'error') {
                  setIsConnected(false);
                  setDeviceInfo(null);
                }
              }
              
              if (data.error) {
                showNotification('error', data.error);
                setIsSyncing(false);
                // Disconnect on error (especially authentication errors)
                setIsConnected(false);
                setDeviceInfo(null);
                // break; // Don't break, keep listening in case it's a transient error or part of multi-device
              }
              
              // Always update progress, even if phase is empty (to show initial state)
              setSyncProgress({
                progress: data.progress ?? 0,
                message: data.message || 'Starting sync...',
                phase: data.phase || 'init',
                results: data.results || null
              } as any);
              
              // Store results for single device sync when complete (users-only sync uses phase 'users' with status 'complete')
              // Check for completion: phase 'complete' OR phase 'users' with status 'complete' or progress 100
              // Also check if results have fingerprints (even if phase/status don't match exactly)
              if (data.results && selectedDevice?.id && !data.isMultiDevice) {
                const hasFingerprints = !!(data.results as any).fingerprints;
                const isComplete = data.phase === 'complete' || 
                                  (data.phase === 'users' && (data.status === 'complete' || data.progress === 100));
                
                // Store if complete OR if we have fingerprints (to ensure they're captured)
                if (isComplete || hasFingerprints) {
                  console.log('[useDashboard] Storing results:', {
                    phase: data.phase,
                    status: data.status,
                    progress: data.progress,
                    isComplete: isComplete,
                    hasFingerprints: hasFingerprints,
                    fingerprints: (data.results as any).fingerprints
                  });
                  setDeviceSyncResults(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(selectedDevice.id);
                    // Preserve fingerprints if they exist in either existing or new data
                    const fingerprints = (data.results as any).fingerprints || existing?.fingerprints;
                    console.log('[useDashboard] Setting deviceSyncResults with fingerprints:', fingerprints);
                    newMap.set(selectedDevice.id, {
                      users: data.results.users,
                      logs: data.results.logs,
                      fingerprints: fingerprints,
                      duration: data.results.duration || 0,
                      timestamp: new Date()
                    });
                    return newMap;
                  });
                }
              }

              if (data.isMultiDevice) {
                  setIsSyncingAll(true);
                  const deviceResults = data.deviceResults || [];
                  setSyncAllProgress({
                      current: data.currentDeviceIndex,
                      total: data.totalDevices,
                      deviceName: data.currentDeviceName || '',
                      results: deviceResults
                  });
                  
                  // Store results immediately for each device as it completes
                  deviceResults.forEach((result: any) => {
                    if (result.success) {
                      // Find device by name or IP
                      const device = devices.find(d => d.name === result.deviceName || d.ip === result.deviceIp);
                      if (device) {
                        setDeviceSyncResults(prev => {
                          const newMap = new Map(prev);
                          // Only update if this is a new result or if we don't have a result for this device yet
                          if (!newMap.has(device.id) || result.duration) {
                            newMap.set(device.id, {
                              users: result.users,
                              logs: result.logs,
                              fingerprints: result.fingerprints,
                              duration: result.duration || 0,
                              timestamp: new Date()
                            });
                          }
                          return newMap;
                        });
                      }
                    }
                  });
              }

              if (data.phase === 'complete' && data.result) {
                const { users: u, logs: l, duration } = data.result;
                
                if (data.isMultiDevice) {
                     const results = data.deviceResults || [];
                     const successCount = results.filter((r: any) => r.success).length;
                     const failCount = results.filter((r: any) => !r.success).length;
                     showNotification('success', `Sync complete! ${successCount} succeeded, ${failCount} failed.`, false);
                     
                     // Store results for each device in multi-device sync (match by device name or IP)
                     results.forEach((result: any) => {
                       if (result.success) {
                         // Find device by name or IP
                         const device = devices.find(d => d.name === result.deviceName || d.ip === result.deviceIp);
                         if (device) {
                           setDeviceSyncResults(prev => {
                             const newMap = new Map(prev);
                            newMap.set(device.id, {
                              users: result.users,
                              logs: result.logs,
                              fingerprints: result.fingerprints,
                              duration: result.duration || 0,
                              timestamp: new Date()
                            });
                             return newMap;
                           });
                         }
                       }
                     });
                     
                     // Force disconnect state in UI since server disconnects
                     setIsConnected(false);
                     setDeviceInfo(null);
                } else {
                    const userMsg = `New Users: ${u.synced} , updated:${u.updated} , skipped:${u.skipped}`;
                    const logMsg = `New Logs:${l.synced} skipped:${l.skipped}`;
                    showNotification('success',
                    `Sync completed! ${userMsg} . ${logMsg} . (${(duration / 1000).toFixed(1)}s)`,
                    false
                    );
                    
                    // Store results for single device sync - use data.results if available (for fingerprints)
                    if (selectedDevice?.id) {
                      setDeviceSyncResults(prev => {
                        const newMap = new Map(prev);
                        const existing = newMap.get(selectedDevice.id);
                        // Preserve fingerprints from any source: data.results, syncProgress, or existing
                        const fingerprints = (data.results as any)?.fingerprints || 
                                           (syncProgress?.results as any)?.fingerprints || 
                                           existing?.fingerprints;
                        const result: any = {
                          users: u,
                          logs: l,
                          duration: duration || 0,
                          timestamp: new Date()
                        };
                        // Only include fingerprints if they exist (don't set to undefined)
                        if (fingerprints) {
                          result.fingerprints = fingerprints;
                        } else if (existing?.fingerprints) {
                          // Preserve existing fingerprints if no new ones
                          result.fingerprints = existing.fingerprints;
                        }
                        newMap.set(selectedDevice.id, result);
                        return newMap;
                      });
                    }
                    
                    // Force disconnect state in UI for single sync too
                    setIsConnected(false);
                    setDeviceInfo(null);
                }

                await fetchDbData();
              }
              
              // Also handle users-only sync completion (phase 'users' with status 'complete')
              // This ensures fingerprints are stored even if the stream closes before phase 'complete'
              if (data.phase === 'users' && data.status === 'complete' && data.results && 
                  selectedDevice?.id && !data.isMultiDevice) {
                console.log('[useDashboard] Users-only sync complete, storing results:', {
                  phase: data.phase,
                  status: data.status,
                  hasFingerprints: !!(data.results as any).fingerprints,
                  fingerprints: (data.results as any).fingerprints
                });
                setDeviceSyncResults(prev => {
                  const newMap = new Map(prev);
                  const existing = newMap.get(selectedDevice.id);
                  // Always update, preserving fingerprints from data.results or existing
                  const fingerprints = (data.results as any).fingerprints || existing?.fingerprints;
                  console.log('[useDashboard] Setting deviceSyncResults (users-only) with fingerprints:', fingerprints);
                  newMap.set(selectedDevice.id, {
                    users: data.results.users,
                    logs: data.results.logs,
                    fingerprints: fingerprints,
                    duration: data.results.duration || 0,
                    timestamp: new Date()
                  });
                  return newMap;
                });
              }
            } catch (e) { }
          }
        }
      }
      
      // Final check: when stream ends, preserve any fingerprint results from syncProgress
      // This ensures fingerprints persist even if the stream closes before final state update
      // Only do this for single device sync (not multi-device)
      if (selectedDevice?.id && syncProgress?.results && !isSyncingAll) {
        const fpResults = (syncProgress.results as any)?.fingerprints;
        console.log('[useDashboard] Stream ended, checking syncProgress for fingerprints:', {
          hasFingerprints: !!fpResults,
          fingerprints: fpResults,
          hasResults: !!syncProgress.results
        });
        if (fpResults) {
          setDeviceSyncResults(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(selectedDevice.id);
            console.log('[useDashboard] Final check: preserving fingerprints from syncProgress', {
              existing: existing,
              fpResults: fpResults
            });
            // Always preserve fingerprints from syncProgress if they exist
            if (existing) {
              newMap.set(selectedDevice.id, {
                ...existing,
                fingerprints: fpResults,
                // Update other fields from syncProgress if available
                users: syncProgress.results?.users || existing.users,
                logs: syncProgress.results?.logs || existing.logs,
                duration: syncProgress.results?.duration || existing.duration
              });
            } else if (syncProgress.results) {
              // Create new entry if it doesn't exist
              newMap.set(selectedDevice.id, {
                users: syncProgress.results.users,
                logs: syncProgress.results.logs,
                fingerprints: fpResults,
                duration: syncProgress.results.duration || 0,
                timestamp: new Date()
              });
            }
            return newMap;
          });
        } else {
          console.log('[useDashboard] No fingerprints found in syncProgress.results');
        }
      }
    } catch (error) {
      showNotification('error', 'Failed to sync data to database', false);
      // Disconnect on sync failure
      setIsConnected(false);
      setDeviceInfo(null);
    } finally {
      isStreamingRef.current = false;
      setIsSyncing(false);
      // Don't clear syncProgress immediately - keep results visible
      // Only clear the progress indicator, not the results
      setSyncProgress(prev => prev ? { ...prev, progress: 100, phase: 'complete' } : null);
      if (isSyncingAll) {
          setTimeout(() => setSyncAllProgress(null), 5000);
      }
      setIsSyncingAll(false);
    }
  };

  // Fetch stats from database (full counts, no pagination)
  const fetchDbStats = async () => {
    try {
      const response = await fetch('/api/db/stats');
      const data: ApiResponse<{ 
        totalUsers: number; 
        totalLogs: number; 
        todayCheckIns: number; 
        todayCheckOuts: number;
      }> = await response.json();

      if (data.success && data.data) {
        setDbStats({
          totalUsers: data.data.totalUsers,
          totalLogs: data.data.totalLogs,
          todayCheckIns: data.data.todayCheckIns,
          todayCheckOuts: data.data.todayCheckOuts,
        });
      }
    } catch (error) {
      console.error('Error fetching stats from DB:', error);
    }
  };

  // Fetch users from database with server-side sorting
  const fetchDbUsers = async (page = 1, search = '', sortField?: string | null, sortDirection?: 'asc' | 'desc') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
        ...(search && { search }),
        ...(sortField && { sortField }),
        ...(sortDirection && { sortDirection }),
      });
      const response = await fetch(`/api/db/users?${params}`);
      const data: ApiResponse<{ users: User[]; total: number; totalPages: number }> = await response.json();

      if (data.success && data.data) {
        setDbUsers(data.data.users);
        setUsersTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching users from DB:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch attendance from database with server-side sorting
  const fetchDbAttendance = async (page = 1, search = '', state?: string, sortField?: string | null, sortDirection?: 'asc' | 'desc') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
        ...(search && { search }),
        ...(state && state !== 'all' && { state: state === 'check-in' ? '0' : '1' }),
        ...(sortField && { sortField }),
        ...(sortDirection && { sortDirection }),
      });
      const response = await fetch(`/api/db/attendance?${params}`);
      const data: ApiResponse<{ logs: AttendanceLog[]; total: number; totalPages: number }> = await response.json();

      if (data.success && data.data) {
        setDbAttendance(data.data.logs);
        setAttendanceTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching attendance from DB:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch attendance by date range (for AttendanceBook)
  const fetchDbAttendanceByDateRange = useCallback(async (startDate: Date, endDate: Date): Promise<AttendanceLog[]> => {
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: '10000', // Large limit to get all records in range
      });
      const response = await fetch(`/api/db/attendance?${params}`);
      const data: ApiResponse<{ logs: AttendanceLog[]; total: number; totalPages: number }> = await response.json();

      if (data.success && data.data) {
        return data.data.logs;
      }
      return [];
    } catch (error) {
      console.error('Error fetching attendance by date range:', error);
      return [];
    }
  }, []);

  // Fetch all users (for AttendanceBook)
  const fetchAllUsers = useCallback(async (): Promise<User[]> => {
    try {
      const params = new URLSearchParams({
        limit: '10000', // Large limit to get all users
      });
      const response = await fetch(`/api/db/users?${params}`);
      const data: ApiResponse<{ users: User[]; total: number; totalPages: number }> = await response.json();

      if (data.success && data.data) {
        return data.data.users;
      }
      return [];
    } catch (error) {
      console.error('Error fetching all users:', error);
      return [];
    }
  }, []);

  // Handle attendance column sort click
  const handleAttendanceSort = (field: string) => {
    const sortField = field as AttendanceSortField;
    if (attendanceSortField === sortField) {
      const newDirection = attendanceSortDirection === 'asc' ? 'desc' : 'asc';
      setAttendanceSortDirection(newDirection);
      setAttendancePage(1);
    } else {
      setAttendanceSortField(sortField);
      setAttendanceSortDirection('desc'); // Default to desc for timestamp
      setAttendancePage(1);
    }
  };

  // Fetch all database data
  const fetchDbData = async () => {
    await Promise.all([
      fetchDbStats(),
      fetchDbUsers(usersPage, searchTerm, userSortField, userSortDirection),
      fetchDbAttendance(attendancePage, '', filterState, attendanceSortField || 'recordTime', attendanceSortDirection),
    ]);
  };

  // Load devices on mount
  useEffect(() => {
    fetchDevices();
    checkSyncStatus();
  }, []);

  useEffect(() => { fetchDbData(); }, []);
  useEffect(() => { 
    fetchDbUsers(usersPage, searchTerm, userSortField || 'userId', userSortDirection); 
  }, [usersPage, userSortField, userSortDirection, searchTerm]);
  useEffect(() => { 
    fetchDbAttendance(attendancePage, searchTerm, filterState, attendanceSortField || 'recordTime', attendanceSortDirection); 
  }, [attendancePage, filterState, attendanceSortField, attendanceSortDirection, searchTerm]);

  // Stats - use full counts from dbStats instead of paginated dbAttendance
  const checkIns = dbStats.todayCheckIns;
  const checkOuts = dbStats.todayCheckOuts;

  return {
    // State
    isConnected,
    isConnecting,
    connectionError,
    devices,
    selectedDevice,
    isLoadingDevices,
    isAddingDevice,
    isEditingDevice,
    editingDevice,
    showDeviceModal,
    deviceInfo,
    isLoading,
    isSyncing,
    syncProgress,
    isSyncingAll,
    syncAllProgress,
    deviceSyncResults,
    activeTab,
    searchTerm,
    filterState,
    notification,
    isSidebarCollapsed,
    dbUsers,
    dbAttendance,
    dbStats,
    usersPage,
    attendancePage,
    usersTotalPages,
    attendanceTotalPages,
    PAGE_SIZE,
    userSortField,
    userSortDirection,
    sortedUsers: dbUsers, // Use dbUsers directly since sorting is now server-side
    attendanceSortField,
    attendanceSortDirection,
    checkIns,
    checkOuts,
    
    // Actions
    setIsConnected,
    setIsConnecting,
    setConnectionError,
    setSelectedDevice,
    setIsAddingDevice,
    setIsEditingDevice,
    setEditingDevice,
    setShowDeviceModal,
    setDeviceInfo,
    setActiveTab,
    setSearchTerm,
    setFilterState,
    setNotification,
    setIsSidebarCollapsed,
    setUsersPage,
    setAttendancePage,
    handleUserSort,
    handleAttendanceSort,
    showNotification,
    fetchDevices,
    fetchDeviceInfo: async () => {
      try {
        const response = await fetch('/api/device/info');
        const data: ApiResponse<DeviceInfo & { deviceTime?: string }> = await response.json();
        if (data.success && data.data) {
          setDeviceInfo(data.data);
        }
      } catch (error) {
        console.error('Error fetching device info:', error);
      }
    },
    handleConnect: async (deviceToConnect?: Device) => {
      setNotification(null); // Close any existing notification
      const device = deviceToConnect || selectedDevice;
      if (!device) {
        showNotification('error', 'Please select a device first');
        return;
      }
      setIsConnecting(true);
      setConnectionError(null);
      try {
        const response = await fetch('/api/device/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: device.ip,
            port: device.port,
            timeout: 10000,
            inport: 4000
          })
        });
        const data: ApiResponse<{ connected: boolean }> = await response.json();
        if (data.success) {
          setIsConnected(true);
          showNotification('success', `Connected to ${device.name} (${device.ip}:${device.port})`);
          const infoResponse = await fetch('/api/device/info');
          const infoData: ApiResponse<DeviceInfo & { deviceTime?: string }> = await infoResponse.json();
          if (infoData.success && infoData.data) {
            setDeviceInfo(infoData.data);
          }
        } else {
          setConnectionError(data.error || 'Failed to connect');
          showNotification('error', data.error || 'Connection failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        setConnectionError(message);
        showNotification('error', message);
      } finally {
        setIsConnecting(false);
      }
    },
    handleDisconnect: async () => {
      setNotification(null); // Close any existing notification
      try {
        await fetch('/api/device/connect', { method: 'DELETE' });
        setIsConnected(false);
        setDeviceInfo(null);
        setConnectionError(null);
        showNotification('info', 'Disconnected from device');
      } catch (error) {
        showNotification('error', 'Failed to disconnect');
      }
    },
    handleSyncToDatabase: async () => {
      setNotification(null); // Close any existing notification
      if (!isConnected) {
        showNotification('error', 'Please connect to device first');
        return;
      }
      // Clear previous results for this device when starting new sync
      if (selectedDevice?.id) {
        setDeviceSyncResults(prev => {
          const newMap = new Map(prev);
          newMap.delete(selectedDevice.id);
          return newMap;
        });
      }
      await connectToSyncStream(false);
    },
    handleSyncAllDevices: async () => {
      setNotification(null); // Close any existing notification
      if (devices.length === 0) {
        showNotification('error', 'No devices registered');
        return;
      }
      
      try {
        const response = await fetch('/api/sync/all', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            // Clear previous results for all devices when starting new sync
            setDeviceSyncResults(new Map());
            setIsSyncingAll(true);
            setSyncAllProgress({
                current: 0,
                total: devices.length,
                deviceName: 'Initializing...',
                results: []
            });
            // Connect to stream to follow progress
            await connectToSyncStream(true);
        } else {
            showNotification('error', data.error || 'Failed to start sync', false);
        }
      } catch (error) {
        showNotification('error', 'Failed to start sync all', false);
      }
    },
    handleSyncUsersOnly: async () => {
      setNotification(null); // Close any existing notification
      if (!isConnected) {
        showNotification('error', 'Please connect to device first');
        return;
      }
      
      // Show confirmation modal
      setPendingSyncAction('single');
      setShowSyncUsersConfirmation(true);
    },
    confirmSyncUsersOnly: async () => {
      setShowSyncUsersConfirmation(false);
      const action = pendingSyncAction;
      setPendingSyncAction(null);
      
      if (!action) return;
      
      try {
        const endpoint = action === 'single' ? '/api/sync/users' : '/api/sync/users/all';
        const response = await fetch(endpoint, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          if (action === 'single') {
            // Clear previous results for this device when starting new sync
            if (selectedDevice?.id) {
              setDeviceSyncResults(prev => {
                const newMap = new Map(prev);
                newMap.delete(selectedDevice.id);
                return newMap;
              });
            }
            await connectToSyncStream(false);
          } else {
            // Clear previous results for all devices when starting new sync
            setDeviceSyncResults(new Map());
            setIsSyncingAll(true);
            setSyncAllProgress({
                current: 0,
                total: devices.length,
                deviceName: 'Initializing...',
                results: []
            });
            // Connect to stream to follow progress
            await connectToSyncStream(true);
          }
        } else {
          showNotification('error', data.error || 'Failed to start users sync', false);
        }
      } catch (error) {
        showNotification('error', 'Failed to start users sync', false);
      }
    },
    handleSyncUsersOnlyAll: async () => {
      setNotification(null); // Close any existing notification
      if (devices.length === 0) {
        showNotification('error', 'No devices registered');
        return;
      }
      
      // Show confirmation modal
      setPendingSyncAction('all');
      setShowSyncUsersConfirmation(true);
    },
    handleStopSync: async () => {
      setNotification(null); // Close any existing notification
      try {
        const response = await fetch('/api/sync/stop', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          showNotification('info', 'Sync stop requested. The sync will be cancelled shortly.', false);
          
          // Auto-disconnect device when sync is stopped
          if (isConnected) {
            try {
              await fetch('/api/device/connect', { method: 'DELETE' });
              setIsConnected(false);
              setDeviceInfo(null);
              setConnectionError(null);
            } catch (disconnectError) {
              console.error('Error disconnecting after stop:', disconnectError);
            }
          }
        } else {
          showNotification('error', data.error || 'Failed to stop sync', false);
        }
      } catch (error) {
        showNotification('error', 'Failed to stop sync', false);
      }
    },
    handleAddDevice: async (deviceData: { name: string; ip: string; serialNumber: string; deviceModel?: string | null; password?: string | null }) => {
      setNotification(null); // Close any existing notification
      setIsAddingDevice(true);
      try {
        const response = await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: deviceData.name,
            ip: deviceData.ip,
            serialNumber: deviceData.serialNumber || null,
            deviceModel: deviceData.deviceModel || null,
            password: deviceData.password || null,
          }),
        });
        const data: ApiResponse<Device> = await response.json();
        if (data.success && data.data) {
          showNotification('success', 'Device added successfully');
          setShowDeviceModal(false);
          await fetchDevices();
          setSelectedDevice(data.data);
          localStorage.setItem('selectedDeviceId', data.data.id.toString());
        } else {
          showNotification('error', data.error || 'Failed to add device');
        }
      } catch (error) {
        showNotification('error', 'Failed to add device');
      } finally {
        setIsAddingDevice(false);
      }
    },
    handleUpdateDevice: async (deviceData: { id: number; name: string; ip: string; port: number; serialNumber: string; deviceModel?: string | null; password?: string | null }) => {
      setNotification(null); // Close any existing notification
      setIsAddingDevice(true);
      try {
        const response = await fetch('/api/devices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: deviceData.id,
            name: deviceData.name,
            ip: deviceData.ip,
            serialNumber: deviceData.serialNumber || null,
            deviceModel: deviceData.deviceModel || null,
            port: deviceData.port,
            password: deviceData.password || null,
          }),
        });
        const data: ApiResponse<Device> = await response.json();
        if (data.success && data.data) {
          showNotification('success', 'Device updated successfully');
          setIsEditingDevice(false);
          setEditingDevice(null);
          setShowDeviceModal(false);
          await fetchDevices();
          if (selectedDevice?.id === data.data.id) {
            setSelectedDevice(data.data);
          }
        } else {
          showNotification('error', data.error || 'Failed to update device');
        }
      } catch (error) {
        showNotification('error', 'Failed to update device');
      } finally {
        setIsAddingDevice(false);
      }
    },
    handleGetDeviceTime: async (device: Device) => {
      try {
        const response = await fetch('/api/device/time/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: device.ip,
            port: device.port,
          }),
        });

        const data: ApiResponse<{ deviceTime: string; deviceTimeISO: string }> = await response.json();

        if (data.success && data.data) {
          showNotification('success', `Device time: ${data.data.deviceTime}`);
        } else {
          showNotification('error', data.error || 'Failed to get device time');
        }
      } catch (error) {
        console.error('Error getting device time:', error);
        showNotification('error', 'Failed to get device time');
      }
    },

    handleSetDeviceTime: async (device: Device) => {
      try {
        const response = await fetch('/api/device/time/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: device.ip,
            port: device.port,
          }),
        });

        const data: ApiResponse<{ beforeTime: string | null; afterTime: string | null; setTime: string }> = await response.json();

        if (data.success && data.data) {
          const message = data.data.afterTime 
            ? `Device time set successfully. Before: ${data.data.beforeTime || 'N/A'}, After: ${data.data.afterTime}`
            : `Device time set successfully to ${data.data.setTime}`;
          showNotification('success', message);
        } else {
          showNotification('error', data.error || 'Failed to set device time');
        }
      } catch (error) {
        console.error('Error setting device time:', error);
        showNotification('error', 'Failed to set device time');
      }
    },

    handleDeleteDevice: async (device: Device) => {
      setNotification(null); // Close any existing notification
      if (!confirm(`Are you sure you want to delete "${device.name}"?`)) {
        return;
      }
      try {
        const response = await fetch(`/api/devices?id=${device.id}`, {
          method: 'DELETE',
        });
        const data: ApiResponse<null> = await response.json();
        if (data.success) {
          showNotification('success', 'Device deleted successfully');
          await fetchDevices();
          if (selectedDevice?.id === device.id) {
            setSelectedDevice(null);
            localStorage.removeItem('selectedDeviceId');
          }
        } else {
          showNotification('error', data.error || 'Failed to delete device');
        }
      } catch (error) {
        showNotification('error', 'Failed to delete device');
      }
    },
    handleStartEdit: (device: Device) => {
      setEditingDevice(device);
      setIsEditingDevice(true);
      setShowDeviceModal(true);
    },
    handleOpenAddModal: () => {
      setIsEditingDevice(false);
      setEditingDevice(null);
      setShowDeviceModal(true);
    },
    handleSelectDevice: async (device: Device) => {
      setNotification(null); // Close any existing notification
      if (isConnected && selectedDevice?.id === device.id) return;
      if (isConnected && selectedDevice?.id !== device.id) {
        await fetch('/api/device/connect', { method: 'DELETE' });
        setIsConnected(false);
        setDeviceInfo(null);
        setConnectionError(null);
      }
      setSelectedDevice(device);
      localStorage.setItem('selectedDeviceId', device.id.toString());
      const deviceToConnect = device;
      if (!deviceToConnect) {
        showNotification('error', 'Please select a device first');
        return;
      }
      setIsConnecting(true);
      setConnectionError(null);
      try {
        const response = await fetch('/api/device/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: deviceToConnect.ip,
            port: deviceToConnect.port,
            timeout: 10000,
            inport: 4000
          })
        });
        const data: ApiResponse<{ connected: boolean }> = await response.json();
        if (data.success) {
          setIsConnected(true);
          showNotification('success', `Connected to ${deviceToConnect.name} (${deviceToConnect.ip}:${deviceToConnect.port})`);
          const infoResponse = await fetch('/api/device/info');
          const infoData: ApiResponse<DeviceInfo & { deviceTime?: string }> = await infoResponse.json();
          if (infoData.success && infoData.data) {
            setDeviceInfo(infoData.data);
          }
        } else {
          setConnectionError(data.error || 'Failed to connect');
          showNotification('error', data.error || 'Connection failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        setConnectionError(message);
        showNotification('error', message);
      } finally {
        setIsConnecting(false);
      }
    },
    fetchDbUsers,
    fetchDbAttendance,
    fetchDbAttendanceByDateRange,
    fetchAllUsers,
    exportAttendance: () => {
      const headers = ['ID', 'User ID', 'Name', 'Timestamp', 'State'];
      const csvContent = [
        headers.join(','),
        ...dbAttendance.map(log => [
          log.id,
          log.userId,
          log.odoo_name || `User ${log.userId}`,
          new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19),
          log.stateLabel
        ].join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Attendance exported successfully');
    },
    exportUsers: async () => {
      try {
        const params = new URLSearchParams({
          limit: '10000', // Pull all users, not just the current page
          ...(searchTerm && { search: searchTerm }),
          ...(userSortField && { sortField: userSortField }),
          ...(userSortDirection && { sortDirection: userSortDirection }),
        });

        const response = await fetch(`/api/db/users?${params}`);
        const data: ApiResponse<{ users: User[]; total: number; totalPages: number }> = await response.json();
        const users = data.success && data.data ? data.data.users : [];

        if (!users.length) {
          showNotification('error', 'No users available to export');
          return;
        }

        const headers = ['User ID', 'Name', 'Department', 'Designation', 'Joined Date', 'Relived Date'];

        const escapeCsv = (value: string | number | null | undefined) =>
          `"${(value ?? '').toString().replace(/"/g, '""')}"`;

        const formatDate = (value: Date | string | null | undefined) => {
          if (!value) return '';
          const date = value instanceof Date ? value : new Date(value);
          return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
        };

        const csvContent = [
          headers.join(','),
          ...users.map(user => [
            escapeCsv(user.userId),
            escapeCsv(user.name),
            escapeCsv(user.designationDepartment || ''),
            escapeCsv(user.designation || ''),
            escapeCsv(formatDate(user.joinDate)),
            escapeCsv(formatDate(user.relievingDate))
          ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('success', 'Users exported successfully');
      } catch (error) {
        console.error('Error exporting users:', error);
        showNotification('error', 'Failed to export users');
      }
    },
    handleSaveFingerprint: async (userId: string, deviceIp: string, devicePort?: number) => {
      setIsSavingFingerprint(true);
      try {
        // Call API endpoint to trigger PowerShell script and save fingerprint data
        const response = await fetch('/api/fingerprint/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            deviceIp,
            port: devicePort || selectedDevice?.port || 4370,
          }),
        });
        
        const data: ApiResponse<any> = await response.json();
        
        if (data.success) {
          showNotification('success', `Fingerprint data saved successfully for user ${userId}`);
        } else {
          throw new Error(data.error || 'Failed to save fingerprint data');
        }
      } catch (error: any) {
        showNotification('error', error.message || 'Failed to save fingerprint data');
        throw error;
      } finally {
        setIsSavingFingerprint(false);
      }
    },
    isSavingFingerprint,
    // Sync confirmation
    showSyncUsersConfirmation,
    setShowSyncUsersConfirmation,
    pendingSyncAction,
    setPendingSyncAction,
  };
}
