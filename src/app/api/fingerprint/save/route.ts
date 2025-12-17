import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { ApiResponse } from "@/types";
import { eq, and, sql } from "drizzle-orm";
import { fpLock } from "@/lib/fpLock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/fingerprint/save
 * Save fingerprint templates to database
 * Body: { userId, templates: Array<{ uid, fingerIdx, valid, template, size }> }
 */
export async function POST(request: NextRequest) {
  let releaseLock: (() => void) | null = null;
  
  try {
    const body = await request.json();
    const { userId, templates, deviceId } = body;

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId is required",
      }, { status: 400 });
    }

    if (!deviceId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "deviceId is required",
      }, { status: 400 });
    }

    if (!templates || !Array.isArray(templates)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "templates array is required",
      }, { status: 400 });
    }

    console.log(`[Fingerprint Save API] Saving ${templates.length} templates for user ${userId}`);

    // Acquire global lock for FP operation (only one at a time)
    releaseLock = await fpLock.acquireGlobal();
    
    // Verify user exists
    const user = await db
      .select()
      .from(schema.attUsers)
      .where(eq(schema.attUsers.userId, userId))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `User ${userId} not found in database`,
      }, { status: 404 });
    }

    // Save or update each template
    let savedCount = 0;
    let updatedCount = 0;
    let errors: string[] = [];

    // Helper function to format fingerIndex: "index,availability"
    const formatFingerIndex = (index: number, available: boolean): string => {
      return `${index},${available ? 1 : 0}`;
    };

    for (const template of templates) {
      try {
        const { fingerIdx, valid, template: templateData, size } = template;
        const fingerIndexStr = formatFingerIndex(fingerIdx, true); // Assume available when saving

        // Check if template already exists for this user + finger + device combination
        // Parse fingerIndex to match by index part
        const existing = await db
          .select()
          .from(schema.attFpData)
          .where(
            and(
              eq(schema.attFpData.userId, userId),
              eq(schema.attFpData.deviceId, deviceId),
              sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIdx}`
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing template
          await db
            .update(schema.attFpData)
            .set({
              fingerIndex: fingerIndexStr, // Update with availability info
              template: templateData,
              templateLength: size,
              flag: valid,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.attFpData.userId, userId),
                eq(schema.attFpData.deviceId, deviceId),
                sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${fingerIdx}`
              )
            );
          updatedCount++;
        } else {
          // Insert new template
          await db.insert(schema.attFpData).values({
            userId: userId,
            fingerIndex: fingerIndexStr, // Format: "index,availability"
            template: templateData,
            templateLength: size,
            flag: valid,
            deviceId: deviceId,
          });
          savedCount++;
        }
      } catch (error: any) {
        console.error(`Error saving template for finger ${template.fingerIdx}:`, error);
        errors.push(`Finger ${template.fingerIdx}: ${error.message || 'Unknown error'}`);
      }
    }

    return NextResponse.json<ApiResponse<{
      saved: number;
      updated: number;
      errors: string[];
    }>>({
      success: true,
      data: {
        saved: savedCount,
        updated: updatedCount,
        errors,
      },
      message: `Saved ${savedCount} new template(s), updated ${updatedCount} existing template(s)`,
    });

  } catch (error: any) {
    console.error("[Fingerprint Save API] Error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to save fingerprint data",
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (releaseLock) {
      releaseLock();
    }
  }
}
