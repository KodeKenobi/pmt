#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSupabaseAdminClient } = require("./src/lib/supabase.ts");

async function migrate() {
  try {
    const supabase = createSupabaseAdminClient();
    
    console.log("Attempting to add backupAutomatic column...");
    
    // First, let's try to read the table to see if column exists
    const { data, error: selectError } = await supabase
      .from("OrganizationSettings")
      .select("*")
      .limit(1);

    if (selectError) {
      console.error("Error checking table:", selectError);
      process.exit(1);
    }

    console.log("Table exists. Attempting to add column...");
    
    // Try using raw SQL through PostgREST
    const { error: alterError } = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE "OrganizationSettings"
        ADD COLUMN IF NOT EXISTS "backupAutomatic" boolean NOT NULL DEFAULT true;
      `,
    });

    if (alterError) {
      // If exec_sql doesn't exist, try a different approach
      console.log("exec_sql RPC not available, trying alternative...");
      
      // Just verify the current state
      const record = data && data[0];
      if (record && "backupAutomatic" in record) {
        console.log("Column already exists!");
      } else {
        console.log("Column does not exist yet. Please add it manually via Supabase dashboard.");
        console.log("SQL: ALTER TABLE \"OrganizationSettings\" ADD COLUMN \"backupAutomatic\" boolean NOT NULL DEFAULT true;");
      }
    } else {
      console.log("Migration completed successfully!");
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

migrate();
