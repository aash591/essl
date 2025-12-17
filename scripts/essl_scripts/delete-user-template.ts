import * as dotenv from 'dotenv';
import ZKLib from 'zkteco-js';
import * as readline from 'readline';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Usage: tsx scripts/essl_scripts/delete-user-template.ts [userId] [ip] [port]
const args = process.argv.slice(2);

// We will determine these inside the main function if not provided
let userId = args[0];
let ip = args[1];
const port = parseInt(args[2] || '4370');

const CMD_DELETE_USERTEMP = 19;
const REQUEST_DATA = {
    // Custom request for Fingerprint Templates: 0x01 (Version?), 0x07 (CMD_DB_RRQ), 0x00, 0x02 (EF_FINGER), ... padding
    GET_TEMPLATES: Buffer.from([0x01, 0x07, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
};

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) =>
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans);
        })
    );
}

// Helper to decode template data (heuristic based)
// Structure roughly: [Size(2)][PIN(2)][FingerID(1)][Valid(1)][Template(Variable)]...
function decodeTemplateData(buf: Buffer) {
    const templates: any[] = [];
    let offset = 0;

    while (offset < buf.length) {
        if (offset + 6 > buf.length) break;

        const size = buf.readUInt16LE(offset);
        const uid = buf.readUInt16LE(offset + 2);
        const fingerIdx = buf.readUInt8(offset + 4);
        const valid = buf.readUInt8(offset + 5);

        // Sanity check size
        if (size > 2000 || size <= 0) {
            offset++;
            continue;
        }

        if (offset + size > buf.length) break;

        const templateData = buf.subarray(offset + 6, offset + size);

        templates.push({
            uid,
            fingerIdx,
            valid,
            template: templateData.toString('base64').substring(0, 20) + '...', // Truncate for display
            size
        });

        offset += size;
    }
    return templates;
}

// Separate function to fetch and display user info
async function fetchUserAndTemplates(zkInstance: any, userId: string): Promise<any> {
    console.log('Fetching users to resolve details...');
    const usersResponse = await zkInstance.getUsers();

    if (!usersResponse || !usersResponse.data) {
        throw new Error('Failed to retrieve users.');
    }

    const users = usersResponse.data;
    const user = users.find((u: any) => {
        const uIdStr = String(u.userId || u.userid || u.uid || '');
        return uIdStr === String(userId);
    });

    if (!user) {
        return null;
    }

    const internalUid = user.uid;
    console.log(`\n----------------------------------------`);
    console.log(`User Found:`);
    console.log(`  Name: ${user.name}`);
    console.log(`  User ID: ${user.userId}`);
    console.log(`  Internal UID: ${internalUid}`);
    console.log(`  Card No: ${user.cardno}`);
    console.log(`----------------------------------------`);

    // Fetch Templates
    console.log('\nFetching fingerprint templates...');
    let userTemplates: any[] = [];
    if (zkInstance.ztcp) {
        try {
            const result = await zkInstance.ztcp.readWithBuffer(REQUEST_DATA.GET_TEMPLATES);
            if (result && result.data) {
                const allTemplates = decodeTemplateData(result.data);
                userTemplates = allTemplates.filter((t: any) => t.uid === internalUid);
            }
        } catch (err) {
            console.warn('Warning: Could not fetch templates via TCP.', err);
        }
    } else {
        console.warn('Warning: UDP template fetching not implemented.');
    }

    if (userTemplates.length > 0) {
        console.log(`\nExisting Templates for ${user.name}:`);
        userTemplates.forEach(t => {
            console.log(`  Finger Index: ${t.fingerIdx} (Size: ${t.size}) - Valid: ${t.valid}`);
        });
    } else {
        console.log(`\nNo templates found for this user (or failed to fetch).`);
    }
    console.log(`----------------------------------------\n`);

    return { user, internalUid, userTemplates };
}


(async () => {
    let zkInstance: any = null;

    try {
        // Interactive Argument Handling
        if (!userId) {
            console.log('=== User Template Deletion Tool ===');
            console.log('No User ID provided in arguments.');

            // Ask for IP if not provided
            if (!ip) {
                ip = await askQuestion('Enter Device IP (default 10.10.20.59): ');
                if (!ip) ip = '10.10.20.59';
            }

            // Ask for User ID
            userId = await askQuestion('Enter User ID to manage: ');
            if (!userId) {
                console.error('Error: User ID is required to proceed.');
                process.exit(1);
            }
        } else {
            // User ID was provided, check IP default
            if (!ip) ip = '10.10.20.59';
        }

        console.log(`\nConnecting to device at ${ip}:${port}...`);
        zkInstance = new ZKLib(ip, port, 10000, 4000);
        await zkInstance.createSocket();
        console.log('✓ Connected successfully\n');

        // 1. Initial Fetch
        const info = await fetchUserAndTemplates(zkInstance, userId);

        if (!info) {
            console.log(`User with ID "${userId}" not found on device.`);
            // Interactive retry logic could go here, but simple exit is safer for now
            process.exit(1);
        }

        const { user, internalUid } = info;

        // 2. Ask for finger index
        const indexStr = await askQuestion('Enter Finger Index to delete (0-9) or "q" to quit: ');
        if (indexStr.toLowerCase() === 'q') {
            console.log('Cancelled.');
            process.exit(0);
        }

        const fingerIndex = parseInt(indexStr);

        if (isNaN(fingerIndex) || fingerIndex < 0 || fingerIndex > 9) {
            throw new Error('Invalid finger index. Must be between 0 and 9.');
        }

        // 3. Delete Template
        console.log(`\nDeleting template ${fingerIndex} for user ${user.name} (uid: ${internalUid})...`);

        const payload = Buffer.alloc(3);
        payload.writeUInt16LE(internalUid, 0);
        payload.writeUInt8(fingerIndex, 2);

        await zkInstance.executeCmd(CMD_DELETE_USERTEMP, payload);
        console.log('✓ Command sent successfully.');

        // 4. Refetch to verify
        console.log('\nReloading all data to verify...');
        await new Promise(r => setTimeout(r, 1500)); // Little longer wait for device to sync

        console.log('\n=== UPDATED DEVICE DATA ===');
        const updatedInfo = await fetchUserAndTemplates(zkInstance, userId);

        if (updatedInfo) {
            console.log(`\nVerification Complete.`);
            const deletedTemplate = updatedInfo.userTemplates.find((t: any) => t.fingerIdx === fingerIndex);
            if (!deletedTemplate) {
                console.log(`✓ SUCCESS: Finger Index ${fingerIndex} is gone.`);
            } else {
                console.log(`✗ FAILURE: Finger Index ${fingerIndex} still exists!`);
            }
        } else {
            console.log('⚠️ WARNING: The user appears to be gone! The command might have deleted the whole user.');
        }

    } catch (error: any) {
        console.error('\n✗ Error:', error.message || error);
    } finally {
        if (zkInstance) {
            try {
                await zkInstance.disconnect();
                console.log('\n✓ Disconnected');
            } catch (e) { }
        }
    }
})();
