import { NextResponse } from "next/server";
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CMD_GET_TIME = 201;    // 0xC9
const CMD_SET_TIME = 202;    // 0xCA
const CMD_REFRESHDATA = 1013; // 0x3F5

/**
 * ZK Protocol Time Encoding
 * ((Year % 100) * 12 * 31 + ((Month - 1) * 31) + Day - 1) * (24 * 60 * 60) + (Hour * 60 * 60 + Minute * 60 + Second)
 */
function encodeTime(date: Date): number {
  return (
    ((date.getFullYear() % 100) * 12 * 31 + ((date.getMonth()) * 31) + date.getDate() - 1) * (24 * 60 * 60) +
    (date.getHours() * 60 * 60 + date.getMinutes() * 60 + date.getSeconds())
  );
}

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
 * POST /api/device/time/set
 * Set device time to system time or provided time
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip, port = 4370, time } = body;

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

      // Read current device time before update
      let beforeTime: string | null = null;
      try {
        const respBefore = await zk.ztcp.executeCmd(CMD_GET_TIME, Buffer.alloc(0));
        if (respBefore && respBefore.length >= 12) {
          const timeInt = respBefore.readUInt32LE(8);
          beforeTime = decodeTime(timeInt);
        }
      } catch (e) {
        // Ignore read errors
      }

      // Prepare new time (use provided time or current system time)
      const newTime = time ? new Date(time) : new Date();
      const encodedTime = encodeTime(newTime);
      
      // Create 4-byte buffer
      const timeBuf = Buffer.alloc(4);
      timeBuf.writeUInt32LE(encodedTime, 0);

      // Send Set Time Command
      await zk.ztcp.executeCmd(CMD_SET_TIME, timeBuf);

      // Refresh Data (Important for device to apply changes)
      await zk.ztcp.executeCmd(CMD_REFRESHDATA, Buffer.alloc(0));

      // Read verification
      let afterTime: string | null = null;
      try {
        const respAfter = await zk.ztcp.executeCmd(CMD_GET_TIME, Buffer.alloc(0));
        if (respAfter && respAfter.length >= 12) {
          const timeInt = respAfter.readUInt32LE(8);
          afterTime = decodeTime(timeInt);
        }
      } catch (e) {
        // Ignore read errors
      }

      await zk.disconnect();

      return NextResponse.json<ApiResponse<{
        beforeTime: string | null;
        afterTime: string | null;
        setTime: string;
      }>>({
        success: true,
        data: {
          beforeTime,
          afterTime,
          setTime: decodeTime(encodedTime),
        },
        message: "Device time set successfully",
      });
    } catch (connectError: any) {
      await zk.disconnect().catch(() => {});
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to connect to device: ${connectError.message || 'Connection timeout'}`,
      }, { status: 400 });
    }
  } catch (error) {
    console.error("Error setting device time:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to set device time",
    }, { status: 500 });
  }
}
