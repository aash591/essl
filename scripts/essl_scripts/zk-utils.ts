import { Buffer } from 'buffer';

export const CMD_AUTH = 1102;
export const CMD_OPTIONS_WRQ = 12; // 0x0C
export const CMD_REFRESH_DATA = 1013; // 0x3F5 - Refresh data/apply changes

/**
 * Generates the Communication Key (Session Key) for ZK password authentication.
 * Based on pyzk 'make_commkey' implementation.
 * 
 * @param key - The COM password (integer)
 * @param sessionId - The session ID from the connection
 * @param ticks - Ticks value (default 50)
 */
export function makeCommKey(key: number, sessionId: number, ticks: number = 50): number {
    let k = 0;
    for (let i = 0; i < 32; i++) {
        if ((key & (1 << i))) {
            k = (k << 1) | 1;
        } else {
            k = k << 1;
        }
    }
    k = (k + sessionId) >>> 0;

    let buf = Buffer.alloc(4);
    buf.writeUInt32LE(k, 0);

    buf[0] ^= 'Z'.charCodeAt(0);
    buf[1] ^= 'K'.charCodeAt(0);
    buf[2] ^= 'S'.charCodeAt(0);
    buf[3] ^= 'O'.charCodeAt(0);

    const t0 = buf[0];
    const t1 = buf[1];
    buf[0] = buf[2];
    buf[1] = buf[3];
    buf[2] = t0;
    buf[3] = t1;

    const B = ticks & 0xff;
    const old3 = buf[3];
    buf[0] ^= B;
    buf[1] ^= B;
    buf[2] = B;
    buf[3] = old3 ^ B;

    return buf.readUInt32LE(0);
}
