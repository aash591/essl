/**
 * Run Drizzle Migrations (Generic)
 * This script runs all pending migrations on the database
 * Handles existing tables gracefully - only creates new tables
 * Also applies triggers and constraints from schema files
 * 
 * Configuration:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DRIZZLE_MIGRATIONS_FOLDER: Path to migrations folder (default: ./drizzle/migrations)
 * - DRIZZLE_SCHEMA_FOLDER: Path to schema folder for triggers/constraints (default: ./src/lib/drizzle/schema)
 * - DRIZZLE_SCHEMA_FILES: Comma-separated list of schema files to check (optional, auto-detects if not set)
 * - DRIZZLE_VERIFY_CONSTRAINTS: Set to 'false' to disable constraint verification (default: enabled)
 * 
 * Usage: 
 * - npx tsx scripts/run-migrations.ts (runs migrations and applies constraints)
 * - npx tsx scripts/run-migrations.ts --add-to-migration (adds constraints to latest migration file before running)
 */

import * as dotenv from 'dotenv';
import postgres from 'postgres';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get database schema name based on environment
// Uses DB_SCHEMA_NAME_PROD for production, DB_SCHEMA_NAME_DEV for dev
// Falls back to 'essl_dev' or 'essl_prod' if not specified
const projectEnvironment = (process.env.PROJECT_ENVIRONMENT || 'DEV').toUpperCase();
const isProduction = projectEnvironment === 'PRODUCTION';
const dbSchema = isProduction
  ? (process.env.DB_SCHEMA_NAME_PROD || 'essl_prod')
  : (process.env.DB_SCHEMA_NAME_DEV || 'essl_dev');

// Log schema selection
console.log(`\n📋 Database Schema Configuration:`);
console.log(`   Environment: ${projectEnvironment}`);
console.log(`   Schema Name: ${dbSchema}`);
console.log(`   DB_SCHEMA_NAME_PROD: ${process.env.DB_SCHEMA_NAME_PROD || '(not set, using default)'}`);
console.log(`   DB_SCHEMA_NAME_DEV: ${process.env.DB_SCHEMA_NAME_DEV || '(not set, using default)'}\n`);

// Get database connection string
// Priority: DATABASE_URL > DRIZZLE_DATABASE_URL > drizzle.config.ts logic
let connectionString: string | undefined = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;

// If not set, try to replicate drizzle.config.ts logic
if (!connectionString) {
  try {
    const configPath = path.join(process.cwd(), 'drizzle.config.ts');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      
      // Check if it uses Supabase-style connection building
      if (configContent.includes('NEXT_PUBLIC_SUPABASE_URL') || configContent.includes('SUPABASE_DB_PASSWORD')) {
        // Replicate the Supabase connection string building logic
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const dbPassword = process.env.SUPABASE_DB_PASSWORD || '';
        
        if (dbPassword && supabaseUrl) {
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
            
            connectionString = `postgresql://${user}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;
          } else if (isCloudSupabase) {
            // Cloud Supabase
            const projectRef = supabaseUrl
              .replace('https://', '')
              .replace('.supabase.co', '')
              .split('.')[0];
            const region = process.env.SUPABASE_REGION || 'us-east-1';
            
            connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
          }
        }
      } else {
        // Try to extract direct connection string from config
        const urlMatch = configContent.match(/url:\s*(['"`])([^'"`]+)\1/);
        if (urlMatch && urlMatch[2] && !urlMatch[2].includes('process.env') && !urlMatch[2].includes('connectionString')) {
          connectionString = urlMatch[2];
        }
      }
    }
  } catch (error) {
    // Ignore errors reading config
  }
}

// Parse command-line arguments early to determine if we need a database connection
const args = process.argv.slice(2);
const addToMigrationOnly = args.includes('--add-to-migration') && args.length === 1;

if (!connectionString && !addToMigrationOnly) {
  throw new Error(
    'DATABASE_URL or DRIZZLE_DATABASE_URL environment variable is required.\n' +
    'Alternatively, ensure drizzle.config.ts connection logic can be resolved with env vars.'
  );
}

// Get migrations folder path
const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER 
  ? path.resolve(process.cwd(), process.env.DRIZZLE_MIGRATIONS_FOLDER)
  : path.join(process.cwd(), 'drizzle', 'migrations');

// Get schema folder for triggers/constraints (optional)
const schemaFolder = process.env.DRIZZLE_SCHEMA_FOLDER
  ? path.resolve(process.cwd(), process.env.DRIZZLE_SCHEMA_FOLDER)
  : path.join(process.cwd(), 'src', 'lib', 'drizzle', 'schema');

// Get specific schema files to check (optional)
const schemaFilesEnv = process.env.DRIZZLE_SCHEMA_FILES;
const specificSchemaFiles = schemaFilesEnv 
  ? schemaFilesEnv.split(',').map(f => f.trim())
  : null;

// Parse command-line arguments (already parsed above, but keep for clarity)
const addToMigration = args.includes('--add-to-migration');

