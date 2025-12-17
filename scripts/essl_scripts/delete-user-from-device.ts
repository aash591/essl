import * as dotenv from 'dotenv';
import ZKLib from 'zkteco-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Parse command line arguments
// Usage: tsx scripts/delete-user-from-device.ts [userId] [ip] [port]
const args = process.argv.slice(2);

const userId = args[0] || '5555';
const ip = args[1] || '10.10.20.59';
const port = parseInt(args[2] || '4370');

console.log('Deleting user from device...');
console.log(`  User ID: ${userId}`);
console.log(`  Device IP: ${ip}`);
console.log(`  Device Port: ${port}`);
console.log('');

(async () => {
  let zkInstance: any = null;
  
  try {
    // Create connection
    console.log(`Connecting to device at ${ip}:${port}...`);
    zkInstance = new ZKLib(ip, port, 10000, 4000);
    await zkInstance.createSocket();
    console.log('✓ Connected successfully\n');

    // First, get all users to find the correct uid for this userId
    console.log('Fetching users from device to find correct UID...');
    const usersResponse = await zkInstance.getUsers();
    
    if (!usersResponse || !usersResponse.data) {
      throw new Error('No user data received from device');
    }

    const users = usersResponse.data;
    const user = users.find((u: any) => {
      const uid = String(u.userId || u.userid || u.uid || '');
      return uid === String(userId);
    });

    if (!user) {
      throw new Error(`User with ID "${userId}" not found on device`);
    }

    // Use the actual uid from the device
    const uid = user.uid;
    console.log(`Found user: ${user.name || 'N/A'} (userId: ${userId}, uid: ${uid})\n`);

    // Delete user from device using the correct uid
    console.log(`Deleting user with uid ${uid} (userId: ${userId}, name: ${user.name || 'N/A'})...`);
    await zkInstance.deleteUser(uid);

    console.log('✓ User deleted successfully!');
    console.log(`\nUser ${userId} (uid: ${uid}) has been deleted from device ${ip}:${port}`);

  } catch (error: any) {
    console.error('\n✗ Error deleting user from device:');
    console.error(error.message || error);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    // Disconnect
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
        console.log('\n✓ Disconnected from device');
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
})().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

