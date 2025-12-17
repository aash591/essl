import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/drizzle/db";
import { eq, and, sql } from "drizzle-orm";
import { ApiResponse } from "@/types";
import type { AttFpData } from "@/lib/drizzle/schema/attendance";

export const dynamic = "force-dynamic";

/**
 * POST /api/db/fingerprint
 * Save fingerprint template data from PowerShell script output
 * Body: { templates: Array<{userId, fingerIndex, template, templateLength, flag}>, sourceDeviceIp }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templates, sourceDeviceIp } = body;

    if (!templates || !Array.isArray(templates)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Invalid request: templates array is required",
      }, { status: 400 });
    }

    if (!sourceDeviceIp) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Invalid request: sourceDeviceIp is required",
      }, { status: 400 });
    }

    // Look up device ID from IP address
    let deviceId: number | null = null;
    try {
      const device = await db
        .select()
        .from(schema.attDevices)
        .where(eq(schema.attDevices.ip, sourceDeviceIp))
        .limit(1);
      
      if (device.length > 0) {
        deviceId = device[0].id;
      } else {
        // Device not found - create it
        const [newDevice] = await db.insert(schema.attDevices).values({
          name: `Device ${sourceDeviceIp}`,
          ip: sourceDeviceIp,
          port: 4370,
        }).returning();
        deviceId = newDevice.id;
      }
    } catch (error: any) {
      console.error(`Error looking up/creating device for IP ${sourceDeviceIp}:`, error);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to find or create device for IP ${sourceDeviceIp}: ${error.message}`,
      }, { status: 500 });
    }

    let saved = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const template of templates) {
      try {
        const { userId, fingerIndex, template: templateData, templateLength, flag } = template;

        if (!userId || fingerIndex === undefined || !templateData || !templateLength) {
          errors++;
          errorDetails.push(`Invalid template data for userId: ${userId}, fingerIndex: ${fingerIndex}`);
          continue;
        }

        // Check if template already exists for this user + finger + device combination
        // Parse fingerIndex to match by index part (format: "index,availability")
        const existing = await db
          .select()
          .from(schema.attFpData)
          .where(
            and(
              eq(schema.attFpData.userId, String(userId)),
              sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${parseInt(String(fingerIndex))}`,
              eq(schema.attFpData.deviceId, deviceId!)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing template
          await db
            .update(schema.attFpData)
            .set({
              template: templateData,
              templateLength: parseInt(String(templateLength)),
              flag: flag ? parseInt(String(flag)) : 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.attFpData.userId, String(userId)),
                sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${parseInt(String(fingerIndex))}`,
                eq(schema.attFpData.deviceId, deviceId!)
              )
            );
          updated++;
        } else {
          // Insert new template (deviceId is required)
          if (!deviceId) {
            errors++;
            errorDetails.push(`Device ID is required for template userId: ${userId}, fingerIndex: ${fingerIndex}`);
            continue;
          }
          await db.insert(schema.attFpData).values({
            userId: String(userId),
            fingerIndex: `${parseInt(String(fingerIndex))},0`, // Format: "index,availability" (0 = not on device initially)
            template: templateData,
            templateLength: parseInt(String(templateLength)),
            flag: flag ? parseInt(String(flag)) : 1,
            deviceId: deviceId,
          });
          saved++;
        }
      } catch (error: any) {
        errors++;
        errorDetails.push(`Error processing template: ${error.message}`);
        console.error(`Error saving fingerprint template:`, error);
      }
    }

    return NextResponse.json<ApiResponse<{ saved: number; updated: number; errors: number; total: number; errorDetails?: string[] }>>({
      success: true,
      data: {
        saved,
        updated,
        errors,
        total: templates.length,
        errorDetails: errors > 0 ? errorDetails : undefined,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/db/fingerprint:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to save fingerprint data",
    }, { status: 500 });
  }
}

/**
 * GET /api/db/fingerprint
 * Get fingerprint templates for a user
 * Query params: userId (required), aggregated (optional - if true, returns aggregated templates across all devices)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const aggregated = searchParams.get("aggregated") === "true";

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId query parameter is required",
      }, { status: 400 });
    }

    if (aggregated) {
      // Get all templates for the user across all devices
      const allTemplates = await db
        .select({
          id: schema.attFpData.id,
          userId: schema.attFpData.userId,
          fingerIndex: schema.attFpData.fingerIndex,
          template: schema.attFpData.template,
          templateLength: schema.attFpData.templateLength,
          flag: schema.attFpData.flag,
          deviceId: schema.attFpData.deviceId,
          createdAt: schema.attFpData.createdAt,
          updatedAt: schema.attFpData.updatedAt,
        })
        .from(schema.attFpData)
        .where(eq(schema.attFpData.userId, userId));

      // Helper function to parse fingerIndex format: "index,availability" or just "index"
      const parseFingerIndex = (fingerIndexStr: string): { index: number; availability?: number } => {
        const parts = fingerIndexStr.split(',');
        if (parts.length === 2) {
          return { index: parseInt(parts[0]), availability: parseInt(parts[1]) };
        }
        return { index: parseInt(fingerIndexStr) };
      };

      // Group templates by fingerIdx and template data
      // Map: fingerIdx -> Map: template (base64) -> { template data, deviceIds that have it }
      const aggregatedMap = new Map<number, Map<string, {
        fingerIdx: number;
        template: string;
        size: number;
        valid: number;
        deviceIds: number[];
        onDeviceByDevice: Map<number, boolean>; // deviceId -> onDevice status
      }>>();

      for (const dbTemplate of allTemplates) {
        const parsed = parseFingerIndex(dbTemplate.fingerIndex);
        const fingerIdx = parsed.index;
        const onDevice = parsed.availability !== undefined ? parsed.availability === 1 : true; // Default to true for legacy

        if (!aggregatedMap.has(fingerIdx)) {
          aggregatedMap.set(fingerIdx, new Map());
        }

        const templateMap = aggregatedMap.get(fingerIdx)!;
        const templateKey = dbTemplate.template;

        if (!templateMap.has(templateKey)) {
          templateMap.set(templateKey, {
            fingerIdx,
            template: dbTemplate.template,
            size: dbTemplate.templateLength,
            valid: dbTemplate.flag || 1,
            deviceIds: [],
            onDeviceByDevice: new Map(),
          });
        }

        const aggregatedTemplate = templateMap.get(templateKey)!;
        if (!aggregatedTemplate.deviceIds.includes(dbTemplate.deviceId)) {
          aggregatedTemplate.deviceIds.push(dbTemplate.deviceId);
        }
        aggregatedTemplate.onDeviceByDevice.set(dbTemplate.deviceId, onDevice);
      }

      // Convert to array format: for each fingerIdx, if there are templates with same data, use the first one
      // If there are different templates for the same fingerIdx, we'll use the most common one (or first)
      const aggregatedTemplates: Array<{
        fingerIdx: number;
        template: string;
        size: number;
        valid: number;
        deviceIds: number[];
        onDeviceByDevice: Record<number, boolean>;
      }> = [];

      for (const [fingerIdx, templateMap] of aggregatedMap.entries()) {
        // If multiple templates exist for same fingerIdx, prefer the one that exists on most devices
        // or the one that's on device (not just in DB)
        let bestTemplate: {
          fingerIdx: number;
          template: string;
          size: number;
          valid: number;
          deviceIds: number[];
          onDeviceByDevice: Map<number, boolean>;
        } | null = null;
        let bestScore = -1;

        for (const templateData of templateMap.values()) {
          // Score: prioritize templates that are on devices (not just in DB)
          const onDeviceCount = Array.from(templateData.onDeviceByDevice.values()).filter(v => v).length;
          const score = onDeviceCount * 1000 + templateData.deviceIds.length;

          if (score > bestScore) {
            bestScore = score;
            bestTemplate = templateData;
          }
        }

        if (bestTemplate) {
          aggregatedTemplates.push({
            fingerIdx: bestTemplate.fingerIdx,
            template: bestTemplate.template,
            size: bestTemplate.size,
            valid: bestTemplate.valid,
            deviceIds: bestTemplate.deviceIds,
            onDeviceByDevice: Object.fromEntries(bestTemplate.onDeviceByDevice),
          });
        }
      }

      // Sort by fingerIdx
      aggregatedTemplates.sort((a, b) => a.fingerIdx - b.fingerIdx);

      return NextResponse.json<ApiResponse<typeof aggregatedTemplates>>({
        success: true,
        data: aggregatedTemplates,
      });
    } else {
      // Original behavior: return all templates per device
      const templates = await db
        .select()
        .from(schema.attFpData)
        .where(eq(schema.attFpData.userId, userId))
        .orderBy(schema.attFpData.fingerIndex);

      return NextResponse.json<ApiResponse<AttFpData[]>>({
        success: true,
        data: templates,
      });
    }
  } catch (error: any) {
    console.error("Error in GET /api/db/fingerprint:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to fetch fingerprint data",
    }, { status: 500 });
  }
}

