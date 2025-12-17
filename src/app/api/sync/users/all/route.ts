import { NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { syncManager } from "@/lib/syncManager";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/users/all
 * Trigger users-only sync for all registered devices
 */
export async function POST() {
  try {
    const devices = await db.select().from(schema.attDevices).orderBy(schema.attDevices.name);

    if (devices.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "No devices registered",
      }, { status: 400 });
    }

    // Check if sync is already running
    const state = syncManager.getState();
    if (state.isSyncing) {
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: "Sync already in progress",
        }, { status: 409 });
    }

    // Start users-only sync in background
    syncManager.startSyncUsersOnlyAll(devices).catch(err => {
        console.error("Background users sync error:", err);
    });

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: `Started syncing users from ${devices.length} devices` },
      message: "Users sync started",
    });

  } catch (error) {
    console.error("Error starting users sync all:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start users sync",
    }, { status: 500 });
  }
}