/**
 * Extract table names from CREATE TABLE statements
 */
function extractTableNames(sql: string): string[] {
  const tableNames: string[] = [];
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/gi;
  let match;
  
  while ((match = createTableRegex.exec(sql)) !== null) {
    tableNames.push(match[1]);
  }
  
  return tableNames;
}

/**
 * Check if a table exists in the database
 */
async function tableExists(sql: postgres.Sql, tableName: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = ${dbSchema} 
        AND table_name = ${tableName}
      );
    `;
    return result[0]?.exists === true;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Modify SQL to add IF NOT EXISTS to CREATE TABLE statements
 */
function addIfNotExists(sql: string): string {
  // Add IF NOT EXISTS to CREATE TABLE statements
  let modified = sql.replace(
    /CREATE\s+TABLE\s+(["']?[a-zA-Z_][a-zA-Z0-9_]*["']?)/gi,
    'CREATE TABLE IF NOT EXISTS $1'
  );
  
  // Add IF NOT EXISTS to CREATE INDEX statements
  modified = modified.replace(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(["']?[a-zA-Z_][a-zA-Z0-9_]*["']?)/gi,
    'CREATE INDEX IF NOT EXISTS $1'
  );
  
  return modified;
}

/**
 * Extract ALTER TABLE statements from SQL
 */
function extractAlterStatements(sql: string): string[] {
  const alterStatements: string[] = [];
  // Match ALTER TABLE statements (including multi-line)
  const alterRegex = /ALTER\s+TABLE\s+[^;]+;/gi;
  let match;
  
  while ((match = alterRegex.exec(sql)) !== null) {
    alterStatements.push(match[0].trim());
  }
  
  return alterStatements;
}

/**
 * Extract DROP/ADD CONSTRAINT statements
 */
function extractConstraintStatements(sql: string): string[] {
  const statements: string[] = [];
  // Match CREATE UNIQUE INDEX, CREATE INDEX, DROP INDEX, etc.
  const constraintRegex = /(?:CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+(?:INDEX|CONSTRAINT)|ALTER\s+TABLE.*(?:ADD|DROP)\s+CONSTRAINT)[^;]+;/gi;
  let match;
  
  while ((match = constraintRegex.exec(sql)) !== null) {
    statements.push(match[0].trim());
  }
  
  return statements;
}

/**
 * Check if a column exists in a table
 */
async function columnExists(sql: postgres.Sql, tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = ${dbSchema} 
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      );
    `;
    return result[0]?.exists === true;
  } catch (error) {
    console.error(`Error checking if column ${tableName}.${columnName} exists:`, error);
    return false;
  }
}

/**
 * Extract column definitions from CREATE TABLE statement
 */
function extractColumnsFromCreateTable(createTableSql: string): Array<{ name: string; definition: string }> {
  const columns: Array<{ name: string; definition: string }> = [];
  
  // Extract the column definitions part (between parentheses)
  const columnSectionMatch = createTableSql.match(/\(([\s\S]*)\)/);
  if (!columnSectionMatch) {
    return columns;
  }
  
  const columnSection = columnSectionMatch[1];
  
  // Parse columns by splitting on commas, but handle commas inside parentheses
  // We'll use a state machine approach
  let currentColumn = '';
  let parenDepth = 0;
  let inQuotes = false;
  
  for (let i = 0; i < columnSection.length; i++) {
    const char = columnSection[i];
    const prevChar = i > 0 ? columnSection[i - 1] : '';
    
    // Handle quotes
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      inQuotes = !inQuotes;
      currentColumn += char;
      continue;
    }
    
    // Track parentheses depth (only when not in quotes)
    if (!inQuotes) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
    }
    
    currentColumn += char;
    
    // If we hit a comma at depth 0 and not in quotes, it's a column separator
    if (char === ',' && parenDepth === 0 && !inQuotes) {
      const columnDef = currentColumn.trim().replace(/,$/, '').trim();
      if (columnDef && !columnDef.match(/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY)/i)) {
        // Extract column name and definition
        const colMatch = columnDef.match(/^["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s+(.+)$/);
        if (colMatch) {
          columns.push({ name: colMatch[1], definition: colMatch[2].trim() });
        }
      }
      currentColumn = '';
    }
  }
  
  // Handle the last column (no trailing comma)
  if (currentColumn.trim()) {
    const columnDef = currentColumn.trim();
    if (columnDef && !columnDef.match(/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY)/i)) {
      const colMatch = columnDef.match(/^["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s+(.+)$/);
      if (colMatch) {
        columns.push({ name: colMatch[1], definition: colMatch[2].trim() });
      }
    }
  }
  
  return columns;
}

/**
 * Check and fix column type mismatches
 */
