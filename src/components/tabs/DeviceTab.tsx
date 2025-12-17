import React, { useState, useEffect } from 'react';
import { 
  Wifi, WifiOff, Server, RefreshCw, Trash2, Settings, 
  CloudUpload, AlertCircle, Check, Square, Clock 
} from 'lucide-react';
import { format } from 'date-fns';
import { Device, DeviceInfo } from '@/types';
import DeviceModal from '@/components/DeviceModal';
import DeleteModal from '@/components/DeleteModal';
import DeviceTimeModal from '@/components/DeviceTimeModal';
import InfoItem from '@/components/InfoItem';
import { formatDeviceTimestamp } from '@/lib/utils';

interface DeviceTabProps {
  devices: Device[];
  selectedDevice: Device | null;
  isLoadingDevices: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  isSyncingAll: boolean;
  isLoading: boolean;
  syncProgress: { 
    progress: number; 
    message: string; 
    phase: string;
    results?: {
      users: { synced: number; updated: number; skipped: number };
      logs: { synced: number; skipped: number };
      duration: number;
    };
  } | null;
  syncAllProgress: {
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
  } | null;
  deviceSyncResults: Map<number, {
    users: { synced: number; updated: number; skipped: number };
    logs: { synced: number; skipped: number };
    fingerprints?: { saved: number; updated: number; errors: number };
    duration: number;
    timestamp: Date;
  }>;
  deviceInfo: (DeviceInfo & { deviceTime?: string }) | null;
  connectionError: string | null;
  showDeviceModal: boolean;
  isEditingDevice: boolean;
  editingDevice: Device | null;
  isAddingDevice: boolean;
  handleSyncToDatabase: () => Promise<void>;
  handleSyncAllDevices: () => Promise<void>;
  handleSyncUsersOnly: () => Promise<void>;
  handleSyncUsersOnlyAll: () => Promise<void>;
  handleStopSync: () => Promise<void>;
  handleOpenAddModal: () => void;
  handleStartEdit: (device: Device) => void;
  handleSelectDevice: (device: Device) => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleDeleteDevice: (device: Device) => Promise<void>;
  handleAddDevice: (deviceData: { name: string; ip: string; serialNumber: string }) => Promise<void>;
  handleUpdateDevice: (deviceData: { id: number; name: string; ip: string; port: number; serialNumber: string }) => Promise<void>;
  handleGetDeviceTime: (device: Device) => Promise<void>;
  handleSetDeviceTime: (device: Device) => Promise<void>;
  setShowDeviceModal: (show: boolean) => void;
}

