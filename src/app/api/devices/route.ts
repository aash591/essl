import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { eq, sql, desc } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// Default port (4370 is standard for ZKTeco/ESSL devices)
const DEFAULT_PORT = 4370;

/**
 * GET /api/devices
 * Get all registered devices with last log sync time
 */
export async function GET() {
  try {
    const devices = await db.select().from(schema.attDevices).orderBy(schema.attDevices.name);

    // Get last log sync time for each device
    const devicesWithLastSync = await Promise.all(
      devices.map(async (device) => {
        // Query the most recent log for this device
        const lastLog = await db
          .select({
            createdAt: schema.attLogs.createdAt
          })
          .from(schema.attLogs)
          .where(eq(schema.attLogs.deviceId, device.id))
          .orderBy(desc(schema.attLogs.createdAt))
          .limit(1);

        const lastLogSyncTime = lastLog[0]?.createdAt || null;

        return {
          ...device,
          lastLogSyncTime: lastLogSyncTime ? new Date(lastLogSyncTime) : null,
        };
      })
    );

    return NextResponse.json<ApiResponse<typeof devicesWithLastSync>>({
      success: true,
      data: devicesWithLastSync,
    });
  } catch (error) {
    console.error("Error fetching devices:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch devices",
    }, { status: 500 });
  }
}

/**
 * POST /api/devices
 * Create a new device
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, ip, serialNumber, deviceModel, password } = body;

    if (!name || !ip) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Name and IP are required",
      }, { status: 400 });
    }

    // Check if device with this IP already exists
    const existing = await db
      .select()
      .from(schema.attDevices)
      .where(eq(schema.attDevices.ip, ip))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device with this IP address already exists",
      }, { status: 400 });
    }

    // Create new device with default port or from env
    // Use provided password or default to "000000" from schema
    const newDevice = await db
      .insert(schema.attDevices)
      .values({
        name,
        ip,
        serialNumber: serialNumber || null,
        deviceModel: deviceModel || null,
        port: DEFAULT_PORT,
        password: password || null, // Will use schema default '000000' if null
      })
      .returning();

    return NextResponse.json<ApiResponse<typeof newDevice[0]>>({
      success: true,
      data: newDevice[0],
      message: "Device created successfully",
    });
  } catch (error: any) {
    console.error("Error creating device:", error);

    // Handle unique constraint violation
    if (error?.code === '23505') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device with this IP address already exists",
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create device",
    }, { status: 500 });
  }
}

/**
 * PUT /api/devices
 * Update an existing device
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, ip, serialNumber, deviceModel, port, password } = body;

    if (!id) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device ID is required",
      }, { status: 400 });
    }

    // Check if device exists
    const existing = await db
      .select()
      .from(schema.attDevices)
      .where(eq(schema.attDevices.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not found",
      }, { status: 404 });
    }

    // If IP is being changed, check if new IP already exists
    if (ip && ip !== existing[0].ip) {
      const ipExists = await db
        .select()
        .from(schema.attDevices)
        .where(eq(schema.attDevices.ip, ip))
        .limit(1);

      if (ipExists.length > 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: "Device with this IP address already exists",
        }, { status: 400 });
      }
    }

    // Update device
    // Only update password if a new password is provided (not null/empty), otherwise keep existing password
    const updateData: any = {
      ...(name && { name }),
      ...(ip && { ip }),
      ...(serialNumber !== undefined && { serialNumber: serialNumber || null }),
      ...(deviceModel !== undefined && { deviceModel: deviceModel || null }),
      ...(port && { port: parseInt(port) }),
    };

    // Only update password if a new value is explicitly provided (not null/empty)
    // If password is null or empty, don't update it (keep existing password in DB)
    if (password !== undefined && password !== null && password.trim() !== '') {
      updateData.password = password.trim();
    }

    const updated = await db
      .update(schema.attDevices)
      .set(updateData)
      .where(eq(schema.attDevices.id, id))
      .returning();

    return NextResponse.json<ApiResponse<typeof updated[0]>>({
      success: true,
      data: updated[0],
      message: "Device updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating device:", error);

    if (error?.code === '23505') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device with this IP address already exists",
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update device",
    }, { status: 500 });
  }
}

/**
 * DELETE /api/devices
 * Delete a device
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device ID is required",
      }, { status: 400 });
    }

    // Check if device exists
    const existing = await db
      .select()
      .from(schema.attDevices)
      .where(eq(schema.attDevices.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not found",
      }, { status: 404 });
    }

    // Delete device
    await db
      .delete(schema.attDevices)
      .where(eq(schema.attDevices.id, parseInt(id)));

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: "Device deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting device:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete device",
    }, { status: 500 });
  }
}

