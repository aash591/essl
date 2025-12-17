import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { eq, and } from "drizzle-orm";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/fingerprint
 * Sync fingerprint data for a user from source device to target device(s)
 * Body: { userId, sourceDeviceIp, targetDeviceIps: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, sourceDeviceIp, targetDeviceIps } = body;

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId is required",
      }, { status: 400 });
    }

    if (!sourceDeviceIp) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "sourceDeviceIp is required",
      }, { status: 400 });
    }

    if (!targetDeviceIps || !Array.isArray(targetDeviceIps) || targetDeviceIps.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "targetDeviceIps array is required and must not be empty",
      }, { status: 400 });
    }

    // 1. Get fingerprint templates from database for this user
    const templates = await db
      .select()
      .from(schema.attFpData)
      .where(eq(schema.attFpData.userId, String(userId)));

    if (templates.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `No fingerprint templates found for user ${userId} in database`,
      }, { status: 404 });
    }

    // 2. Get user info from database
    const user = await db
      .select()
      .from(schema.attUsers)
      .where(eq(schema.attUsers.userId, String(userId)))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found in database`,
      }, { status: 404 });
    }

    const userInfo = user[0];
    const results: any[] = [];

    // 3. Sync to each target device
    for (const targetIp of targetDeviceIps) {
      try {
        // Connect to target device
        const connected = await zkDevice.connect({ ip: targetIp });
        if (!connected) {
          results.push({
            deviceIp: targetIp,
            success: false,
            error: "Failed to connect to device",
          });
          continue;
        }

        // Get zkteco-js instance
        const zkInstance = (zkDevice as any).zkInstance;
        if (!zkInstance) {
          results.push({
            deviceIp: targetIp,
            success: false,
            error: "Device instance not available",
          });
          continue;
        }

        const ztcp = zkInstance.ztcp;
        const COMMANDS = require('zkteco-js/src/helper/command').COMMANDS;

        let syncedCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // 4. First, ensure user exists on target device
        // Try to get user info from device
        const deviceUsers = await zkInstance.getUsers();
        const deviceUser = deviceUsers?.data?.find((u: any) => 
          u.userId === String(userId) || parseInt(u.userId) === parseInt(String(userId))
        );

        if (!deviceUser) {
          // User doesn't exist on device, we need to create them first
          // Note: This requires SetUserInfo which may not be available in zkteco-js
          // For now, we'll skip and report error
          results.push({
            deviceIp: targetIp,
            success: false,
            error: `User ${userId} does not exist on device. Please sync user first.`,
          });
          continue;
        }

        // 5. Upload each fingerprint template
        for (const template of templates) {
          try {
            // Parse fingerIndex format: "index,availability" or just "index"
            const parts = template.fingerIndex.split(',');
            const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(template.fingerIndex);
            
            // Decode base64 template to buffer
            const templateBuffer = Buffer.from(template.template, 'base64');

            // SetUserTmpExStr: SetUserTmpExStr(machineNumber, enrollNumber, fingerIndex, flag, tmpData, tmpLength)
            // Note: zkteco-js may not expose this directly, so we use executeCmd
            const requestBuffer = Buffer.alloc(6);
            requestBuffer.writeUInt16LE(parseInt(String(userId)), 0);
            requestBuffer.writeUInt8(fingerIdx, 2);
            requestBuffer.writeUInt8(template.flag || 1, 3);
            requestBuffer.writeUInt16LE(template.templateLength, 4);

            // Try to set template using executeCmd with CMD_USERTEMP_WRQ
            // This is a write command, format may vary by device
            // For now, we'll use a workaround: try to set via SetUserTmp if available
            if (zkInstance.SetUserTmpExStr) {
              const success = zkInstance.SetUserTmpExStr(
                1, // machineNumber
                String(userId),
                fingerIdx,
                template.flag || 1,
                templateBuffer,
                template.templateLength
              );

              if (success) {
                syncedCount++;
              } else {
                errorCount++;
                errors.push(`Failed to set template for finger ${template.fingerIndex}`);
              }
            } else {
              // Fallback: Try using executeCmd with CMD_USERTEMP_WRQ
              // Note: This is device-specific and may not work for all devices
              errorCount++;
              errors.push(`SetUserTmpExStr not available in zkteco-js library`);
            }
          } catch (error: any) {
            errorCount++;
            errors.push(`Error syncing finger ${template.fingerIndex}: ${error.message}`);
            console.error(`Error syncing template for finger ${template.fingerIndex}:`, error);
          }
        }

        results.push({
          deviceIp: targetIp,
          success: syncedCount > 0,
          synced: syncedCount,
          errors: errorCount,
          total: templates.length,
          errorMessages: errors.length > 0 ? errors : undefined,
        });

        // Disconnect from device
        await zkDevice.disconnect();
      } catch (error: any) {
        results.push({
          deviceIp: targetIp,
          success: false,
          error: error.message || "Unknown error",
        });
        console.error(`Error syncing to device ${targetIp}:`, error);
      }
    }

    return NextResponse.json<ApiResponse<{ userId: string; sourceDeviceIp: string; results: any[]; summary: { totalDevices: number; successful: number; failed: number } }>>({
      success: true,
      data: {
        userId,
        sourceDeviceIp,
        results,
        summary: {
          totalDevices: targetDeviceIps.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/sync/fingerprint:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to sync fingerprint data",
    }, { status: 500 });
  }
}

