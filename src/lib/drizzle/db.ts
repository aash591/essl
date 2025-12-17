/**
 * Database Connection for Drizzle ORM
 * Handles connection to Supabase PostgreSQL
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/attendance';

// Get Supabase connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

// Get schema info for logging
const projectEnvironment = (process.env.PROJECT_ENVIRONMENT || 'DEV').toUpperCase();
const isProduction = projectEnvironment === 'PRODUCTION';
const schemaName = isProduction
  ? (process.env.DB_SCHEMA_NAME_PROD || 'essl_prod')
  : (process.env.DB_SCHEMA_NAME_DEV || 'essl_dev');

if (!dbPassword) {
  console.warn('SUPABASE_DB_PASSWORD not set - database operations will fail');
}

// Log database connection info (only in development or if explicitly enabled)
if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_DB === 'true') {
  console.log(`[DB Connection] Environment: ${projectEnvironment}, Schema: ${schemaName}, URL: ${supabaseUrl ? 'set' : 'not set'}`);
}

// Build connection string
function getConnectionString(): string {
  const isCloudSupabase = supabaseUrl.includes('.supabase.co');

  if (!isCloudSupabase && supabaseUrl) {
    // Self-hosted Supabase (Docker)
    const urlObj = new URL(supabaseUrl);
    const host = process.env.SUPABASE_DB_HOST_POSTGRES_URL || urlObj.hostname;
    const useDirect = process.env.SUPABASE_DB_USE_DIRECT !== 'false';
    const directPort = process.env.SUPABASE_DB_PORT_POSTGRES_DIRECT || '5433';
    const poolerPort = process.env.SUPABASE_DB_PORT_POSTGRES_POOLER || '6543';
    const port = useDirect ? directPort : poolerPort;
    const user = process.env.SUPABASE_DB_USER_POSTGRES || 'supabase_admin';
    const dbName = process.env.SUPABASE_DB_NAME_POSTGRES || 'postgres';
    const sslMode = process.env.SUPABASE_DB_SSL_POSTGRES === 'true' ? 'require' : 'disable';
    
    return `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;
  } else {
    // Cloud Supabase
    const projectRef = supabaseUrl
      .replace('https://', '')
      .replace('.supabase.co', '')
      .split('.')[0];
    const region = process.env.SUPABASE_REGION || 'us-east-1';
    
    return `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
  }
}

// Create postgres client (lazy initialization)
let client: postgres.Sql | null = null;

function getClient() {
  if (!client) {
    const connectionString = getConnectionString();
    client = postgres(connectionString, {
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

// Create drizzle instance
export const db = drizzle(getClient(), { schema });

// Export schema for use in queries
export { schema };

// Auto-migrate on module load (only in server-side context)
// This ensures schema and tables exist when the app starts
if (typeof window === 'undefined') {
  // Only run in server-side context (not in browser)
  import('./auto-migrate').then(({ autoMigrate }) => {
    autoMigrate().catch((error) => {
      console.error('[DB] Auto-migration failed:', error);
    });
  });
}

// Helper to close connection (for scripts)
export async function closeConnection() {
  if (client) {
    await client.end();
    client = null;
  }
}

