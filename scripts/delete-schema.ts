/**
 * Delete a Database Schema
 * 
 * WARNING: This will permanently delete the schema and ALL its contents!
 * 
 * Usage:
 *   npx tsx scripts/delete-schema.ts <schema_name>
 * 
 * Example:
 *   npx tsx scripts/delete-schema.ts essl_dev
 */

import * as dotenv from 'dotenv';
import postgres from 'postgres';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get schema name from command line argument
const schemaName = process.argv[2];

if (!schemaName) {
  console.error('❌ Error: Schema name is required');
  console.log('\nUsage: npx tsx scripts/delete-schema.ts <schema_name>');
  console.log('Example: npx tsx scripts/delete-schema.ts essl_dev');
  process.exit(1);
}

// Prevent accidental deletion of 'public' schema
if (schemaName.toLowerCase() === 'public') {
  console.error('❌ Error: Cannot delete the "public" schema (it is the default PostgreSQL schema)');
  process.exit(1);
}

// Get database connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

if (!dbPassword) {
  console.error('❌ Error: SUPABASE_DB_PASSWORD is required');
  process.exit(1);
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

async function deleteSchema() {
  const connectionString = getConnectionString();
  const connectionStringForLog = connectionString.replace(/:[^:@]+@/, ':****@');
  
  console.log('🔌 Connecting to database...');
  console.log('📡 Connection:', connectionStringForLog);
  console.log(`🗑️  Schema to delete: ${schemaName}\n`);

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if schema exists
    const schemaExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.schemata 
        WHERE schema_name = ${schemaName}
      ) as exists;
    `;

    if (!schemaExists[0]?.exists) {
      console.log(`⚠️  Schema '${schemaName}' does not exist`);
      await sql.end();
      return;
    }

    // List tables in the schema
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ${schemaName}
      ORDER BY table_name;
    `;

    if (tables.length > 0) {
      console.log(`📋 Found ${tables.length} table(s) in schema '${schemaName}':`);
      tables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });
      console.log('');
    }

    // Delete the schema (CASCADE will delete all objects in the schema)
    console.log(`⚠️  WARNING: This will permanently delete schema '${schemaName}' and ALL its contents!`);
    console.log('   Deleting schema...\n');
    
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    
    console.log(`✅ Schema '${schemaName}' has been deleted successfully!`);
    
  } catch (error: any) {
    console.error('❌ Error deleting schema:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the deletion
deleteSchema()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

