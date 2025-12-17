import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Settings, Network, RefreshCw, Check, X,
    AlertCircle
} from 'lucide-react';
import { Device } from '@/types';

interface DeviceModalProps {
    show: boolean;
    onClose: () => void;
    isEditing: boolean;
    editingDevice: Device | null;
    onAdd: (device: { name: string; ip: string; serialNumber: string; deviceModel?: string | null; password?: string | null }) => Promise<void>;
    onUpdate: (device: { id: number; name: string; ip: string; port: number; serialNumber: string; deviceModel?: string | null; password?: string | null }) => Promise<void>;
    isConnected: boolean;
    isAddingDevice: boolean;
}

export default function DeviceModal({
    show,
    onClose,
    isEditing,
    editingDevice,
    onAdd,
    onUpdate,
    isConnected,
    isAddingDevice
}: DeviceModalProps) {
    const [deviceName, setDeviceName] = useState('');
    const [deviceIp, setDeviceIp] = useState('');
    const [devicePort, setDevicePort] = useState('4370');
    const [deviceSerial, setDeviceSerial] = useState('');
    const [deviceModel, setDeviceModel] = useState('');
    const [devicePassword, setDevicePassword] = useState('');
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Reset or populate form when modal opens/changes
    useEffect(() => {
        if (show) {
            if (isEditing && editingDevice) {
                setDeviceName(editingDevice.name);
                setDeviceIp(editingDevice.ip);
                setDevicePort(editingDevice.port.toString());
                setDeviceSerial(editingDevice.serialNumber || '');
                setDeviceModel(editingDevice.deviceModel || '');
                setDevicePassword(''); // Don't populate password when editing for security
            } else {
                setDeviceName('');
                setDeviceIp('');
                setDevicePort('4370');
                setDeviceSerial('');
                setDeviceModel('');
                setDevicePassword('');
            }
            setFetchError(null);
        }
    }, [show, isEditing, editingDevice]);

    const handleFetchDeviceInfo = async () => {
        if (!deviceIp) {
            setFetchError('Please enter an IP address first');
            return;
        }

        setIsFetchingInfo(true);
        setFetchError(null);

        try {
            const response = await fetch('/api/device/info/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: deviceIp,
                    port: parseInt(devicePort) || 4370,
                    password: devicePassword.trim() || null,
                }),
            });

            const data = await response.json();

            if (data.success && data.data) {
                if (data.data.serialNumber) {
                    setDeviceSerial(data.data.serialNumber);
                }
                if (data.data.deviceModel) {
                    setDeviceModel(data.data.deviceModel);
                }
                if (data.data.deviceName && !deviceName) {
                    setDeviceName(data.data.deviceName);
                }

                // Save password to database after successful fetch
                // Use provided password or default to "000000" if empty
                const finalPassword = devicePassword.trim() || '000000';
                try {
                    if (isEditing && editingDevice) {
                        // Update existing device password
                        await fetch('/api/devices', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: editingDevice.id,
                                password: finalPassword,
                            }),
                        });
                    } else {
                        // Check if device exists by IP, if so update password
                        const devicesResponse = await fetch('/api/devices');
                        const devicesData = await devicesResponse.json();
                        if (devicesData.success && devicesData.data) {
                            const existingDevice = devicesData.data.find((d: any) => d.ip === deviceIp);
                            if (existingDevice) {
                                // Update existing device password
                                await fetch('/api/devices', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        id: existingDevice.id,
                                        password: finalPassword,
                                    }),
                                });
                            }
                        }
                    }
                } catch (saveError) {
                    // Don't fail the fetch if password save fails, just log it
                    console.warn('Failed to save password to database:', saveError);
                }
            } else {
                setFetchError(data.error || 'Failed to fetch device info');
            }
        } catch (error) {
            setFetchError('Failed to connect to device. Please check IP and port.');
        } finally {
            setIsFetchingInfo(false);
        }
    };

    const handleSubmit = async () => {
        let finalSerial = deviceSerial;
        let finalModel = deviceModel;
        let finalName = deviceName;

        // Auto-fetch device info if serial number or device model is missing
        if ((!deviceSerial || !deviceModel) && deviceIp) {
            setIsFetchingInfo(true);
            setFetchError(null);

            try {
                const response = await fetch('/api/device/info/fetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ip: deviceIp,
                        port: parseInt(devicePort) || 4370,
                        password: devicePassword.trim() || null,
                    }),
                });

                const data = await response.json();

                if (data.success && data.data) {
                    // Use fetched values if current values are empty
                    if (data.data.serialNumber && !finalSerial) {
                        finalSerial = data.data.serialNumber;
                        setDeviceSerial(data.data.serialNumber);
                    }
                    if (data.data.deviceModel && !finalModel) {
                        finalModel = data.data.deviceModel;
                        setDeviceModel(data.data.deviceModel);
                    }
                    if (data.data.deviceName && !finalName) {
                        finalName = data.data.deviceName;
                        setDeviceName(data.data.deviceName);
                    }
                } else {
                    // If fetch fails but we have required fields, continue anyway
                    console.warn('Failed to auto-fetch device info:', data.error);
                }
            } catch (error) {
                // If fetch fails but we have required fields, continue anyway
                console.warn('Failed to auto-fetch device info:', error);
            } finally {
                setIsFetchingInfo(false);
            }
        }

        // Submit with the final values (fetched or existing)
        const finalPassword = devicePassword.trim() || null; // Will default to "000000" in API if null
        if (isEditing && editingDevice) {
            await onUpdate({
                id: editingDevice.id,
                name: finalName,
                ip: deviceIp,
                port: parseInt(devicePort) || 4370,
                serialNumber: finalSerial || '',
                deviceModel: finalModel || null,
                password: finalPassword
            });
        } else {
            await onAdd({
                name: finalName,
                ip: deviceIp,
                serialNumber: finalSerial || '',
                deviceModel: finalModel || null,
                password: finalPassword
            });
        }
    };

    if (!show || typeof window === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
        >
            <div
                className="glass-card rounded-xl w-full max-w-md animate-slide-in-up flex flex-col"
                style={{ maxHeight: '90vh' }}
            >
                {/* Fixed Header */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50 flex-shrink-0 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                            {isEditing ? <Settings className="w-5 h-5 text-primary" /> : <Network className="w-5 h-5 text-primary" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">{isEditing ? 'Edit Device' : 'Add New Device'}</h3>
                            <p className="text-sm text-muted-foreground">{isEditing ? 'Update device configuration' : 'Register a new ESSL device'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-lg transition-all flex-shrink-0"
                        disabled={isAddingDevice}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 pt-4">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                Device Name
                            </label>
                            <input
                                type="text"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="e.g., Main Entrance Device"
                                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                                disabled={isConnected || isAddingDevice}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                    IP Address
                                </label>
                                <div className="relative">
                                    <Network className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        value={deviceIp}
                                        onChange={(e) => setDeviceIp(e.target.value)}
                                        placeholder="192.168.1.201"
                                        className="w-full pl-10 pr-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 transition-all"
                                        disabled={isConnected || isAddingDevice}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                    Port
                                </label>
                                <input
                                    type="text"
                                    value={devicePort}
                                    onChange={(e) => setDevicePort(e.target.value)}
                                    placeholder="4370"
                                    className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 transition-all"
                                    disabled={isConnected || isAddingDevice}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                Password (COM)
                            </label>
                            <input
                                type="text"
                                value={devicePassword}
                                onChange={(e) => setDevicePassword(e.target.value)}
                                placeholder="Enter device password"
                                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 transition-all"
                                disabled={isConnected || isAddingDevice}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">Leave empty to use default password</p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                Serial Number <span className="text-muted-foreground/70 font-normal">(Auto-filled)</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={deviceSerial}
                                    readOnly
                                    className="flex-1 px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm font-mono cursor-not-allowed opacity-70"
                                    placeholder="Will be fetched automatically"
                                />
                                <button
                                    type="button"
                                    onClick={handleFetchDeviceInfo}
                                    disabled={isConnected || isAddingDevice || isFetchingInfo || !deviceIp}
                                    className="px-4 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    title="Fetch device information"
                                >
                                    {isFetchingInfo ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /> Fetching...</>
                                    ) : (
                                        <><RefreshCw className="w-4 h-4" /> Fetch Info</>
                                    )}
                                </button>
                            </div>
                            {fetchError && (
                                <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> {fetchError}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                Device Model <span className="text-muted-foreground/70 font-normal">(Auto-filled)</span>
                            </label>
                            <input
                                type="text"
                                value={deviceModel}
                                readOnly
                                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm cursor-not-allowed opacity-70"
                                placeholder="Will be fetched automatically"
                            />
                        </div>

                    </div>
                </div>

                {/* Fixed Footer */}
                <div className="flex gap-3 p-6 pt-4 border-t border-border/50 flex-shrink-0 sticky bottom-0 bg-card/95 backdrop-blur-sm">
                    <button
                        onClick={handleSubmit}
                        disabled={isAddingDevice || !deviceName || !deviceIp || isConnected}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAddingDevice ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                {isEditing ? 'Updating...' : 'Adding...'}
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                {isEditing ? 'Update Device' : 'Add Device'}
                            </>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={isAddingDevice}
                        className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

