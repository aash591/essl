import { NextRequest, NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse, User } from "@/types";
import { db, schema } from "@/lib/drizzle/db";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for large operations

interface WriteUserRequest {
  userId?: string; // Single user ID to write
  userIds?: string[]; // Multiple user IDs to write
  all?: boolean; // Write all users from database
  deviceIp?: string; // Optional: connect to specific device IP
  devicePort?: number; // Optional: connect to specific device port
}

/**
 * POST /api/device/users
 * Write user(s) from database to the connected device
 */
export async function POST(request: NextRequest) {
  try {
    const body: WriteUserRequest = await request.json();
    const { userId, userIds, all, deviceIp, devicePort } = body;

    // Connect to device if IP/port provided
    if (deviceIp && devicePort) {
      console.log(`Connecting to device at ${deviceIp}:${devicePort}...`);
      const connected = await zkDevice.connect({ 
        ip: deviceIp, 
        port: devicePort,
        timeout: 0,
        inport: 4000
      });
      
      if (!connected) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Failed to connect to device at ${deviceIp}:${devicePort}`,
        }, { status: 500 });
      }
    } else if (!zkDevice.isConnected()) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not connected. Please connect first or provide deviceIp and devicePort.",
      }, { status: 400 });
    }

    // Fetch users from database
    let usersToWrite: any[] = [];

    if (all) {
      // Get all users from database
      const allUsers = await db.select().from(schema.attUsers);
      usersToWrite = allUsers;
      console.log(`Writing all ${allUsers.length} users to device...`);
    } else if (userIds && userIds.length > 0) {
      // Get specific users by userId
      const users = await db
        .select()
        .from(schema.attUsers)
        .where(inArray(schema.attUsers.userId, userIds));
      usersToWrite = users;
      console.log(`Writing ${users.length} users to device...`);
    } else if (userId) {
      // Get single user by userId
      const users = await db
        .select()
        .from(schema.attUsers)
        .where(eq(schema.attUsers.userId, userId))
        .limit(1);
      usersToWrite = users;
      console.log(`Writing 1 user to device...`);
    } else {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Please provide userId, userIds array, or set all=true",
      }, { status: 400 });
    }

    if (usersToWrite.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "No users found to write",
      }, { status: 404 });
    }

    // Get device ID from database if deviceIp is provided
    let deviceId: number | null = null;
    if (deviceIp) {
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
    }

    // Step 1: Fetch all users from device to get UIDs (device-specific)
    // IMPORTANT: If we can't read users, we MUST NOT guess a UID. This matches sync-user-fp-linux.ts:
    //   - First read all users from device
    //   - Find UID by userId
    //   - Then write using that UID
    let deviceUsers: any[] = [];
    try {
      const usersResponse = await zkDevice.getUsers();
      deviceUsers = Array.isArray(usersResponse) ? usersResponse : [];
      console.log(`[Device Users API] Fetched ${deviceUsers.length} users from device`);
    } catch (getUsersError: any) {
      console.error(
        `[Device Users API] Failed to get users from device (required to resolve UID by userId):`,
        getUsersError?.message || getUsersError
      );
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Failed to read users from device. Cannot resolve device UID for this user.",
      }, { status: 500 });
    }

    // Get zkInstance for direct access (matching script approach)
    const zkInstance = (zkDevice as any).zkInstance;
    if (!zkInstance) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device connection lost",
      }, { status: 500 });
    }

    // Step 2: Write each user to device using their device-specific UID
    // Note: Typically one user per call (one user to multiple devices), but API supports multiple users
    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>
    };

    // Calculate max UID from device users (for new user creation)
    // Track dynamically to handle multiple new users in one call
    let currentMaxUid = deviceUsers.length > 0
      ? deviceUsers.reduce((max: number, u: any) => Math.max(max, parseInt(u.uid)), 0)
      : 0;

    for (const dbUser of usersToWrite) {
      try {
        // Find existing user on device by userId to get their UID
        const existingDeviceUser = deviceUsers.find((u: any) => u.userId === dbUser.userId);
        let deviceUid: number;

        if (existingDeviceUser) {
          // User exists - use existing UID
          deviceUid = parseInt(existingDeviceUser.uid);
          console.log(`[Device Users API] User ${dbUser.userId} exists on device with UID: ${deviceUid}`);
        } else {
          // User doesn't exist - calculate new UID
          deviceUid = currentMaxUid + 1;
          currentMaxUid = deviceUid; // Update for next iteration (if multiple new users)
          console.log(`[Device Users API] User ${dbUser.userId} is new, creating with UID: ${deviceUid}`);
        }

        // Extract role value
        let roleValue = 0;
        const userRole = dbUser.role || "0";
        if (typeof userRole === 'string') {
          const roleParts = userRole.split(',');
          roleValue = parseInt(roleParts[0]) || 0;
        } else {
          roleValue = userRole;
        }

        const cardNoValue = dbUser.cardNo ? parseInt(dbUser.cardNo) || 0 : 0;
        const password = dbUser.password || "";

        // Write user to device using device-specific UID
        await zkInstance.setUser(
          deviceUid,
          dbUser.userId,
          dbUser.name || "",
          password,
          roleValue,
          cardNoValue
        );

        console.log(`[Device Users API] Successfully wrote user ${dbUser.userId} to device with UID: ${deviceUid}`);
        result.success++;

        // Refresh device data after write to ensure user is in device database
        if (zkInstance.ztcp) {
          await zkInstance.ztcp.executeCmd(1013, ''); // CMD_REFRESHDATA
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for device processing

      } catch (error: any) {
        console.error(`[Device Users API] Error writing user ${dbUser.userId} to device:`, error);
        result.failed++;
        result.errors.push({
          userId: dbUser.userId,
          error: error.message || String(error)
        });
      }
    }

    // Update stored_devices for successfully written users if deviceId is available
    if (deviceId !== null && result.success > 0) {
      try {
        for (const user of usersToWrite) {
          const currentStoredDevices = user.storedDevices || '';
          const storedDeviceIds = currentStoredDevices ? currentStoredDevices.split(',').map((id: string) => id.trim()) : [];
          
          if (!storedDeviceIds.includes(String(deviceId))) {
            storedDeviceIds.push(String(deviceId));
            const updatedStoredDevices = storedDeviceIds.join(',');
            
            await db
              .update(schema.attUsers)
              .set({ 
                storedDevices: updatedStoredDevices,
                updatedAt: new Date()
              })
              .where(eq(schema.attUsers.userId, user.userId));
          }
        }
      } catch (error) {
        console.error('Error updating stored_devices:', error);
        // Don't fail the request if stored_devices update fails
      }
    }

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      message: `Successfully wrote ${result.success} user(s) to device. ${result.failed > 0 ? `${result.failed} failed.` : ''}`,
    });

  } catch (error) {
    console.error("Error writing users to device:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to write users to device",
    }, { status: 500 });
  }
}

interface DeleteUserRequest {
  userId?: string; // Single user ID to delete
  userIds?: string[]; // Multiple user IDs to delete
  deviceIp?: string; // Optional: connect to specific device IP
  devicePort?: number; // Optional: connect to specific device port
}

/**
 * DELETE /api/device/users
 * Delete user(s) from the connected device
 */
export async function DELETE(request: NextRequest) {
  try {
    const body: DeleteUserRequest = await request.json();
    const { userId, userIds, deviceIp, devicePort } = body;

    // Connect to device if IP/port provided
    if (deviceIp && devicePort) {
      console.log(`Connecting to device at ${deviceIp}:${devicePort}...`);
      const connected = await zkDevice.connect({ 
        ip: deviceIp, 
        port: devicePort,
        timeout: 0,
        inport: 4000
      });
      
      if (!connected) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Failed to connect to device at ${deviceIp}:${devicePort}`,
        }, { status: 500 });
      }
    } else if (!zkDevice.isConnected()) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not connected. Please connect first or provide deviceIp and devicePort.",
      }, { status: 400 });
    }

    // Determine which users to delete
    let userIdsToDelete: string[] = [];

    if (userIds && userIds.length > 0) {
      userIdsToDelete = userIds;
      console.log(`Deleting ${userIds.length} users from device...`);
    } else if (userId) {
      userIdsToDelete = [userId];
      console.log(`Deleting 1 user from device...`);
    } else {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Please provide userId or userIds array",
      }, { status: 400 });
    }

    if (userIdsToDelete.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "No user IDs provided to delete",
      }, { status: 400 });
    }

    // Delete users from device
    const result = await zkDevice.deleteUsers(userIdsToDelete);

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      message: `Successfully deleted ${result.success} user(s) from device. ${result.failed > 0 ? `${result.failed} failed.` : ''}`,
    });

  } catch (error) {
    console.error("Error deleting users from device:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete users from device",
    }, { status: 500 });
  }
}

