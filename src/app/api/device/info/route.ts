import { NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse, DeviceInfo } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!zkDevice.isConnected()) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not connected. Please connect first.",
      }, { status: 400 });
    }

    const info = await zkDevice.getInfo();

    // Try to get device time, but don't fail if it errors (some devices don't support it)
    let deviceTime: string | null = null;
    try {
      const time = await zkDevice.getTime();
      deviceTime = time.toISOString();
    } catch (timeError) {
      console.warn("Could not get device time (not supported by this device):", timeError);
      // Use current server time as fallback
      deviceTime = new Date().toISOString();
    }

    return NextResponse.json<ApiResponse<DeviceInfo & { deviceTime: string | null }>>({
      success: true,
      data: {
        ...info!,
        deviceTime,
      },
    });

  } catch (error) {
    console.error("Error getting device info:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get device info",
    }, { status: 500 });
  }
}