async function checkAndFixColumnType(sql: postgres.Sql, tableName: string, columnName: string, expectedType: string): Promise<boolean> {
  try {
    const columnInfo = await sql`
      SELECT data_type, udt_name
      FROM information_schema.columns 
      WHERE table_schema = ${dbSchema} 
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    `;
    
    if (columnInfo.length === 0) {
      return false; // Column doesn't exist
    }
    
    const currentType = columnInfo[0]?.data_type;
    const currentUdt = columnInfo[0]?.udt_name;
    
    // Normalize types for comparison
    // serial is just integer with auto-increment, so treat it as integer
    let normalizedExpected = expectedType.toLowerCase().replace(/\s+/g, '');
    if (normalizedExpected.includes('serial')) {
      normalizedExpected = 'integer';
    }
    const normalizedCurrent = currentType?.toLowerCase() || '';
    
    // Check if types match
    const typeMatches = 
      normalizedExpected.includes('integer') && (normalizedCurrent === 'integer' || normalizedCurrent === 'int4') ||
      normalizedExpected.includes('varchar') && (normalizedCurrent === 'character varying' || normalizedCurrent === 'varchar') ||
      normalizedExpected.includes('timestamp') && (normalizedCurrent === 'timestamp without time zone' || normalizedCurrent === 'timestamp') ||
      normalizedExpected === normalizedCurrent;
    
    if (!typeMatches) {
      // Type mismatch detected - need to convert
      console.log(`    🔧 Type mismatch detected: ${tableName}.${columnName} is ${currentType}, expected ${expectedType}`);
      
      // Handle varchar to integer conversion
      if ((normalizedCurrent === 'character varying' || normalizedCurrent === 'varchar' || normalizedCurrent === 'text') && normalizedExpected.includes('integer')) {
        // Clean up data first - convert valid numeric strings to integers, set invalid ones to NULL
        await sql.unsafe(`
          UPDATE "${tableName}" 
          SET "${columnName}" = CASE 
            WHEN "${columnName}" ~ '^[0-9]+$' THEN ("${columnName}")::integer
            ELSE NULL
          END
          WHERE "${columnName}" IS NOT NULL
        `);
        console.log(`    ✅ Cleaned up ${tableName}.${columnName} values`);
        
        // Change the column type to integer
        await sql.unsafe(`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE integer USING "${columnName}"::integer`);
        console.log(`    ✅ Changed ${tableName}.${columnName} type from ${currentType} to integer`);
        return true;
      }
      
      // For other type changes, try to convert directly
      if (!normalizedExpected.includes('serial')) {
        try {
          await sql.unsafe(`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${expectedType} USING "${columnName}"::${expectedType}`);
          console.log(`    ✅ Changed ${tableName}.${columnName} type from ${currentType} to ${expectedType}`);
          return true;
        } catch (convertError: any) {
          console.error(`    ⚠️  Could not convert type:`, convertError?.message || convertError);
        }
      }
    }
    
    return false;
  } catch (error: any) {
    console.error(`    ⚠️  Error checking column type for ${tableName}.${columnName}:`, error?.message || error);
    return false;
  }
}

/**
 * Add missing columns to an existing table based on CREATE TABLE statement
 */
