import { NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse } from "@/types";
import { syncManager } from "@/lib/syncManager";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for large syncs

/**
 * POST /api/sync/users
 * Sync users only (no logs) from currently connected device
 */
export async function POST() {
  try {
    if (!zkDevice.isConnected()) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Device not connected. Please connect first.",
      }, { status: 400 });
    }

    // Start users-only sync in background
    syncManager.startSyncUsersOnly().catch(err => {
      console.error("Background users sync error:", err);
    });

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: "Users sync started" },
      message: "Users sync started",
    });

  } catch (error) {
    console.error("Error starting users sync:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start users sync",
    }, { status: 500 });
  }
}

