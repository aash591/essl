
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';

// Access internal constants if possible, or define them
// From zkteco-js/src/helper/command.js
const COMMANDS = {
    CMD_DB_RRQ: 7,
    CMD_USERTEMP_RRQ: 9,
    CMD_DATA_WRRQ: 1503,
};

const REQUEST_DATA = {
    // Custom request for Fingerprint Templates
    // 0x01 (Version?), 0x07 (CMD_DB_RRQ), 0x00, 0x02 (EF_FINGER), ... padding
    GET_TEMPLATES: Buffer.from([0x01, 0x07, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
};

// Helper to decode template data (heuristic based)
// Standard ZK template header often includes size, pin, finger index
// Structure roughly: [Size(2)][PIN(2)][FingerID(1)][Valid(1)][Template(Variable)]...
function decodeTemplateData(buf: Buffer) {
    const templates: any[] = [];
    let offset = 0;

    // This is a naive parser and might need adjustment based on specific device model (TFT vs B&W)
    // Assuming binary templates from a defined stream
    // Many modern ZK devices use a specific structure for SSR_UserTmp

    // If we just get a raw stream of templates, we need to know the structure size
    // For many devices it is consistent.

    // For now, we will just try to identify plausible chunks
    // OR we can just store the raw base64 and user manually matches it? 
    // No, we need to associate with User ID.

    // Let's rely on a common structure:
    // Size (2 bytes LE)
    // UID (2 bytes LE)
    // FingerIdx (1 byte)
    // Valid (1 byte)
    // TemplateContent...

    while (offset < buf.length) {
        if (offset + 6 > buf.length) break;

        const size = buf.readUInt16LE(offset);
        const uid = buf.readUInt16LE(offset + 2);
        const fingerIdx = buf.readUInt8(offset + 4);
        const valid = buf.readUInt8(offset + 5);

        // Sanity check size
        if (size > 2000 || size <= 0) {
            // Probably lost sync or invalid format
            offset++;
            continue;
        }

        if (offset + size > buf.length) break;

        const templateData = buf.subarray(offset + 6, offset + size);

        templates.push({
            uid,
            fingerIdx,
            valid,
            template: templateData.toString('base64'),
            size
        });

        offset += size;
    }
    return templates;
}

const readline = require('readline');

// Parse command line arguments first
const args = process.argv.slice(2);
let userId = args[0] || '';
let ip = args[1] || '';
let port = parseInt(args[2] || '0');

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(query, (ans: string) => {
            rl.close();
            resolve(ans);
        });
    });
}

(async () => {
    // Interactive mode if IP is not provided
    if (!ip) {
        console.log('=== Interactive Mode ===');
        ip = await askQuestion('Enter device IP (e.g., 10.10.20.59): ');
        if (!ip) {
            console.error('IP address is required.');
            process.exit(1);
        }

        const portStr = await askQuestion('Enter port (default 4370): ');
        port = portStr ? parseInt(portStr) : 4370;

        userId = await askQuestion('Enter User ID (blank to read ALL users): ');
    }

    if (!port) port = 4370;

    console.log('---------------------------------------------------');
    console.log('ZK Device User Info & Template Retriever (Linux/Node)');
    console.log(`Target IP: ${ip}:${port}`);
    if (userId) console.log(`Filter User ID: ${userId}`);
    console.log('---------------------------------------------------\n');

    let zk: any = null;
    try {
        zk = new ZKLib(ip, port, 10000, 4000);
        console.log('Connecting...');
        await zk.createSocket();
        console.log('Connected! Fetching Users...');

        // Get Users
        const users = await zk.getUsers();
        console.log(`Found ${users.data.length} users.`);

        if (userId) {
            const targetUser = users.data.find((u: any) => u.userId === userId);
            if (!targetUser) {
                console.error(`User ${userId} not found in user list!`);
                // Continue anyway? No, exit if specific user requested
            } else {
                console.log(`User found: ${targetUser.name} (UID: ${targetUser.uid}, UserID: ${targetUser.userId})`);
            }
        }

        // Get Templates
        // Accessing internal ztcp to send custom command
        console.log('Fetching Fingerprint Templates...');

        let templateRecords: any[] = [];

        if (zk.ztcp) {
            try {
                // We access the internal readWithBuffer method if available
                // To do this type-safely we might need to cast or ignore TS errors
                // This payload requests EF_FINGER data
                const result = await zk.ztcp.readWithBuffer(REQUEST_DATA.GET_TEMPLATES);

                if (result && result.data) {
                    // console.log(`Received ${result.data.length} bytes of template data.`);
                    templateRecords = decodeTemplateData(result.data);
                    console.log(`Parsed ${templateRecords.length} templates.`);
                }
            } catch (tmplErr) {
                console.warn('Failed to fetch templates via TCP:', tmplErr);
            }
        } else if (zk.zudp) {
            console.warn('UDP template fetching not implemented in this script version.');
        }

        // Display Data
        console.log('\n=== User Information ===');

        const usersToDisplay = userId
            ? users.data.filter((u: any) => u.userId === userId)
            : users.data;

        for (const user of usersToDisplay) {
            console.log(`\nUser ID   : ${user.userId}`);
            console.log(`Name      : ${user.name}`);
            console.log(`Role      : ${user.role}`);
            console.log(`Password  : ${user.password}`);
            console.log(`CardNo    : ${user.cardno}`);

            // Find templates for this user
            // Note: device returns UID (internal ID), not UserID string. 
            // We must match user.uid to template.uid
            const userTemplates = templateRecords.filter(t => t.uid == user.uid);

            if (userTemplates.length > 0) {
                console.log(`Fingerprints:`);
                userTemplates.forEach(t => {
                    console.log(`  Finger ${t.fingerIdx}: [${t.template}] (Size: ${t.size})`);
                });
            } else {
                console.log(`Fingerprints: None found (or failed to fetch)`);
            }
        }

    } catch (e: any) {
        console.error('Error:', e.message || e);
    } finally {
        if (zk) {
            try {
                await zk.disconnect();
                console.log('\nDisconnected.');
            } catch (e) { }
        }
    }
})();
