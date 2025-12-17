
import net from 'net';

/**
 * ZK Protocol Sniffer / Proxy
 * 
 * Usage:
 * 1. Run this script: `npx tsx scripts/zk-proxy.ts`
 *    (It listens on localhost:4370 and forwards to Target Device 10.10.20.58:4370)
 * 2. Point your Windows Software / Script to `127.0.0.1` (localhost) instead of the real device IP.
 * 3. Perform the "Write Template" action in your software.
 * 4. Watch the console for the HEX dump of the packet exchange.
 */

const LOCAL_PORT = 4370;
const REMOTE_IP = '10.10.20.58'; // Target Device
const REMOTE_PORT = 4370;

const server = net.createServer((clientSocket) => {
    console.log(`\nNew Client Connected: ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);

    const deviceSocket = new net.Socket();

    deviceSocket.connect(REMOTE_PORT, REMOTE_IP, () => {
        console.log(`Connected to Remote Device: ${REMOTE_IP}:${REMOTE_PORT}`);
    });

    // Capture Data from Client (Windows SDK) -> Proxy -> Device
    clientSocket.on('data', (data) => {
        console.log(`\n[CLIENT -> DEVICE] (${data.length} bytes)`);
        console.log(formatHex(data));
        deviceSocket.write(data);
    });

    // Capture Data from Device -> Proxy -> Client (Windows SDK)
    deviceSocket.on('data', (data) => {
        console.log(`\n[DEVICE -> CLIENT] (${data.length} bytes)`);
        console.log(formatHex(data));
        clientSocket.write(data);
    });

    // Error Handling
    clientSocket.on('error', (err) => console.error('Client Error:', err.message));
    deviceSocket.on('error', (err) => console.error('Device Error:', err.message));

    clientSocket.on('close', () => {
        console.log('Client Disconnected');
        deviceSocket.end();
    });
    deviceSocket.on('close', () => console.log('Device Disconnected'));
    // Keep server running for next connection

});

// Helper to print nice HEX dumps
function formatHex(buffer: Buffer) {
    let output = '';
    for (let i = 0; i < buffer.length; i += 16) {
        const chunk = buffer.subarray(i, i + 16);
        const hex = chunk.toString('hex').match(/../g)?.join(' ') || '';
        const ascii = chunk.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
        output += `${i.toString(16).padStart(4, '0')}  ${hex.padEnd(48, ' ')}  |${ascii}|\n`;
    }
    return output;
}

server.listen(LOCAL_PORT, () => {
    console.log(`ZK Proxy Sniffer listening on 0.0.0.0:${LOCAL_PORT}`);
    console.log(`Forwarding to ${REMOTE_IP}:${REMOTE_PORT}`);
    console.log('Ready to capture packets...');
});
