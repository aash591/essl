/**
 * Attendance Database Schema
 * Tables for storing ESSL device users and attendance logs
 */

import { pgSchema, pgTable, serial, varchar, integer, timestamp, time, text, boolean, index, unique } from 'drizzle-orm/pg-core';

// Define custom schema based on environment
// Uses DB_SCHEMA_NAME_PROD for production, DB_SCHEMA_NAME_DEV for dev
// Falls back to 'essl_dev' or 'essl_prod' if not specified
const projectEnvironment = (process.env.PROJECT_ENVIRONMENT || 'DEV').toUpperCase();
const isProduction = projectEnvironment === 'PRODUCTION';

const schemaName = isProduction
  ? (process.env.DB_SCHEMA_NAME_PROD || 'essl_prod')
  : (process.env.DB_SCHEMA_NAME_DEV || 'essl_dev');

// Log schema selection for debugging (only in development or if explicitly enabled)
if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_SCHEMA === 'true') {
  console.log(`[DB Schema] Environment: ${projectEnvironment}, Schema: ${schemaName}`);
}

// Handle 'public' schema specially - Drizzle doesn't allow pgSchema('public')
// For 'public' schema, we'll use pgTable() directly, otherwise use pgSchema()
const usePublicSchema = schemaName.toLowerCase() === 'public';
const esslSchema = usePublicSchema ? null : pgSchema(schemaName);

// Helper function to create tables - uses pgTable for 'public', pgSchema().table() for others
function createTable<TColumns extends Record<string, any>>(
  name: string,
  columns: TColumns,
  extraConfig?: (table: any) => any
) {
  if (usePublicSchema) {
    return pgTable(name, columns, extraConfig);
  } else {
    return esslSchema!.table(name, columns, extraConfig);
  }
}

/**
 * att_devices - Stores registered ESSL devices
 */
export const attDevices = createTable('att_devices', {
  id: serial('id').primaryKey(),
  // Device name/label
  name: varchar('name', { length: 255 }).notNull(),
  // Device IP address
  ip: varchar('ip', { length: 50 }).notNull(),
  // Serial number (SL number)
  serialNumber: varchar('serial_number', { length: 100 }),
  // Device model/platform (e.g., "ZK-Teco", "ESSL", etc.)
  deviceModel: varchar('device_model', { length: 100 }),
  // Port (default 4370, can be overridden per device)
  port: integer('port').default(4370).notNull(),
  // Device password (default 000000)
  password: varchar('password', { length: 50 }).default('000000'),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for faster lookups
  ipIdx: index('att_devices_ip_idx').on(table.ip),
  // Unique constraint to prevent duplicate IPs
  ipUnique: index('att_devices_ip_unique').on(table.ip),
}));

/**
 * att_users - Stores user information from ESSL device
 * Matches device output structure: { uid, role, password, name, cardno, userId }
 * Users can punch on any device - device_ip is not needed here (logs track which device)
 */
export const attUsers = createTable('att_users', {
  id: serial('id').primaryKey(),
  // User ID string (userId from device, e.g., "1118") - unique identifier across all devices
  userId: varchar('user_id', { length: 50 }).notNull(),
  // User name from device
  name: varchar('name', { length: 255 }).notNull(),
  // Role: "0" = user, "14" = admin, "14,1,2" = admin on devices with IDs 1,2
  role: varchar('role', { length: 100 }).default('0'),
  // Card number (if any)
  cardNo: varchar('card_no', { length: 50 }),
  // Password (if stored on device)
  password: varchar('password', { length: 100 }),
  // Comma-separated device IDs where this user is found/stored
  storedDevices: varchar('stored_devices', { length: 500 }),
  // Shift ID - references att_shifts.id
  shiftId: integer('shift_id').references(() => attShifts.id),
  // Designation ID - references att_designations.id
  designationId: integer('designation_id').references(() => attDesignations.id),
  // Join date - when the user joined
  joinDate: timestamp('join_date'),
  // Relieving date - when the user left/resigned
  relievingDate: timestamp('relieving_date'),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for faster lookups
  userIdIdx: index('att_users_user_id_idx').on(table.userId),
  designationIdIdx: index('att_users_designation_id_idx').on(table.designationId),
  shiftIdIdx: index('att_users_shift_id_idx').on(table.shiftId),
  // Unique constraint: userId is unique (users can punch on any device, but user record is global)
  userIdUnique: unique('att_users_user_id_unique').on(table.userId),
}));

/**
 * att_logs - Stores attendance logs from ESSL device
 */
