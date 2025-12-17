/**
 * Auto-Migration Function
 * Automatically checks and creates schema/tables on app startup
 * Works in both development and production (including Docker)
 */

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Get schema name based on environment
const projectEnvironment = (process.env.PROJECT_ENVIRONMENT || 'DEV').toUpperCase();
const isProduction = projectEnvironment === 'PRODUCTION';
const schemaName = isProduction
  ? (process.env.DB_SCHEMA_NAME_PROD || 'essl_prod')
  : (process.env.DB_SCHEMA_NAME_DEV || 'essl_dev');

// Build connection string (same logic as db.ts)
function getConnectionString(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';
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

// Track if migration has been run (singleton pattern)
let migrationPromise: Promise<void> | null = null;
let migrationCompleted = false;

/**
 * Check if schema exists
 */
async function schemaExists(sql: postgres.Sql): Promise<boolean> {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.schemata 
        WHERE schema_name = ${schemaName}
      ) as exists;
    `;
    return result[0]?.exists || false;
  } catch (error) {
    console.error('[Auto-Migrate] Error checking schema:', error);
    return false;
  }
}

/**
 * Check if any tables exist in the schema
 */
async function tablesExist(sql: postgres.Sql): Promise<boolean> {
  try {
    if (schemaName.toLowerCase() === 'public') {
      // For public schema, check if our tables exist
      const result = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'att_devices'
        ) as exists;
      `;
      return result[0]?.exists || false;
    } else {
      // For custom schema, check if schema exists and has tables
      const result = await sql`
        SELECT COUNT(*) as count
        FROM information_schema.tables 
        WHERE table_schema = ${schemaName};
      `;
      return (Number(result[0]?.count) || 0) > 0;
    }
  } catch (error) {
    console.error('[Auto-Migrate] Error checking tables:', error);
    return false;
  }
}

/**
 * Generate migrations using drizzle-kit if they don't exist
 */
function generateMigrationsIfNeeded(): boolean {
  const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
  const migrationsExist = fs.existsSync(migrationsFolder) && 
    fs.readdirSync(migrationsFolder).some(file => file.endsWith('.sql'));

  if (migrationsExist) {
    console.log('[Auto-Migrate] Migrations already exist, skipping generation');
    return false;
  }

  // Check if we're in Docker build context
  const isDockerBuild = process.env.DOCKER_BUILD === 'true' || 
                        process.env.BUILDKIT_STEP_ID !== undefined ||
                        fs.existsSync('/.dockerenv') && process.env.NODE_ENV === 'production';

  // In production/Docker build, don't generate migrations (they should be pre-built)
  // Only generate in development
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isDockerBuild) {
    console.warn('');
    console.warn('⚠️  [Auto-Migrate] Migrations not found during Docker build!');
    console.warn('   Migrations should be generated before building the Docker image.');
    console.warn('');
    console.warn('   Please run before building:');
    console.warn('   npm run db:generate');
    console.warn('');
    console.warn('   Then rebuild your Docker image.');
    console.warn('');
    return false;
  }

  if (isProduction && !isDockerBuild) {
    console.warn('[Auto-Migrate] Migrations not found in production');
    console.warn('[Auto-Migrate] Please run: npm run db:generate before deploying');
    return false;
  }

  try {
    console.log('[Auto-Migrate] No migrations found, generating migrations with drizzle-kit...');
    
    // Check if drizzle-kit is available
    let drizzleKitAvailable = false;
    try {
      execSync('npx drizzle-kit --version', { stdio: 'pipe', timeout: 5000 });
      drizzleKitAvailable = true;
    } catch {
      // Check if it's in node_modules
      const drizzleKitPath = path.join(process.cwd(), 'node_modules', 'drizzle-kit');
      drizzleKitAvailable = fs.existsSync(drizzleKitPath);
    }

    if (!drizzleKitAvailable) {
      console.warn('[Auto-Migrate] drizzle-kit not found');
      console.warn('[Auto-Migrate] Install it with: npm install drizzle-kit --save-dev');
      console.warn('[Auto-Migrate] Then run: npm run db:generate');
      return false;
    }

    // Generate migrations
    console.log('[Auto-Migrate] Running: drizzle-kit generate');
    execSync('npx drizzle-kit generate', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: { ...process.env }
    });

    // Verify migrations were created
    if (fs.existsSync(migrationsFolder)) {
      const migrationFiles = fs.readdirSync(migrationsFolder)
        .filter(file => file.endsWith('.sql'));
      
      if (migrationFiles.length > 0) {
        console.log(`[Auto-Migrate] ✅ Generated ${migrationFiles.length} migration file(s)`);
        return true;
      }
    }

    console.warn('[Auto-Migrate] Migration generation completed but no SQL files found');
    return false;
  } catch (error: any) {
    console.error('[Auto-Migrate] Failed to generate migrations:', error.message);
    console.warn('[Auto-Migrate] Please run manually: npm run db:generate');
    return false;
  }
}

