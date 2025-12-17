import { NextRequest, NextResponse } from 'next/server';
import { zkDevice } from '@/lib/zkDevice';
import { db, schema } from '@/lib/drizzle/db';
import { eq, and, sql } from 'drizzle-orm';
import { fpLock } from '@/lib/fpLock';
import type { ApiResponse } from '@/types';

/**
 * DELETE /api/fingerprint/delete
 * Delete a fingerprint template from device (preserves in DB)
 * 
 * Body: {
 *   userId: string,
 *   deviceIp: string,
 *   devicePort: number,
 *   fingerIndex: number
 * }
 */
export async function DELETE(request: NextRequest) {
  let releaseLock: (() => void) | null = null;

  try {
    const body = await request.json();
    const { userId, deviceIp, devicePort, fingerIndex } = body;

    // Validate input
    if (!userId || !deviceIp || devicePort === undefined || fingerIndex === undefined) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Missing required fields: userId, deviceIp, devicePort, fingerIndex',
      }, { status: 400 });
    }

    if (fingerIndex < 0 || fingerIndex > 9) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid finger index. Must be between 0 and 9',
      }, { status: 400 });
    }

    // Acquire global lock for fingerprint operations
    releaseLock = await fpLock.acquireGlobal();
    console.log(`[Fingerprint Delete API] Lock acquired for deleting template ${fingerIndex} for user ${userId} on device ${deviceIp}:${devicePort}`);

    // Connect to device (need to get password from device record)
    const deviceRecord = await db
      .select()
      .from(schema.attDevices)
      .where(
        and(
          eq(schema.attDevices.ip, deviceIp),
          eq(schema.attDevices.port, devicePort)
        )
      )
      .limit(1);

    if (deviceRecord.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Device not found in database',
      }, { status: 404 });
    }

    const devicePassword = deviceRecord[0].password;

    await zkDevice.connect({
      ip: deviceIp,
      port: devicePort,
      password: devicePassword || null
    });
    console.log(`[Fingerprint Delete API] Connected to device ${deviceIp}:${devicePort}`);

    const deviceId = deviceRecord[0].id;

    // Get user from device to get internal UID and user info
    const users = await zkDevice.getUsers();
    const user = users.find((u: any) => u.userId === userId);

    if (!user) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found on device`,
      }, { status: 404 });
    }

    const deviceUid = user.uid;

    // Prepare user info for restoration
    // Extract role value - handle string formats like "14" or "14,1,2"
    let roleValue: number = 0;
    if (user.role !== undefined) {
      if (typeof user.role === 'string') {
        // If role is "14,1,2", extract the first number (14)
        const roleParts = user.role.split(',');
        roleValue = parseInt(roleParts[0]) || 0;
      } else if (typeof user.role === 'number') {
        roleValue = user.role;
      }
    }

    const userInfo: { name: string; cardNo?: string; role?: number; password?: string } = {
      name: user.name || '',
      cardNo: user.cardNo || '',
      role: roleValue,
      password: user.password || '',
    };

    // Step 1: Get templates from database for this user and device (excluding the one to delete)
    const fpTemplates = await db
      .select()
      .from(schema.attFpData)
      .where(
        and(
          eq(schema.attFpData.userId, userId),
          eq(schema.attFpData.deviceId, deviceId)
        )
      );

    // Filter out the template we want to delete and parse fingerIndex format
    const templatesToWrite = fpTemplates
      .filter(t => {
        const parts = t.fingerIndex.split(',');
        const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
        return fingerIdx !== fingerIndex; // Exclude the one we're deleting
      })
      .map(t => {
        const parts = t.fingerIndex.split(',');
        const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
        return {
          fingerIdx: fingerIdx,
          template: t.template,
        };
      });

    console.log(`[Fingerprint Delete API] Found ${fpTemplates.length} template(s) in DB, will write ${templatesToWrite.length} (excluding finger ${fingerIndex})`);

    // Step 2: Delete user, write user, get UID, then write templates from DB (matching sync-user-fp-linux.ts)
    console.log(`[Fingerprint Delete API] Deleting template for finger ${fingerIndex} from device`);
    await zkDevice.deleteFingerprintTemplate(userId, userInfo, templatesToWrite);
    console.log(`[Fingerprint Delete API] Template deleted successfully from device`);

    // Update availability status in database to indicate it's no longer on device
    // Format: "index,0" (not on device) - preserves template in DB
    const fingerIndexStr = `${fingerIndex},0`;
    await db
      .update(schema.attFpData)
      .set({
        fingerIndex: fingerIndexStr,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.attFpData.userId, userId),
          eq(schema.attFpData.deviceId, deviceId),
          sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIndex}`
        )
      );

    // Note: Template is preserved in database - allows it to be added back to the device later if needed

    return NextResponse.json<ApiResponse<{
      userId: string;
      fingerIndex: number;
      message: string;
    }>>({
      success: true,
      data: {
        userId,
        fingerIndex,
        message: `Template for finger ${fingerIndex} deleted from device. Template preserved in database.`,
      },
    });

  } catch (error: any) {
    console.error('[Fingerprint Delete API] Error:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || 'Failed to delete fingerprint template from device',
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (releaseLock) {
      releaseLock();
      console.log('[Fingerprint Delete API] Lock released');
    }
  }
}