export const attLogs = createTable('att_logs', {
  id: serial('id').primaryKey(),
  // Serial number from device (sn)
  deviceSn: integer('device_sn'),
  // User ID string (user_id from device log)
  userId: varchar('user_id', { length: 50 }).notNull(),
  // Timestamp of the punch
  recordTime: timestamp('record_time').notNull(),
  // Type of record (usually 1 for fingerprint)
  type: integer('type').default(1),
  // State: 0 = Check-in, 1 = Check-out (depends on device config)
  state: integer('state').default(0),
  // Device IP this log came from
  deviceIp: varchar('device_ip', { length: 50 }),
  // Device ID - references att_devices.id
  deviceId: integer('device_id').references(() => attDevices.id),
  // Timestamps for our records
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for faster queries
  userIdIdx: index('att_logs_user_id_idx').on(table.userId),
  recordTimeIdx: index('att_logs_record_time_idx').on(table.recordTime),
  deviceSnIdx: index('att_logs_device_sn_idx').on(table.deviceSn),
  deviceIpIdx: index('att_logs_device_ip_idx').on(table.deviceIp),
  deviceIdIdx: index('att_logs_device_id_idx').on(table.deviceId),
  // Composite index for common queries
  userRecordIdx: index('att_logs_user_record_idx').on(table.userId, table.recordTime),
  // Unique constraint: prevent duplicate logs (same record time from same device)
  recordTimeDeviceIdUnique: unique('att_logs_record_time_device_id_unique').on(table.recordTime, table.deviceId),
}));

/**
 * att_fp_data - Stores fingerprint template data from ESSL devices
 * Used for syncing fingerprint data between devices
 */
export const attFpData = createTable('att_fp_data', {
  id: serial('id').primaryKey(),
  // User ID string (userId from device, e.g., "348") - references att_users.userId
  userId: varchar('user_id', { length: 50 }).notNull(),
  // Finger index with availability info: format "index,availability" (e.g., "5,1" = index 5 available on device, "5,0" = index 5 not on device)
  fingerIndex: varchar('finger_index', { length: 10 }).notNull(),
  // Base64 encoded fingerprint template data
  template: text('template').notNull(),
  // Length of template data
  templateLength: integer('template_length').notNull(),
  // Flag value from device (usually 1 for valid template)
  flag: integer('flag').default(1),
  // Device ID where this template was read from - references att_devices.id (REQUIRED)
  deviceId: integer('device_id').references(() => attDevices.id).notNull(),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for faster lookups
  userIdIdx: index('att_fp_data_user_id_idx').on(table.userId),
  fingerIndexIdx: index('att_fp_data_finger_index_idx').on(table.fingerIndex),
  deviceIdIdx: index('att_fp_data_device_id_idx').on(table.deviceId),
  // Composite index for user + finger + device lookup
  userFingerDeviceIdx: index('att_fp_data_user_finger_device_idx').on(table.userId, table.fingerIndex, table.deviceId),
  // Unique constraint: one template per user per finger index per device
  userFingerDeviceUnique: unique('att_fp_data_user_finger_device_unique').on(table.userId, table.fingerIndex, table.deviceId),
  // Note: Foreign key constraint from user_id to att_users.user_id with CASCADE DELETE
  // is added via manual migration (see migration files) because Drizzle doesn't support
  // foreign keys to unique columns (non-primary keys) directly in schema definitions.
  // When a user is deleted, their fingerprint data will be automatically deleted.
}));

/**
 * att_departments - Stores departments
 */
export const attDepartments = createTable('att_departments', {
  id: serial('id').primaryKey(),
  // Department name
  name: varchar('name', { length: 255 }).notNull(),
  // Description (optional)
  description: text('description'),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for faster lookups
  nameIdx: index('att_departments_name_idx').on(table.name),
}));

/**
 * att_designations - Stores designations
 * Designations reference a department via departmentId
 */
export const attDesignations = createTable('att_designations', {
  id: serial('id').primaryKey(),
  // Designation name
  designation: varchar('designation', { length: 255 }).notNull(),
  // Description (optional)
  description: text('description'),
  // Department ID - references att_departments.id
  departmentId: integer('department_id').references(() => attDepartments.id),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for faster lookups
  designationIdx: index('att_designations_designation_idx').on(table.designation),
  departmentIdIdx: index('att_designations_department_id_idx').on(table.departmentId),
}));

/**
 * att_shifts - Stores shift master data
 * Simple shifts with name + start/end times
 */
export const attShifts = createTable('att_shifts', {
  id: serial('id').primaryKey(),
  // Shift name (e.g., "General Shift", "Night Shift")
  name: varchar('name', { length: 255 }).notNull(),
  // Shift start time (HH:MM:SS)
  startTime: time('start_time').notNull(),
  // Shift end time (HH:MM:SS)
  endTime: time('end_time').notNull(),
  // Whether this shift is active and can be assigned
  isActive: boolean('is_active').default(true).notNull(),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for faster lookup by name
  nameIdx: index('att_shifts_name_idx').on(table.name),
}));

