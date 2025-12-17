import { NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { syncManager } from "@/lib/syncManager";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/all
 * Trigger sync for all registered devices
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

    // Start sync in background (fire and forget from request perspective, 
    // but we return success so UI can start polling)
    // We don't await this promise so the response returns immediately
    syncManager.startSyncAll(devices).catch(err => {
        console.error("Background sync error:", err);
    });

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: `Started syncing ${devices.length} devices` },
      message: "Sync started",
    });

  } catch (error) {
    console.error("Error starting sync all:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start sync",
    }, { status: 500 });
  }
}

