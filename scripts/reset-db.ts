/**
 * Reset Database - Drop all tables
 * Use this to completely reset your database before running fresh migrations
 * 
 * ⚠️ WARNING: This will delete ALL data!
 * 
 * Usage: bun scripts/reset-db.ts
 */

import * as dotenv from 'dotenv';
import postgres from 'postgres';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get Supabase connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD is required');
}

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
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
  
  if (useDirect) {
    connectionString = `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;
  } else {
    connectionString = `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}&pgbouncer=true`;
  }
} else {
  // Cloud Supabase
  const projectRef = supabaseUrl
    .replace('https://', '')
    .replace('.supabase.co', '')
    .split('.')[0];
  const region = process.env.SUPABASE_REGION || 'us-east-1';
  
  connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
}

async function resetDatabase() {
  console.log('🔌 Connecting to database...');
  const connectionStringForLog = connectionString.replace(/:[^:@]+@/, ':****@');
  console.log('📡 Connection:', connectionStringForLog);
  
  // Create postgres client
  const client = postgres(connectionString, { max: 1 });
  
  try {
    console.log('⚠️  WARNING: This will drop ALL tables in the public schema!');
    console.log('📋 Fetching list of tables...\n');
    
    // Get all tables in public schema
    const tables = await client`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;
    
    if (tables.length === 0) {
      console.log('✅ No tables found. Database is already empty.');
      return;
    }
    
    console.log(`📊 Found ${tables.length} table(s):`);
    tables.forEach((table) => {
      console.log(`   - ${(table as { tablename: string }).tablename}`);
    });
    
    console.log('\n🗑️  Dropping all tables...');
    
    // Drop all tables with CASCADE to handle dependencies
    for (const table of tables) {
      const tableName = (table as { tablename: string }).tablename;
      try {
        await client.unsafe(`DROP TABLE IF EXISTS public."${tableName}" CASCADE;`);
        console.log(`   ✅ Dropped: ${tableName}`);
      } catch (error) {
        console.error(`   ❌ Failed to drop ${tableName}:`, error);
      }
    }
    
    // Also drop the drizzle schema if it exists (contains migration tracking)
    try {
      await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE;');
      console.log('   ✅ Dropped drizzle schema (migration tracking)');
    } catch (error) {
      // Ignore if schema doesn't exist
      console.log('   ℹ️  Drizzle schema not found (no migration tracking)');
    }
    
    console.log('\n✅ Database reset complete!');
    console.log('📝 You can now run: bun run db:migrate');
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
    throw error;
  } finally {
    // Close connection
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run reset
resetDatabase()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Reset process failed!');
    console.error(error);
    process.exit(1);
  });

