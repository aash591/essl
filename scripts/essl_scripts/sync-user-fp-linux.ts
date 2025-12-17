
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import readline from 'readline';

// --- Constants & Helpers ---

const COMMANDS = {
    CMD_DB_RRQ: 7,
    CMD_USERTEMP_WRQ: 10,
    CMD_REFRESHDATA: 1013,
};

const REQUEST_DATA = {
    // Requests fingerprint templates
    GET_TEMPLATES: Buffer.from([0x01, 0x07, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
};

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

function decodeTemplateData(buf: Buffer) {
    const templates: any[] = [];
    let offset = 0;
    while (offset < buf.length) {
        if (offset + 6 > buf.length) break;
        const size = buf.readUInt16LE(offset);
        const uid = buf.readUInt16LE(offset + 2);
        const fingerIdx = buf.readUInt8(offset + 4);
        const valid = buf.readUInt8(offset + 5);

        if (size > 2000 || size <= 0) { offset++; continue; }
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

function createTemplateData(uid: number, fingerIdx: number, templateBase64: string): Buffer {
    const template = Buffer.from(templateBase64, 'base64');
    const size = template.length + 6;
    const buf = Buffer.alloc(size);
    buf.writeUInt16LE(size, 0);
    buf.writeUInt16LE(uid, 2);
    buf.writeUInt8(fingerIdx, 4);
    buf.writeUInt8(1, 5);
    template.copy(buf, 6);
    return buf;
}

function displayUserInfo(label: string, user: any, templates: any[]) {
    console.log(`\n=== [${label}] USER INFO ===`);
    console.log(`User ID   : ${user.userId}`);
    console.log(`Name      : ${user.name}`);
    console.log(`Role      : ${user.role}`);
    console.log(`Password  : ${user.password}`);
    console.log(`CardNo    : ${user.cardno}`);
    console.log(`UID       : ${user.uid}`); // Internal ID

    if (templates.length > 0) {
        console.log(`Fingerprints: ${templates.length}`);
        templates.forEach(t => {
            console.log(`  Finger ${t.fingerIdx}: [${t.template}] (Size: ${t.size})`);
        });
    } else {
        console.log(`Fingerprints: None found.`);
    }
    console.log('==============================\n');
}

async function connectDevice(ip: string, port: number, desc: string) {
    console.log(`[${desc}] Connecting to ${ip}:${port}...`);
    const zk = new ZKLib(ip, port, 10000, 4000);
    await zk.createSocket();
    console.log(`[${desc}] Connected.`);
    return zk;
}

// --- Main Logic ---

(async () => {
    const args = process.argv.slice(2);
    let userId = args[0];
    let sourceIp = args[1];
    let targetIp = args[2];

    if (!userId || !sourceIp || !targetIp) {
        console.log('=== ZK Sync User & Fingerprints (Linux/Node) ===');
        if (!userId) userId = await askQuestion('User ID to Sync: ');
        if (!sourceIp) sourceIp = await askQuestion('Source Device IP: ');
        if (!targetIp) targetIp = await askQuestion('Target Device IP: ');
    }

    if (!userId || !sourceIp || !targetIp) {
        console.error('Missing required arguments.');
        process.exit(1);
    }

    console.log('\n--- Sync Job Started ---');
    console.log(`User: ${userId}`);
    console.log(`Source: ${sourceIp}`);
    console.log(`Target: ${targetIp}`);
    console.log('------------------------\n');

    let sourceZk: any = null;
    let targetZk: any = null;

    try {
        // --- STEP 1: READ FROM SOURCE ---
        sourceZk = await connectDevice(sourceIp, 4370, 'SOURCE');

        const sourceUsers = await sourceZk.getUsers();
        const user = sourceUsers.data.find((u: any) => u.userId === userId);

        if (!user) throw new Error(`User ${userId} not found on Source Device.`);

        // Get Templates
        console.log(`[SOURCE] Downloading templates...`);
        let userTemplates: any[] = [];

        if (sourceZk.ztcp) {
            try {
                const reply = await sourceZk.ztcp.readWithBuffer(REQUEST_DATA.GET_TEMPLATES);
                if (reply && reply.data) {
                    const allTemplates = decodeTemplateData(reply.data);
                    userTemplates = allTemplates.filter(t => t.uid == user.uid);
                }
            } catch (err) {
                console.warn(`[SOURCE] Failed to read templates:`, err);
            }
        }

        // DISPLAY SOURCE
        displayUserInfo('SOURCE', user, userTemplates);

        await sourceZk.disconnect();
        sourceZk = null;
        console.log(`[SOURCE] Disconnected.\n`);

        // --- STEP 2: WRITE TO TARGET ---
        targetZk = await connectDevice(targetIp, 4370, 'TARGET');

        const targetUsers = await targetZk.getUsers();
        let targetUser = targetUsers.data.find((u: any) => u.userId === userId);
        let targetUid = 0;

        if (targetUser) {
            targetUid = parseInt(targetUser.uid);
            console.log(`[TARGET] User exists (UID: ${targetUid}). DELETING for clean sync...`);

            // Delete User - Clean Slate Strategy
            // CMD_DELETE_USER = 18. Payload: 2 bytes UID.
            const delBuf = Buffer.alloc(2);
            delBuf.writeUInt16LE(targetUid, 0);

            if (targetZk.ztcp) await targetZk.ztcp.executeCmd(18, delBuf);
            else if (targetZk.zudp) await targetZk.zudp.executeCmd(18, delBuf);

            // Explicit Refresh
            if (targetZk.ztcp) await targetZk.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
            await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
            const maxUid = targetUsers.data.reduce((max: number, u: any) => Math.max(max, parseInt(u.uid)), 0);
            targetUid = maxUid + 1;
            console.log(`[TARGET] User new. Creating with UID: ${targetUid}...`);
        }

        // Write User
        console.log(`[TARGET] Writing User Info (UID: ${targetUid})...`);
        await targetZk.setUser(
            targetUid,
            user.userId,
            user.name,
            user.password || '',
            user.role || 0,
            parseInt(user.cardno || '0')
        );

        // Refresh again to ensure user is in DB
        if (targetZk.ztcp) await targetZk.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        await new Promise(resolve => setTimeout(resolve, 1500));


        // SSR Protocol Constants
        const CMD_PREPARE_DATA = 1500;
        const CMD_DATA = 1501;
        const CMD_TMP_WRITE = 87;

        function createTmpWriteMetadata(uid: number, fingerIdx: number, flag: number, size: number): Buffer {
            const buf = Buffer.alloc(6);
            buf.writeUInt16LE(uid, 0);       // 0-1: UID
            buf.writeUInt8(fingerIdx, 2);    // 2: Finger Index
            buf.writeUInt8(flag, 3);         // 3: Flag (usually 1)
            buf.writeUInt16LE(size, 4);      // 4-5: Size of template
            return buf;
        }

        // Write Templates (SSR Protocol)
        if (userTemplates.length > 0) {
            console.log(`[TARGET] Writing ${userTemplates.length} templates using SSR Protocol (1500->1501->87)...`);
            for (const t of userTemplates) {
                // Decode from Base64
                const rawTemplate = Buffer.from(t.template, 'base64');
                const templateSize = rawTemplate.length;

                try {
                    if (targetZk.ztcp) {
                        // STEP 1: CMD_PREPARE_DATA
                        const sizeBuf = Buffer.alloc(4);
                        sizeBuf.writeUInt32LE(templateSize, 0);
                        await targetZk.ztcp.executeCmd(CMD_PREPARE_DATA, sizeBuf);

                        // STEP 2: CMD_DATA
                        await targetZk.ztcp.executeCmd(CMD_DATA, rawTemplate);

                        // STEP 3: CMD_TMP_WRITE
                        const metaBuf = createTmpWriteMetadata(targetUid, t.fingerIdx, 1, templateSize);
                        const response = await targetZk.ztcp.executeCmd(CMD_TMP_WRITE, metaBuf);

                        const status = response.readUInt16LE(0);
                        const msg = (status === 2000) ? 'OK' : `FAIL (${status})`;
                        console.log(`  > Wrote Finger ${t.fingerIdx} (Size: ${templateSize}) -> Status: ${msg}`);
                    } else {
                        console.warn('  > UDP not supported for SSR Write Protocol yet.');
                    }
                } catch (err: any) {
                    console.error(`  > Error writing Finger ${t.fingerIdx}:`, err.message);
                }
            }
        } else {
            console.log(`[TARGET] No templates to write.`);
        }

        // Final Refresh
        try {
            if (targetZk.ztcp) await targetZk.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        } catch (e) { }

        // --- STEP 3: VERIFICATION (Read Back) ---
        console.log(`\n[VERIFICATION] Reading back data from Target...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay for device processing

        const verifyUsers = await targetZk.getUsers();
        const verifiedUser = verifyUsers.data.find((u: any) => u.userId === userId);

        if (verifiedUser) {
            // Read back templates
            let verifiedTemplates: any[] = [];
            if (targetZk.ztcp) {
                try {
                    const reply = await targetZk.ztcp.readWithBuffer(REQUEST_DATA.GET_TEMPLATES);
                    if (reply && reply.data) {
                        const allTemplates = decodeTemplateData(reply.data);

                        // DEBUG: Inspect what we actually found
                        const validLooking = allTemplates.filter(t => t.size > 200).length;
                        console.log(`[VERIFICATION] Raw Templates Read: ${allTemplates.length} (Valid-looking: ${validLooking})`);

                        if (allTemplates.length > 100 && validLooking === 0) {
                            console.warn('[VERIFICATION] WARNING: Target device uses a different template format. Parser failed to decode.');
                        } else if (allTemplates.length > 0) {
                            // Log sample
                            allTemplates.slice(0, 3).forEach((t, i) => console.log(`  [${i}] UID: ${t.uid}, Idx: ${t.fingerIdx}, Size: ${t.size}`));
                        }

                        verifiedTemplates = allTemplates.filter(t => t.uid == verifiedUser.uid);
                    }
                } catch (err) {
                    console.warn(`[VERIFICATION] Failed to read templates:`, err);
                }
            }

            // DISPLAY TARGET (VERIFIED)
            displayUserInfo('TARGET (VERIFIED)', verifiedUser, verifiedTemplates);

            if (userTemplates.length > 0 && verifiedTemplates.length !== userTemplates.length) {
                console.warn(`[VERIFICATION] WARNING: Template count mismatch! (Source: ${userTemplates.length}, Target: ${verifiedTemplates.length})`);
            } else if (userTemplates.length > 0) {
                console.log(`[VERIFICATION] SUCCESS: Template count matches.`);
            }

        } else {
            console.error(`[VERIFICATION] FAILED: User ${userId} NOT found on Target!`);
        }

        console.log(`[TARGET] Sync Complete.`);

    } catch (e: any) {
        console.error('\nERROR:', e.message || e);
    } finally {
        if (sourceZk) try { await sourceZk.disconnect(); } catch (e) { }
        if (targetZk) try { await targetZk.disconnect(); } catch (e) { }
    }
})();
