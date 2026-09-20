#!/usr/bin/env node

/**
 * This migration adds the `backupAutomatic` column to the OrganizationSettings table.
 * 
 * Run this in your Supabase dashboard's SQL Editor:
 * 
 * ALTER TABLE "OrganizationSettings"
 * ADD COLUMN IF NOT EXISTS "backupAutomatic" boolean NOT NULL DEFAULT true;
 * 
 * Or use the Supabase CLI:
 * supabase db push
 * 
 * If neither of those work, manually run this SQL in your database.
 */

const SQL = `
ALTER TABLE "OrganizationSettings"
ADD COLUMN IF NOT EXISTS "backupAutomatic" boolean NOT NULL DEFAULT true;
`;

console.log("=====================================");
console.log("Migration: Add backupAutomatic column");
console.log("=====================================\n");
console.log("To apply this migration, run one of the following:\n");
console.log("1. Supabase Dashboard (recommended):");
console.log("   - Go to your Supabase project");
console.log("   - Open SQL Editor");
console.log("   - Paste and run this SQL:\n");
console.log(SQL);
console.log("\n2. Supabase CLI:");
console.log("   supabase db push\n");
console.log("3. Direct database connection:");
console.log("   psql [connection-string]");
console.log("   Then run the SQL above\n");
console.log("After running the migration, the toggle will work without fallback.");
