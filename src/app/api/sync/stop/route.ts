import { NextResponse } from "next/server";
import { syncManager } from "@/lib/syncManager";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/stop
 * Stop the currently running sync operation
 */
export async function POST() {
  try {
    const state = syncManager.getState();
    
    if (!state.isSyncing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "No sync in progress",
      }, { status: 400 });
    }

    // Stop the sync
    syncManager.stopSync();

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: "Sync stop requested" },
      message: "Sync will be stopped",
    });

  } catch (error) {
    console.error("Error stopping sync:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop sync",
    }, { status: 500 });
  }
}

