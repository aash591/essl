import { NextRequest, NextResponse } from 'next/server';
import { zkDevice } from '@/lib/zkDevice';
import { db, schema } from '@/lib/drizzle/db';
import { eq, and } from 'drizzle-orm';
import { fpLock } from '@/lib/fpLock';
import type { ApiResponse } from '@/types';

/**
 * POST /api/fingerprint/restore
 * Restore fingerprint templates to device using delete-and-restore approach
 * 
 * Body: {
 *   userId: string,
 *   deviceIp: string,
 *   devicePort: number,
 *   fingerIndex: number (optional - if provided, restores all templates including this one)
 * }
 */
export async function POST(request: NextRequest) {
  let releaseLock: (() => void) | null = null;

  try {
    const body = await request.json();
    const { userId, deviceIp, devicePort, fingerIndex } = body;

    // Validate input
    if (!userId || !deviceIp || devicePort === undefined) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Missing required fields: userId, deviceIp, devicePort',
      }, { status: 400 });
    }

    // Acquire global lock for fingerprint operations
    releaseLock = await fpLock.acquireGlobal();
    console.log(`[Fingerprint Restore API] Lock acquired for restoring templates for user ${userId} on device ${deviceIp}:${devicePort}`);

    // Get device from database
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

    const deviceId = deviceRecord[0].id;
    const devicePassword = deviceRecord[0].password;

    // Connect to device
    await zkDevice.connect({
      ip: deviceIp,
      port: devicePort,
      password: devicePassword || null
    });
    console.log(`[Fingerprint Restore API] Connected to device ${deviceIp}:${devicePort}`);

    // Get user from device to get internal UID
    const users = await zkDevice.getUsers();
    const user = users.find((u: any) => u.userId === userId);

    if (!user) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found on device`,
      }, { status: 404 });
    }

    const deviceUid = user.uid;

    // Get user info from database for restore
    const dbUser = await db
      .select()
      .from(schema.attUsers)
      .where(eq(schema.attUsers.userId, userId))
      .limit(1);

    if (dbUser.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found in database`,
      }, { status: 404 });
    }

    const userInfo = {
      name: dbUser[0].name,
      password: user.password || undefined,
      role: dbUser[0].role || undefined,
      cardNo: dbUser[0].cardNo || undefined,
    };

    // Get all templates from database for this user and device
    const dbTemplates = await db
      .select()
      .from(schema.attFpData)
      .where(
        and(
          eq(schema.attFpData.userId, userId),
          eq(schema.attFpData.deviceId, deviceId)
        )
      );

    // Parse fingerIndex format and prepare templates to restore
    const templatesToRestore = dbTemplates.map(t => {
      const parts = t.fingerIndex.split(',');
      const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
      return {
        fingerIdx: fingerIdx,
        template: t.template
      };
    });

    console.log(`[Fingerprint Restore API] Found ${dbTemplates.length} template(s) in DB, will restore all to device`);

    // Restore templates to device using writeFingerprintTemplates
    console.log(`[Fingerprint Restore API] Restoring templates for user ${userId} (uid: ${deviceUid}) to device`);
    const writeResult = await zkDevice.writeFingerprintTemplates(deviceUid, templatesToRestore);
    console.log(`[Fingerprint Restore API] Templates restored successfully to device: ${writeResult.success} success, ${writeResult.failed} failed`);

    return NextResponse.json<ApiResponse<{
      userId: string;
      templatesRestored: number;
      templatesFailed: number;
      message: string;
    }>>({
      success: true,
      data: {
        userId,
        templatesRestored: writeResult.success,
        templatesFailed: writeResult.failed,
        message: `Restored ${writeResult.success} fingerprint template(s) to device${writeResult.failed > 0 ? `, ${writeResult.failed} failed` : ''}.`,
      },
    });

  } catch (error: any) {
    console.error('[Fingerprint Restore API] Error:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || 'Failed to restore fingerprint templates to device',
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (releaseLock) {
      releaseLock();
      console.log('[Fingerprint Restore API] Lock released');
    }
  }
}