/**
 * Run migrations from migration files
 */
async function runMigrations(sql: postgres.Sql): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
  
  // Try to generate migrations if they don't exist
  if (!fs.existsSync(migrationsFolder) || 
      !fs.readdirSync(migrationsFolder).some(file => file.endsWith('.sql'))) {
    console.log('[Auto-Migrate] Migrations folder or files not found, attempting to generate...');
    const generated = generateMigrationsIfNeeded();
    
    if (!generated) {
      console.warn('[Auto-Migrate] Could not generate migrations, tables may not be created');
      console.warn('[Auto-Migrate] Please run: npm run db:generate');
      return;
    }
  }

  const migrationFiles = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.warn('[Auto-Migrate] No migration files found after generation attempt');
    return;
  }

  console.log(`[Auto-Migrate] Found ${migrationFiles.length} migration file(s)`);
  console.log(`[Auto-Migrate] Target schema: ${schemaName}`);

  for (const migrationFile of migrationFiles) {
    console.log(`[Auto-Migrate] Processing migration: ${migrationFile}`);
    const migrationPath = path.join(migrationsFolder, migrationFile);
    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    
    // Replace schema references in SQL if needed
    let processedSql = sqlContent;
    
    // Find all schema names in the SQL file (quoted schemas like "ESSL", "public", etc.)
    const schemaMatches = Array.from(processedSql.matchAll(/"([A-Z_][A-Z0-9_]*)"/g));
    const uniqueSchemas = new Set(schemaMatches.map(m => m[1]));
    
    // Filter out table/column names (common patterns that aren't schemas)
    const tableColumnNames = new Set(['id', 'name', 'type', 'state', 'flag', 'port', 'ip']);
    const existingSchemas = Array.from(uniqueSchemas).filter(s => 
      !tableColumnNames.has(s.toLowerCase()) && 
      s.length > 2 && // Schemas are usually longer
      s !== 'NOT' && s !== 'KEY' && s !== 'NULL' && s !== 'DEFAULT'
    );
    
    // If we found a schema in the SQL and it's different from target schema, replace it
    if (existingSchemas.length > 0) {
      const existingSchema = existingSchemas[0]; // Use first found schema
      const needsReplacement = existingSchema.toLowerCase() !== schemaName.toLowerCase();
      
      if (needsReplacement) {
        console.log(`[Auto-Migrate] Found schema '${existingSchema}' in migration, replacing with '${schemaName}'`);
        
        // Replace quoted schema references: "ESSL" -> "essl_prod"
        const schemaRegex = new RegExp(`"${existingSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi');
        processedSql = processedSql.replace(schemaRegex, `"${schemaName}"`);
        
        // Replace unquoted schema references: ESSL. -> essl_prod.
        const schemaRegexUnquoted = new RegExp(`\\b${existingSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'gi');
        processedSql = processedSql.replace(schemaRegexUnquoted, `${schemaName}.`);
      }
    } else if (schemaName.toLowerCase() !== 'public') {
      // No schema found, but we need a custom schema - replace 'public' references
      console.log(`[Auto-Migrate] Replacing 'public' schema with '${schemaName}' in ${migrationFile}`);
      
      processedSql = processedSql.replace(/"public"\./g, `"${schemaName}".`);
      processedSql = processedSql.replace(/public\./g, `${schemaName}.`);
      processedSql = processedSql.replace(/"public"/g, `"${schemaName}"`);
      processedSql = processedSql.replace(/FROM "public"/gi, `FROM "${schemaName}"`);
      processedSql = processedSql.replace(/TO "public"/gi, `TO "${schemaName}"`);
      processedSql = processedSql.replace(/REFERENCES "public"/gi, `REFERENCES "${schemaName}"`);
    }

    // Split SQL by statement breakpoints (Drizzle format)
    const statements = processedSql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => {
        // Filter out empty statements and comments-only
        const cleaned = s.replace(/--.*$/gm, '').trim();
        return cleaned.length > 0;
      });

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          // Log first 100 chars of statement for debugging
          const statementPreview = statement.substring(0, 100).replace(/\s+/g, ' ');
          console.log(`[Auto-Migrate] Executing statement ${i + 1}/${statements.length}: ${statementPreview}...`);
          
          await sql.unsafe(statement);
          console.log(`[Auto-Migrate] ✅ Statement ${i + 1} executed successfully`);
        } catch (error: any) {
          // Ignore errors for existing objects (table already exists, etc.)
          const errorMsg = error.message || String(error);
          const isIgnorableError = 
            errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate') ||
            (errorMsg.includes('relation') && errorMsg.includes('already exists')) ||
            errorMsg.includes('does not exist'); // For DROP IF EXISTS on non-existent objects
          
          if (!isIgnorableError) {
            console.error(`[Auto-Migrate] ❌ Error executing statement ${i + 1} in ${migrationFile}:`, errorMsg);
            console.error(`[Auto-Migrate] Statement: ${statement.substring(0, 200)}...`);
          } else {
            console.log(`[Auto-Migrate] ⚠️  Statement ${i + 1} skipped (object already exists)`);
          }
        }
      }
    }
  }

  console.log('[Auto-Migrate] Migrations completed');
}

