import { NextRequest, NextResponse } from "next/server";
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import { ApiResponse } from "@/types";
import { makeCommKey, CMD_AUTH } from "@/lib/zk-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Raw command codes
const RAW_CMD_OPTIONS = 12;      // 0x0C
const RAW_CMD_DEVICE_INFO = 501; // 0x1F5
const RAW_CMD_GET_DATA = 11;     // 0x0B
const CMD_ACK_OK = 2000;         // Success response code

// The query string for device info (from get-device-info-reversed.ts)
const QUERY_ALL_PARAMS = "~OS=?,ExtendFmt=?,~ExtendFmt=?,ExtendOPLog=?,~ExtendOPLog=?,~Platform=?,~ZKFPVersion=?,WorkCode=?,~SSR=?,~PIN2Width=?,~UserExtFmt=?,BuildVersion=?,AttPhotoForSDK=?,~IsOnlyRFMachine=?,CameraOpen=?,CompatOldFirmware=?,IsSupportPull=?,Language=?,~SerialNumber=?,FaceFunOn=?,~DeviceName=?";

/**
 * Strips the 8-byte ZK header and returns the clean ASCII string.
 */
function cleanString(buffer: Buffer): string {
  if (buffer.length <= 8) return '';
  const raw = buffer.subarray(8).toString('ascii');
  return raw.replace(/\0/g, '').trim();
}

/**
 * Parse key-value pairs from buffer into dictionary
 */
function parseToDict(buffer: Buffer, dict: Record<string, string>) {
  const text = cleanString(buffer);
  const parts = text.split(',');
  parts.forEach(part => {
    const [key, val] = part.split('=');
    if (key && key.trim()) {
      dict[key.trim()] = val || '';
    }
  });
}

/**
 * Parse single key-value response
 */
