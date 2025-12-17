import { NextRequest, NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse } from "@/types";
import { db, schema } from "@/lib/drizzle/db";
import { eq } from "drizzle-orm";
import { fpLock } from "@/lib/fpLock";
import { Buffer } from 'buffer';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/device/register
 * Add user to device (write user to device and update storedDevices in DB)
 * Body: { userId, deviceIp, devicePort }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, deviceIp, devicePort, role } = body;

    if (!userId || !deviceIp || !devicePort) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId, deviceIp, and devicePort are required",
      }, { status: 400 });
    }

    const port = parseInt(devicePort.toString());
    if (isNaN(port)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Invalid devicePort",
      }, { status: 400 });
    }

    console.log(`[Device Register API] Adding user ${userId} to device ${deviceIp}:${port}`);

    // Get user from database
    const user = await db
      .select()
      .from(schema.attUsers)
      .where(eq(schema.attUsers.userId, userId))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found in database`,
      }, { status: 404 });
    }

    // Get device from database
    const device = await db
      .select()
      .from(schema.attDevices)
      .where(eq(schema.attDevices.ip, deviceIp))
      .limit(1);

    if (device.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Device ${deviceIp} not found in database`,
      }, { status: 404 });
    }

    const deviceId = device[0].id;
    const devicePassword = device[0].password;

    // Connect to device
    const connected = await zkDevice.connect({
      ip: deviceIp,
      port: port,
      timeout: 10000,
      inport: 4000,
      password: devicePassword || null,
    });

    if (!connected) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to connect to device at ${deviceIp}:${port}`,
      }, { status: 500 });
    }

    // Acquire global lock for FP operation
    const releaseLock = await fpLock.acquireGlobal();
    
    try {
      // Step 1: Check if user already exists on device (Clean Slate Strategy)
      let deviceUsers: any[] = [];
      let existingUser: any = null;
      let deviceUid = 0;

      try {
        const usersResponse = await zkDevice.getUsers();
        // getUsers() returns an array directly
        deviceUsers = Array.isArray(usersResponse) ? usersResponse : [];
        existingUser = deviceUsers.find((u: any) => u.userId === userId);
      } catch (getUsersError: any) {
        console.warn(`[Device Register API] Could not get users from device (may be empty or timeout):`, getUsersError?.message);
        // Continue - device might be empty or connection issue, we'll try to write anyway
        // Set deviceUsers to empty array to avoid errors in reduce
        deviceUsers = [];
      }

      // Get zkInstance for direct access (matching script approach)
      const zkInstance = (zkDevice as any).zkInstance;
      if (!zkInstance) {
        throw new Error("Device connection lost");
      }

      if (existingUser) {
        // User exists - delete first for clean slate (as per sync-user-fp-linux.ts)
        deviceUid = parseInt(existingUser.uid);
        console.log(`[Device Register API] User exists (UID: ${deviceUid}). Deleting for clean sync...`);

        // Delete user using CMD_DELETE_USER = 18 (matching script)
        if (zkInstance.ztcp) {
          const delBuf = Buffer.alloc(2);
          delBuf.writeUInt16LE(deviceUid, 0);
          await zkInstance.ztcp.executeCmd(18, delBuf);
          console.log(`[Device Register API] User deleted from device`);
        } else if (zkInstance.zudp) {
          const delBuf = Buffer.alloc(2);
          delBuf.writeUInt16LE(deviceUid, 0);
          await zkInstance.zudp.executeCmd(18, delBuf);
          console.log(`[Device Register API] User deleted from device (UDP)`);
        } else {
          // Fallback to deleteUser method
          await zkDevice.deleteUser(userId);
        }

        // Explicit refresh after deletion (matching script)
        if (zkInstance.ztcp) {
          await zkInstance.ztcp.executeCmd(1013, ''); // CMD_REFRESHDATA
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // User doesn't exist - calculate new UID
        if (deviceUsers.length > 0) {
          const maxUid = deviceUsers.reduce((max: number, u: any) => Math.max(max, parseInt(u.uid)), 0);
          deviceUid = maxUid + 1;
        } else {
          // Use userId as UID if device is empty
          deviceUid = parseInt(userId) || 1;
        }
        console.log(`[Device Register API] User new. Creating with UID: ${deviceUid}...`);
      }

      // Step 2: Write user to device
      console.log(`[Device Register API] Writing User Info (UID: ${deviceUid})...`);
      
      // Extract role value
      // Prefer explicit role from request (used when changing role from UI),
      // otherwise fall back to role stored in DB.
      let roleValue = 0;
      const userRoleSource = role !== undefined && role !== null
        ? String(role)
        : (user[0].role || "0");
      if (typeof userRoleSource === 'string') {
        const roleParts = userRoleSource.split(',');
        roleValue = parseInt(roleParts[0]) || 0;
      } else {
        roleValue = userRoleSource;
      }

      const cardNoValue = user[0].cardNo ? parseInt(user[0].cardNo) || 0 : 0;
      const password = user[0].password || "";

      // Step 2: Write user to device using zkInstance.setUser directly (matching script)
      await zkInstance.setUser(
        deviceUid,
        user[0].userId,
        user[0].name,
        password,
        roleValue,
        cardNoValue
      );

      console.log(`[Device Register API] User written to device`);

      // Step 3: Refresh again to ensure user is in device database (matching script)
      if (zkInstance.ztcp) {
        await zkInstance.ztcp.executeCmd(1013, ''); // CMD_REFRESHDATA
      }
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Fetch fingerprint templates from database for this user
      // Note: We can fetch templates from any device, but when writing to a new device,
      // we'll write all available templates. If you want device-specific templates only,
      // you can filter by deviceId here.
      const fpTemplates = await db
        .select()
        .from(schema.attFpData)
        .where(eq(schema.attFpData.userId, userId));
      
      // Group templates by finger index and take the most recent one for each finger
      // This ensures we write one template per finger index to the device
      // Parse fingerIndex format: "index,availability" or legacy "index"
      const templatesByFinger = new Map<number, typeof fpTemplates[0]>();
      for (const template of fpTemplates) {
        const parts = template.fingerIndex.split(',');
        const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(template.fingerIndex);
        
        const existing = templatesByFinger.get(fingerIdx);
        if (!existing || new Date(template.updatedAt) > new Date(existing.updatedAt)) {
          templatesByFinger.set(fingerIdx, template);
        }
      }
      
      const uniqueTemplates = Array.from(templatesByFinger.values());

      let fpWriteResult = null;
      if (uniqueTemplates.length > 0) {
        console.log(`[Device Register API] Found ${uniqueTemplates.length} unique fingerprint template(s) in database, writing to device...`);
        
        // Prepare templates for writing (parse fingerIndex to get actual index)
        const templatesToWrite = uniqueTemplates.map(t => {
          const parts = t.fingerIndex.split(',');
          const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
          return {
            fingerIdx: fingerIdx,
            template: t.template,
          };
        });

        // Write fingerprint templates to device
        fpWriteResult = await zkDevice.writeFingerprintTemplates(deviceUid, templatesToWrite);
        
        console.log(`[Device Register API] Fingerprint write result: ${fpWriteResult.success} success, ${fpWriteResult.failed} failed`);
      } else {
        console.log(`[Device Register API] No fingerprint templates found in database for user ${userId}`);
      }

      // Update storedDevices in database (add device ID if not present)
      const currentStoredDevices = user[0].storedDevices || '';
      const storedDeviceIds = currentStoredDevices ? currentStoredDevices.split(',').map(id => id.trim()) : [];
      
      if (!storedDeviceIds.includes(String(deviceId))) {
        storedDeviceIds.push(String(deviceId));
        const updatedStoredDevices = storedDeviceIds.join(',');
        
        await db
          .update(schema.attUsers)
          .set({ 
            storedDevices: updatedStoredDevices,
            updatedAt: new Date()
          })
          .where(eq(schema.attUsers.userId, userId));
      }

      const message = fpTemplates.length > 0
        ? `User ${userId} and ${fpWriteResult?.success || 0} fingerprint template(s) successfully added to device ${deviceIp}${fpWriteResult && fpWriteResult.failed > 0 ? ` (${fpWriteResult.failed} failed)` : ''}`
        : `User ${userId} successfully added to device ${deviceIp}`;

      return NextResponse.json<ApiResponse<{ 
        userId: string; 
        deviceId: number;
        fingerprintsWritten?: number;
        fingerprintsFailed?: number;
      }>>({
        success: true,
        data: { 
          userId, 
          deviceId,
          fingerprintsWritten: fpWriteResult?.success || 0,
          fingerprintsFailed: fpWriteResult?.failed || 0,
        },
        message,
      });
    } finally {
      // Always release the lock
      releaseLock();
    }

  } catch (error: any) {
    console.error("[Device Register API] Error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to add user to device",
    }, { status: 500 });
  }
}

/**
 * DELETE /api/device/register
 * Remove user from device (delete from device but keep FP data in DB)
 * Body: { userId, deviceIp, devicePort }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, deviceIp, devicePort } = body;

    if (!userId || !deviceIp || !devicePort) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId, deviceIp, and devicePort are required",
      }, { status: 400 });
    }

    const port = parseInt(devicePort.toString());
    if (isNaN(port)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Invalid devicePort",
      }, { status: 400 });
    }

    console.log(`[Device Register API] Removing user ${userId} from device ${deviceIp}:${port}`);

    // Get user from database
    const user = await db
      .select()
      .from(schema.attUsers)
      .where(eq(schema.attUsers.userId, userId))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found in database`,
      }, { status: 404 });
    }

    // Get device from database
    const device = await db
      .select()
      .from(schema.attDevices)
      .where(eq(schema.attDevices.ip, deviceIp))
      .limit(1);

    if (device.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Device ${deviceIp} not found in database`,
      }, { status: 404 });
    }

    const deviceId = device[0].id;
    const devicePassword = device[0].password;

    // Connect to device
    const connected = await zkDevice.connect({
      ip: deviceIp,
      port: port,
      timeout: 10000,
      inport: 4000,
      password: devicePassword || null,
    });

    if (!connected) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to connect to device at ${deviceIp}:${port}`,
      }, { status: 500 });
    }

    // Delete user from device
    // IMPORTANT: We must delete by device UID, not by userId.
    // Logic (matches scripts/essl_scripts/delete-user-from-device.ts):
    //   1) Fetch all users from device
    //   2) Find the record matching this userId
    //   3) Use its UID to perform the delete
    let deviceUsers: any[] = [];
    try {
      const usersResponse = await zkDevice.getUsers();
      // getUsers() usually returns an array; fallback to empty if unexpected
      deviceUsers = Array.isArray(usersResponse) ? usersResponse : [];
    } catch (getUsersError: any) {
      console.error(
        "[Device Register API] Failed to get users from device for delete:",
        getUsersError?.message || getUsersError
      );
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Failed to read users from device. Cannot resolve UID for delete.",
      }, { status: 500 });
    }

    // Find matching user by userId (handle different field names just in case)
    const deviceUser = deviceUsers.find((u: any) => {
      const idStr = String(u.userId ?? u.userid ?? u.uid ?? "");
      return idStr === String(userId);
    });

    if (!deviceUser) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found on device`,
      }, { status: 404 });
    }

    const deviceUid = parseInt(String(deviceUser.uid));
    if (!Number.isFinite(deviceUid)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Invalid UID for user ${userId} on device`,
      }, { status: 500 });
    }

    // Get underlying zkInstance so we can delete by UID, just like the script
    const zkInstance = (zkDevice as any).zkInstance;
    if (!zkInstance) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device connection lost",
      }, { status: 500 });
    }

    try {
      // Use low-level CMD_DELETE_USER (18) where possible, matching add-user flow
      if (zkInstance.ztcp) {
        const delBuf = Buffer.alloc(2);
        delBuf.writeUInt16LE(deviceUid, 0);
        await zkInstance.ztcp.executeCmd(18, delBuf);
      } else if (zkInstance.zudp) {
        const delBuf = Buffer.alloc(2);
        delBuf.writeUInt16LE(deviceUid, 0);
        await zkInstance.zudp.executeCmd(18, delBuf);
      } else if (typeof zkInstance.deleteUser === "function") {
        // Fallback to high-level deleteUser with UID
        await zkInstance.deleteUser(deviceUid);
      } else {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: "Device SDK does not support user deletion on this connection",
        }, { status: 500 });
      }
    } catch (deleteError: any) {
      console.error(
        `[Device Register API] Error deleting user ${userId} (UID ${deviceUid}) from device:`,
        deleteError?.message || deleteError
      );
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: deleteError?.message || "Failed to delete user from device",
      }, { status: 500 });
    }

    // Update storedDevices in database (remove device ID)
    // IMPORTANT: Do NOT delete fingerprint data from DB - it should remain
    const currentStoredDevices = user[0].storedDevices || '';
    const storedDeviceIds = currentStoredDevices ? currentStoredDevices.split(',').map(id => id.trim()) : [];
    
    const filteredDeviceIds = storedDeviceIds.filter(id => id !== String(deviceId));
    const updatedStoredDevices = filteredDeviceIds.join(',');
    
    await db
      .update(schema.attUsers)
      .set({ 
        storedDevices: updatedStoredDevices || null,
        updatedAt: new Date()
      })
      .where(eq(schema.attUsers.userId, userId));

    return NextResponse.json<ApiResponse<{ userId: string; deviceId: number }>>({
      success: true,
      data: { userId, deviceId },
      message: `User ${userId} successfully removed from device ${deviceIp}. Fingerprint data preserved in database.`,
    });

  } catch (error: any) {
    console.error("[Device Register API] Error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to remove user from device",
    }, { status: 500 });
  }
}
