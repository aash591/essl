
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import readline from 'readline';

// Constants
const COMMANDS = {
    CMD_USERTEMP_WRQ: 10, // Likely command for writing template
    CMD_REFRESHDATA: 1013,
};

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

// Helpers
function createTemplateData(uid: number, fingerIdx: number, templateBase64: string): Buffer {
    const template = Buffer.from(templateBase64, 'base64');
    const size = template.length + 6; // 2(Size)+2(UID)+1(Idx)+1(Valid) + Data
    const buf = Buffer.alloc(size);

    buf.writeUInt16LE(size, 0);
    buf.writeUInt16LE(uid, 2);
    buf.writeUInt8(fingerIdx, 4);
    buf.writeUInt8(1, 5); // Valid = 1
    template.copy(buf, 6);
    return buf;
}

(async () => {
    // 1. Gather Input
    // args: [userId] [name] [password] [card] [ip] [port]
    const args = process.argv.slice(2);

    let userId = args[0];
    let ip = args[4]; // adjust index if needed, but interactive is safer
    let port = 0;

    // Data holders
    let name = args[1] || '';
    let password = args[2] || '';
    let card = args[3] || '0';
    let fingerIdx = -1;
    let templateData = '';

    // Interactive Mode
    if (!userId || !ip) {
        console.log('=== Interactive Mode (Writer) ===');

        if (!ip) {
            ip = await askQuestion('Device IP (e.g. 10.10.20.59): ');
            const p = await askQuestion('Port (default 4370): ');
            port = p ? parseInt(p) : 4370;
        }

        if (!userId) {
            userId = await askQuestion('User ID (enroll number): ');
        }

        if (!name) name = await askQuestion('Name: ');
        if (!password) password = await askQuestion('Password (blank for none): ');
        if (!card) card = await askQuestion('Card Number (default 0): ');

        const addFinger = await askQuestion('Add Fingerprint? (y/n): ');
        if (addFinger.toLowerCase().startsWith('y')) {
            const fIdx = await askQuestion('Finger Index (0-9): ');
            fingerIdx = parseInt(fIdx);
            templateData = await askQuestion('Paste Base64 Template: ');
        }
    }

    if (!port) port = 4370; // fallback

    console.log('---------------------------------------------------');
    console.log('ZK Device User Info WRITER (Linux/Node)');
    console.log(`Target: ${ip}:${port}`);
    console.log(`User  : ${userId} (${name})`);
    if (fingerIdx >= 0) console.log(`Finger: Index ${fingerIdx}, Data Len ${templateData.length}`);
    console.log('---------------------------------------------------\n');

    let zk: any = null;
    try {
        zk = new ZKLib(ip, port, 10000, 4000);
        console.log('Connecting...');
        await zk.createSocket();
        console.log('Connected.');

        // 1. Write User Info
        // We need a UID (internal ID). 
        // Strategy: 
        // - Get all users to see if this userId exists.
        // - If yes, use existing UID.
        // - If no, find max UID + 1? Or does setUser handle it?
        // zkteco-js setUser(uid, userid, ...) requires us to PROVIDE uid.

        console.log('Fetching existing users to resolve UID...');
        const users = await zk.getUsers();
        let existingUser = users.data.find((u: any) => u.userId === userId);

        let uid = 0;
        if (existingUser) {
            uid = parseInt(existingUser.uid);
            console.log(`User ${userId} exists. Updating (UID: ${uid})...`);
        } else {
            // Find a free UID
            // Naive approach: max + 1
            const maxUid = users.data.reduce((max: number, u: any) => Math.max(max, parseInt(u.uid)), 0);
            uid = maxUid + 1;
            // Limit check? UID is usually uint16 (65535) or less. 
            if (uid > 3000) console.warn('Warning: UID > 3000, verify device limits.');
            console.log(`User ${userId} is new. Creating (New UID: ${uid})...`);
        }

        // Write User
        // setUser(uid, userid, name, password, role, cardno)
        await zk.setUser(uid, userId, name, password, 0, parseInt(card));
        console.log('User info written.');

        // 2. Write Template (if provided)
        if (fingerIdx >= 0 && templateData) {
            console.log('Writing fingerprint template...');
            const buf = createTemplateData(uid, fingerIdx, templateData);

            // Access internal execution
            if (zk.ztcp) {
                await zk.ztcp.executeCmd(COMMANDS.CMD_USERTEMP_WRQ, buf);
            } else if (zk.zudp) {
                await zk.zudp.executeCmd(COMMANDS.CMD_USERTEMP_WRQ, buf);
            }
            console.log('Template written.');
        }

        // 3. Refresh
        // It's good practice to refresh data so device updates cache
        try {
            if (zk.ztcp) await zk.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        } catch (e) { }

        console.log('Done.');

    } catch (e: any) {
        console.error('Error:', e.message || e);
    } finally {
        if (zk) {
            try {
                await zk.disconnect();
            } catch (e) { }
        }
    }
})();
