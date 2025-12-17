import { NextRequest, NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse, DeviceConnection } from "@/types";
import { db, schema } from "@/lib/drizzle/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body: DeviceConnection = await request.json();

    const { ip, port, timeout = 10000, inport = 4000 } = body;

    if (!ip || !port) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "IP and Port are required",
      }, { status: 400 });
    }

    console.log(`Attempting to connect to device at ${ip}:${port}...`);

    // Fetch device password from database
    let devicePassword: string | null = null;
    try {
      const deviceRecord = await db
        .select({ password: schema.attDevices.password })
        .from(schema.attDevices)
        .where(eq(schema.attDevices.ip, ip))
        .limit(1);
      
      if (deviceRecord.length > 0) {
        devicePassword = deviceRecord[0].password;
      }
    } catch (error) {
      console.warn(`Could not fetch device password for IP ${ip}:`, error);
    }

    // Connect to device with provided configuration and password
    try {
      const connected = await zkDevice.connect({ ip, port, timeout, inport, password: devicePassword });

      if (!connected) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Failed to connect to device at ${ip}:${port}. Please check if the device is online and the IP/port/DeviceComPassword are correct.`,
        }, { status: 500 });
      }

      return NextResponse.json<ApiResponse<{ connected: boolean }>>({
        success: true,
        data: { connected: true },
        message: `Connected to device at ${ip}:${port} successfully`,
      });
    } catch (connectError: any) {
      // Handle authentication errors specifically
      if (connectError.message && connectError.message.includes("Authentication failed")) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: connectError.message,
        }, { status: 401 });
      }
      throw connectError;
    }

  } catch (error) {
    console.error("Connection error:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error !== null && 'err' in error)
        ? String((error as { err: unknown }).err)
        : "Failed to connect to device";

    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await zkDevice.disconnect();
    zkDevice.clearConfig(); // Clear stored config on manual disconnect

    return NextResponse.json<ApiResponse<{ connected: boolean }>>({
      success: true,
      data: { connected: false },
      message: "Disconnected from device",
    });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to disconnect",
    }, { status: 500 });
  }
}