/**
 * Auto-migrate function - ensures schema and tables exist
 * This function is idempotent and safe to call multiple times
 */
export async function autoMigrate(): Promise<void> {
  // Return existing promise if migration is already in progress
  if (migrationPromise) {
    return migrationPromise;
  }

  // Return immediately if already completed
  if (migrationCompleted) {
    return;
  }

  // Check if auto-migration is disabled
  if (process.env.DISABLE_AUTO_MIGRATE === 'true') {
    console.log('[Auto-Migrate] Auto-migration is disabled (DISABLE_AUTO_MIGRATE=true)');
    return;
  }

  migrationPromise = (async () => {
    try {
      const connectionString = getConnectionString();
      
      if (!connectionString) {
        console.warn('[Auto-Migrate] No database connection string available');
        return;
      }

      console.log(`[Auto-Migrate] Starting auto-migration (Environment: ${projectEnvironment}, Schema: ${schemaName})`);
      
      const sql = postgres(connectionString, { max: 1 });

      try {
        // Step 1: Create schema if it doesn't exist (skip for 'public')
        if (schemaName.toLowerCase() !== 'public') {
          const schemaExistsResult = await schemaExists(sql);
          if (!schemaExistsResult) {
            console.log(`[Auto-Migrate] Creating schema: ${schemaName}`);
            await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            console.log(`[Auto-Migrate] Schema '${schemaName}' created`);
          } else {
            console.log(`[Auto-Migrate] Schema '${schemaName}' already exists`);
          }
        } else {
          console.log('[Auto-Migrate] Using default "public" schema');
        }

        // Step 2: Check if tables exist
        console.log(`[Auto-Migrate] Checking if tables exist in schema '${schemaName}'...`);
        const tablesExistResult = await tablesExist(sql);
        
        if (!tablesExistResult) {
          console.log('[Auto-Migrate] Tables not found, running migrations...');
          await runMigrations(sql);
          
          // Verify tables were created after migration
          const verifyTables = await tablesExist(sql);
          if (verifyTables) {
            console.log('[Auto-Migrate] ✅ Tables successfully created');
          } else {
            console.warn('[Auto-Migrate] ⚠️  Tables still not found after migration - please check logs above');
          }
        } else {
          console.log('[Auto-Migrate] Tables already exist, skipping migrations');
          
          // Log which tables exist for debugging
          try {
            const existingTables = await sql`
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = ${schemaName}
              ORDER BY table_name;
            `;
            console.log(`[Auto-Migrate] Found ${existingTables.length} existing table(s):`, 
              existingTables.map((t: any) => t.table_name).join(', '));
          } catch (e) {
            // Ignore errors in logging
          }
        }

        migrationCompleted = true;
        console.log('[Auto-Migrate] Auto-migration completed successfully');
      } finally {
        await sql.end();
      }
    } catch (error: any) {
      console.error('[Auto-Migrate] Error during auto-migration:', error.message);
      // Don't throw - allow app to continue even if migration fails
      // The app will show errors when trying to use the database
    }
  })();

  return migrationPromise;
}