async function addMissingColumns(sql: postgres.Sql, tableName: string, createTableSql: string): Promise<void> {
  try {
    const expectedColumns = extractColumnsFromCreateTable(createTableSql);
    
    if (expectedColumns.length === 0) {
      console.log(`    ℹ️  No columns extracted from CREATE TABLE for ${tableName}`);
      return;
    }
    
    console.log(`    📋 Found ${expectedColumns.length} expected columns in schema`);
    
    for (const col of expectedColumns) {
      const exists = await columnExists(sql, tableName, col.name);
      if (!exists) {
        // Column is missing, add it
        console.log(`    ➕ Column ${tableName}.${col.name} is missing, adding...`);
        const alterSql = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.definition}`;
        await sql.unsafe(alterSql);
        console.log(`    ✅ Added missing column ${tableName}.${col.name}`);
      } else {
        // Column exists, check if type matches
        // Extract type from definition (e.g., "integer", "varchar(50)", "timestamp")
        const typeMatch = col.definition.match(/^(\w+(?:\([^)]+\))?)/i);
        if (typeMatch) {
          const expectedType = typeMatch[1];
          await checkAndFixColumnType(sql, tableName, col.name, expectedType);
        }
      }
    }
  } catch (error: any) {
    console.error(`    ⚠️  Error adding missing columns to ${tableName}:`, error?.message || error);
  }
}

/**
 * Apply schema changes to existing tables (ALTER statements)
 */
async function applySchemaChanges(sql: postgres.Sql, sqlContent: string, existingTables: string[]): Promise<void> {
  if (existingTables.length === 0) {
    return; // No existing tables, nothing to alter
  }

  console.log(`  🔧 Applying schema changes to existing tables...`);

  // Extract ALTER TABLE statements
  const alterStatements = extractAlterStatements(sqlContent);
  
  // Separate type changes from constraint additions - do type changes first
  const typeChangeStatements: string[] = [];
  const constraintStatements: string[] = [];
  const otherStatements: string[] = [];
  
  for (const alterStmt of alterStatements) {
    if (alterStmt.match(/ALTER\s+COLUMN.*SET\s+DATA\s+TYPE/i)) {
      typeChangeStatements.push(alterStmt);
    } else if (alterStmt.match(/ADD\s+CONSTRAINT.*FOREIGN\s+KEY/i)) {
      constraintStatements.push(alterStmt);
    } else {
      otherStatements.push(alterStmt);
    }
  }
  
  // Process type changes first
  for (const alterStmt of typeChangeStatements) {
    try {
      const alterTypeMatch = alterStmt.match(/ALTER\s+TABLE\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+ALTER\s+COLUMN\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+SET\s+DATA\s+TYPE\s+(\w+)/i);
      if (alterTypeMatch) {
        const [, tableName, columnName, newType] = alterTypeMatch;
        if (existingTables.includes(tableName)) {
          try {
            // Check current column type
            const currentType = await sql`
              SELECT data_type 
              FROM information_schema.columns 
              WHERE table_schema = ${dbSchema} 
              AND table_name = ${tableName}
              AND column_name = ${columnName}
            `;
            
            if (currentType.length > 0) {
              const currentDataType = currentType[0]?.data_type;
              // If changing from varchar/text to integer, need to handle conversion
              if ((currentDataType === 'character varying' || currentDataType === 'varchar' || currentDataType === 'text') && newType.toLowerCase() === 'integer') {
                console.log(`    🔧 Converting ${tableName}.${columnName} from ${currentDataType} to ${newType}...`);
                // First, try to convert valid numeric strings to integers, set invalid ones to NULL
                await sql.unsafe(`
                  UPDATE "${tableName}" 
                  SET "${columnName}" = CASE 
                    WHEN "${columnName}" ~ '^[0-9]+$' THEN "${columnName}"::integer
                    ELSE NULL
                  END
                  WHERE "${columnName}" IS NOT NULL
                `);
                console.log(`    ✅ Cleaned up ${tableName}.${columnName} values`);
              }
            }
          } catch (typeCheckError: any) {
            console.log(`    ℹ️  Could not check current type, proceeding with type change:`, typeCheckError?.message);
          }
        }
      }
      
      // Execute ALTER statement
      await sql.unsafe(alterStmt);
      console.log(`    ✅ Applied type change: ${alterStmt.substring(0, 60)}...`);
    } catch (error: any) {
      const isNonCriticalError = 
        error?.code === '42710' || // duplicate_object
        error?.code === '42P07' || // duplicate_table
        error?.code === '42701' || // duplicate_column
        error?.message?.includes('already exists') ||
        error?.message?.includes('duplicate') ||
        error?.severity === 'NOTICE';
      
      if (isNonCriticalError) {
        console.log(`    ℹ️  ${alterStmt.substring(0, 50)}... (already exists, skipping)`);
      } else {
        console.error(`    ⚠️  Error applying type change: ${alterStmt.substring(0, 50)}...`, error?.message || error);
      }
    }
  }
  
  // Process other ALTER statements (non-type, non-constraint)
  for (const alterStmt of otherStatements) {
    try {
      // Handle ADD COLUMN with IF NOT EXISTS check
      if (alterStmt.match(/ADD\s+COLUMN/i)) {
        const addMatch = alterStmt.match(/ALTER\s+TABLE\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+ADD\s+COLUMN\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/i);
        if (addMatch) {
          const tableName = addMatch[1];
          const columnName = addMatch[2];
          
          if (existingTables.includes(tableName)) {
            const exists = await columnExists(sql, tableName, columnName);
            if (exists) {
              console.log(`    ℹ️  Column ${tableName}.${columnName} already exists, skipping`);
              continue;
            }
          }
        }
      }
      
      // Execute ALTER statement
      await sql.unsafe(alterStmt);
      console.log(`    ✅ Applied: ${alterStmt.substring(0, 60)}...`);
    } catch (error: any) {
      const isNonCriticalError = 
        error?.code === '42710' || // duplicate_object
        error?.code === '42P07' || // duplicate_table
        error?.code === '42701' || // duplicate_column
        error?.message?.includes('already exists') ||
        error?.message?.includes('duplicate') ||
        error?.severity === 'NOTICE';
      
      if (isNonCriticalError) {
        console.log(`    ℹ️  ${alterStmt.substring(0, 50)}... (already exists, skipping)`);
      } else {
        console.error(`    ⚠️  Error applying: ${alterStmt.substring(0, 50)}...`, error?.message || error);
      }
    }
  }
  
  // Process foreign key constraints last (after type changes are done)
  for (const alterStmt of constraintStatements) {
    // Extract foreign key details (declare outside try for error handler)
    const fkMatch = alterStmt.match(/FOREIGN\s+KEY\s+\(["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\)\s+REFERENCES\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s*\(["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\)/i);
    const tableMatch = alterStmt.match(/ALTER\s+TABLE\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/i);
    const constraintMatch = alterStmt.match(/ADD\s+CONSTRAINT\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/i);
    
    try {
      if (fkMatch && tableMatch && constraintMatch) {
        const [, fkColumn, refTable, refColumn] = fkMatch;
        const tableName = tableMatch[1];
        const constraintName = constraintMatch[1];
        
        // Check if constraint already exists
        const constraintExists = await sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = ${dbSchema} 
            AND constraint_name = ${constraintName}
            AND table_name = ${tableName}
          );
        `;
        
        if (constraintExists[0]?.exists === true) {
          console.log(`    ℹ️  Constraint ${constraintName} already exists, skipping`);
          continue;
        }
        
        // Clean up invalid foreign key values before adding constraint
        if (existingTables.includes(tableName) && existingTables.includes(refTable)) {
          try {
            await sql.unsafe(`
              UPDATE "${tableName}" 
              SET "${fkColumn}" = NULL 
              WHERE "${fkColumn}" IS NOT NULL 
              AND "${fkColumn}" NOT IN (SELECT "${refColumn}" FROM "${refTable}")
            `);
            console.log(`    🔧 Cleaned up invalid foreign key values in ${tableName}.${fkColumn}`);
          } catch (cleanupError: any) {
            console.log(`    ℹ️  Could not clean up foreign key values (non-critical):`, cleanupError?.message);
          }
        }
      }
      
      // Execute ALTER statement to add constraint
      await sql.unsafe(alterStmt);
      console.log(`    ✅ Applied foreign key constraint: ${alterStmt.substring(0, 60)}...`);
    } catch (error: any) {
      const isNonCriticalError = 
        error?.code === '42710' || // duplicate_object
        error?.code === '42P07' || // duplicate_table
        error?.message?.includes('already exists') ||
        error?.message?.includes('duplicate') ||
        error?.severity === 'NOTICE';
      
      const isForeignKeyError = 
        error?.message?.includes('foreign key') ||
        error?.message?.includes('violates foreign key') ||
        error?.code === '23503'; // foreign_key_violation
      
      if (isNonCriticalError) {
        console.log(`    ℹ️  ${alterStmt.substring(0, 50)}... (already exists, skipping)`);
      } else if (isForeignKeyError) {
        console.error(`    ⚠️  Error applying foreign key constraint: ${alterStmt.substring(0, 50)}...`, error?.message || error);
        if (fkMatch && tableMatch) {
          console.error(`    💡 Tip: Check for invalid ${fkMatch[1]} values in ${tableMatch[1]} that don't exist in ${fkMatch[2]}`);
        }
      } else {
        console.error(`    ⚠️  Error applying: ${alterStmt.substring(0, 50)}...`, error?.message || error);
      }
    }
  }
}

