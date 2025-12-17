import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });
dotenv.config();

const query = process.argv.slice(2).join(' ');

if (!query) {
  console.error('Usage: bun scripts/run-query.ts "<SQL>"');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

if (!supabaseUrl || !dbPassword) {
  throw new Error('Missing database connection env vars');
}

const isCloudSupabase = supabaseUrl.includes('.supabase.co');
let connectionString: string;

if (!isCloudSupabase) {
  const url = new URL(supabaseUrl);
  const host = process.env.SUPABASE_DB_HOST_POSTGRES_URL || url.hostname;
  const useDirect = process.env.SUPABASE_DB_USE_DIRECT !== 'false';
  const directPort = process.env.SUPABASE_DB_PORT_POSTGRES_DIRECT || '5433';
  const poolerPort = process.env.SUPABASE_DB_PORT_POSTGRES_POOLER || '6543';
  const port = useDirect ? directPort : poolerPort;
  const user = process.env.SUPABASE_DB_USER_POSTGRES || 'supabase_admin';
  const dbName = process.env.SUPABASE_DB_NAME_POSTGRES || 'postgres';
  const sslMode = process.env.SUPABASE_DB_SSL_POSTGRES === 'true' ? 'require' : 'disable';
  connectionString = `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;
  if (!useDirect) {
    connectionString += '&pgbouncer=true';
  }
} else {
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '').split('.')[0];
  const region = process.env.SUPABASE_REGION || 'us-east-1';
  connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
}

const client = postgres(connectionString, { max: 1 });

(async () => {
  try {
    const result = await client.unsafe(query);
    console.table(result);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error('Query failed:', error);
  process.exit(1);
});
