import { zkDevice } from "@/lib/zkDevice";
import { db, schema } from "@/lib/drizzle/db";
import { eq, and, sql, isNotNull, or, inArray } from "drizzle-orm";
import { Device } from "@/types";
import { parseDeviceTimestamp } from "@/lib/utils";

interface SyncState {
    isSyncing: boolean;
    phase: 'idle' | 'users' | 'logs' | 'complete' | 'error';
    status: string;
    message: string;
    progress: number;
    current: number;
    total: number;
    results: {
        users: { synced: number; updated: number; skipped: number };
        logs: { synced: number; skipped: number };
        fingerprints?: { saved: number; updated: number; errors: number };
        duration: number;
    };
    error?: string;
    startTime?: number;

    // Multi-device support
    isMultiDevice: boolean;
    currentDeviceIndex: number;
    totalDevices: number;
    currentDeviceName?: string;
    deviceResults: Array<{
        deviceName: string;
        deviceIp: string;
        success: boolean;
        users: { synced: number; updated: number; skipped: number };
        logs: { synced: number; skipped: number };
        fingerprints?: { saved: number; updated: number; errors: number };
        error?: string;
    }>;
}

type SyncListener = (state: SyncState) => void;

const globalForSync = globalThis as unknown as {
    syncManager: SyncManager | undefined;
};

export class SyncManager {
    private state: SyncState = {
        isSyncing: false,
        phase: 'idle',
        status: 'idle',
        message: '',
        progress: 0,
        current: 0,
        total: 0,
        results: {
            users: { synced: 0, updated: 0, skipped: 0 },
            logs: { synced: 0, skipped: 0 },
            duration: 0
        },
        isMultiDevice: false,
        currentDeviceIndex: 0,
        totalDevices: 0,
        deviceResults: []
    };

    private listeners: Set<SyncListener> = new Set();
    private shouldStop: boolean = false;

    constructor() { }

