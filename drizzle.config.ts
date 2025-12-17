import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get Supabase connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD is required');
}

// Check if self-hosted (not *.supabase.co domain)
const isCloudSupabase = supabaseUrl.includes('.supabase.co');

let connectionString: string;

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
  
  connectionString = `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;
} else {
  // Cloud Supabase
  const projectRef = supabaseUrl
    .replace('https://', '')
    .replace('.supabase.co', '')
    .split('.')[0];
  const region = process.env.SUPABASE_REGION || 'us-east-1';
  
  connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
}

export default {
  schema: './src/lib/drizzle/schema/*.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;