function parseKeyVal(buffer: Buffer, dict: Record<string, string>, defaultKey: string) {
  const text = cleanString(buffer);
  if (text.includes('=')) {
    const [key, val] = text.split('=');
    dict[key.trim()] = val || '';
  } else {
    dict[defaultKey] = text;
  }
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
 * POST /api/device/info/fetch
 * Fetch device information (serial number, model, etc.) from a device
 * Based on get-device-info-reversed.ts implementation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ip, port = 4370, password } = body;

    if (!ip) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: "IP address is required",
      }, { status: 400 });
    }

    const zk = new ZKLib(ip, port, 10000, 4000);
    const deviceInfo: Record<string, string> = {};

    try {
      await zk.createSocket();

      if (!zk.ztcp) {
        throw new Error('TCP Socket not initialized (zk.ztcp is missing)');
      }

      // Authenticate with password if provided (COM password)
      // Based on get-device-info-reversed.ts implementation
      if (password && password.trim()) {
        try {
          const passInt = parseInt(password, 10);
          if (isNaN(passInt)) {
            throw new Error('Password must be numeric for this auth method');
          }

          // Access sessionId from ztcp or zudp based on connection type
          // @ts-ignore - accessing internal property
          const sessionId = zk.ztcp?.sessionId || zk.zudp?.sessionId;

          if (!sessionId) {
            throw new Error('Could not retrieve Session ID for authentication.');
          }

          // Generate authentication payload using makeCommKey
          const authPayload = makeCommKey(passInt, sessionId);
          const buf = Buffer.alloc(4);
          buf.writeUInt32LE(authPayload, 0);

          // Send authentication command using executeCmd (not ztcp.executeCmd)
          // @ts-ignore - using executeCmd method
          const authResponse = await zk.executeCmd(CMD_AUTH, buf);
          
          if (authResponse && authResponse.length >= 2) {
            const responseCode = authResponse.readUInt16LE(0);
            if (responseCode !== CMD_ACK_OK) {
              throw new Error(`Authentication Failed. Response Code: ${responseCode}`);
            }
          } else {
            throw new Error('Authentication Failed: Invalid response.');
          }
        } catch (authError: any) {
          // If password authentication fails, disconnect and return error
          await zk.disconnect().catch(() => { });
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Password authentication failed: ${authError.message || 'Invalid password. Please check the device password (COM).'}`,
          }, { status: 401 });
        }
      } else {
        // No password provided, just send SDKBuild=1 to verify connection
        try {
          await zk.ztcp.executeCmd(RAW_CMD_OPTIONS, Buffer.from('SDKBuild=1\0', 'ascii'));
        } catch (optionsError: any) {
          await zk.disconnect().catch(() => { });
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Failed to communicate with device: ${optionsError.message || 'Connection error'}`,
          }, { status: 400 });
        }
      }

      // 2. Send the BIG query (CMD_DEVICE_INFO - 501)
      const queryBuf = Buffer.from(QUERY_ALL_PARAMS + '\0', 'ascii');
      const resp2 = await zk.ztcp.executeCmd(RAW_CMD_DEVICE_INFO, queryBuf);
      if (resp2) {
        parseToDict(resp2, deviceInfo);
      }

      // 3. Query ZKFaceVersion
      const faceVerBuf = Buffer.from('ZKFaceVersion\0', 'ascii');
      const resp3 = await zk.ztcp.executeCmd(RAW_CMD_GET_DATA, faceVerBuf);
      if (resp3) parseKeyVal(resp3, deviceInfo, 'ZKFaceVersion');

      // 4. Query MAC Address
      const macBuf = Buffer.from('MAC\0', 'ascii');
      const resp4 = await zk.ztcp.executeCmd(RAW_CMD_GET_DATA, macBuf);
      if (resp4) parseKeyVal(resp4, deviceInfo, 'MAC');

      // 5. Query ProductTime
      const prodTimeBuf = Buffer.from('~ProductTime\0', 'ascii');
      const resp5 = await zk.ztcp.executeCmd(RAW_CMD_GET_DATA, prodTimeBuf);
      if (resp5) parseKeyVal(resp5, deviceInfo, 'ProductTime');

      // 6. Query IP Address
      const ipBuf = Buffer.from('IPAddress\0', 'ascii');
      const resp6 = await zk.ztcp.executeCmd(RAW_CMD_GET_DATA, ipBuf);
      if (resp6) parseKeyVal(resp6, deviceInfo, 'IPAddress');

      // 7. Query Current Device Time (CMD_GET_TIME - 201)
      const resp7 = await zk.ztcp.executeCmd(201, Buffer.alloc(0));
      if (resp7 && resp7.length >= 12) {
        const timeInt = resp7.readUInt32LE(8);
        deviceInfo['DeviceTime'] = decodeTime(timeInt);
      }

      // 8. Query Firmware Version (CMD_GET_VERSION - 1100 / 0x44C)
      const resp8 = await zk.ztcp.executeCmd(1100, Buffer.alloc(0));
      if (resp8) parseKeyVal(resp8, deviceInfo, 'FirmwareVersion');

      await zk.disconnect();

      // Extract relevant fields
      const serialNumber = deviceInfo['~SerialNumber'] || null;
      const deviceModel = deviceInfo['~DeviceName'] || null; // Use Device Name for device model
      const deviceName = deviceInfo['~DeviceName'] || null;
      const firmware = deviceInfo['FirmwareVersion'] || deviceInfo['BuildVersion'] || null;
      const platform = deviceInfo['~Platform'] || deviceInfo['Platform'] || null;
      const os = deviceInfo['~OS'] || deviceInfo['OS'] || null;
      const mac = deviceInfo['MAC'] || null;
      const time = deviceInfo['DeviceTime'] || null;
      const vendor = deviceInfo['~Vendor'] || deviceInfo['Vendor'] || null;

      return NextResponse.json<ApiResponse<{
        serialNumber: string | null;
        deviceModel: string | null;
        firmware: string | null;
        deviceName: string | null;
        platform: string | null;
        os: string | null;
        mac: string | null;
        time: string | null;
        vendor: string | null;
      }>>({
        success: true,
        data: {
          serialNumber,
          deviceModel,
          firmware,
          deviceName,
          platform,
          os,
          mac,
          time,
          vendor,
        },
      });
    } catch (connectError: any) {
      await zk.disconnect().catch(() => { });
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: `Failed to connect to device: ${connectError.message || 'Connection timeout'}`,
      }, { status: 400 });
    }
  } catch (error) {
    console.error("Error fetching device info:", error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch device info",
    }, { status: 500 });
  }
}
