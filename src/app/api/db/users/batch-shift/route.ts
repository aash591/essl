import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { inArray } from "drizzle-orm";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/db/users/batch-shift
 * Batch update user shifts
 * Body: { userIds: number[], shiftId: number | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds, shiftId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "User IDs array is required",
      }, { status: 400 });
    }

    // Validate all userIds are numbers
    const validUserIds = userIds
      .map((id: any) => parseInt(id))
      .filter((id: number) => !isNaN(id));

    if (validUserIds.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "No valid user IDs provided",
      }, { status: 400 });
    }

    // Batch update users
    const result = await db
      .update(schema.attUsers)
      .set({
        shiftId: shiftId ? parseInt(shiftId) : null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.attUsers.id, validUserIds))
      .returning();

    return NextResponse.json<ApiResponse<{ updated: number }>>({
      success: true,
      data: { updated: result.length },
    });
  } catch (error) {
    console.error("Error batch updating user shifts:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to batch update users",
    }, { status: 500 });
  }
}


