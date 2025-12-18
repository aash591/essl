/**
 * Interactive script to create an admin user
 * Usage: npx tsx scripts/create-admin.ts
 * 
 * The script will prompt you for:
 * - Username
 * - Password (with confirmation)
 * - Full Name
 * - Email
 */

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/drizzle/schema/attendance';
import { eq } from 'drizzle-orm';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

if (!dbPassword) {
  console.error('❌ Error: SUPABASE_DB_PASSWORD is required');
  process.exit(1);
}

// Get schema name based on environment (same logic as schema file)
const projectEnvironment = (process.env.PROJECT_ENVIRONMENT || 'DEV').toUpperCase();
const isProduction = projectEnvironment === 'PRODUCTION';
const schemaName = isProduction
  ? (process.env.DB_SCHEMA_NAME_PROD || 'essl_prod')
  : (process.env.DB_SCHEMA_NAME_DEV || 'essl_dev');

// Log schema selection for debugging
console.log(`[Schema] Environment: ${projectEnvironment}, Schema: ${schemaName}`);

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

// Create readline interface
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Prompt function
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function createAdmin() {
  const rl = createReadlineInterface();

  try {
    console.log('\n🔐 Create Admin User\n');
    console.log('Please provide the following information:\n');

    // Get username
    let username = '';
    while (!username.trim()) {
      username = await question(rl, 'Username: ');
      if (!username.trim()) {
        console.log('❌ Username cannot be empty. Please try again.\n');
      }
    }
    username = username.trim();

    // Get password with confirmation
    let password = '';
    let passwordConfirm = '';
    while (true) {
      password = await question(rl, 'Password: ');
      if (password.length < 6) {
        console.log('❌ Password must be at least 6 characters long. Please try again.\n');
        continue;
      }
      passwordConfirm = await question(rl, 'Confirm Password: ');
      if (password !== passwordConfirm) {
        console.log('❌ Passwords do not match. Please try again.\n');
        continue;
      }
      break;
    }

    // Get full name
    let name = '';
    while (!name.trim()) {
      name = await question(rl, 'Full Name: ');
      if (!name.trim()) {
        console.log('❌ Name cannot be empty. Please try again.\n');
      }
    }
    name = name.trim();

    // Get email with validation
    let email = '';
    while (true) {
      email = await question(rl, 'Email: ');
      email = email.trim();
      if (!email) {
        console.log('❌ Email cannot be empty. Please try again.\n');
        continue;
      }
      if (!isValidEmail(email)) {
        console.log('❌ Invalid email format. Please try again.\n');
        continue;
      }
      break;
    }

    // Get role selection
    console.log('\n📋 Available roles:');
    console.log('1. super_admin - Full system access (can create/manage other admins)');
    console.log('2. admin - Standard admin access (cannot create/manage other admins)');
    
    let role = 'admin'; // Default role
    while (true) {
      const roleChoice = await question(rl, '🎭 Select role (1-2, default: 2): ');
      const choice = roleChoice.trim();
      
      if (!choice || choice === '2') {
        role = 'admin';
        break;
      } else if (choice === '1') {
        role = 'super_admin';
        break;
      } else {
        console.log('❌ Invalid choice. Please enter 1 or 2.\n');
      }
    }

    console.log(`\n⏳ Creating admin user with role: ${role}...`);

    rl.close();

    // Validate inputs (redundant but safe)
    if (!username || !password || !name || !email) {
      console.error('❌ Error: All fields are required');
      process.exit(1);
    }

    // Connect to database
    console.log('\n📡 Connecting to database...');
    const connectionString = getConnectionString();
    const client = postgres(connectionString);

    // Use the configured schema based on PROJECT_ENVIRONMENT
    const actualSchemaName = schemaName;
    console.log(`📋 Using configured schema: '${actualSchemaName}' (Environment: ${projectEnvironment})`);
    
    // Check if table exists in the configured schema
    console.log('🔍 Checking if att_admin table exists in configured schema...');
    try {
      const tableCheck = await client`
        SELECT table_schema 
        FROM information_schema.tables 
        WHERE table_schema = ${actualSchemaName}
        AND table_name = 'att_admin'
        LIMIT 1;
      `;
      
      if (tableCheck.length === 0) {
        console.error(`\n❌ Error: Table 'att_admin' not found in schema '${actualSchemaName}'.`);
        console.error(`\n💡 Please run migrations first:`);
        console.error(`   npm run db:migrate`);
        console.error(`\n   Current environment: ${projectEnvironment}`);
        console.error(`   Expected schema: ${actualSchemaName}`);
        console.error(`\n   Or if migrations haven't been generated:`);
        console.error(`   npm run db:generate`);
        console.error(`   npm run db:migrate\n`);
        await client.end();
        process.exit(1);
      }
      
      console.log(`✅ Found table 'att_admin' in schema '${actualSchemaName}'`);
    } catch (error: any) {
      console.error(`❌ Error checking table: ${error.message}`);
      await client.end();
      process.exit(1);
    }

    // Ensure the actual schema exists (should already exist if table is there)
    if (actualSchemaName.toLowerCase() !== 'public') {
      try {
        const schemaCheck = await client`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.schemata 
            WHERE schema_name = ${actualSchemaName}
          ) as exists;
        `;
        
        if (!schemaCheck[0]?.exists) {
          console.log(`📋 Creating schema '${actualSchemaName}'...`);
          await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "${actualSchemaName}"`);
          console.log(`✅ Schema '${actualSchemaName}' created`);
        }
      } catch (error: any) {
        console.error(`❌ Error ensuring schema exists: ${error.message}`);
        await client.end();
        process.exit(1);
      }
    }

    // Use raw SQL queries with the actual schema name to avoid schema mismatch issues
    // The Drizzle schema object uses a different schema name than what's in the database
    // So we'll use raw SQL with the correct schema name
    
    // Check if username or email already exists
    console.log('🔍 Checking for existing users...');
    const existingAdmin = await client.unsafe(
      `SELECT id, username, email FROM "${actualSchemaName}".att_admin WHERE username = $1 LIMIT 1`,
      [username]
    );

    if (existingAdmin.length > 0) {
      console.error(`\n❌ Error: Username "${username}" already exists`);
      await client.end();
      process.exit(1);
    }

    const existingEmail = await client.unsafe(
      `SELECT id, username, email FROM "${actualSchemaName}".att_admin WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existingEmail.length > 0) {
      console.error(`\n❌ Error: Email "${email}" already exists`);
      await client.end();
      process.exit(1);
    }

    // Hash password
    console.log('🔒 Hashing password...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create admin user using raw SQL
    console.log('💾 Creating admin user...\n');
    const newAdmin = await client.unsafe(
      `INSERT INTO "${actualSchemaName}".att_admin (username, name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, username, name, email, role, is_active, created_at`,
      [username, name, email, passwordHash, role]
    );

    if (newAdmin.length === 0) {
      console.error('\n❌ Error: Failed to create admin user');
      await client.end();
      process.exit(1);
    }

    const admin = newAdmin[0];
    console.log('✅ Admin user created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.is_active}`);
    console.log(`   Created: ${admin.created_at}\n`);

    await client.end();
  } catch (error: any) {
    console.error('\n❌ Error creating admin user:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

createAdmin();