/**
 * Extract and apply constraints and indexes
 */
async function applyConstraintsAndIndexes(sql: postgres.Sql, sqlContent: string): Promise<void> {
  const constraintStatements = extractConstraintStatements(sqlContent);
  
  if (constraintStatements.length === 0) {
    return;
  }
  
  console.log(`  🔧 Applying constraints and indexes...`);
  
  for (const stmt of constraintStatements) {
    try {
      await sql.unsafe(stmt);
      console.log(`    ✅ Applied: ${stmt.substring(0, 60)}...`);
    } catch (error: any) {
      const isNonCriticalError = 
        error?.code === '42710' || // duplicate_object
        error?.code === '42P07' || // duplicate_table
        error?.message?.includes('already exists') ||
        error?.message?.includes('duplicate') ||
        error?.severity === 'NOTICE';
      
      if (isNonCriticalError) {
        console.log(`    ℹ️  Constraint/index already exists (non-critical)`);
      } else {
        console.error(`    ⚠️  Error creating constraint/index:`, error?.message || error);
      }
    }
  }
}

/**
 * Get triggers and constraints SQL from schema files
 * Uses the same pattern matching as apply-triggers-and-constraints.ts
 */
function getTriggersAndConstraintsSQL(): string {
  const sqlParts: string[] = [];
  
  if (!fs.existsSync(schemaFolder)) {
    return '';
  }
  
  // Determine which files to check
  let filesToCheck: string[] = [];
  
  if (specificSchemaFiles) {
    // Use specified files
    filesToCheck = specificSchemaFiles.map(file => {
      // Add .ts extension if not present
      if (!file.endsWith('.ts') && !file.endsWith('.js')) {
        file = file + '.ts';
      }
      return path.join(schemaFolder, file);
    }).filter(fs.existsSync);
  } else {
    // Auto-detect: find all TypeScript files in schema folder
    filesToCheck = fs.readdirSync(schemaFolder)
      .filter(file => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts'))
      .map(file => path.join(schemaFolder, file));
  }
  
  if (filesToCheck.length === 0) {
    return '';
  }
  
  // Common patterns for SQL exports (same as apply-triggers-and-constraints.ts)
  const sqlPatterns = [
    // Specific patterns (higher priority)
    /export\s+const\s+[\w_]*TRIGGER[\w_]*SQL\s*=\s*`([\s\S]*?)`;/gi,
    /export\s+const\s+[\w_]*CONSTRAINT[\w_]*SQL\s*=\s*`([\s\S]*?)`;/gi,
    /export\s+const\s+[\w_]*FOREIGN[\w_]*KEY[\w_]*SQL\s*=\s*`([\s\S]*?)`;/gi,
    // Generic pattern (lower priority)
    /export\s+const\s+[\w_]*SQL\s*=\s*`([\s\S]*?)`;/gi,
  ];
  
  for (const filePath of filesToCheck) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Try each pattern
      for (const pattern of sqlPatterns) {
        const matches = Array.from(content.matchAll(pattern));
        for (const match of matches) {
          if (match[1]) {
            const sql = match[1].trim();
            if (sql && !sqlParts.includes(sql)) {
              sqlParts.push(sql);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors reading individual files
      console.warn(`⚠️  Warning: Could not read schema file ${path.basename(filePath)}`);
    }
  }
  
  return sqlParts.join('\n\n');
}

/**
 * Check if SQL content already exists in migration file
 */
function sqlAlreadyExists(content: string, sql: string): boolean {
  // Extract key identifiers from SQL to check if it's already present
  const keyIdentifiers: string[] = [];
  
  // Extract constraint names
  const constraintMatches = sql.matchAll(/CONSTRAINT\s+["']?([\w_]+)["']?/gi);
  for (const match of constraintMatches) {
    keyIdentifiers.push(match[1]);
  }
  
  // Extract function/trigger names
  const functionMatches = sql.matchAll(/(?:CREATE|DROP)\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER)\s+["']?([\w_]+)["']?/gi);
  for (const match of functionMatches) {
    keyIdentifiers.push(match[1]);
  }
  
  // Check if any key identifier exists in content
  if (keyIdentifiers.length > 0) {
    return keyIdentifiers.some(id => content.includes(id));
  }
  
  // Fallback: check if a significant portion of SQL exists
  const sqlLines = sql.split('\n').filter(line => line.trim() && !line.trim().startsWith('--'));
  if (sqlLines.length > 0) {
    const sampleLine = sqlLines[0].trim().substring(0, 50);
    return content.includes(sampleLine);
  }
  
  return false;
}

/**
 * Add triggers/constraints to the latest migration file
 */
function addToLatestMigration(): boolean {
  try {
    const combinedSQL = getTriggersAndConstraintsSQL();
    
    if (!combinedSQL.trim()) {
      console.log('ℹ️  No triggers/constraints found in schema files, skipping addition to migration');
      return false;
    }
    
    // Check if migrations folder exists
    if (!fs.existsSync(migrationsFolder)) {
      console.log('ℹ️  Migrations folder not found, skipping addition to migration');
      return false;
    }

    // Get all SQL migration files
    const migrationFiles = fs.readdirSync(migrationsFolder)
      .filter(file => file.endsWith('.sql'))
      .sort()
      .reverse(); // Sort descending to get latest first

    if (migrationFiles.length === 0) {
      console.log('ℹ️  No migration files found, skipping addition to migration');
      return false;
    }

    // Get the latest migration file
    const latestMigration = migrationFiles[0];
    const latestMigrationPath = path.join(migrationsFolder, latestMigration);

    // Read current content
    let currentContent = fs.readFileSync(latestMigrationPath, 'utf-8');

    // Check if SQL already exists in this migration
    if (sqlAlreadyExists(currentContent, combinedSQL)) {
      console.log(`ℹ️  Triggers/constraints already exist in ${latestMigration}, skipping`);
      return false;
    }

    // Append SQL to the migration
    const updatedContent = currentContent + '\n\n' + combinedSQL;

    // Write back to file
    fs.writeFileSync(latestMigrationPath, updatedContent, 'utf-8');

    console.log(`✅ Added triggers and constraints SQL to ${latestMigration}`);
    return true;
  } catch (error) {
    console.error('❌ Error adding to migration:', error);
    throw error;
  }
}

/**
 * Verify constraints and triggers in the database
 */
async function verifyConstraints(sql: postgres.Sql): Promise<void> {
  if (process.env.DRIZZLE_VERIFY_CONSTRAINTS === 'false') {
    return;
  }
  
  try {
    console.log('\n🔍 Verifying constraints...');
    
    // Check for foreign key constraints
    const fkConstraints = await sql`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = ${dbSchema}
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    
    if (fkConstraints.length > 0) {
      console.log(`  ✅ Found ${fkConstraints.length} foreign key constraint(s)`);
    }
    
    // Check for triggers
    const triggers = await sql`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE trigger_schema = ${dbSchema}
      ORDER BY event_object_table, trigger_name;
    `;
    
    if (triggers.length > 0) {
      console.log(`  ✅ Found ${triggers.length} trigger(s)`);
    }
  } catch (verifyError) {
    // Verification is optional, don't fail if it errors
    console.log('  ℹ️  Could not verify constraints (non-critical)');
  }
}

/**
 * Run migrations with smart handling of existing tables
 */
async function runMigrations() {
  // Step 1: Add to migration file (if requested)
  if (addToMigration) {
    console.log('📝 Adding triggers/constraints to latest migration file...\n');
    const added = addToLatestMigration();
    if (added) {
      console.log('✅ Added to migration file\n');
    } else {
      console.log('⏭️  Skipped (already exists or no SQL found)\n');
    }
    
    // If only adding to migration, exit early (no database connection needed)
    if (addToMigrationOnly) {
      console.log('✨ Done! (Only adding to migration file, not running migrations)');
      return;
    }
  }
  
  // From here on, we need a database connection
  if (!connectionString) {
    throw new Error('Database connection is required to run migrations');
  }
  
  console.log('🔌 Connecting to database...');
  const connectionStringForLog = connectionString.replace(/:[^:@]+@/, ':****@');
  console.log('📡 Connection:', connectionStringForLog);
  
  // Create postgres client
  const sql = postgres(connectionString, { max: 1 });
  
  // Check if migrations folder exists
  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found: ${migrationsFolder}`);
  }
  
  console.log('📂 Migrations folder:', migrationsFolder);
  
  // Ensure schema exists (skip for 'public' schema as it always exists)
  if (dbSchema.toLowerCase() !== 'public') {
    console.log(`📋 Checking/creating schema: ${dbSchema}`);
    try {
      // Use unsafe to properly quote schema name
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${dbSchema}"`);
      console.log(`✅ Schema '${dbSchema}' is ready\n`);
    } catch (error: any) {
      console.warn(`⚠️  Could not create schema (may already exist): ${error.message}\n`);
    }
  } else {
    console.log(`📋 Using default 'public' schema (no creation needed)\n`);
  }
  
  // Get all migration SQL files
  const migrationFiles = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  if (migrationFiles.length === 0) {
    console.log('ℹ️  No migration files found');
    await sql.end();
    return;
  }
  
  console.log(`📋 Found ${migrationFiles.length} migration file(s)\n`);
  
  try {
    // Get existing tables
    const existingTablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ${dbSchema} 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const existingTables = existingTablesResult.map((row: any) => row.table_name);
    
    console.log(`📊 Found ${existingTables.length} existing table(s) in database\n`);
    
    // Process each migration file
    for (const migrationFile of migrationFiles) {
      console.log(`📄 Processing: ${migrationFile}`);
      const migrationPath = path.join(migrationsFolder, migrationFile);
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
      
      // Extract table names from this migration
      const tableNames = extractTableNames(sqlContent);
      const newTables = tableNames.filter(table => !existingTables.includes(table));
      
      if (newTables.length > 0) {
        console.log(`  ✨ Creating ${newTables.length} new table(s): ${newTables.join(', ')}`);
      }
      
      // Split SQL into table creation and other statements
      const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?[^;]*;/gi;
      let tableSql = sqlContent;
      let triggersSql = '';
      
      // Check if there's a separator for triggers/constraints (common pattern)
      const triggerSeparator = /--\s*TRIGGERS|--\s*CONSTRAINTS|--\s*CUSTOM/i;
      if (triggerSeparator.test(sqlContent)) {
        const parts = sqlContent.split(triggerSeparator);
        tableSql = parts[0];
        triggersSql = parts.slice(1).join('\n');
      }
      
      // Extract and execute CREATE TABLE statements for new tables only
      const createTableRegex2 = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?[^;]*;/gi;
      let match;
      const statements: { tableName: string; sql: string }[] = [];
      const allTableStatements: { tableName: string; sql: string }[] = [];
      
      // Reset regex to scan from beginning
      createTableRegex2.lastIndex = 0;
      while ((match = createTableRegex2.exec(tableSql)) !== null) {
        const tableName = match[1];
        const fullMatch = match[0];
        allTableStatements.push({ tableName, sql: fullMatch });
        if (newTables.includes(tableName)) {
          statements.push({ tableName, sql: fullMatch });
        }
      }
      
      // Execute CREATE TABLE for new tables with IF NOT EXISTS
      for (const stmt of statements) {
        // Extract table definition (everything after table name)
        const tableDef = stmt.sql.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?[a-zA-Z_][a-zA-Z0-9_]*["']?\s*/i, '');
        const finalSql = `CREATE TABLE IF NOT EXISTS "${stmt.tableName}" ${tableDef}`;
        
        try {
          await sql.unsafe(finalSql);
        } catch (error: any) {
          if (error?.severity !== 'NOTICE' && error?.code !== '42P07') {
            throw error;
          }
        }
      }
      
      // Check existing tables for missing columns from CREATE TABLE definitions
      for (const stmt of allTableStatements) {
        if (existingTables.includes(stmt.tableName)) {
          console.log(`  🔍 Checking ${stmt.tableName} for missing columns...`);
          await addMissingColumns(sql, stmt.tableName, stmt.sql);
        }
      }
      
      // Apply schema changes (ALTER TABLE statements) for existing tables
      await applySchemaChanges(sql, tableSql, existingTables);
      
      // Execute rest of SQL (ALTER, indexes, etc.) with IF NOT EXISTS for existing tables
      const restOfSql = tableSql.replace(createTableRegex2, '');
      if (restOfSql.trim()) {
        const modifiedRest = addIfNotExists(restOfSql);
        try {
          await sql.unsafe(modifiedRest);
        } catch (error: any) {
          // Handle duplicate constraint/index errors gracefully
          const isNonCriticalError = 
            error?.severity === 'NOTICE' || 
            error?.code === '42P07' || // duplicate_table
            error?.code === '42710' || // duplicate_object (constraints, indexes)
            error?.code === '23505' || // unique_violation
            error?.message?.includes('already exists') ||
            error?.message?.includes('duplicate');
          
          if (isNonCriticalError) {
            console.log(`    ℹ️  Some constraints/indexes already exist (non-critical)`);
          } else {
            throw error;
          }
        }
      }
      
      // Apply constraints and indexes
      await applyConstraintsAndIndexes(sql, tableSql);
      
      // ALWAYS execute triggers and constraints SQL, even if tables exist
      if (triggersSql.trim()) {
        console.log(`  🔧 Applying triggers and constraints from migration...`);
        try {
          await sql.unsafe(triggersSql);
          console.log(`  ✅ Triggers and constraints applied`);
        } catch (triggerError: any) {
          // Log but don't fail - triggers/constraints might already exist
          const isNonCriticalError = 
            triggerError?.code === '42P07' || // duplicate_table
            triggerError?.code === '42710' || // duplicate_object (constraints, indexes)
            triggerError?.code === '23505' || // unique_violation
            triggerError?.message?.includes('already exists') ||
            triggerError?.message?.includes('duplicate') ||
            triggerError?.severity === 'NOTICE';
          
          if (isNonCriticalError) {
            console.log(`  ℹ️  Some triggers/constraints already exist (non-critical)`);
          } else {
            console.error(`  ⚠️  Error applying triggers:`, triggerError?.message || triggerError);
            // Don't throw - continue with migration (triggers might have been applied before)
          }
        }
      }
      
      // Verify new tables were actually created
      const createdTables: string[] = [];
      for (const tableName of newTables) {
        const exists = await tableExists(sql, tableName);
        if (exists) {
          createdTables.push(tableName);
        }
      }
      
      if (createdTables.length > 0) {
        console.log(`  ✅ Migration applied (created ${createdTables.length} new table(s): ${createdTables.join(', ')})`);
      } else if (newTables.length === 0) {
        console.log(`  ✅ Migration processed (no new tables)`);
      }
      
      console.log(''); // Empty line between migrations
    }
    
    // Apply triggers and constraints from schema files (if any)
    // This ensures constraints are applied even if they weren't in migration files
    const schemaTriggersSQL = getTriggersAndConstraintsSQL();
    if (schemaTriggersSQL.trim()) {
      const sqlSources = schemaTriggersSQL.split('\n\n').filter(s => s.trim()).length;
      console.log(`\n🔧 Applying triggers and constraints from schema files...`);
      console.log(`   Found SQL from ${sqlSources} source(s) in ${schemaFolder}`);
      
      // Show what will be applied (first 200 chars of each SQL block)
      const sqlBlocks = schemaTriggersSQL.split('\n\n').filter(s => s.trim());
      sqlBlocks.forEach((block, idx) => {
        const preview = block.split('\n').slice(0, 2).join(' ').substring(0, 100);
        console.log(`   [${idx + 1}] ${preview}...`);
      });
      
      try {
        await sql.unsafe(schemaTriggersSQL);
        console.log('✅ Triggers and constraints from schema files applied successfully');
      } catch (error: any) {
        const isNonCriticalError = 
          error?.code === '42710' || // duplicate_object
          error?.code === '42P07' || // duplicate_table
          error?.code === '23505' || // unique_violation
          error?.message?.includes('already exists') ||
          error?.message?.includes('duplicate') ||
          error?.severity === 'NOTICE';
        
        if (isNonCriticalError) {
          console.log('ℹ️  Some triggers/constraints already exist in database (skipped - non-critical)');
          console.log('   This is normal if constraints were applied previously.');
        } else {
          console.error('⚠️  Error applying triggers/constraints from schema:', error?.message || error);
          // Don't throw - continue (constraints might have been applied before)
        }
      }
      
      // Verify constraints (optional)
      await verifyConstraints(sql);
    } else {
      console.log(`\nℹ️  No triggers/constraints found in schema files`);
      console.log(`   Checked folder: ${schemaFolder}`);
      if (specificSchemaFiles) {
        console.log(`   Looking for: ${specificSchemaFiles.join(', ')}`);
      } else {
        console.log(`   Looking for exported constants like: *TRIGGER*SQL, *CONSTRAINT*SQL, *FOREIGN*KEY*SQL, etc.`);
      }
    }
    
    console.log('\n✅ All migrations completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error running migrations:', error);
    throw error;
  } finally {
    await sql.end();
    console.log('🔌 Database connection closed');
  }
}

// Run migrations
runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