    getState(): SyncState {
        return { ...this.state };
    }

    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => {
            this.listeners.delete(listener);
        };
    }

    private updateState(updates: Partial<SyncState>) {
        this.state = { ...this.state, ...updates };
        this.listeners.forEach(listener => listener(this.getState()));
    }

    stopSync() {
        this.shouldStop = true;
    }

    async startSyncAll(devices: Device[]) {
        if (this.state.isSyncing) {
            console.log('Sync already in progress');
            return;
        }

        this.shouldStop = false;
        const startTime = Date.now();

        this.updateState({
            isSyncing: true,
            isMultiDevice: true,
            phase: 'idle',
            status: 'starting',
            message: `Starting sync for ${devices.length} devices...`,
            progress: 0,
            startTime,
            totalDevices: devices.length,
            currentDeviceIndex: 0,
            deviceResults: [],
            results: {
                users: { synced: 0, updated: 0, skipped: 0 },
                logs: { synced: 0, skipped: 0 },
                duration: 0
            }
        });

        const overallResults = {
            users: { synced: 0, updated: 0, skipped: 0 },
            logs: { synced: 0, skipped: 0 },
            duration: 0
        };

        try {
            for (let i = 0; i < devices.length; i++) {
                if (this.shouldStop) {
                    throw new Error("Sync cancelled by user");
                }

                const device = devices[i];
                this.updateState({
                    currentDeviceIndex: i + 1,
                    currentDeviceName: device.name,
                    message: `Connecting to ${device.name} (${i + 1}/${devices.length})...`,
                    progress: Math.round((i / devices.length) * 100)
                });

                // Connect with password authentication
                try {
                    const connected = await zkDevice.connect({
                        ip: device.ip,
                        port: device.port,
                        timeout: 20000,
                        password: device.password || null
                    });

                    if (!connected) {
                        this.state.deviceResults.push({
                            deviceName: device.name,
                            deviceIp: device.ip,
                            success: false,
                            users: { synced: 0, updated: 0, skipped: 0 },
                            logs: { synced: 0, skipped: 0 },
                            error: "Connection failed"
                        });
                        continue;
                    }
                } catch (connectError: any) {
                    // Handle authentication errors
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: false,
                        users: { synced: 0, updated: 0, skipped: 0 },
                        logs: { synced: 0, skipped: 0 },
                        error: connectError.message || "Connection failed"
                    });
                    continue;
                }

                // Sync individual device
                try {
                    const deviceResult = await this.syncDevice(device);
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: true,
                        users: deviceResult.users,
                        logs: deviceResult.logs
                    });

                    // Aggregate results
                    overallResults.users.synced += deviceResult.users.synced;
                    overallResults.users.updated += deviceResult.users.updated;
                    overallResults.users.skipped += deviceResult.users.skipped;
                    overallResults.logs.synced += deviceResult.logs.synced;
                    overallResults.logs.skipped += deviceResult.logs.skipped;

                } catch (err) {
                    console.error(`Error syncing device ${device.name}:`, err);
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: false,
                        users: { synced: 0, updated: 0, skipped: 0 },
                        logs: { synced: 0, skipped: 0 },
                        error: err instanceof Error ? err.message : "Unknown error"
                    });
                } finally {
                    await zkDevice.disconnect();
                }

                this.updateState({
                    deviceResults: [...this.state.deviceResults],
                    results: { ...overallResults, duration: Date.now() - startTime }
                });
            }

            this.updateState({
                isSyncing: false,
                phase: 'complete',
                status: 'done',
                message: 'All devices sync complete!',
                progress: 100,
                results: { ...overallResults, duration: Date.now() - startTime }
            });

        } catch (error) {
            console.error("Sync All error:", error);

            // Disconnect device on error (including cancellation)
            if (zkDevice.isConnected()) {
                try {
                    await zkDevice.disconnect();
                } catch (disconnectError) {
                    console.error("Error disconnecting device after sync all error:", disconnectError);
                }
            }

            this.updateState({
                isSyncing: false,
                phase: 'error',
                status: 'error',
                message: error instanceof Error ? error.message : "Sync failed",
                error: error instanceof Error ? error.message : "Sync failed"
            });
        }
    }

    async startSyncUsersOnly() {
        if (this.state.isSyncing) return;

        this.shouldStop = false;
        const startTime = Date.now();

        this.updateState({
            isSyncing: true,
            isMultiDevice: false,
            phase: 'users',
            status: 'starting',
            message: 'Starting users sync...',
            progress: 0,
            startTime,
            results: {
                users: { synced: 0, updated: 0, skipped: 0 },
                logs: { synced: 0, skipped: 0 },
                duration: 0
            }
        });

        try {
            const config = zkDevice.getConfig();
            const deviceIp = config?.ip || "unknown";

            // Fetch device password from database
            let devicePassword: string | null = null;
            try {
                const deviceRecord = await db
                    .select({ password: schema.attDevices.password })
                    .from(schema.attDevices)
                    .where(eq(schema.attDevices.ip, deviceIp))
                    .limit(1);

                if (deviceRecord.length > 0) {
                    devicePassword = deviceRecord[0].password;
                }
            } catch (error) {
                console.warn(`Could not fetch device password for IP ${deviceIp}:`, error);
            }

            if (!zkDevice.isConnected() || config?.password !== devicePassword) {
                try {
                    const connected = await zkDevice.connect({
                        ip: config?.ip || deviceIp,
                        port: config?.port || 4370,
                        timeout: config?.timeout || 10000,
                        inport: config?.inport || 4000,
                        password: devicePassword
                    });
                    if (!connected) {
                        throw new Error("Device not connected");
                    }
                } catch (connectError: any) {
                    if (connectError.message && connectError.message.includes("Authentication failed")) {
                        throw new Error(connectError.message);
                    }
                    throw new Error("Device not connected");
                }
            }

            const result = await this.syncUsersOnly({
                name: "Device",
                ip: deviceIp
            } as any);

            this.updateState({
                isSyncing: false,
                phase: 'complete',
                status: 'done',
                message: 'Users sync complete!',
                progress: 100,
                results: {
                    ...result,
                    duration: Date.now() - startTime
                }
            });

            if (zkDevice.isConnected()) {
                await zkDevice.disconnect();
            }

        } catch (error) {
            // Disconnect device on error (including cancellation)
            if (zkDevice.isConnected()) {
                try {
                    await zkDevice.disconnect();
                } catch (disconnectError) {
                    console.error("Error disconnecting device after users sync error:", disconnectError);
                }
            }

            this.updateState({
                isSyncing: false,
                phase: 'error',
                status: 'error',
                message: error instanceof Error ? error.message : "Users sync failed",
                error: error instanceof Error ? error.message : "Users sync failed"
            });
        }
    }

    async startSyncUsersOnlyAll(devices: Device[]) {
        if (this.state.isSyncing) {
            console.log('Sync already in progress');
            return;
        }

        this.shouldStop = false;
        const startTime = Date.now();

        this.updateState({
            isSyncing: true,
            isMultiDevice: true,
            phase: 'idle',
            status: 'starting',
            message: `Starting users sync for ${devices.length} devices...`,
            progress: 0,
            startTime,
            totalDevices: devices.length,
            currentDeviceIndex: 0,
            deviceResults: [],
            results: {
                users: { synced: 0, updated: 0, skipped: 0 },
                logs: { synced: 0, skipped: 0 },
                duration: 0
            }
        });

        const overallResults = {
            users: { synced: 0, updated: 0, skipped: 0 },
            logs: { synced: 0, skipped: 0 },
            duration: 0
        };

        try {
            for (let i = 0; i < devices.length; i++) {
                if (this.shouldStop) {
                    throw new Error("Sync cancelled by user");
                }

                const device = devices[i];
                this.updateState({
                    currentDeviceIndex: i + 1,
                    currentDeviceName: device.name,
                    message: `Connecting to ${device.name} (${i + 1}/${devices.length})...`,
                    progress: Math.round((i / devices.length) * 100)
                });

                // Connect with password authentication
                try {
                    const connected = await zkDevice.connect({
                        ip: device.ip,
                        port: device.port,
                        timeout: 20000,
                        password: device.password || null
                    });

                    if (!connected) {
                        this.state.deviceResults.push({
                            deviceName: device.name,
                            deviceIp: device.ip,
                            success: false,
                            users: { synced: 0, updated: 0, skipped: 0 },
                            logs: { synced: 0, skipped: 0 },
                            error: "Connection failed"
                        });
                        continue;
                    }
                } catch (connectError: any) {
                    // Handle authentication errors
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: false,
                        users: { synced: 0, updated: 0, skipped: 0 },
                        logs: { synced: 0, skipped: 0 },
                        error: connectError.message || "Connection failed"
                    });
                    continue;
                }

                try {
                    const deviceResult = await this.syncUsersOnly(device);
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: true,
                        users: deviceResult.users,
                        logs: deviceResult.logs,
                        fingerprints: deviceResult.fingerprints
                    });

                    overallResults.users.synced += deviceResult.users.synced;
                    overallResults.users.updated += deviceResult.users.updated;
                    overallResults.users.skipped += deviceResult.users.skipped;

                } catch (err) {
                    console.error(`Error syncing users from device ${device.name}:`, err);
                    this.state.deviceResults.push({
                        deviceName: device.name,
                        deviceIp: device.ip,
                        success: false,
                        users: { synced: 0, updated: 0, skipped: 0 },
                        logs: { synced: 0, skipped: 0 },
                        error: err instanceof Error ? err.message : "Unknown error"
                    });
                } finally {
                    await zkDevice.disconnect();
                }

                this.updateState({
                    deviceResults: [...this.state.deviceResults],
                    results: { ...overallResults, duration: Date.now() - startTime }
                });
            }

            this.updateState({
                isSyncing: false,
                phase: 'complete',
                status: 'done',
                message: 'All devices users sync complete!',
                progress: 100,
                results: { ...overallResults, duration: Date.now() - startTime }
            });

        } catch (error) {
            console.error("Users Sync All error:", error);

            // Disconnect device on error (including cancellation)
            if (zkDevice.isConnected()) {
                try {
                    await zkDevice.disconnect();
                } catch (disconnectError) {
                    console.error("Error disconnecting device after users sync all error:", disconnectError);
                }
            }

            this.updateState({
                isSyncing: false,
                phase: 'error',
                status: 'error',
                message: error instanceof Error ? error.message : "Users sync failed",
                error: error instanceof Error ? error.message : "Users sync failed"
            });
        }
    }

    // Keep the original startSync for backward compatibility or single device sync
    // But modify it to use the shared syncDevice logic if possible, 
    // OR just wrap startSyncAll with one device.
    async startSync() {
        // If we are already connected, we sync that device.
        // But for consistency, let's just assume this is a legacy call 
        // that tries to sync whatever is connected or fails.
        // Better yet, let's just implement the logic using internal helper.

        if (this.state.isSyncing) return;

        // Reset shouldStop flag for new sync
        this.shouldStop = false;

        // If previous sync ended in error (e.g., was cancelled), disconnect to ensure clean state
        if (this.state.phase === 'error' && zkDevice.isConnected()) {
            try {
                await zkDevice.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }

        // Note: this legacy method relies on zkDevice already being connected or configured.
        // It's safer to use startSyncAll with a specific device if possible.
        // But the UI calls this via /api/sync/stream without args.
        // Let's assume it wants to sync the CURRENTLY connected device.

        if (!zkDevice.isConnected()) {
            // Try to connect to default or stored config?
            // If not possible, error out.
            // We'll leave the original logic mostly intact but refactored.
            // Or... we can deprecate this and force providing a device.
        }

        // For now, I'll reimplement it to match the old behavior but using the new structure.
        this.updateState({
            isSyncing: true,
            isMultiDevice: false,
            phase: 'users',
            status: 'starting',
            message: 'Starting sync...',
            progress: 0,
            startTime: Date.now(),
            results: {
                users: { synced: 0, updated: 0, skipped: 0 },
                logs: { synced: 0, skipped: 0 },
                duration: 0
            }
        });

        try {
            // Get config first to check if we have device info
            let config = zkDevice.getConfig();
            const deviceIp = config?.ip || "unknown";

            // Fetch device password from database
            let devicePassword: string | null = null;
            try {
                const deviceRecord = await db
                    .select({ password: schema.attDevices.password })
                    .from(schema.attDevices)
                    .where(eq(schema.attDevices.ip, deviceIp))
                    .limit(1);

                if (deviceRecord.length > 0) {
                    devicePassword = deviceRecord[0].password;
                }
            } catch (error) {
                console.warn(`Could not fetch device password for IP ${deviceIp}:`, error);
            }

            // If device is not connected, or if previous sync was cancelled (error state),
            // ensure we have a fresh connection with password
            if (!zkDevice.isConnected() || !config || !config.ip || config.password !== devicePassword) {
                try {
                    const connected = await zkDevice.connect({
                        ip: config?.ip || deviceIp,
                        port: config?.port || 4370,
                        timeout: config?.timeout || 10000,
                        inport: config?.inport || 4000,
                        password: devicePassword
                    });
                    if (!connected) {
                        throw new Error("Device not connected");
                    }
                    // Refresh config after connection
                    config = zkDevice.getConfig();
                    if (!config || !config.ip) {
                        throw new Error("Device not connected - unable to get device configuration");
                    }
                } catch (connectError: any) {
                    if (connectError.message && connectError.message.includes("Authentication failed")) {
                        throw new Error(connectError.message);
                    }
                    throw new Error("Device not connected");
                }
            }

            // Call internal sync
            const result = await this.syncDevice({
                name: "Device",
                ip: deviceIp
            } as any);

            this.updateState({
                isSyncing: false,
                phase: 'complete',
                status: 'done',
                message: 'Sync complete!',
                progress: 100,
                results: {
                    ...result,
                    duration: Date.now() - (this.state.startTime || 0)
                }
            });

            // Disconnect after sync
            if (zkDevice.isConnected()) {
                await zkDevice.disconnect();
            }

        } catch (error) {
            // Disconnect device on error (including cancellation)
            if (zkDevice.isConnected()) {
                try {
                    await zkDevice.disconnect();
                } catch (disconnectError) {
                    console.error("Error disconnecting device after sync error:", disconnectError);
                }
            }

            this.updateState({
                isSyncing: false,
                phase: 'error',
                status: 'error',
                message: error instanceof Error ? error.message : "Sync failed",
                error: error instanceof Error ? error.message : "Sync failed"
            });
        }
    }

    private async syncUsersOnly(device: Device): Promise<{
        users: { synced: number; updated: number; skipped: number };
        logs: { synced: number; skipped: number };
        fingerprints?: { saved: number; updated: number; errors: number };
    }> {
        const deviceIp = device.ip;

        // Get device ID from database using device IP
        let deviceId: number | null = null;
        try {
            const deviceRecord = await db
                .select()
                .from(schema.attDevices)
                .where(eq(schema.attDevices.ip, deviceIp))
                .limit(1);

            if (deviceRecord.length > 0) {
                deviceId = deviceRecord[0].id;
            }
        } catch (error) {
            console.error(`Error fetching device ID for IP ${deviceIp}:`, error);
        }

        // --- Users Only ---
        this.updateState({
            phase: 'users',
            status: 'fetching',
            message: `Fetching users from ${device.name}...`,
        });

        const users = await zkDevice.getUsers();
        const totalUsers = users.length;

        // Create uid -> userId mapping for matching templates later
        const uidToUserIdMap = new Map<number, string>();
        for (const user of users) {
            uidToUserIdMap.set(user.uid, user.userId);
        }

        let usersSynced = 0;
        let usersUpdated = 0;
        let usersSkipped = 0;
        let fingerprintsSaved = 0;
        let fingerprintsUpdated = 0;
        let fingerprintsErrors = 0;

        // Phase 1: Process all users first (without fetching fingerprints)
        for (let i = 0; i < users.length; i++) {
            if (this.shouldStop) throw new Error("Sync cancelled by user");

            const user = users[i];
            const userDisplayName = user.name || user.userId;

            // Update progress for each user individually
            const userProgress = Math.round(((i + 1) / totalUsers) * 100);
            this.updateState({
                message: `Processing user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})`,
                progress: userProgress,
                phase: 'users',
                current: i + 1,
                total: totalUsers,
            });

            try {
                // Show status: Checking user in database
                this.updateState({
                    message: `Checking user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId}) in database...`,
                    progress: userProgress,
                    phase: 'users',
                    current: i + 1,
                    total: totalUsers,
                });

                const existing = await db
                    .select()
                    .from(schema.attUsers)
                    .where(eq(schema.attUsers.userId, user.userId))
                    .limit(1);

                if (existing.length > 0) {
                    // Show status: Updating existing user
                    this.updateState({
                        message: `Updating user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})...`,
                        progress: userProgress,
                        phase: 'users',
                        current: i + 1,
                        total: totalUsers,
                    });

                    const existingUser = existing[0];
                    let shouldUpdate = false;
                    const updates: any = {};

                    // Check if existing name is just a number (e.g. "101") which implies it's a placeholder
                    const existingName = existingUser.name || '';
                    const isNameJustNumber = /^\d+$/.test(existingName.trim());

                    // Check if device returns a valid text name (has non-digits)
                    // Some devices only store names, so if DB has number and device has text, update name
                    const deviceNameIsText = user.name && !/^\d+$/.test(user.name.trim());

                    // Skip entire update if device returns numeric name (no meaningful data)
                    const deviceNameIsNumeric = user.name && /^\d+$/.test(user.name.trim());
                    if (deviceNameIsNumeric) {
                        usersSkipped++;
                        continue; // Skip this user entirely
                    }

                    // Update name if DB has number and device returns text name
                    if (isNameJustNumber && deviceNameIsText) {
                        updates.name = user.name;
                        shouldUpdate = true;
                    }

                    // Handle stored devices tracking
                    if (deviceId !== null) {
                        const currentStoredDevices = existingUser.storedDevices || '';
                        const storedDeviceIds = currentStoredDevices ? currentStoredDevices.split(',').map(id => id.trim()) : [];

                        if (!storedDeviceIds.includes(String(deviceId))) {
                            // Add device ID to stored devices
                            const updatedDevices = currentStoredDevices
                                ? `${currentStoredDevices},${deviceId}`
                                : String(deviceId);
                            updates.storedDevices = updatedDevices;
                            shouldUpdate = true;
                        }
                    }

                    // Handle role updates for admin tracking
                    if (deviceId !== null) {
                        const currentRole = String(existingUser.role || '0');
                        const isAdminOnDevice = user.role === 14;

                        if (isAdminOnDevice) {
                            // User is admin on this device
                            if (currentRole === '0' || !currentRole.startsWith('14')) {
                                // Not currently admin, set to admin on this device
                                updates.role = `14,${deviceId}`;
                                shouldUpdate = true;
                            } else {
                                // Already admin, check if device ID is in the list
                                const roleParts = currentRole.split(',');
                                const deviceIds = roleParts.slice(1); // Skip "14"
                                if (!deviceIds.includes(String(deviceId))) {
                                    // Add device ID to the list
                                    updates.role = `14,${deviceIds.concat(String(deviceId)).join(',')}`;
                                    shouldUpdate = true;
                                }
                            }
                        } else {
                            // User is not admin on this device
                            if (currentRole.startsWith('14')) {
                                // Currently admin, remove this device ID if present
                                const roleParts = currentRole.split(',');
                                const deviceIds = roleParts.slice(1); // Skip "14"
                                const filteredDeviceIds = deviceIds.filter(id => id !== String(deviceId));

                                if (filteredDeviceIds.length === 0) {
                                    // No more admin devices, set to regular user
                                    updates.role = '0';
                                } else {
                                    // Still admin on other devices
                                    updates.role = `14,${filteredDeviceIds.join(',')}`;
                                }
                                shouldUpdate = true;
                            }
                        }
                    } else {
                        // Device ID not found, use simple role update
                        if (user.role === 14) {
                            updates.role = '14';
                            shouldUpdate = true;
                        } else if (String(existingUser.role || '0') !== '0') {
                            // Only update if role was not 0
                            updates.role = '0';
                            shouldUpdate = true;
                        }
                    }

                    if (shouldUpdate) {
                        this.updateState({
                            message: `Saving user data ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})...`,
                            progress: userProgress,
                            phase: 'users',
                            current: i + 1,
                            total: totalUsers,
                        });

                        updates.updatedAt = new Date();
                        await db
                            .update(schema.attUsers)
                            .set(updates)
                            .where(eq(schema.attUsers.id, existingUser.id));

                        // Exclude admin users from updated count if update is only for device tracking
                        // Check if update includes name change (meaningful update) or only device tracking
                        const hasNameUpdate = 'name' in updates;
                        // Check if user is admin in database (role starts with "14")
                        const existingRole = String(existingUser.role || '0');
                        const isAdminInDb = existingRole.startsWith('14');
                        const isOnlyDeviceTracking = !hasNameUpdate && (updates.storedDevices !== undefined || updates.role !== undefined);

                        // Count update only if: not admin in DB, OR admin with name update, OR admin but not only device tracking
                        if (!isAdminInDb || hasNameUpdate || !isOnlyDeviceTracking) {
                            usersUpdated++;
                        }
                        console.log(`[Sync] User updated: ${user.userId} - "${user.name}"`);
                    } else {
                        usersSkipped++;
                    }
                } else {
                    // New user - insert with role based on admin status
                    this.updateState({
                        message: `Adding new user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})...`,
                        progress: userProgress,
                        phase: 'users',
                        current: i + 1,
                        total: totalUsers,
                    });

                    let roleValue = '0';
                    if (user.role === 14 && deviceId !== null) {
                        roleValue = `14,${deviceId}`;
                    } else if (user.role === 14) {
                        roleValue = '14';
                    }

                    // Store device ID for new users
                    const storedDevicesValue = deviceId !== null ? String(deviceId) : null;

                    this.updateState({
                        message: `Saving new user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})...`,
                        progress: userProgress,
                        phase: 'users',
                        current: i + 1,
                        total: totalUsers,
                    });

                    await db.insert(schema.attUsers).values({
                        userId: user.userId,
                        name: user.name,
                        role: roleValue,
                        cardNo: user.cardNo || null,
                        password: user.password || null,
                        storedDevices: storedDevicesValue,
                    });
                    usersSynced++;
                }
            } catch (error: any) {
                usersSkipped++;
                // Show error status
                this.updateState({
                    message: `Error processing user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId}) - ${error.message || 'Unknown error'}`,
                    progress: Math.round(((i + 1) / totalUsers) * 100),
                    phase: 'users',
                    current: i + 1,
                    total: totalUsers,
                });
            }

            // Update progress with results for every user (individual progress)
            const currentUserProgress = Math.round(((i + 1) / totalUsers) * 100);
            const fpMessage = fingerprintsSaved > 0 || fingerprintsUpdated > 0
                ? ` (${fingerprintsSaved + fingerprintsUpdated} fingerprints saved)`
                : '';

            // Update results after each user
            this.updateState({
                message: `Completed user ${i + 1}/${totalUsers}: ${userDisplayName} (ID: ${user.userId})${fpMessage}`,
                progress: currentUserProgress,
                phase: 'users',
                current: i + 1,
                total: totalUsers,
                results: {
                    users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                    logs: { synced: 0, skipped: 0 },
                    fingerprints: { saved: fingerprintsSaved, updated: fingerprintsUpdated, errors: fingerprintsErrors },
                    duration: Date.now() - (this.state.startTime || Date.now())
                }
            });

            // Log summary every 100 users or at completion
            if ((i + 1) % 100 === 0 || i === users.length - 1) {
                console.log(`[Sync Users] ${i + 1}/${totalUsers} | Synced: ${usersSynced}, Updated: ${usersUpdated}, Skipped: ${usersSkipped} | Fingerprints: Saved: ${fingerprintsSaved}, Updated: ${fingerprintsUpdated}, Errors: ${fingerprintsErrors}`);
            }
        }

        console.log(`[Sync Users] ========== USER LOOP COMPLETED ==========`);
        console.log(`[Sync Users] About to start Phase 2 fingerprint fetching...`);
        console.log(`[Sync Users] Current state - DeviceId: ${deviceId}, Users processed: ${users.length}`);
        console.log(`[Sync Users] UID map size: ${uidToUserIdMap.size}`);

        // Phase 2: Fetch all fingerprints at once and match them to users
        console.log(`[Sync Users] ========== STARTING PHASE 2: FINGERPRINT FETCHING ==========`);
        console.log(`[Sync Users] DeviceId check: ${deviceId} (type: ${typeof deviceId})`);
        if (deviceId !== null) {
            console.log(`[Sync Users] ✓ DeviceId is NOT null (${deviceId}), proceeding with fingerprint fetch...`);
            try {
                console.log(`[Sync Users] Inside try block - about to update state and fetch templates...`);
                this.updateState({
                    phase: 'users',
                    status: 'fetching',
                    message: `📥 Fetching all fingerprint templates from ${device.name}... (this may take a moment)`,
                    progress: 50,
                    results: {
                        users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                        logs: { synced: 0, skipped: 0 },
                        fingerprints: { saved: 0, updated: 0, errors: 0 },
                        duration: Date.now() - (this.state.startTime || Date.now())
                    }
                });

                // Fetch all templates at once (without userId filter)
                // Note: getUsers() uses CMD_USERTEMP_RRQ, getFingerprintTemplates() uses CMD_DB_RRQ with EF_FINGER - these are DIFFERENT queries
                console.log(`[Sync Users] Fetching all fingerprint templates (using CMD_DB_RRQ with EF_FINGER query)...`);
                console.log(`[Sync Users] About to call getFingerprintTemplates() - this may take time...`);
                const allTemplates = await zkDevice.getFingerprintTemplates(undefined, users); // Pass users to avoid re-fetching
                console.log(`[Sync Users] getFingerprintTemplates() completed, received ${allTemplates?.length || 0} templates`);
                console.log(`[Sync Users] Fetched ${allTemplates.length} fingerprint templates from device`);
                console.log(`[Sync Users] UID mapping size: ${uidToUserIdMap.size}, Device users: ${users.length}`);

                if (allTemplates.length === 0) {
                    console.warn(`[Sync Users] WARNING: No fingerprint templates fetched from device! This might indicate a query issue.`);
                }

                // Helper function to format fingerIndex: "index,availability"
                const formatFingerIndex = (index: number, available: boolean): string => {
                    return `${index},${available ? 1 : 0}`;
                };

                // Process all templates and match them to users
                this.updateState({
                    phase: 'users',
                    status: 'processing',
                    message: `💾 Processing ${allTemplates.length} fingerprint templates...`,
                    progress: 60,
                    results: {
                        users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                        logs: { synced: 0, skipped: 0 },
                        fingerprints: { saved: 0, updated: 0, errors: 0 },
                        duration: Date.now() - (this.state.startTime || Date.now())
                    }
                });

                let templatesMatched = 0;
                let templatesSkippedNoUser = 0;
                const totalTemplates = allTemplates.length;

                for (let templateIdx = 0; templateIdx < allTemplates.length; templateIdx++) {
                    const template = allTemplates[templateIdx];

                    // Update progress every 50 templates or at completion
                    if (templateIdx % 50 === 0 || templateIdx === allTemplates.length - 1) {
                        const templateProgress = Math.round((templateIdx / totalTemplates) * 20); // 20% of total progress for templates
                        this.updateState({
                            phase: 'users',
                            status: 'processing',
                            message: `💾 Saving fingerprints: ${templateIdx + 1}/${totalTemplates} templates (${fingerprintsSaved} saved, ${fingerprintsUpdated} updated)...`,
                            progress: 60 + templateProgress,
                            results: {
                                users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                                logs: { synced: 0, skipped: 0 },
                                fingerprints: { saved: fingerprintsSaved, updated: fingerprintsUpdated, errors: fingerprintsErrors },
                                duration: Date.now() - (this.state.startTime || Date.now())
                            }
                        });
                    }
                    try {
                        // Match template uid to userId using our map
                        const userId = uidToUserIdMap.get(template.uid);

                        if (!userId) {
                            // Template belongs to a user not in the device user list (shouldn't happen, but skip if it does)
                            templatesSkippedNoUser++;
                            if (templatesSkippedNoUser <= 5) { // Only log first 5 to avoid spam
                                console.warn(`[Sync Users] Template with uid ${template.uid} has no matching user`);
                            }
                            continue;
                        }

                        // Normalize userId to string and trim
                        const normalizedUserId = String(userId).trim();

                        // Save/overwrite fingerprint for this user (save all templates matched via uid mapping)
                        templatesMatched++;

                        const { fingerIdx, valid, template: templateData, size } = template;
                        const fingerIndexStr = formatFingerIndex(fingerIdx, true); // Available on device

                        // Use normalized userId for database operations
                        const dbUserId = normalizedUserId;

                        // Check if template already exists for this user + finger + device combination
                        // Find ALL records with this finger index (could be "5,0" or "5,1")
                        const allExisting = await db
                            .select()
                            .from(schema.attFpData)
                            .where(
                                and(
                                    eq(schema.attFpData.userId, dbUserId),
                                    eq(schema.attFpData.deviceId, deviceId),
                                    sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIdx}`
                                )
                            );

                        // Check if there's already a record with the exact fingerIndex we want
                        const exactMatch = await db
                            .select()
                            .from(schema.attFpData)
                            .where(
                                and(
                                    eq(schema.attFpData.userId, dbUserId),
                                    eq(schema.attFpData.deviceId, deviceId),
                                    eq(schema.attFpData.fingerIndex, fingerIndexStr)
                                )
                            )
                            .limit(1);

                        if (exactMatch.length > 0) {
                            // Update the existing record with the exact fingerIndex
                            await db
                                .update(schema.attFpData)
                                .set({
                                    template: templateData,
                                    templateLength: size,
                                    flag: valid,
                                    updatedAt: new Date(),
                                })
                                .where(eq(schema.attFpData.id, exactMatch[0].id));
                            fingerprintsUpdated++;

                            // Delete any other records with the same finger index but different availability
                            // (e.g., if we have "5,1" and also "5,0", delete "5,0")
                            if (allExisting.length > 1) {
                                const idsToDelete = allExisting
                                    .filter(e => e.id !== exactMatch[0].id)
                                    .map(e => e.id);
                                if (idsToDelete.length > 0) {
                                    await db
                                        .delete(schema.attFpData)
                                        .where(inArray(schema.attFpData.id, idsToDelete));
                                    console.log(`[Sync Users] Deleted ${idsToDelete.length} duplicate fingerprint record(s) for finger ${fingerIdx}`);
                                }
                            }
                        } else if (allExisting.length > 0) {
                            // We have records with this finger index but different availability (e.g., "5,0")
                            // Update the first one and delete the rest
                            const recordToUpdate = allExisting[0];

                            // Delete all other records with the same finger index
                            if (allExisting.length > 1) {
                                const idsToDelete = allExisting
                                    .slice(1)
                                    .map(e => e.id);
                                await db
                                    .delete(schema.attFpData)
                                    .where(inArray(schema.attFpData.id, idsToDelete));
                                console.log(`[Sync Users] Deleted ${idsToDelete.length} duplicate fingerprint record(s) for finger ${fingerIdx}`);
                            }

                            // Update the remaining record
                            await db
                                .update(schema.attFpData)
                                .set({
                                    fingerIndex: fingerIndexStr,
                                    template: templateData,
                                    templateLength: size,
                                    flag: valid,
                                    updatedAt: new Date(),
                                })
                                .where(eq(schema.attFpData.id, recordToUpdate.id));
                            fingerprintsUpdated++;
                        } else {
                            // No existing record, insert new template
                            await db.insert(schema.attFpData).values({
                                userId: dbUserId,
                                fingerIndex: fingerIndexStr,
                                template: templateData,
                                templateLength: size,
                                flag: valid,
                                deviceId: deviceId,
                            });
                            fingerprintsSaved++;
                        }
                    } catch (templateError: any) {
                        console.error(`[Sync Users] Error saving template with uid ${template.uid}, finger ${template.fingerIdx}:`, templateError);
                        fingerprintsErrors++;
                        // Continue with other templates
                    }
                }

                console.log(`[Sync Users] Fingerprint processing summary:`);
                console.log(`  - Total templates from device: ${allTemplates.length}`);
                console.log(`  - Templates matched and saved: ${templatesMatched}`);
                console.log(`  - Templates skipped (no user match): ${templatesSkippedNoUser}`);
                console.log(`  - Fingerprints saved: ${fingerprintsSaved}, updated: ${fingerprintsUpdated}, errors: ${fingerprintsErrors}`);

                this.updateState({
                    phase: 'users',
                    status: 'complete',
                    message: `Fingerprints complete: ${fingerprintsSaved} saved, ${fingerprintsUpdated} updated${fingerprintsErrors > 0 ? `, ${fingerprintsErrors} errors` : ''}`,
                    progress: 80,
                    results: {
                        users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                        logs: { synced: 0, skipped: 0 },
                        fingerprints: { saved: fingerprintsSaved, updated: fingerprintsUpdated, errors: fingerprintsErrors },
                        duration: Date.now() - (this.state.startTime || Date.now())
                    }
                });
            } catch (fpError: any) {
                console.error(`[Sync Users] Error fetching/processing fingerprints:`, fpError);
                console.error(`[Sync Users] Fingerprint error stack:`, fpError?.stack);
                fingerprintsErrors++;
                // Don't fail the entire sync if fingerprint processing fails
            }
        } else {
            console.warn(`[Sync Users] DeviceId is null! Skipping fingerprint fetch. This is unusual.`);
        }

        // Cleanup: Remove device ID from storedDevices for users deleted from device
        if (deviceId !== null) {
            try {
                console.log(`[Sync Cleanup] Starting cleanup for device ${deviceId}...`);
                // Get set of all userIds found on the device
                const deviceUserIds = new Set(users.map(u => u.userId));
                console.log(`[Sync Cleanup] Found ${deviceUserIds.size} users on device`);

                // Fetch all users with non-null storedDevices and filter in JavaScript
                // This is more reliable than complex SQL queries
                const allDbUsers = await db
                    .select()
                    .from(schema.attUsers)
                    .where(isNotNull(schema.attUsers.storedDevices));

                console.log(`[Sync Cleanup] Found ${allDbUsers.length} users in DB with storedDevices`);

                const deviceIdStr = String(deviceId);
                let cleanupCount = 0;

                for (const dbUser of allDbUsers) {
                    // Check if storedDevices contains this device ID
                    const currentStoredDevices = dbUser.storedDevices || '';
                    if (!currentStoredDevices) continue;

                    const storedDeviceIds = currentStoredDevices.split(',').map(id => id.trim());
                    const hasDeviceId = storedDeviceIds.includes(deviceIdStr);

                    if (hasDeviceId) {
                        // User has this device ID in storedDevices
                        // Check if this user is still on the device
                        if (!deviceUserIds.has(dbUser.userId)) {
                            // User was deleted from device, remove device ID from storedDevices
                            const filteredDeviceIds = storedDeviceIds.filter(id => id !== deviceIdStr);

                            if (filteredDeviceIds.length === 0) {
                                // No more devices, set to null
                                await db
                                    .update(schema.attUsers)
                                    .set({
                                        storedDevices: null,
                                        updatedAt: new Date()
                                    })
                                    .where(eq(schema.attUsers.id, dbUser.id));
                                console.log(`[Sync Cleanup] Removed device ${deviceId} from user ${dbUser.userId} (${dbUser.name}) - set storedDevices to null`);
                            } else {
                                // Update with remaining device IDs
                                await db
                                    .update(schema.attUsers)
                                    .set({
                                        storedDevices: filteredDeviceIds.join(','),
                                        updatedAt: new Date()
                                    })
                                    .where(eq(schema.attUsers.id, dbUser.id));
                                console.log(`[Sync Cleanup] Removed device ${deviceId} from user ${dbUser.userId} (${dbUser.name}) - remaining devices: ${filteredDeviceIds.join(',')}`);
                            }
                            cleanupCount++;
                        }
                    }
                }

                if (cleanupCount > 0) {
                    console.log(`[Sync Cleanup] ✓ Removed device ${deviceId} from ${cleanupCount} user(s) that were deleted from device`);
                } else {
                    console.log(`[Sync Cleanup] ✓ No cleanup needed - all users with device ${deviceId} are still on the device`);
                }
            } catch (error) {
                console.error(`[Sync Cleanup] ✗ Error cleaning up storedDevices:`, error);
            }
        }

        const duration = Date.now() - (this.state.startTime || Date.now());
        console.log(`\n[Users Sync Complete] Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`  Users: ${usersSynced} synced, ${usersUpdated} updated, ${usersSkipped} skipped`);
        if (fingerprintsSaved > 0 || fingerprintsUpdated > 0 || fingerprintsErrors > 0) {
            console.log(`  Fingerprints: ${fingerprintsSaved} saved, ${fingerprintsUpdated} updated${fingerprintsErrors > 0 ? `, ${fingerprintsErrors} errors` : ''}`);
        }
        console.log('');

        // Update final state with fingerprint results
        this.updateState({
            phase: 'users',
            status: 'complete',
            message: `Sync complete: ${usersSynced + usersUpdated} users, ${fingerprintsSaved + fingerprintsUpdated} fingerprints`,
            progress: 100,
            results: {
                users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                logs: { synced: 0, skipped: 0 },
                fingerprints: { saved: fingerprintsSaved, updated: fingerprintsUpdated, errors: fingerprintsErrors },
                duration
            }
        });

        return {
            users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
            logs: { synced: 0, skipped: 0 },
            fingerprints: { saved: fingerprintsSaved, updated: fingerprintsUpdated, errors: fingerprintsErrors }
        };
    }

    private async syncDevice(device: Device): Promise<{
        users: { synced: number; updated: number; skipped: number };
        logs: { synced: number; skipped: number };
    }> {
        const deviceIp = device.ip;

        // Get device ID from database using device IP
        let deviceId: number | null = null;
        try {
            const deviceRecord = await db
                .select()
                .from(schema.attDevices)
                .where(eq(schema.attDevices.ip, deviceIp))
                .limit(1);

            if (deviceRecord.length > 0) {
                deviceId = deviceRecord[0].id;
            }
        } catch (error) {
            console.error(`Error fetching device ID for IP ${deviceIp}:`, error);
        }

        // --- Phase 1: Users ---
        this.updateState({
            phase: 'users',
            status: 'fetching',
            message: `Fetching users from ${device.name}...`,
            // If multi-device, progress is handled by parent loop somewhat, but we can have sub-progress
        });

        const users = await zkDevice.getUsers();
        const totalUsers = users.length;

        let usersSynced = 0;
        let usersUpdated = 0;
        let usersSkipped = 0;

        for (let i = 0; i < users.length; i++) {
            if (this.shouldStop) throw new Error("Sync cancelled by user");

            const user = users[i];
            try {
                const existing = await db
                    .select()
                    .from(schema.attUsers)
                    .where(eq(schema.attUsers.userId, user.userId))
                    .limit(1);

                if (existing.length > 0) {
                    const existingUser = existing[0];
                    let shouldUpdate = false;
                    const updates: any = {};

                    // Check if existing name is just a number (e.g. "101") which implies it's a placeholder
                    const existingName = existingUser.name || '';
                    const isNameJustNumber = /^\d+$/.test(existingName.trim());

                    // Check if device returns a valid text name (has non-digits)
                    // Some devices only store names, so if DB has number and device has text, update name
                    const deviceNameIsText = user.name && !/^\d+$/.test(user.name.trim());

                    // Skip entire update if device returns numeric name (no meaningful data)
                    const deviceNameIsNumeric = user.name && /^\d+$/.test(user.name.trim());
                    if (deviceNameIsNumeric) {
                        usersSkipped++;
                        continue; // Skip this user entirely
                    }

                    // Update name if DB has number and device returns text name
                    if (isNameJustNumber && deviceNameIsText) {
                        updates.name = user.name;
                        shouldUpdate = true;
                    }

                    // Handle stored devices tracking
                    if (deviceId !== null) {
                        const currentStoredDevices = existingUser.storedDevices || '';
                        const storedDeviceIds = currentStoredDevices ? currentStoredDevices.split(',').map(id => id.trim()) : [];

                        if (!storedDeviceIds.includes(String(deviceId))) {
                            // Add device ID to stored devices
                            const updatedDevices = currentStoredDevices
                                ? `${currentStoredDevices},${deviceId}`
                                : String(deviceId);
                            updates.storedDevices = updatedDevices;
                            shouldUpdate = true;
                        }
                    }

                    // Handle role updates for admin tracking
                    if (deviceId !== null) {
                        const currentRole = String(existingUser.role || '0');
                        const isAdminOnDevice = user.role === 14;

                        if (isAdminOnDevice) {
                            // User is admin on this device
                            if (currentRole === '0' || !currentRole.startsWith('14')) {
                                // Not currently admin, set to admin on this device
                                updates.role = `14,${deviceId}`;
                                shouldUpdate = true;
                            } else {
                                // Already admin, check if device ID is in the list
                                const roleParts = currentRole.split(',');
                                const deviceIds = roleParts.slice(1); // Skip "14"
                                if (!deviceIds.includes(String(deviceId))) {
                                    // Add device ID to the list
                                    updates.role = `14,${deviceIds.concat(String(deviceId)).join(',')}`;
                                    shouldUpdate = true;
                                }
                            }
                        } else {
                            // User is not admin on this device
                            if (currentRole.startsWith('14')) {
                                // Currently admin, remove this device ID if present
                                const roleParts = currentRole.split(',');
                                const deviceIds = roleParts.slice(1); // Skip "14"
                                const filteredDeviceIds = deviceIds.filter(id => id !== String(deviceId));

                                if (filteredDeviceIds.length === 0) {
                                    // No more admin devices, set to regular user
                                    updates.role = '0';
                                } else {
                                    // Still admin on other devices
                                    updates.role = `14,${filteredDeviceIds.join(',')}`;
                                }
                                shouldUpdate = true;
                            }
                        }
                    } else {
                        // Device ID not found, use simple role update
                        if (user.role === 14) {
                            updates.role = '14';
                            shouldUpdate = true;
                        } else if (String(existingUser.role || '0') !== '0') {
                            // Only update if role was not 0
                            updates.role = '0';
                            shouldUpdate = true;
                        }
                    }

                    if (shouldUpdate) {
                        updates.updatedAt = new Date();
                        await db
                            .update(schema.attUsers)
                            .set(updates)
                            .where(eq(schema.attUsers.id, existingUser.id));

                        // Exclude admin users from updated count if update is only for device tracking
                        // Check if update includes name change (meaningful update) or only device tracking
                        const hasNameUpdate = 'name' in updates;
                        // Check if user is admin in database (role starts with "14")
                        const existingRole = String(existingUser.role || '0');
                        const isAdminInDb = existingRole.startsWith('14');
                        const isOnlyDeviceTracking = !hasNameUpdate && (updates.storedDevices !== undefined || updates.role !== undefined);

                        // Count update only if: not admin in DB, OR admin with name update, OR admin but not only device tracking
                        if (!isAdminInDb || hasNameUpdate || !isOnlyDeviceTracking) {
                            usersUpdated++;
                        }
                        console.log(`[Sync] User updated: ${user.userId} - "${user.name}"`);
                    } else {
                        usersSkipped++;
                    }
                } else {
                    // New user - insert with role based on admin status
                    let roleValue = '0';
                    if (user.role === 14 && deviceId !== null) {
                        roleValue = `14,${deviceId}`;
                    } else if (user.role === 14) {
                        roleValue = '14';
                    }

                    // Store device ID for new users
                    const storedDevicesValue = deviceId !== null ? String(deviceId) : null;

                    await db.insert(schema.attUsers).values({
                        userId: user.userId,
                        name: user.name,
                        role: roleValue,
                        cardNo: user.cardNo || null,
                        password: user.password || null,
                        storedDevices: storedDevicesValue,
                    });
                    usersSynced++;
                }
            } catch (error: any) {
                usersSkipped++;
            }

            // Update progress for every 100 users or at completion
            if ((i + 1) % 100 === 0 || i === users.length - 1) {
                console.log(`[Sync Users] ${i + 1}/${totalUsers} | Synced: ${usersSynced}, Updated: ${usersUpdated}, Skipped: ${usersSkipped}`);
                const userProgress = Math.round(((i + 1) / totalUsers) * 100);
                this.updateState({
                    message: `Syncing users: ${i + 1}/${totalUsers}`,
                    progress: Math.min(20, Math.round(userProgress * 0.2)), // Users phase takes up first 20%
                    phase: 'users',
                    results: {
                        users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                        logs: { synced: 0, skipped: 0 },
                        duration: Date.now() - (this.state.startTime || Date.now())
                    }
                });
            }
        }

        // --- Phase 2: Logs ---
        this.updateState({
            phase: 'logs',
            status: 'fetching',
            message: `Fetching logs from ${device.name}...`,
            progress: 20
        });

        const logs = await zkDevice.getAttendance();
        const totalLogs = logs.length;

        let logsSynced = 0;
        let logsSkipped = 0;
        const BATCH_SIZE = 500;

        for (let i = 0; i < logs.length; i += BATCH_SIZE) {
            if (this.shouldStop) throw new Error("Sync cancelled by user");

            const batch = logs.slice(i, i + BATCH_SIZE);
            for (const log of batch) {
                try {
                    const recordTime = parseDeviceTimestamp(log.timestamp || log.record_time);

                    // Check for duplicate using recordTime + deviceId
                    if (deviceId !== null) {
                        const existing = await db
                            .select()
                            .from(schema.attLogs)
                            .where(
                                and(
                                    eq(schema.attLogs.recordTime, recordTime),
                                    eq(schema.attLogs.deviceId, deviceId)
                                )
                            )
                            .limit(1);

                        if (existing.length > 0) {
                            logsSkipped++;
                            continue;
                        }
                    }

                    await db.insert(schema.attLogs).values({
                        deviceSn: log.sn || log.id || null,
                        userId: log.userId,
                        recordTime: recordTime,
                        type: log.type || 1,
                        state: log.state,
                        deviceIp: log.ip || deviceIp,
                        deviceId: deviceId,
                    });
                    logsSynced++;
                } catch (error: any) {
                    logsSkipped++;
                }
            }

            // Update progress for logs every batch
            const processed = Math.min(i + BATCH_SIZE, logs.length);
            console.log(`[Sync Logs] ${processed}/${totalLogs} | Synced: ${logsSynced}, Skipped: ${logsSkipped}`);
            // Log phase takes 20% -> 100% of the progress bar
            const logProgress = 20 + Math.round((processed / totalLogs) * 80);

            this.updateState({
                message: `Syncing logs: ${processed}/${totalLogs}`,
                progress: logProgress,
                phase: 'logs',
                results: {
                    users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
                    logs: { synced: logsSynced, skipped: logsSkipped },
                    duration: Date.now() - (this.state.startTime || Date.now())
                }
            });
        }

        const duration = Date.now() - (this.state.startTime || Date.now());
        console.log(`\n[Sync Complete] Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`  Users: ${usersSynced} synced, ${usersUpdated} updated, ${usersSkipped} skipped`);
        console.log(`  Logs: ${logsSynced} synced, ${logsSkipped} skipped\n`);

        return {
            users: { synced: usersSynced, updated: usersUpdated, skipped: usersSkipped },
            logs: { synced: logsSynced, skipped: logsSkipped }
        };
    }
}

// Ensure singleton instance
if (!globalForSync.syncManager) {
    globalForSync.syncManager = new SyncManager();
}

export const syncManager = globalForSync.syncManager;
