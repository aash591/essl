// ESSL Device Types

export interface DeviceInfo {
  serialNumber: string;
  deviceName: string;
  platform: string;
  firmware: string;
  userCount: number;
  logCount: number;
  ip: string;
  port: number;
}

export interface AttendanceLog {
  id: number;
  sn?: number | null; // Serial number from device
  odoo_uid: number;
  odoo_name?: string;
  userId: string;
  record_time?: string | Date; // Original record_time from device
  timestamp: Date;
  type?: number; // Type of record (usually 1 for fingerprint)
  state: number; // 0: Check-in, 1: Check-out
  stateLabel: string;
  ip?: string; // Device IP from log
}

export interface User {
  id?: number; // Database ID for unique key
  uid: number;
  odoo_uid?: number;
  odoo_name?: string;
  userId: string;
  name: string;
  role: number | string; // Can be "0", "14", or "14,1,2" format
  password: string;
  cardNo: string;
  storedDevices?: string; // Comma-separated device IDs where this user is found/stored
  designationId?: number | null; // Designation ID reference
  designation?: string | null; // Designation name
  designationDepartment?: string | null; // Department name for the designation
  joinDate?: Date | string | null; // Join date - when the user joined
  relievingDate?: Date | string | null; // Relieving date - when the user left/resigned
  shiftId?: number | null; // Shift ID reference
  shiftName?: string | null; // Shift name
  shiftStartTime?: string | null; // Shift start time (HH:MM:SS)
  shiftEndTime?: string | null; // Shift end time (HH:MM:SS)
}

export interface DeviceConnection {
  ip: string;
  port: number;
  inport?: number;
  timeout?: number;
}

export interface Device {
  id: number;
  name: string;
  ip: string;
  serialNumber: string | null;
  deviceModel: string | null;
  port: number;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLogSyncTime?: Date | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