// Type exports for TypeScript
export type AttUser = typeof attUsers.$inferSelect;
export type NewAttUser = typeof attUsers.$inferInsert;
export type AttLog = typeof attLogs.$inferSelect;
export type NewAttLog = typeof attLogs.$inferInsert;
export type AttDevice = typeof attDevices.$inferSelect;
export type NewAttDevice = typeof attDevices.$inferInsert;
export type AttFpData = typeof attFpData.$inferSelect;
export type NewAttFpData = typeof attFpData.$inferInsert;
export type AttDepartment = typeof attDepartments.$inferSelect;
export type NewAttDepartment = typeof attDepartments.$inferInsert;
export type AttDesignation = typeof attDesignations.$inferSelect;
export type NewAttDesignation = typeof attDesignations.$inferInsert;
export type AttShift = typeof attShifts.$inferSelect;
export type NewAttShift = typeof attShifts.$inferInsert;

/**
 * Foreign Key Constraints SQL
 * This SQL adds foreign key constraints that cannot be defined directly in Drizzle schema
 * (e.g., foreign keys to unique columns that are not primary keys)
 * 
 * This is automatically applied by scripts/apply-triggers-and-constraints.ts
 */
export const ATTENDANCE_FOREIGN_KEY_CONSTRAINTS_SQL = `
-- Foreign key constraint: att_fp_data.user_id -> att_users.user_id with CASCADE DELETE
-- When a user is deleted, their fingerprint data is automatically deleted
ALTER TABLE "${schemaName}"."att_fp_data" 
ADD CONSTRAINT "att_fp_data_user_id_att_users_user_id_fk" 
FOREIGN KEY ("user_id") 
REFERENCES "${schemaName}"."att_users"("user_id") 
ON DELETE CASCADE 
ON UPDATE no action;

-- Migration: Update att_fp_data to support per-device fingerprint templates
-- Step 1: Drop old unique constraint (if exists)
ALTER TABLE "${schemaName}"."att_fp_data" 
DROP CONSTRAINT IF EXISTS "att_fp_data_user_finger_unique";

-- Step 2: Delete any templates with NULL device_id (orphaned data)
DELETE FROM "${schemaName}"."att_fp_data" WHERE "device_id" IS NULL;

-- Step 3: Make device_id NOT NULL
ALTER TABLE "${schemaName}"."att_fp_data" 
ALTER COLUMN "device_id" SET NOT NULL;

-- Step 4: Add new unique constraint including device_id
-- This allows the same user to have the same finger index on different devices
ALTER TABLE "${schemaName}"."att_fp_data" 
ADD CONSTRAINT "att_fp_data_user_finger_device_unique" 
UNIQUE ("user_id", "finger_index", "device_id");

-- Migration: Change finger_index from integer to varchar to store availability info
-- Format: "index,availability" (e.g., "5,1" = available on device, "5,0" = not on device)
-- Step 1: Add temporary column
ALTER TABLE "${schemaName}"."att_fp_data" 
ADD COLUMN IF NOT EXISTS "finger_index_new" VARCHAR(10);

-- Step 2: Convert existing integer values to new format (assume available: "index,1")
UPDATE "${schemaName}"."att_fp_data" 
SET "finger_index_new" = "finger_index"::text || ',1'
WHERE "finger_index_new" IS NULL;

-- Step 3: Drop old column and constraints
ALTER TABLE "${schemaName}"."att_fp_data" 
DROP CONSTRAINT IF EXISTS "att_fp_data_user_finger_device_unique";

DROP INDEX IF EXISTS "${schemaName}"."att_fp_data_finger_index_idx";
DROP INDEX IF EXISTS "${schemaName}"."att_fp_data_user_finger_device_idx";

ALTER TABLE "${schemaName}"."att_fp_data" 
DROP COLUMN IF EXISTS "finger_index";

-- Step 4: Rename new column
ALTER TABLE "${schemaName}"."att_fp_data" 
RENAME COLUMN "finger_index_new" TO "finger_index";

-- Step 5: Make it NOT NULL
ALTER TABLE "${schemaName}"."att_fp_data" 
ALTER COLUMN "finger_index" SET NOT NULL;

-- Step 6: Recreate indexes and constraints
CREATE INDEX IF NOT EXISTS "${schemaName}"."att_fp_data_finger_index_idx" ON "${schemaName}"."att_fp_data" ("finger_index");

CREATE INDEX IF NOT EXISTS "${schemaName}"."att_fp_data_user_finger_device_idx" 
ON "${schemaName}"."att_fp_data" ("user_id", "finger_index", "device_id");

ALTER TABLE "${schemaName}"."att_fp_data" 
ADD CONSTRAINT "att_fp_data_user_finger_device_unique" 
UNIQUE ("user_id", "finger_index", "device_id");
`;

