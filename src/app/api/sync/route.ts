import { NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { db, schema } from "@/lib/drizzle/db";
import { eq, and, sql, isNotNull, or } from "drizzle-orm";
import { ApiResponse } from "@/types";
import { syncManager } from "@/lib/syncManager";
import { parseDeviceTimestamp } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for large syncs

interface SyncResult {
  users: {
    synced: number;
    updated: number;
    skipped: number;
  };
  logs: {
    synced: number;
    skipped: number;
  };
  deviceIp: string;
  duration: number;
}

/**
 * POST /api/sync
 * Sync users and attendance logs from ESSL device to Supabase
 */
export async function POST() {
  // ... Keep existing implementation for single device sync ...
  // This seems to be used for "Sync Current Device" or auto-sync on check status
  // For now I'll just keep the existing logic but using the singleton
  
  const startTime = Date.now();

  try {
    const deviceConfig = zkDevice.getConfig();
    const deviceIp = deviceConfig?.ip || "unknown";

    // Get device record from database to fetch password
    let deviceId: number | null = null;
    let devicePassword: string | null = null;
    try {
      const deviceRecord = await db
        .select()
        .from(schema.attDevices)
        .where(eq(schema.attDevices.ip, deviceIp))
        .limit(1);
      
      if (deviceRecord.length > 0) {
        deviceId = deviceRecord[0].id;
        devicePassword = deviceRecord[0].password;
      }
    } catch (error) {
      console.error(`Error fetching device record for IP ${deviceIp}:`, error);
    }

    // Reconnect with password if not connected or password changed
    if (!zkDevice.isConnected() || deviceConfig?.password !== devicePassword) {
      try {
        const connected = await zkDevice.connect({ 
          ip: deviceIp, 
          port: deviceConfig?.port || 4370, 
          timeout: deviceConfig?.timeout || 10000,
          inport: deviceConfig?.inport || 4000,
          password: devicePassword 
        });
        
        if (!connected) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: "Device not connected. Please connect first.",
          }, { status: 400 });
        }
      } catch (connectError: any) {
        if (connectError.message && connectError.message.includes("Authentication failed")) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: connectError.message,
          }, { status: 401 });
        }
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: "Device not connected. Please connect first.",
        }, { status: 400 });
      }
    }

    console.log(`Starting sync from device ${deviceIp}...`);

    const result: SyncResult = {
      users: { synced: 0, updated: 0, skipped: 0 },
      logs: { synced: 0, skipped: 0 },
      deviceIp,
      duration: 0,
    };

    // 1. Sync Users
    console.log(`[Sync] Fetching users from device ${deviceIp}...`);
    const users = await zkDevice.getUsers();
    console.log(`[Sync] Found ${users.length} users on device`);

    let userCount = 0;
    for (const user of users) {
      userCount++;
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
            result.users.skipped++;
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
              console.log(`[Sync] Adding device ${deviceId} to stored_devices for user ${user.userId} (${user.name}). Previous: "${currentStoredDevices}", Updated: "${updatedDevices}"`);
            } else {
              console.log(`[Sync] Device ${deviceId} already in stored_devices for user ${user.userId} (${user.name}). Current: "${currentStoredDevices}"`);
            }
          } else {
            console.warn(`[Sync] deviceId is null for device ${deviceIp}, cannot update stored_devices for user ${user.userId}. Device may not be registered in database.`);
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
              result.users.updated++;
            }
            console.log(`[Sync] User updated: ${user.userId} - "${user.name}"`);
          } else {
            result.users.skipped++;
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
          result.users.synced++;
        }
      } catch (error: any) {
        if (error?.code === '23505') {
          result.users.skipped++;
        } else {
          // Only log errors periodically
          if (result.users.skipped % 100 === 0) {
            console.error(`[Sync] Error syncing users (${result.users.skipped} skipped so far):`, error);
          }
          result.users.skipped++;
        }
      }

      // Log progress every 100 users
      if (userCount % 100 === 0 || userCount === users.length) {
        console.log(`[Sync Users] ${userCount}/${users.length} | Synced: ${result.users.synced}, Updated: ${result.users.updated}, Skipped: ${result.users.skipped}`);
      }
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

    // 2. Sync Attendance Logs
    console.log(`[Sync] Fetching attendance logs from device ${deviceIp}...`);
    const logs = await zkDevice.getAttendance();
    console.log(`[Sync] Found ${logs.length} logs on device`);

    const BATCH_SIZE = 500;
    for (let i = 0; i < logs.length; i += BATCH_SIZE) {
      const batch = logs.slice(i, i + BATCH_SIZE);
      const processed = Math.min(i + BATCH_SIZE, logs.length);

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
              result.logs.skipped++;
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
          result.logs.synced++;
        } catch (error: any) {
          if (error?.code === '23505') {
            result.logs.skipped++;
          } else {
            // Only log errors, not every skipped log
            if (result.logs.skipped % 100 === 0) {
              console.error(`[Sync] Error syncing logs (${result.logs.skipped} skipped so far):`, error);
            }
            result.logs.skipped++;
          }
        }
      }

      // Log progress every batch
      console.log(`[Sync Logs] ${processed}/${logs.length} | Synced: ${result.logs.synced}, Skipped: ${result.logs.skipped}`);
    }

    result.duration = Date.now() - startTime;
    
    console.log(`\n[Sync Complete] Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`  Users: ${result.users.synced} synced, ${result.users.updated} updated, ${result.users.skipped} skipped`);
    console.log(`  Logs: ${result.logs.synced} synced, ${result.logs.skipped} skipped\n`);
    
    return NextResponse.json<ApiResponse<SyncResult>>({
      success: true,
      data: result,
      message: `Synced ${result.users.synced} new users, ${result.users.updated} updated, ${result.users.skipped} skipped. Logs: ${result.logs.synced} synced, ${result.logs.skipped} skipped`,
    });

  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync data",
    }, { status: 500 });
  }
}

/**
 * GET /api/sync
 * Get sync status/stats from database
 */
export async function GET() {
  try {
    const userCount = await db.select().from(schema.attUsers);
    const logCount = await db.select().from(schema.attLogs);

    const syncState = syncManager.getState();

    return NextResponse.json<ApiResponse<{
      users: number;
      logs: number;
      isSyncing: boolean;
      syncProgress: number;
      isMultiDevice: boolean;
      currentDeviceName?: string;
      currentDeviceIndex: number;
      totalDevices: number;
      deviceResults: any[];
    }>>({
      success: true,
      data: {
        users: userCount.length,
        logs: logCount.length,
        isSyncing: syncState.isSyncing,
        syncProgress: syncState.progress,
        isMultiDevice: syncState.isMultiDevice,
        currentDeviceName: syncState.currentDeviceName,
        currentDeviceIndex: syncState.currentDeviceIndex,
        totalDevices: syncState.totalDevices,
        deviceResults: syncState.deviceResults
      },
    });
  } catch (error) {
    console.error("Error getting sync stats:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get sync stats",
    }, { status: 500 });
  }
}
