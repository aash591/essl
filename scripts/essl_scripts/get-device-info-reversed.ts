
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import * as readline from 'readline';
import { makeCommKey, CMD_AUTH } from './zk-utils';

const RAW_CMD_OPTIONS = 12;      // 0x0C
const RAW_CMD_DEVICE_INFO = 501; // 0x1F5
const RAW_CMD_GET_DATA = 11;     // 0x0B
const CMD_SET_COMMKEY = 13;      // 0x0D - Used for password authentication

// The huge query string from the hex dump
const QUERY_ALL_PARAMS = "~OS=?,ExtendFmt=?,~ExtendFmt=?,ExtendOPLog=?,~ExtendOPLog=?,~Platform=?,~ZKFPVersion=?,WorkCode=?,~SSR=?,~PIN2Width=?,~UserExtFmt=?,BuildVersion=?,AttPhotoForSDK=?,~IsOnlyRFMachine=?,CameraOpen=?,CompatOldFirmware=?,IsSupportPull=?,Language=?,~SerialNumber=?,FaceFunOn=?,~DeviceName=?";

// Store collected info
const deviceInfo: Record<string, string> = {};

function askQuestion(query: string): Promise<string> {

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function readDeviceInfoReversed(ip: string, port: number, password?: string | null) {

    console.log(`Connecting to ${ip}:${port}...`);
    const zk = new ZKLib(ip, port, 5000, 4000);

    try {
        await zk.createSocket();
        console.log('Connected!');

        if (!zk.ztcp) {
            throw new Error('TCP Socket not initialized (zk.ztcp is missing)');
        }



        // Authenticate with password if provided (COM password)
        if (password && password.trim()) {
            try {
                const passInt = parseInt(password, 10);
                if (isNaN(passInt)) {
                    throw new Error('Password must be numeric for this auth method');
                }
                console.log(`Authenticating with password: ${passInt}...`);

                // Access sessionId from ztcp or zudp based on connection type
                // @ts-ignore - accessing internal property
                const sessionId = zk.ztcp?.sessionId || zk.zudp?.sessionId;

                if (sessionId) {
                    const authPayload = makeCommKey(passInt, sessionId);
                    const buf = Buffer.alloc(4);
                    buf.writeUInt32LE(authPayload, 0);

                    // @ts-ignore
                    const authResponse = await zk.executeCmd(CMD_AUTH, buf);
                    if (authResponse && authResponse.length >= 2) {
                        const responseCode = authResponse.readUInt16LE(0);
                        if (responseCode === 2000) { // CMD_ACK_OK
                            console.log('Password authentication successful!\n');
                        } else {
                            throw new Error(`Authentication Failed. Response Code: ${responseCode}`);
                        }
                    } else {
                        throw new Error('Authentication Failed: Invalid response.');
                    }
                } else {
                    throw new Error('Could not retrieve Session ID for authentication.');
                }

            } catch (authError: any) {
                // If password authentication fails, disconnect and throw error
                try {
                    await zk.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors
                }
                throw new Error(`Password authentication failed: ${authError.message}`);
            }
        } else {

            // No password provided, just send SDKBuild=1 to verify connection
            await zk.ztcp.executeCmd(RAW_CMD_OPTIONS, Buffer.from('SDKBuild=1\0', 'ascii'));
            console.log('No password provided, proceeding without authentication...\n');
        }

        console.log('Fetching device information...\n');

        // 1. Send SDKBuild=1 (CMD_OPTIONS - 12) - Already sent above, but keeping for reference
        // Note: This is already done during password verification, so we can skip it here
        // However, if no password was provided, it was already sent above

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

        printSummary(deviceInfo);

    } catch (e: any) {
        console.error('ERROR:', e.message);
    } finally {
        await zk.disconnect();
    }
}

/**
 * Decodes ZK 32-bit compressed time format.
 * Formula roughly:
 * Second = t % 60
 * Minute = (t / 60) % 60
 * Hour = (t / 3600) % 24
 * Day = (t / (3600*24)) % 31 + 1 (Approx logic, ZK uses specific bit fields usually)
 * 
 * ACTUALLY: ZK often uses:
 * ((Year-2000) * 12 * 31 + ((Month-1) * 31) + Day-1) * (24*60*60) + (Hour*60*60 + Minute*60 + Second)
 * OR:
 * Standard encoded bits:
 * Year: 26-31 (add 2000)
 * Month: 22-25
 * Day: 17-21
 * Hour: 12-16
 * Minute: 6-11
 * Second: 0-5
 */
function decodeTime(t: number): string {
    const second = Math.ceil(t % 60); // ceil? ZK logic sometimes weird, normally standard mod.
    let temp = Math.floor(t / 60);
    const minute = temp % 60;
    temp = Math.floor(temp / 60);
    const hour = temp % 24;
    temp = Math.floor(temp / 24);

    // Day/Month/Year logic involves constant days in months, simplified here:
    // ZK 'old' format vs 'new' format.
    // Let's try the bitwise decode first as it's common in older parsers, 
    // BUT the 'value % 60' approach matches the ZKLib 'decodeTime' usually.

    const day = (temp % 31) + 1;
    temp = Math.floor(temp / 31);
    const month = (temp % 12) + 1;
    temp = Math.floor(temp / 12);
    const year = temp + 2000;

    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function pad(n: number) {
    return n.toString().padStart(2, '0');
}

/**
 * Strips the 8-byte ZK header and returns the clean ASCII string.
 */
function cleanString(buffer: Buffer): string {
    // Header is usually 8 bytes (CMD_ACK + size + session + reply tokens)
    if (buffer.length <= 8) return '';
    // Find the first valid ASCII char or key-value pair start if possible, 
    // but usually just slicing 8 is enough for these command responses.

    // Sometimes the string starts immediately after 8 bytes.
    // However, some responses might have "MAC=" or just "MAC" or binary data.
    // For these specific text commands, it's usually text.

    // We can use a regex to extract "Key=Value" if present, or just trim garbage.
    const raw = buffer.subarray(8).toString('ascii');
    // Remove null terminators and trim
    return raw.replace(/\0/g, '').trim();
}


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

function parseKeyVal(buffer: Buffer, dict: Record<string, string>, defaultKey: string) {
    const text = cleanString(buffer);
    if (text.includes('=')) {
        const [key, val] = text.split('=');
        dict[key.trim()] = val || '';
    } else {
        dict[defaultKey] = text;
    }
}

function printSummary(info: Record<string, string>) {
    console.log('========================================');
    console.log('           DEVICE INFORMATION           ');
    console.log('========================================');

    // Define the updated display mapping
    const displayMap: Record<string, string> = {
        '~DeviceName': 'Device Name      ',
        '~SerialNumber': 'Serial Number    ',
        'MAC': 'MAC Address      ',
        'IPAddress': 'IP Address       ',
        '~Platform': 'Platform         ',
        'FirmwareVersion': 'Firmware Version ', // Derived from Cmd 1100
        'BuildVersion': 'Build Version    ', // Deduced from Cmd 501
        '~ZKFPVersion': 'FP Version       ',
        'ZKFaceVersion': 'Face Version     ',
        '~ProductTime': 'Product Time     ',
        'DeviceTime': 'Current Time     ',
        'UserCount': 'User Count       ',
        'FaceFunOn': 'Face Support     ',
        '~SSR': 'SSR Support      '
    };

    // Print mapped fields
    for (const [key, label] of Object.entries(displayMap)) {
        if (info[key]) {
            console.log(`${label} : ${info[key]}`);
        }
    }
    console.log('========================================');
}

/**
 * Main execution - accepts command-line arguments or prompts interactively
 * Usage: ts-node script.ts [ip] [port] [password]
 * Example: ts-node script.ts 10.10.20.59 4370 000000
 */
async function main() {
    console.log('========================================');
    console.log('     Device Info Reader (Reversed)      ');
    console.log('========================================\n');

    let ip: string;
    let port: number;
    let password: string | null;

    // Check if command-line arguments are provided
    const args = process.argv.slice(2);

    if (args.length > 0) {
        // Use command-line arguments
        ip = args[0];
        port = args[1] ? parseInt(args[1], 10) : 4370;
        password = args[2] && args[2].trim() ? args[2].trim() : null;

        if (!ip || !ip.trim()) {
            console.error('ERROR: IP address is required');
            process.exit(1);
        }

        if (isNaN(port) || port < 1 || port > 65535) {
            console.error('ERROR: Invalid port number. Must be between 1 and 65535');
            process.exit(1);
        }

        console.log(`Using provided parameters:`);
        console.log(`  IP: ${ip}`);
        console.log(`  Port: ${port}`);
        console.log(`  Password: ${password ? '***' : 'None'}\n`);
    } else {
        // Interactive mode - prompt for input
        ip = await askQuestion('Enter device IP address: ');
        if (!ip || !ip.trim()) {
            console.error('ERROR: IP address is required');
            process.exit(1);
        }

        const portInput = await askQuestion('Enter device port (default: 4370): ');
        port = portInput && portInput.trim() ? parseInt(portInput.trim(), 10) : 4370;

        if (isNaN(port) || port < 1 || port > 65535) {
            console.error('ERROR: Invalid port number. Must be between 1 and 65535');
            process.exit(1);
        }

        const passwordInput = await askQuestion('Enter device password (optional, press Enter to skip): ');
        password = passwordInput && passwordInput.trim() ? passwordInput.trim() : null;
        console.log('\n');
    }

    await readDeviceInfoReversed(ip.trim(), port, password);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