export default function DeviceTab({
  devices,
  selectedDevice,
  isLoadingDevices,
  isConnected,
  isConnecting,
  isSyncing,
  isSyncingAll,
  isLoading,
  syncProgress,
  syncAllProgress,
  deviceSyncResults,
  deviceInfo,
  connectionError,
  showDeviceModal,
  isEditingDevice,
  editingDevice,
  isAddingDevice,
  handleSyncToDatabase,
  handleSyncAllDevices,
  handleSyncUsersOnly,
  handleSyncUsersOnlyAll,
  handleStopSync,
  handleOpenAddModal,
  handleStartEdit,
  handleSelectDevice,
  handleDisconnect,
  handleDeleteDevice,
  handleAddDevice,
  handleUpdateDevice,
  handleGetDeviceTime,
  handleSetDeviceTime,
  setShowDeviceModal
}: DeviceTabProps) {
  const [pendingSyncDeviceId, setPendingSyncDeviceId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [isDeletingDevice, setIsDeletingDevice] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeModalDevice, setTimeModalDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (pendingSyncDeviceId && isConnected && selectedDevice?.id === pendingSyncDeviceId) {
      handleSyncToDatabase();
      setPendingSyncDeviceId(null);
    }
  }, [pendingSyncDeviceId, isConnected, selectedDevice, handleSyncToDatabase]);

  const handleSyncClick = async (device: Device) => {
    if (isSyncing || isSyncingAll) return;
    
    if (selectedDevice?.id === device.id && isConnected) {
      await handleSyncToDatabase();
    } else {
      setPendingSyncDeviceId(device.id);
      await handleSelectDevice(device);
    }
  };

  const handleDeleteClick = (device: Device) => {
    setDeviceToDelete(device);
    setShowDeleteModal(true);
  };

  const handleTimeClick = (device: Device) => {
    setTimeModalDevice(device);
    setShowTimeModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deviceToDelete) return;
    
    setIsDeletingDevice(true);
    try {
      await handleDeleteDevice(deviceToDelete);
      setShowDeleteModal(false);
      setDeviceToDelete(null);
    } catch (error) {
      console.error('Error deleting device:', error);
    } finally {
      setIsDeletingDevice(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center">
            <CloudUpload className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Data Synchronization</h3>
            <p className="text-sm text-muted-foreground">Sync users and attendance logs from device(s) to database</p>
          </div>
        </div>

          <div className="space-y-4">
            <div className="bg-secondary/30 rounded-lg p-4 border border-border/50">
              <p className="text-sm text-muted-foreground mb-2">Sync users and attendance logs from device(s) to your database.</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Users will be added or updated based on their device UID</li>
                <li>Attendance logs will be synced with duplicate detection</li>
                <li>The sync process may take several minutes for large datasets</li>
                <li>Multiple devices will be synced sequentially (one at a time)</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                {devices.length > 1 && (
                  <>
                    <button
                      onClick={handleSyncAllDevices}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/25"
                      disabled={isSyncingAll || isSyncing || isLoading || devices.length === 0}
                    >
                      <CloudUpload className={`w-4 h-4 ${isSyncingAll ? 'animate-bounce' : ''}`} />
                      {isSyncingAll && syncAllProgress ? `Syncing All (${syncAllProgress.current}/${syncAllProgress.total})...` : `Sync All Devices (${devices.length})`}
                    </button>
                    <button
                      onClick={handleSyncUsersOnlyAll}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-accent/25"
                      disabled={isSyncingAll || isSyncing || isLoading || devices.length === 0}
                      title="Sync users only (no attendance logs)"
                    >
                      <CloudUpload className={`w-4 h-4 ${isSyncingAll ? 'animate-bounce' : ''}`} />
                      {isSyncingAll && syncAllProgress ? `Syncing Users (${syncAllProgress.current}/${syncAllProgress.total})...` : `Sync Users Only (${devices.length})`}
                    </button>
                  </>
                )}
                {(isSyncing || isSyncingAll) && (
                  <button
                    onClick={handleStopSync}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-destructive hover:bg-destructive/90 text-white rounded-lg font-medium text-sm transition-all hover:shadow-lg hover:shadow-destructive/25"
                    title="Stop the current sync operation"
                  >
                    <Square className="w-4 h-4" />
                    Stop Sync
                  </button>
                )}
              </div>
              {isConnected && devices.length <= 1 && (
                <div className="flex gap-3">
                  <button
                    onClick={handleSyncUsersOnly}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-accent/25"
                    disabled={isSyncing || isLoading}
                    title="Sync users only (no attendance logs)"
                  >
                    <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                    {isSyncing ? 'Syncing Users...' : 'Sync Users Only'}
                  </button>
                  {isSyncing && (
                    <button
                      onClick={handleStopSync}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-destructive hover:bg-destructive/90 text-white rounded-lg font-medium text-sm transition-all hover:shadow-lg hover:shadow-destructive/25"
                      title="Stop the current sync operation"
                    >
                      <Square className="w-4 h-4" />
                      Stop Sync
                    </button>
                  )}
                </div>
              )}
            </div>

          {!isConnected && devices.length <= 1 && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> Click "Sync" on a device below to start
            </p>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Registered Devices</h3>
              <p className="text-sm text-muted-foreground">Manage your ESSL devices</p>
            </div>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Settings className="w-4 h-4" /> Add Device
          </button>
        </div>

        {isLoadingDevices ? (
          <div className="text-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading devices...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-8">
            <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="font-semibold mb-2">No Devices Registered</h4>
            <p className="text-sm text-muted-foreground mb-4">Add your first device to get started</p>
            <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all mx-auto">
              <Settings className="w-4 h-4" /> Add Device
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const isSyncingThis = (isSyncing && selectedDevice?.id === device.id && !isSyncingAll) || (isSyncingAll && syncAllProgress?.deviceName === device.name);
              const isConnectedThis = (!isSyncingAll && isConnected && selectedDevice?.id === device.id) || (isSyncingAll && syncAllProgress?.deviceName === device.name);
              
              return (
                <div key={device.id} className={`p-4 rounded-lg border transition-all ${isSyncingThis ? 'border-primary bg-primary/5' : 'border-border bg-secondary/30 hover:border-primary/30'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <h4 className="font-semibold text-base sm:text-lg">{device.name}</h4>
                        {isSyncingThis ? (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Syncing
                          </span>
                        ) : isConnectedThis && (
                          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Connected
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                        <span className="font-mono break-all">{device.ip}:{device.port}</span>
                        {device.serialNumber && <span className="font-mono break-all">SN: {device.serialNumber}</span>}
                        {device.deviceModel && <span className="text-primary break-all">{device.deviceModel}</span>}
                        {device.lastLogSyncTime && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 break-all">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span className="break-words">Last log: {formatDeviceTimestamp(new Date(device.lastLogSyncTime), 'MMM dd, yyyy h:mm a')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <button 
                        onClick={() => handleSyncClick(device)} 
                        disabled={isConnecting || isSyncing || isSyncingAll} 
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                        title="Sync users and logs"
                      >
                        {isConnecting && selectedDevice?.id === device.id ? (
                          <><RefreshCw className="w-3 h-3 animate-spin" /> <span className="hidden sm:inline">Connecting...</span><span className="sm:hidden">Conn...</span></>
                        ) : isSyncingThis ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" /> 
                            <span className="hidden sm:inline">
                              {syncProgress?.phase === 'users' ? 'Syncing Users...' : 
                               syncProgress?.phase === 'logs' ? 'Syncing Logs...' : 
                               'Syncing...'}
                            </span>
                            <span className="sm:hidden">
                              {syncProgress?.phase === 'users' ? 'Users...' : 
                               syncProgress?.phase === 'logs' ? 'Logs...' : 
                               'Sync...'}
                            </span>
                          </>
                        ) : (
                          <><CloudUpload className="w-3 h-3" /> <span className="hidden sm:inline">Sync</span></>
                        )}
                      </button>
                      {isConnected && selectedDevice?.id === device.id && !isSyncingThis && (
                        <button 
                          onClick={handleSyncUsersOnly} 
                          disabled={isConnecting || isSyncing || isSyncingAll} 
                          className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                          title="Sync users only (no logs)"
                        >
                          <><CloudUpload className="w-3 h-3" /> <span className="hidden sm:inline">Users</span></>
                        </button>
                      )}

                      <button 
                        onClick={() => handleTimeClick(device)} 
                        disabled={isConnecting || isSyncing || isSyncingAll} 
                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                        title="Manage device time"
                      >
                        <Clock className="w-3 h-3" />
                      </button>

                      <button onClick={() => handleStartEdit(device)} disabled={(isConnected && selectedDevice?.id === device.id) || isSyncing || isSyncingAll} className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex-shrink-0">Edit</button>
                      <button onClick={() => handleDeleteClick(device)} disabled={(isConnected && selectedDevice?.id === device.id) || isSyncing || isSyncingAll || isDeletingDevice} className="px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex-shrink-0"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>

                  {(isSyncingThis || deviceSyncResults.has(device.id)) && (
                    <div className="mt-4 pt-4 border-t border-border/50 animate-fade-in">
                        {isSyncingThis && syncProgress ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{syncProgress.message}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-accent">{syncProgress.progress}%</span>
                              <button
                                onClick={handleStopSync}
                                className="px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded text-xs font-medium transition-all flex items-center gap-1"
                                title="Stop sync"
                              >
                                <Square className="w-3 h-3" />
                                Stop
                              </button>
                            </div>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-accent to-primary transition-all duration-300 ease-out"
                              style={{ width: `${syncProgress.progress}%` }}
                            />
                          </div>
                          {syncProgress.results && (
                            <div className={`grid gap-2 text-xs mt-2 ${
                              (syncProgress.results as any).fingerprints 
                                ? (syncProgress.results.logs.synced > 0 ? 'grid-cols-3' : 'grid-cols-2')
                                : (syncProgress.results.logs.synced > 0 ? 'grid-cols-2' : 'grid-cols-1')
                            }`}>
                              <div className="bg-secondary/50 rounded p-2">
                                <div className="font-semibold text-primary mb-1">Users</div>
                                <div className="space-y-0.5 text-muted-foreground">
                                  <div>New: <span className="text-accent">{syncProgress.results.users.synced}</span></div>
                                  <div>Updated: <span className="text-accent">{syncProgress.results.users.updated}</span></div>
                                  <div>Skipped: <span className="text-muted-foreground">{syncProgress.results.users.skipped}</span></div>
                                </div>
                              </div>
                              {(syncProgress.results as any).fingerprints && (
                                <div className="bg-secondary/50 rounded p-2">
                                  <div className="font-semibold text-primary mb-1">Fingerprints</div>
                                  <div className="space-y-0.5 text-muted-foreground">
                                    <div>New: <span className="text-accent">{(syncProgress.results as any).fingerprints.saved}</span></div>
                                    <div>Updated: <span className="text-accent">{(syncProgress.results as any).fingerprints.updated}</span></div>
                                    {(syncProgress.results as any).fingerprints.errors > 0 && (
                                      <div>Errors: <span className="text-destructive">{(syncProgress.results as any).fingerprints.errors}</span></div>
                                    )}
                                    {syncProgress.results.duration && (
                                      <div className="text-xs mt-1 pt-1 border-t border-border/30">
                                        Duration: {(syncProgress.results.duration / 1000).toFixed(1)}s
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {syncProgress.results.logs.synced > 0 && (
                                <div className="bg-secondary/50 rounded p-2">
                                  <div className="font-semibold text-primary mb-1">Logs</div>
                                  <div className="space-y-0.5 text-muted-foreground">
                                    <div>Synced: <span className="text-accent">{syncProgress.results.logs.synced}</span></div>
                                    <div>Skipped: <span className="text-muted-foreground">{syncProgress.results.logs.skipped}</span></div>
                                    {syncProgress.results.duration && !(syncProgress.results as any).fingerprints && (
                                      <div className="text-xs mt-1 pt-1 border-t border-border/30">
                                        Duration: {(syncProgress.results.duration / 1000).toFixed(1)}s
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {['Users', 'Logs', 'Complete'].map((phase) => (
                              <span key={phase} className={`px-2 py-0.5 rounded ${syncProgress.phase === phase.toLowerCase() ? 'bg-accent/20 text-accent' : 'bg-secondary'}`}>
                                {phase}
                              </span>
                            ))}
                          </div>
                        </div>
                       ) : deviceSyncResults.has(device.id) ? (
                         (() => {
                           const results = deviceSyncResults.get(device.id)!;
                           // Show fingerprints if they exist (users-only sync), otherwise show logs
                           const showFingerprints = !!results.fingerprints;
                           return (
                             <div className="space-y-2">
                               <div className="text-xs text-muted-foreground mb-2">
                                 Last sync: {formatDeviceTimestamp(results.timestamp, 'MMM dd, yyyy h:mm a')}
                               </div>
                               <div className="grid grid-cols-2 gap-2 text-xs">
                                 <div className="bg-secondary/50 rounded p-2">
                                   <div className="font-semibold text-primary mb-1">Users</div>
                                   <div className="space-y-0.5 text-muted-foreground">
                                     <div>New: <span className="text-accent">{results.users.synced}</span></div>
                                     <div>Updated: <span className="text-accent">{results.users.updated}</span></div>
                                     <div>Skipped: <span className="text-muted-foreground">{results.users.skipped}</span></div>
                                   </div>
                                 </div>
                                 {showFingerprints ? (
                                   <div className="bg-secondary/50 rounded p-2">
                                     <div className="font-semibold text-primary mb-1">Fingerprints</div>
                                     <div className="space-y-0.5 text-muted-foreground">
                                        <div>New: <span className="text-accent">{results.fingerprints?.saved ?? 0}</span></div>
                                        <div>Updated: <span className="text-accent">{results.fingerprints?.updated ?? 0}</span></div>
                                        {(results.fingerprints?.errors ?? 0) > 0 && (
                                          <div>Errors: <span className="text-destructive">{results.fingerprints?.errors ?? 0}</span></div>
                                       )}
                                       {results.duration > 0 && (
                                         <div className="text-xs mt-1 pt-1 border-t border-border/30">
                                           Duration: {(results.duration / 1000).toFixed(1)}s
                                         </div>
                                       )}
                                     </div>
                                   </div>
                                 ) : (
                                   <div className="bg-secondary/50 rounded p-2">
                                     <div className="font-semibold text-primary mb-1">Logs</div>
                                     <div className="space-y-0.5 text-muted-foreground">
                                       <div>Synced: <span className="text-accent">{results.logs.synced}</span></div>
                                       <div>Skipped: <span className="text-muted-foreground">{results.logs.skipped}</span></div>
                                       {results.duration > 0 && (
                                         <div className="text-xs mt-1 pt-1 border-t border-border/30">
                                           Duration: {(results.duration / 1000).toFixed(1)}s
                                         </div>
                                       )}
                                     </div>
                                   </div>
                                 )}
                               </div>
                             </div>
                           );
                         })()
                       ) : (
                         <div className="text-sm text-muted-foreground">
                           Preparing sync...
                         </div>
                       )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeviceModal
        show={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
        isEditing={isEditingDevice}
        editingDevice={editingDevice}
        onAdd={handleAddDevice}
        onUpdate={handleUpdateDevice}
        isConnected={isConnected}
        isAddingDevice={isAddingDevice}
      />

      <DeleteModal
        show={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeviceToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Device"
        itemName={deviceToDelete?.name || ''}
        itemType="device"
        warningMessage={deviceToDelete && isConnected && selectedDevice?.id === deviceToDelete.id 
          ? "This device is currently connected. Please disconnect before deleting."
          : "This action cannot be undone. All device records will be removed from the database."}
        isDeleting={isDeletingDevice}
        icon={Trash2}
      />

      <DeviceTimeModal
        show={showTimeModal}
        onClose={() => {
          setShowTimeModal(false);
          setTimeModalDevice(null);
        }}
        device={timeModalDevice}
        onGetTime={handleGetDeviceTime}
        onSetTime={handleSetDeviceTime}
      />

      {connectionError && selectedDevice && (
        <div className="glass-card rounded-xl p-4 border border-destructive/20 bg-destructive/10">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" /> <span>{connectionError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
