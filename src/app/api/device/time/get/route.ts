import { NextResponse } from "next/server";
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CMD_GET_TIME = 201; // 0xC9

/**
 * Decode ZK 32-bit compressed time format
 */
function decodeTime(t: number): string {
  const second = Math.ceil(t % 60);
  let temp = Math.floor(t / 60);
  const minute = temp % 60;
  temp = Math.floor(temp / 60);
  const hour = temp % 24;
  temp = Math.floor(temp / 24);
  const day = (temp % 31) + 1;
  temp = Math.floor(temp / 31);
  const month = (temp % 12) + 1;
  temp = Math.floor(temp / 12);
  const year = temp + 2000;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * POST /api/device/time/get
 * Get current time from a device
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip, port = 4370 } = body;

    if (!ip) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "IP address is required",
      }, { status: 400 });
    }

    const zk = new ZKLib(ip, port, 10000, 4000);
    
    try {
      await zk.createSocket();

      if (!zk.ztcp) {
        throw new Error('TCP Socket not initialized (zk.ztcp is missing)');
      }

      // Read device time
      const resp = await zk.ztcp.executeCmd(CMD_GET_TIME, Buffer.alloc(0));
      
      await zk.disconnect();

      if (resp && resp.length >= 12) {
        const timeInt = resp.readUInt32LE(8);
        const deviceTime = decodeTime(timeInt);
        const deviceTimeISO = new Date(deviceTime).toISOString();

        return NextResponse.json<ApiResponse<{
          deviceTime: string;
          deviceTimeISO: string;
        }>>({
          success: true,
          data: {
            deviceTime,
            deviceTimeISO,
          },
        });
      } else {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: "Failed to read device time",
        }, { status: 400 });
      }
    } catch (connectError: any) {
      await zk.disconnect().catch(() => {});
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to connect to device: ${connectError.message || 'Connection timeout'}`,
      }, { status: 400 });
    }
  } catch (error) {
    console.error("Error getting device time:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get device time",
    }, { status: 500 });
  }
}
