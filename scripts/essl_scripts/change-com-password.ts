import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';
import * as readline from 'readline';
import { makeCommKey, CMD_AUTH, CMD_OPTIONS_WRQ, CMD_REFRESH_DATA } from './zk-utils';

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

async function changeComPassword() {
    console.log('========================================');
    console.log('       Change COM Password Script       ');
    console.log('========================================\n');

    const args = process.argv.slice(2);
    // Usage: node change-com-password.ts <ip> [old_pass] [new_pass]
    // Or flags: --ip <ip> --old <pass> --new <pass>

    let ip = '';
    let oldPass: string | null = null;
    let newPass = '';

    // Simple argument parsing
    if (args.includes('--ip') && args.includes('--new')) {
        const ipIdx = args.indexOf('--ip');
        if (ipIdx !== -1) ip = args[ipIdx + 1];

        const oldIdx = args.indexOf('--old');
        if (oldIdx !== -1) oldPass = args[oldIdx + 1];

        const newIdx = args.indexOf('--new');
        if (newIdx !== -1) newPass = args[newIdx + 1];
    } else {
        // Positional fallback
        ip = args[0];
        oldPass = args[1] && args[1] !== '0' ? args[1] : null; // '0' usually means no password in args from batch scripts
        newPass = args[2];
    }

    // Validate or Prompt
    if (!ip) {
        console.log('No arguments provided. Entering interactive mode...');
        ip = await askQuestion('Enter device IP address: ');
        if (!ip) {
            console.error('ERROR: IP address required.');
            process.exit(1);
        }

        const oldInput = await askQuestion('Enter OLD password (leave empty if none): ');
        oldPass = oldInput.trim() || null;

        newPass = await askQuestion('Enter NEW password: ');
    }

    if (!newPass) {
        console.error('ERROR: New password required.');
        process.exit(1);
    }

    const port = 4370;
    console.log(`Connecting to ${ip}:${port}...`);
    const zk = new ZKLib(ip, port, 5000, 4000);

    try {
        await zk.createSocket();
        console.log('Connected!');

        if (!zk.ztcp) {
            throw new Error('TCP Socket not initialized.');
        }

        // Authenticate using old password 
        if (oldPass && oldPass !== '0' && oldPass.trim()) {
            console.log(`Authenticating with old password: ${oldPass}...`);
            const passInt = parseInt(oldPass, 10);

            // @ts-ignore
            const sessionId = zk.ztcp?.sessionId || zk.zudp?.sessionId;
            if (!sessionId) throw new Error('No Session ID found');

            const authPayload = makeCommKey(passInt, sessionId);
            const buf = Buffer.alloc(4);
            buf.writeUInt32LE(authPayload, 0);

            // @ts-ignore
            const authResponse = await zk.executeCmd(CMD_AUTH, buf);
            if (authResponse && authResponse.length >= 2 && authResponse.readUInt16LE(0) === 2000) {
                console.log('Authentication successful.');
            } else {
                throw new Error('Authentication failed with old password.');
            }
        } else {
            console.log('No old password provided, assuming unauthenticated access.');
        }

        // Send Command to Change Password
        console.log(`Setting new COM password to: ${newPass}...`);

        // CMD_OPTIONS_WRQ (12)
        // Payload: "COMKey=<new_pass>\0"
        const commandString = `COMKey=${newPass}\0`;
        const cmdBuf = Buffer.from(commandString, 'ascii');

        // @ts-ignore
        const setResponse = await zk.executeCmd(CMD_OPTIONS_WRQ, cmdBuf);

        // Verify response (2000 = OK)
        if (setResponse && setResponse.length >= 2 && setResponse.readUInt16LE(0) === 2000) {
            console.log('Password set command acknowledged.');
        } else {
            // Sometimes it returns success but checking response is good practice. 
            // If it fails, it might return different code.
            console.warn('Warning: Password set command response logic check might differ.', setResponse);
        }

        // Refresh Data to apply changes
        console.log('Refreshing device data to apply changes...');
        // @ts-ignore
        await zk.executeCmd(CMD_REFRESH_DATA, Buffer.alloc(0));
        console.log('Refresh command sent.');

        console.log('\nSUCCESS: Password change process completed.');
        console.log(`Please verify by connecting with password: ${newPass}`);

    } catch (e: any) {
        console.error('ERROR:', e.message);
        process.exit(1);
    } finally {
        await zk.disconnect();
    }
}

changeComPassword();
