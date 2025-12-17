import { NextRequest, NextResponse } from 'next/server';
import { zkDevice } from '@/lib/zkDevice';
import { db, schema } from '@/lib/drizzle/db';
import { eq, and, sql } from 'drizzle-orm';
import { fpLock } from '@/lib/fpLock';
import type { ApiResponse } from '@/types';

/**
 * POST /api/fingerprint/add
 * Add a fingerprint template to device (from database)
 * 
 * Body: {
 *   userId: string,
 *   deviceIp: string,
 *   devicePort: number,
 *   fingerIndex: number
 * }
 */
export async function POST(request: NextRequest) {
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
    console.log(`[Fingerprint Add API] Lock acquired for adding template ${fingerIndex} for user ${userId} on device ${deviceIp}:${devicePort}`);

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
    const deviceId = deviceRecord[0].id;

    await zkDevice.connect({
      ip: deviceIp,
      port: devicePort,
      password: devicePassword || null
    });
    console.log(`[Fingerprint Add API] Connected to device ${deviceIp}:${devicePort}`);

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

    // Get template from database for this user, device, and finger index
    let dbTemplates = await db
      .select()
      .from(schema.attFpData)
      .where(
        and(
          eq(schema.attFpData.userId, userId),
          eq(schema.attFpData.deviceId, deviceId),
          sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIndex}`
        )
      )
      .limit(1);

    let template = dbTemplates.length > 0 ? dbTemplates[0] : null;

    // If template doesn't exist for this device, try to find it from another device
    if (!template) {
      console.log(`[Fingerprint Add API] Template not found for device ${deviceId}, searching other devices...`);
      
      // Find template from any other device for this user and finger index
      const otherDeviceTemplates = await db
        .select()
        .from(schema.attFpData)
        .where(
          and(
            eq(schema.attFpData.userId, userId),
            sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIndex}`
          )
        )
        .limit(1);

      if (otherDeviceTemplates.length > 0) {
        const sourceTemplate = otherDeviceTemplates[0];
        console.log(`[Fingerprint Add API] Found template from device ${sourceTemplate.deviceId}, copying to device ${deviceId}`);
        
        // Copy template to current device's database
        const fingerIndexStr = `${fingerIndex},0`; // Initially marked as not on device (will be updated after adding)
        await db.insert(schema.attFpData).values({
          userId: userId,
          fingerIndex: fingerIndexStr,
          template: sourceTemplate.template,
          templateLength: sourceTemplate.templateLength,
          flag: sourceTemplate.flag || 1,
          deviceId: deviceId,
        });
        
        // Query the newly inserted template
        const newTemplates = await db
          .select()
          .from(schema.attFpData)
          .where(
            and(
              eq(schema.attFpData.userId, userId),
              eq(schema.attFpData.deviceId, deviceId),
              sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIndex}`
            )
          )
          .limit(1);
        
        if (newTemplates.length > 0) {
          template = newTemplates[0];
        } else {
          // Fallback to source template if query fails
          template = sourceTemplate;
        }
      } else {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Template for finger ${fingerIndex} not found in database for this user on any device`,
        }, { status: 404 });
      }
    }

    // Add template to device
    console.log(`[Fingerprint Add API] Adding template for finger ${fingerIndex} (uid: ${deviceUid}) to device`);
    await zkDevice.addFingerprintTemplate(deviceUid, fingerIndex, template.template);
    console.log(`[Fingerprint Add API] Template added successfully to device`);

    // Update availability status in database to indicate it's now on device
    const fingerIndexStr = `${fingerIndex},1`; // Format: "index,1" (available on device)
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

    return NextResponse.json<ApiResponse<{
      userId: string;
      fingerIndex: number;
      message: string;
    }>>({
      success: true,
      data: {
        userId,
        fingerIndex,
        message: `Template for finger ${fingerIndex} added to device successfully.`,
      },
    });

  } catch (error: any) {
    console.error('[Fingerprint Add API] Error:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || 'Failed to add fingerprint template to device',
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (releaseLock) {
      releaseLock();
      console.log('[Fingerprint Add API] Lock released');
    }
  }
}
