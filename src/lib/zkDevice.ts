// ESSL/ZKTeco Device Connection Library
import ZKLib from "zkteco-js";
import { Buffer } from 'buffer';
import { DeviceInfo, AttendanceLog, User } from "@/types";
import { makeCommKey, CMD_AUTH } from "@/lib/zk-utils";
import { parseDeviceTimestamp } from "@/lib/utils";

// Constants for fingerprint template reading and writing
const COMMANDS = {
  CMD_DB_RRQ: 7,
  CMD_USERTEMP_RRQ: 9,
  CMD_DATA_WRRQ: 1503,
  CMD_REFRESHDATA: 1013,
  // SSR Protocol for writing templates
  CMD_PREPARE_DATA: 1500,
  CMD_DATA: 1501,
  CMD_TMP_WRITE: 87,
  // Delete template command
  CMD_DELETE_USERTEMP: 19,
  // Delete user command
  CMD_DELETE_USER: 18,
};

const REQUEST_DATA = {
  // Custom request for Fingerprint Templates
  // 0x01 (Version?), 0x07 (CMD_DB_RRQ), 0x00, 0x02 (EF_FINGER), ... padding
  GET_TEMPLATES: Buffer.from([0x01, 0x07, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
};

// Helper to decode template data
// Structure: [Size(2)][UID(2)][FingerID(1)][Valid(1)][Template(Variable)]...
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

// Store entire connection state globally to persist across module reloads in Next.js
const globalForDevice = globalThis as unknown as {
  zkInstance: any;
  connected: boolean;
  deviceConfig: {
    ip: string;
    port: number;
    timeout: number;
    inport: number;
    password?: string | null;
  } | null;
};

// Initialize global state if not exists
if (!globalForDevice.zkInstance) {
  globalForDevice.zkInstance = null;
  globalForDevice.connected = false;
  globalForDevice.deviceConfig = null;
}

class ZKDevice {
  private getDefaultConfig() {
    return {
      ip: process.env.NEXT_PUBLIC_DEVICE_IP || "10.10.20.58",
      port: parseInt(process.env.NEXT_PUBLIC_DEVICE_PORT || "4370"),
      timeout: 0, // No timeout
      inport: 4000
    };
  }

  private get zkInstance() {
    return globalForDevice.zkInstance;
  }

  private set zkInstance(instance: any) {
    globalForDevice.zkInstance = instance;
  }

  private get connected() {
    return globalForDevice.connected;
  }

  private set connected(value: boolean) {
    globalForDevice.connected = value;
  }

  private get currentConfig() {
    return globalForDevice.deviceConfig;
  }

  private set currentConfig(config: typeof globalForDevice.deviceConfig) {
    globalForDevice.deviceConfig = config;
  }

  async connect(config?: { ip?: string; port?: number; timeout?: number; inport?: number; password?: string | null }): Promise<boolean> {
    try {
      // Use provided config, or stored config, or fall back to defaults
      // No timeout for large data transfers
      const newConfig = {
        ip: config?.ip || this.currentConfig?.ip || this.getDefaultConfig().ip,
        port: config?.port || this.currentConfig?.port || this.getDefaultConfig().port,
        timeout: config?.timeout !== undefined ? config.timeout : (this.currentConfig?.timeout !== undefined ? this.currentConfig.timeout : 0),
        inport: config?.inport || this.currentConfig?.inport || 4000,
        password: config?.password !== undefined ? config.password : (this.currentConfig?.password !== undefined ? this.currentConfig.password : null)
      };

      // If already connected to the same device with same password, return true
      if (this.connected && this.zkInstance &&
        this.currentConfig?.ip === newConfig.ip &&
        this.currentConfig?.port === newConfig.port &&
        this.currentConfig?.password === newConfig.password) {
        console.log("Already connected to device");
        return true;
      }

      // Disconnect from any existing connection
      if (this.zkInstance) {
        try {
          await this.zkInstance.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      // Clean up any existing instance
      this.zkInstance = null;
      this.connected = false;

      console.log(`Connecting to device at ${newConfig.ip}:${newConfig.port}...`);
      this.zkInstance = new ZKLib(newConfig.ip, newConfig.port, newConfig.timeout, newConfig.inport);

      // Create socket and connect
      await this.zkInstance.createSocket();

      // Authenticate with password if provided (COM password)
      // Based on get-device-info-reversed.ts implementation
      if (newConfig.password && newConfig.password.trim()) {
        try {
          if (!this.zkInstance.ztcp) {
            throw new Error('TCP Socket not initialized (zk.ztcp is missing)');
          }

          const passInt = parseInt(newConfig.password, 10);
          if (isNaN(passInt)) {
            throw new Error('Password must be numeric for this auth method');
          }

          // Access sessionId from ztcp or zudp based on connection type
          // @ts-ignore - accessing internal property
          const sessionId = this.zkInstance.ztcp?.sessionId || this.zkInstance.zudp?.sessionId;

          if (!sessionId) {
            throw new Error('Could not retrieve Session ID for authentication.');
          }

          // Generate authentication payload using makeCommKey
          const authPayload = makeCommKey(passInt, sessionId);
          const buf = Buffer.alloc(4);
          buf.writeUInt32LE(authPayload, 0);

          // Send authentication command using executeCmd (not ztcp.executeCmd)
          // @ts-ignore - using executeCmd method
          const authResponse = await this.zkInstance.executeCmd(CMD_AUTH, buf);

          const CMD_ACK_OK = 2000;
          if (authResponse && authResponse.length >= 2) {
            const responseCode = authResponse.readUInt16LE(0);
            if (responseCode !== CMD_ACK_OK) {
              throw new Error(`Authentication Failed. Response Code: ${responseCode}`);
            }
          } else {
            throw new Error('Authentication Failed: Invalid response.');
          }

          console.log("Password authentication successful");
        } catch (authError: any) {
          // If password authentication fails, disconnect and return false
          try {
            await this.zkInstance.disconnect();
          } catch (disconnectError) {
            // Ignore disconnect errors
          }
          this.zkInstance = null;
          this.connected = false;
          console.error("Password authentication failed:", authError);
          throw new Error(`Password authentication failed: ${authError.message || 'Invalid password. Please check the device password (COM).'}`);
        }
      }

      // Configure socket for large data transfers
      if (this.zkInstance.socket) {
        // Increase max listeners to prevent warning during large data transfers
        this.zkInstance.socket.setMaxListeners(50);
        // No socket timeout - let it run indefinitely for large data transfers
        this.zkInstance.socket.setTimeout(0);
        // Keep connection alive
        this.zkInstance.socket.setKeepAlive(true, 30000);
      }

      this.connected = true;
      this.currentConfig = newConfig;
      console.log("Connected to device successfully");

      return true;
    } catch (error) {
      this.zkInstance = null;
      this.connected = false;
      console.error("Connection error:", error);
      // Re-throw authentication errors so they can be handled properly
      if (error instanceof Error && error.message.includes("Authentication failed")) {
        throw error;
      }
      // Don't throw other errors, just return false so the API can handle it gracefully
      return false;
    }
  }

  // Ensure connection before operations - auto-reconnect if we have config
  private async ensureConnection(): Promise<boolean> {
    if (this.connected && this.zkInstance) {
      return true;
    }

    // Try to reconnect using stored config
    if (this.currentConfig) {
      console.log("Reconnecting to device...");
      return await this.connect(this.currentConfig);
    }

    return false;
  }

  // Force a fresh reconnection (useful after failed commands that may corrupt socket state)
  private async forceReconnect(): Promise<boolean> {
    if (!this.currentConfig) {
      return false;
    }

    // Disconnect existing connection
    if (this.zkInstance) {
      try {
        await this.zkInstance.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    // Reset state
    this.zkInstance = null;
    this.connected = false;

    // Reconnect
    return await this.connect(this.currentConfig);
  }

  async disconnect(): Promise<void> {
    if (this.zkInstance && this.connected) {
      try {
        await this.zkInstance.disconnect();
      } catch (error) {
        console.error("Disconnect error (ignored):", error);
      }
    }
    this.zkInstance = null;
    this.connected = false;
  }

  async getInfo(): Promise<DeviceInfo | null> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.currentConfig) {
      throw new Error("Device not connected");
    }

    try {
      // Some devices fail on getInfo, so we wrap it carefully
      let info: any = {};
      try {
        console.log("Fetching device info...");
        info = await this.zkInstance.getInfo();
        console.log("Raw device info:", info);
      } catch (e) {
        console.warn("Failed to get full device info, using defaults:", e);
      }

      return {
        serialNumber: "N/A",
        deviceName: "ESSL Device",
        platform: "N/A",
        firmware: "N/A",
        userCount: info?.userCounts || 0,
        logCount: info?.logCounts || 0,
        ip: this.currentConfig.ip,
        port: this.currentConfig.port,
      };
    } catch (error) {
      console.error("Error getting device info:", error);
      // Return safe defaults instead of throwing
      return {
        serialNumber: "N/A",
        deviceName: "ESSL Device",
        platform: "N/A",
        firmware: "N/A",
        userCount: 0,
        logCount: 0,
        ip: this.currentConfig?.ip || "N/A",
        port: this.currentConfig?.port || 0,
      };
    }
  }

  async getAttendance(): Promise<AttendanceLog[]> {
    // Force a fresh connection for getAttendance to avoid corrupted socket state
    // Some devices corrupt the socket after failed commands (like getTime)
    if (this.currentConfig) {
      console.log("Forcing fresh connection for getAttendance...");
      await this.forceReconnect();
    }

    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      console.log("Fetching attendance logs (this may take a while for large datasets)...");
      const startTime = Date.now();
      const logs = await this.zkInstance.getAttendances();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Raw attendance response - total logs: ${logs?.data?.length || 0} (fetched in ${duration}s)`);

      if (!logs || !logs.data) {
        return [];
      }

      // Map zkteco-js format to our application format
      // Device output: { sn, user_id, record_time, type, state, ip }
      return logs.data.map((log: any, index: number) => ({
        sn: log.sn || null, // Serial number from device
        id: log.sn || index + 1, // Keep id for backward compatibility
        odoo_uid: parseInt(log.user_id) || 0,
        odoo_name: "", // Will be populated by matching with users
        userId: log.user_id,
        record_time: log.record_time, // Keep original record_time
        timestamp: parseDeviceTimestamp(log.record_time), // Parse without timezone conversion
        type: log.type || 1, // Use type from device (usually 1 for fingerprint)
        state: log.state || 0, // 0: Check-in, 1: Check-out usually
        stateLabel: log.state === 1 ? "Check-out" : "Check-in",
        ip: log.ip, // Device IP from log
      }));
    } catch (error) {
      console.error("Error getting attendance:", error);
      throw error;
    }
  }

  async getUsers(): Promise<User[]> {
    // Force a fresh connection for getUsers to avoid corrupted socket state
    // Some devices corrupt the socket after failed commands (like getTime)
    if (this.currentConfig) {
      console.log("Forcing fresh connection for getUsers...");
      await this.forceReconnect();
    }

    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      console.log("Fetching users...");
      const users = await this.zkInstance.getUsers();
      console.log("Raw users response - total users:", users?.data?.length || 0);

      if (!users || !users.data) {
        console.warn("No user data in response");
        return [];
      }

      // Based on actual device output: { uid, role, password, name, cardno, userId }
      return users.data.map((user: any) => ({
        uid: user.uid,
        odoo_uid: user.uid,
        odoo_name: user.name || "",
        userId: user.userId || user.userid || String(user.uid),
        name: user.name || "",
        role: user.role || 0,
        password: user.password || "",
        cardNo: String(user.cardno || ""),
      }));
    } catch (error) {
      console.error("Error getting users:", error);
      throw error;
    }
  }

  async clearAttendance(): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      await this.zkInstance.clearAttendanceLog();
      return true;
    } catch (error) {
      console.error("Error clearing attendance:", error);
      throw error;
    }
  }

  async getTime(): Promise<Date> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      const time = await this.zkInstance.getTime();
      return new Date(time);
    } catch (error) {
      console.error("Error getting time:", error);
      // Fallback to current time if device time fails
      return new Date();
    }
  }

  /**
   * Write a single user to the device
   * @param user User object with userId, name, password, role, cardNo
   * @returns true if successful
   */
  async setUser(user: {
    userId: string;
    name: string;
    password?: string;
    role?: number | string;
    cardNo?: string;
  }): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      // Extract role value - handle string formats like "14" or "14,1,2"
      let roleValue = 0;
      if (user.role !== undefined) {
        if (typeof user.role === 'string') {
          // If role is "14,1,2", extract the first number (14)
          const roleParts = user.role.split(',');
          roleValue = parseInt(roleParts[0]) || 0;
        } else {
          roleValue = user.role;
        }
      }

      // Convert cardNo to number (0 if empty or invalid)
      const cardNoValue = user.cardNo ? parseInt(user.cardNo) || 0 : 0;

      // Use userId as uid (device internal ID)
      const uid = parseInt(user.userId) || 0;
      const password = user.password || "";

      console.log(`Writing user to device: uid=${uid}, userId=${user.userId}, name=${user.name}, role=${roleValue}, cardNo=${cardNoValue}`);

      await this.zkInstance.setUser(
        uid,
        user.userId,
        user.name,
        password,
        roleValue,
        cardNoValue
      );

      console.log(`Successfully wrote user ${user.userId} to device`);
      return true;
    } catch (error) {
      console.error(`Error writing user ${user.userId} to device:`, error);
      throw error;
    }
  }

  /**
   * Write multiple users to the device
   * @param users Array of user objects
   * @returns Object with success count and errors
   */
  async setUsers(users: Array<{
    userId: string;
    name: string;
    password?: string;
    role?: number | string;
    cardNo?: string;
  }>): Promise<{ success: number; failed: number; errors: Array<{ userId: string; error: string }> }> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>
    };

    console.log(`Writing ${users.length} users to device...`);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        await this.setUser(user);
        result.success++;

        // Log progress every 50 users
        if ((i + 1) % 50 === 0 || i === users.length - 1) {
          console.log(`[Write Users] ${i + 1}/${users.length} | Success: ${result.success}, Failed: ${result.failed}`);
        }
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          userId: user.userId,
          error: error.message || String(error)
        });

        // Log errors periodically
        if (result.failed % 10 === 0) {
          console.error(`[Write Users] ${result.failed} users failed so far. Latest error:`, error);
        }
      }
    }

    console.log(`[Write Users Complete] Success: ${result.success}, Failed: ${result.failed}`);
    return result;
  }

  /**
   * Delete a user from the device by userId
   * @param userId User ID string (will be converted to uid)
   * @returns true if successful
   */
  async deleteUser(userId: string): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      // Convert userId to uid (numeric, must be 1-3000)
      let uid = parseInt(userId) || 1;
      if (uid <= 0 || uid > 3000) {
        // If userId is out of range, use modulo to get a valid uid (1-3000)
        uid = (uid % 3000) || 1;
        console.log(`Note: userId ${userId} maps to uid=${uid} (device internal ID)`);
      }

      console.log(`Deleting user from device: userId=${userId}, uid=${uid}`);

      await this.zkInstance.deleteUser(uid);

      console.log(`Successfully deleted user ${userId} (uid: ${uid}) from device`);
      return true;
    } catch (error) {
      console.error(`Error deleting user ${userId} from device:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple users from the device
   * @param userIds Array of user ID strings
   * @returns Object with success count and errors
   */
  async deleteUsers(userIds: string[]): Promise<{ success: number; failed: number; errors: Array<{ userId: string; error: string }> }> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>
    };

    console.log(`Deleting ${userIds.length} users from device...`);

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      try {
        await this.deleteUser(userId);
        result.success++;

        // Log progress every 50 users
        if ((i + 1) % 50 === 0 || i === userIds.length - 1) {
          console.log(`[Delete Users] ${i + 1}/${userIds.length} | Success: ${result.success}, Failed: ${result.failed}`);
        }
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          userId: userId,
          error: error.message || String(error)
        });

        // Log errors periodically
        if (result.failed % 10 === 0) {
          console.error(`[Delete Users] ${result.failed} users failed so far. Latest error:`, error);
        }
      }
    }

    console.log(`[Delete Users Complete] Success: ${result.success}, Failed: ${result.failed}`);
    return result;
  }

  // Check if we have a valid connection config (may need to reconnect)
  isConnected(): boolean {
    return this.currentConfig !== null;
  }

  // Check if actively connected right now
  isActivelyConnected(): boolean {
    return this.connected && this.zkInstance !== null;
  }

  getConfig() {
    return this.currentConfig;
  }

  // Clear the stored config on disconnect
  clearConfig() {
    this.currentConfig = null;
  }

  /**
   * Get fingerprint templates from the device
   * @param userId Optional user ID to filter templates. If not provided, returns all templates
   * @param users Optional pre-fetched users array to avoid redundant getUsers() call
   * @returns Array of template objects with uid, fingerIdx, valid, template (base64), and size
   */
  async getFingerprintTemplates(userId?: string, users?: User[]): Promise<Array<{
    uid: number;
    fingerIdx: number;
    valid: number;
    template: string;
    size: number;
  }>> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      console.log("Fetching fingerprint templates...");

      // Get users only if not provided and userId filtering is needed
      let userList: User[] = users || [];
      if (userId && !users) {
        userList = await this.getUsers();
      }

      // Access internal ztcp to send custom command (different query than getUsers)
      // getUsers() uses: zkteco-js's getUsers() method (likely CMD_USERTEMP_RRQ)
      // getFingerprintTemplates() uses: CMD_DB_RRQ (0x07) with EF_FINGER (0x02) parameter
      let templateRecords: any[] = [];

      if (this.zkInstance.ztcp) {
        try {
          console.log("Sending template query: CMD_DB_RRQ with EF_FINGER (different from getUsers query)");
          // Use the internal readWithBuffer method to request EF_FINGER data
          // This is a different query than getUsers() - uses CMD_DB_RRQ with EF_FINGER parameter
          const result = await this.zkInstance.ztcp.readWithBuffer(REQUEST_DATA.GET_TEMPLATES);

          if (result && result.data) {
            console.log(`Received ${result.data.length} bytes of template data from device`);
            templateRecords = decodeTemplateData(result.data);
            console.log(`Parsed ${templateRecords.length} fingerprint templates from raw data.`);
          } else {
            console.warn("Template query returned no data - device may have no templates or query failed");
          }
        } catch (tmplErr: any) {
          console.error('Failed to fetch templates via TCP:', tmplErr);
          throw new Error(`Failed to fetch templates: ${tmplErr.message || 'Unknown error'}`);
        }
      } else if (this.zkInstance.zudp) {
        throw new Error('UDP template fetching not implemented');
      } else {
        throw new Error('No TCP/UDP connection available');
      }

      // If userId is provided, filter templates for that user
      if (userId && userList.length > 0) {
        const targetUser = userList.find((u: User) => u.userId === userId);
        if (!targetUser) {
          console.warn(`User ${userId} not found in user list`);
          return [];
        }

        // Match templates by uid (device internal ID)
        const userTemplates = templateRecords.filter(t => t.uid === targetUser.uid);
        console.log(`Found ${userTemplates.length} templates for user ${userId} (uid: ${targetUser.uid})`);
        return userTemplates;
      }

      // Return all templates
      return templateRecords;
    } catch (error) {
      console.error("Error getting fingerprint templates:", error);
      throw error;
    }
  }

  /**
   * Write fingerprint template to device using SSR Protocol
   * @param uid Device internal UID
   * @param fingerIdx Finger index (0-9)
   * @param templateBase64 Base64 encoded template data
   * @returns true if successful
   */
  async writeFingerprintTemplate(uid: number, fingerIdx: number, templateBase64: string): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      if (!this.zkInstance.ztcp) {
        throw new Error('TCP connection required for fingerprint writing');
      }

      // Decode template from Base64
      const rawTemplate = Buffer.from(templateBase64, 'base64');
      const templateSize = rawTemplate.length;

      // STEP 1: CMD_PREPARE_DATA - Prepare device for data transfer
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32LE(templateSize, 0);
      await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_PREPARE_DATA, sizeBuf);

      // STEP 2: CMD_DATA - Send template data
      await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_DATA, rawTemplate);

      // STEP 3: CMD_TMP_WRITE - Write template with metadata
      // Metadata: [UID(2)][FingerIdx(1)][Flag(1)][Size(2)]
      const metaBuf = Buffer.alloc(6);
      metaBuf.writeUInt16LE(uid, 0);       // 0-1: UID
      metaBuf.writeUInt8(fingerIdx, 2);    // 2: Finger Index
      metaBuf.writeUInt8(1, 3);            // 3: Flag (usually 1 for valid)
      metaBuf.writeUInt16LE(templateSize, 4); // 4-5: Size of template

      const response = await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_TMP_WRITE, metaBuf);

      // Check response status
      const status = response.readUInt16LE(0);
      const CMD_ACK_OK = 2000;

      if (status === CMD_ACK_OK) {
        console.log(`Successfully wrote fingerprint template: UID=${uid}, Finger=${fingerIdx}, Size=${templateSize}`);
        return true;
      } else {
        throw new Error(`Template write failed with status: ${status}`);
      }
    } catch (error) {
      console.error(`Error writing fingerprint template (UID=${uid}, Finger=${fingerIdx}):`, error);
      throw error;
    }
  }

  /**
   * Write multiple fingerprint templates to device
   * @param uid Device internal UID
   * @param templates Array of { fingerIdx, template (base64) }
   * @returns Object with success count and errors
   */
  async writeFingerprintTemplates(uid: number, templates: Array<{ fingerIdx: number; template: string }>): Promise<{
    success: number;
    failed: number;
    errors: Array<{ fingerIdx: number; error: string }>;
  }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ fingerIdx: number; error: string }>
    };

    console.log(`Writing ${templates.length} fingerprint templates for UID ${uid}...`);

    for (const template of templates) {
      try {
        await this.writeFingerprintTemplate(uid, template.fingerIdx, template.template);
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          fingerIdx: template.fingerIdx,
          error: error.message || String(error)
        });
        console.error(`Failed to write template for finger ${template.fingerIdx}:`, error);
      }
    }

    // Refresh device data after writing templates
    try {
      if (this.zkInstance?.ztcp) {
        await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        // Wait a bit for device to process
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (refreshError) {
      console.warn('Failed to refresh device data after writing templates:', refreshError);
      // Don't fail the operation if refresh fails
    }

    console.log(`[Write Fingerprints Complete] Success: ${result.success}, Failed: ${result.failed}`);
    return result;
  }

  /**
   * Delete individual fingerprint template from device
   * Strategy: Delete user, write user, get UID, then write templates from DB (excluding deleted one)
   * Follows same flow as sync-user-fp-linux.ts
   * @param userId User ID string (e.g., "348")
   * @param userInfo User info object with name, cardNo, password, role (needed to restore user)
   * @param templatesFromDb Array of templates from database (excluding the deleted one)
   * @returns true if successful
   */
  async deleteFingerprintTemplate(
    userId: string, 
    userInfo: { name: string; cardNo?: string; role?: number; password?: string },
    templatesFromDb: Array<{ fingerIdx: number; template: string }>
  ): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      console.log(`[Delete Template] Strategy: Delete user, write user, get UID, then write templates from DB`);

      // Step 1: Check if user exists and get current UID
      const deviceUsers = await this.getUsers();
      const existingUser = deviceUsers.find((u: any) => u.userId === userId);
      let deviceUid = 0;

      if (existingUser) {
        deviceUid = typeof existingUser.uid === 'number' ? existingUser.uid : parseInt(String(existingUser.uid));
        console.log(`[Delete Template] User exists (UID: ${deviceUid}). Deleting for clean sync...`);

        // Delete user using CMD_DELETE_USER = 18 (matching sync-user-fp-linux.ts)
        if (this.zkInstance.ztcp) {
          const delBuf = Buffer.alloc(2);
          delBuf.writeUInt16LE(deviceUid, 0);
          await this.zkInstance.ztcp.executeCmd(18, delBuf);
          console.log(`[Delete Template] User deleted from device`);
        } else if (this.zkInstance.zudp) {
          const delBuf = Buffer.alloc(2);
          delBuf.writeUInt16LE(deviceUid, 0);
          await this.zkInstance.zudp.executeCmd(18, delBuf);
          console.log(`[Delete Template] User deleted from device (UDP)`);
        } else {
          // Fallback to deleteUser method (expects string userId)
          await this.deleteUser(String(userId));
        }

        // Explicit refresh after deletion (matching script)
        if (this.zkInstance.ztcp) {
          await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // User doesn't exist - calculate new UID (matching script)
        if (deviceUsers.length > 0) {
          const maxUid = deviceUsers.reduce((max: number, u: any) => Math.max(max, parseInt(u.uid)), 0);
          deviceUid = maxUid + 1;
        } else {
          deviceUid = parseInt(userId) || 1;
        }
        console.log(`[Delete Template] User new. Creating with UID: ${deviceUid}...`);
      }

      // Step 2: Write user to device (matching sync-user-fp-linux.ts)
      console.log(`[Delete Template] Writing User Info (UID: ${deviceUid})...`);
      
      // Extract role value
      let roleValue = 0;
      if (userInfo.role !== undefined) {
        roleValue = typeof userInfo.role === 'number' ? userInfo.role : parseInt(String(userInfo.role)) || 0;
      }

      const cardNoValue = userInfo.cardNo ? parseInt(userInfo.cardNo) || 0 : 0;
      const password = userInfo.password || "";

      // Use zkInstance.setUser directly (matching script)
      await this.zkInstance.setUser(
        deviceUid,
        userId,
        userInfo.name,
        password,
        roleValue,
        cardNoValue
      );

      console.log(`[Delete Template] User written to device`);

      // Step 3: Refresh again to ensure user is in device database (matching script)
      if (this.zkInstance.ztcp) {
        await this.zkInstance.ztcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
      }
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Step 4: Get UID from device (matching script - UID might have changed)
      const verifyUsers = await this.getUsers();
      const verifiedUser = verifyUsers.find((u: any) => u.userId === userId);
      
      if (!verifiedUser) {
        throw new Error(`User ${userId} not found after writing`);
      }

      const finalUid = typeof verifiedUser.uid === 'number' ? verifiedUser.uid : parseInt(String(verifiedUser.uid));
      console.log(`[Delete Template] Got UID from device: ${finalUid}`);

      // Step 5: Write templates from DB (excluding the deleted one)
      if (templatesFromDb.length > 0) {
        console.log(`[Delete Template] Writing ${templatesFromDb.length} template(s) from DB to device...`);
        const writeResult = await this.writeFingerprintTemplates(finalUid, templatesFromDb);
        console.log(`[Delete Template] ✓ Written ${writeResult.success} template(s), ${writeResult.failed} failed`);
      } else {
        console.log(`[Delete Template] No templates to write back (all deleted)`);
      }

      console.log(`[Delete Template] ✓ Template deletion completed successfully`);
      return true;
    } catch (error: any) {
      console.error("[Delete Template] Error deleting fingerprint template:", error);
      console.error("[Delete Template] Error details:", {
        message: error?.message,
        stack: error?.stack,
        userId,
        fingerIdx: 'N/A'
      });
      throw error;
    }
  }

  /**
   * Add individual fingerprint template to device
   * @param uid Device internal UID
   * @param fingerIdx Finger index (0-9)
   * @param templateBase64 Base64 encoded template data
   * @returns true if successful
   */
  async addFingerprintTemplate(uid: number, fingerIdx: number, templateBase64: string): Promise<boolean> {
    const isConnected = await this.ensureConnection();
    if (!isConnected || !this.zkInstance) {
      throw new Error("Device not connected");
    }

    try {
      // Use the existing writeFingerprintTemplate method
      return await this.writeFingerprintTemplate(uid, fingerIdx, templateBase64);
    } catch (error: any) {
      console.error("[Add Template] Error adding fingerprint template:", error);
      console.error("[Add Template] Error details:", {
        message: error?.message,
        stack: error?.stack,
        uid,
        fingerIdx
      });
      throw error;
    }
  }
}

// Singleton instance
export const zkDevice = new ZKDevice();
export default ZKDevice;
