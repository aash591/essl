import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/fingerprint/sync
 * Sync fingerprint data for a user from source device to target device using winax script
 * Body: { userId, sourceIP, sourcePort, targetIP, targetPort, sourcePassword?, targetPassword? }
 */
export async function POST(request: NextRequest) {
  console.log("[Fingerprint Sync API] Request received (winax script)");
  try {
    const body = await request.json();
    console.log("[Fingerprint Sync API] Request body:", JSON.stringify(body, null, 2));

    const { userId, sourceIP, sourcePort, targetIP, targetPort, sourcePassword, targetPassword } = body;

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "userId is required",
      }, { status: 400 });
    }

    if (!sourceIP || !sourcePort || !targetIP || !targetPort) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "sourceIP, sourcePort, targetIP, and targetPort are required",
      }, { status: 400 });
    }

    // Path to winax TypeScript script
    const scriptPath = path.join(process.cwd(), "scripts", "sync-user-fp-between-devices-winax.ts");
    console.log("[Fingerprint Sync API] Using script:", scriptPath);

    // Build args
    const args = [
      scriptPath,
      sourceIP,
      sourcePort.toString(),
      targetIP,
      targetPort.toString(),
      userId,
      sourcePassword || "",
      targetPassword || "",
    ];

    console.log("[Fingerprint Sync API] Spawning ts-node/tsx winax script with args:", args);

    return new Promise<NextResponse>((resolve) => {
      const child = spawn("npx", ["tsx", ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log("[Fingerprint Sync API] child stdout chunk:", chunk.substring(0, 200));
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.log("[Fingerprint Sync API] child stderr chunk:", chunk.substring(0, 200));
      });

      child.on("close", (code) => {
        console.log("[Fingerprint Sync API] child exited code:", code);
        console.log("[Fingerprint Sync API] child stdout len:", stdout.length, "stderr len:", stderr.length);

        const output = stdout + stderr;

        if (code === 0) {
          resolve(NextResponse.json<ApiResponse<any>>({
            success: true,
            data: { userId, sourceIP, targetIP, output: output.substring(0, 2000) },
            message: `Fingerprint sync completed for user ${userId}`,
          }));
        } else {
          resolve(NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Sync failed (code ${code}). ${output.substring(0, 1000)}`,
          }, { status: 500 }));
        }
      });

      child.on("error", (err) => {
        console.error("[Fingerprint Sync API] child process error:", err);
        resolve(NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Failed to launch winax script: ${err.message}`,
        }, { status: 500 }));
      });
    });
  } catch (error: any) {
    console.error("[Fingerprint Sync API] Exception:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error.message || "Failed to sync fingerprint data",
    }, { status: 500 });
  }
}

