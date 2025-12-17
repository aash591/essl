
import ZKLib from 'zkteco-js';
import { Buffer } from 'buffer';

const CMD_GET_TIME = 201;    // 0xC9
const CMD_SET_TIME = 202;    // 0xCA
const CMD_REFRESHDATA = 1013;// 0x3F5

async function setDeviceTime() {
    const ip = '10.10.20.58';
    const port = 4370;

    console.log(`Connecting to ${ip}:${port}...`);
    const zk = new ZKLib(ip, port, 5000, 4000);

    try {
        await zk.createSocket();
        console.log('Connected!\n');

        if (!zk.ztcp) throw new Error('TCP Socket not initialized');

        // 1. READ Current Device Time
        console.log('--- [1/4] Reading Current Device Time ---');
        await readAndLogTime(zk, 'Before Update');

        // 2. PREPARE New Time (Current System Time)
        const now = new Date();
        console.log(`\n--- [2/4] Setting Device Time to System Time: ${formatDate(now)} ---`);

        const encodedTime = encodeTime(now);
        // Create 4-byte buffer
        const timeBuf = Buffer.alloc(4);
        timeBuf.writeUInt32LE(encodedTime, 0);

        // 3. SEND Set Time Command
        await zk.ztcp.executeCmd(CMD_SET_TIME, timeBuf);
        console.log('Command sent.');

        // 4. REFRESH Data (Important for device to apply changes visually/internally)
        console.log('\n--- [3/4] Refreshing Device Data ---');
        await zk.ztcp.executeCmd(CMD_REFRESHDATA, Buffer.alloc(0));
        console.log('Refresh command sent.');

        // 5. READ Verification
        console.log('\n--- [4/4] Verifying Device Time ---');
        await readAndLogTime(zk, 'After Update');

    } catch (e: any) {
        console.error('ERROR:', e.message);
    } finally {
        await zk.disconnect();
    }
}

async function readAndLogTime(zk: any, label: string) {
    const resp = await zk.ztcp.executeCmd(CMD_GET_TIME, Buffer.alloc(0));
    if (resp && resp.length >= 12) {
        // Header (8) + Time (4)
        const timeInt = resp.readUInt32LE(8);
        console.log(`${label}: ${decodeTime(timeInt)}`);
    } else {
        console.log(`${label}: [Failed to read]`);
    }
}

/**
 * ZK Protocol Time Encoding
 * ((Year % 100) * 12 * 31 + ((Month - 1) * 31) + Day - 1) * (24 * 60 * 60) + (Hour * 60 * 60 + Minute * 60 + Second)
 */
function encodeTime(date: Date): number {
    const t =
        ((date.getFullYear() % 100) * 12 * 31 + ((date.getMonth()) * 31) + date.getDate() - 1) * (24 * 60 * 60) +
        (date.getHours() * 60 * 60 + date.getMinutes() * 60 + date.getSeconds());
    return t;
}

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

    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function pad(n: number) {
    return n.toString().padStart(2, '0');
}

function formatDate(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

setDeviceTime();
