import { NextRequest, NextResponse } from "next/server";
import { zkDevice } from "@/lib/zkDevice";
import { ApiResponse } from "@/types";
import { db, schema } from "@/lib/drizzle/db";
import { eq, and, sql } from "drizzle-orm";
import { fpLock } from "@/lib/fpLock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/fingerprint/read
 * Read fingerprint templates for a user from a device
 * Query params: userId, deviceIp, devicePort, force (optional - if true, bypasses skip check and forces fresh read)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const deviceIp = searchParams.get("deviceIp");
    const devicePort = searchParams.get("devicePort");
    const force = searchParams.get("force") === "true";

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId is required",
      }, { status: 400 });
    }

    if (!deviceIp || !devicePort) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "deviceIp and devicePort are required",
      }, { status: 400 });
    }

    const port = parseInt(devicePort);
    if (isNaN(port)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "Invalid devicePort",
      }, { status: 400 });
    }

    console.log(`[Fingerprint Read API] Reading fingerprints for user ${userId} from device ${deviceIp}:${port}`);

    // Get device ID from database first
    let deviceId: number | null = null;
    let devicePassword: string | null = null;
    try {
      const deviceRecord = await db
        .select({ id: schema.attDevices.id, password: schema.attDevices.password })
        .from(schema.attDevices)
        .where(eq(schema.attDevices.ip, deviceIp))
        .limit(1);

      if (deviceRecord.length > 0) {
        deviceId = deviceRecord[0].id;
        devicePassword = deviceRecord[0].password;
      }
    } catch (error) {
      console.warn(`Could not fetch device record for IP ${deviceIp}:`, error);
    }

    // Check if FP data already exists for this user+device combination
    // Skip reading if device_id already exists in FP table for this user (unless force=true)
    if (deviceId !== null && !force) {
      try {
        const existingFpData = await db
          .select()
          .from(schema.attFpData)
          .where(
            and(
              eq(schema.attFpData.userId, userId),
              eq(schema.attFpData.deviceId, deviceId)
            )
          )
          .limit(1);

        if (existingFpData.length > 0) {
          console.log(`[Fingerprint Read API] FP data already exists for user ${userId} on device ${deviceId}, skipping read`);

          // Return existing templates from database for this specific device
          // Note: These templates may include ones that are not currently on the device
          const existingTemplates = await db
            .select()
            .from(schema.attFpData)
            .where(
              and(
                eq(schema.attFpData.userId, userId),
                eq(schema.attFpData.deviceId, deviceId)
              )
            );

          // Parse fingerIndex format to get availability info from stored data
          return NextResponse.json<ApiResponse<{
            userId: string;
            templates: Array<{
              uid: number;
              fingerIdx: number;
              valid: number;
              template: string;
              size: number;
              onDevice?: boolean;
            }>;
            skipped: boolean;
          }>>({
            success: true,
            data: {
              userId,
              templates: existingTemplates.map(t => {
                const parts = t.fingerIndex.split(',');
                const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
                const onDevice = parts.length === 2 ? parts[1] === '1' : undefined; // Use stored availability info
                
                return {
                  uid: 0, // Not available from DB
                  fingerIdx: fingerIdx,
                  valid: t.flag || 1,
                  template: t.template,
                  size: t.templateLength,
                  onDevice: onDevice, // From stored availability info
                };
              }),
              skipped: true,
            },
            message: 'Fingerprint data already exists in database, skipped device read',
          });
        }
      } catch (error) {
        console.warn('[Fingerprint Read API] Error checking existing FP data:', error);
        // Continue with read if check fails
      }
    }

    // Acquire global lock for FP operation (only one at a time)
    const releaseLock = await fpLock.acquireGlobal();

    try {
      // Connect to device
      const connected = await zkDevice.connect({
        ip: deviceIp,
        port: port,
        timeout: 10000,
        inport: 4000,
        password: devicePassword,
      });

      if (!connected) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Failed to connect to device at ${deviceIp}:${port}`,
        }, { status: 500 });
      }

      // Get fingerprint templates for the user
      const templates = await zkDevice.getFingerprintTemplates(userId);

      // Auto-save fingerprint data to database (handle both cases: templates exist or not)
      if (!deviceId) {
        console.warn(`[Fingerprint Read API] deviceId is null, cannot save templates`);
      } else {
        try {
          // Verify user exists
          const user = await db
            .select()
            .from(schema.attUsers)
            .where(eq(schema.attUsers.userId, userId))
            .limit(1);

          if (user.length > 0) {
            let savedCount = 0;
            let updatedCount = 0;
            let deletedCount = 0;

            // Get all existing templates in DB for this user+device combination
            const existingDbTemplates = await db
              .select()
              .from(schema.attFpData)
              .where(
                and(
                  eq(schema.attFpData.userId, userId),
                  eq(schema.attFpData.deviceId, deviceId)
                )
              );

            // Track which finger indices are present on device
            const deviceFingerIndices = new Set(templates.map(t => t.fingerIdx));

            // Helper function to parse fingerIndex format: "index,availability" or just "index" (legacy)
            const parseFingerIndex = (fingerIndexStr: string): { index: number; availability?: number } => {
              const parts = fingerIndexStr.split(',');
              if (parts.length === 2) {
                return { index: parseInt(parts[0]), availability: parseInt(parts[1]) };
              }
              // Legacy format: just the index number
              return { index: parseInt(fingerIndexStr) };
            };

            // Helper function to format fingerIndex: "index,availability"
            const formatFingerIndex = (index: number, available: boolean): string => {
              return `${index},${available ? 1 : 0}`;
            };

            // Update or insert templates from device
            for (const template of templates) {
              const { fingerIdx, valid, template: templateData, size } = template;
              const fingerIndexStr = formatFingerIndex(fingerIdx, true); // Available on device

              // Find existing template by parsing fingerIndex
              const existing = existingDbTemplates.find(t => {
                const parsed = parseFingerIndex(t.fingerIndex);
                return parsed.index === fingerIdx;
              });

              if (existing) {
                // Update existing template with new availability info
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
            }

            // Check for templates in DB that are not on device (but don't delete them)
            // Update their availability status to 0 (not on device)
            for (const dbTemplate of existingDbTemplates) {
              const parsed = parseFingerIndex(dbTemplate.fingerIndex);
              if (!deviceFingerIndices.has(parsed.index)) {
                // Template exists in DB but not on device - update availability to 0
                const fingerIndexStr = formatFingerIndex(parsed.index, false);
                await db
                  .update(schema.attFpData)
                  .set({
                    fingerIndex: fingerIndexStr, // Update to "index,0"
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(schema.attFpData.userId, userId),
                      eq(schema.attFpData.deviceId, deviceId),
                      sql`SPLIT_PART(${schema.attFpData.fingerIndex}, ',', 1)::integer = ${parsed.index}`
                    )
                  );
              }
            }

            const dbOnlyTemplates = existingDbTemplates.filter(
              dbTemplate => {
                const parsed = parseFingerIndex(dbTemplate.fingerIndex);
                return !deviceFingerIndices.has(parsed.index);
              }
            );

            if (dbOnlyTemplates.length > 0) {
              console.log(`[Fingerprint Read API] Found ${dbOnlyTemplates.length} template(s) in DB that are not on device (preserved in DB): ${dbOnlyTemplates.map(t => `F${t.fingerIndex}`).join(', ')}`);
            }

            console.log(`[Fingerprint Read API] Auto-saved: ${savedCount} new, ${updatedCount} updated. ${dbOnlyTemplates.length} template(s) in DB but not on device (preserved for future use)`);
          }
        } catch (saveError: any) {
          console.error('[Fingerprint Read API] Error auto-saving fingerprint data:', saveError);
          // Don't fail the request if save fails
        }
      }

      // Get final templates from DB (after sync) to return accurate data
      // Include both templates from device AND templates in DB that are not on device
      let finalTemplates = templates;
      if (deviceId) {
        try {
          const dbTemplates = await db
            .select()
            .from(schema.attFpData)
            .where(
              and(
                eq(schema.attFpData.userId, userId),
                eq(schema.attFpData.deviceId, deviceId)
              )
            );
          
          // Map DB templates to response format
          // This includes templates that are on device AND templates that are only in DB
          // Parse fingerIndex format: "index,availability"
          finalTemplates = dbTemplates.map(t => {
            const parts = t.fingerIndex.split(',');
            const fingerIdx = parts.length === 2 ? parseInt(parts[0]) : parseInt(t.fingerIndex);
            const onDevice = parts.length === 2 ? parts[1] === '1' : false; // Default to false for legacy format
            
            return {
              uid: 0, // Not available from DB
              fingerIdx: fingerIdx,
              valid: t.flag || 1,
              template: t.template,
              size: t.templateLength,
              // Mark if template is on device or only in DB (from stored availability info)
              onDevice: onDevice,
            };
          });
        } catch (error) {
          console.warn('[Fingerprint Read API] Error fetching final templates from DB:', error);
          // Fallback to device templates
        }
      }

      return NextResponse.json<ApiResponse<{
        userId: string;
        templates: Array<{
          uid: number;
          fingerIdx: number;
          valid: number;
          template: string;
          size: number;
          onDevice?: boolean; // true if on device, false if only in DB
        }>;
        skipped: boolean;
      }>>({
        success: true,
        data: {
          userId,
          templates: finalTemplates,
          skipped: false,
        },
      });
    } finally {
      // Always release the lock
      releaseLock();
    }

  } catch (error: any) {
    console.error("[Fingerprint Read API] Error:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to read fingerprint data",
    }, { status: 500 });
  }
}
