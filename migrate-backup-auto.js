const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "https://gkrcmxdpvimngzjafakx.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log("Adding backupAutomatic column to OrganizationSettings...");
    const { error } = await supabase.rpc("exec", {
      sql: `
        ALTER TABLE "OrganizationSettings"
        ADD COLUMN IF NOT EXISTS "backupAutomatic" boolean NOT NULL DEFAULT true;
      `,
    });

    if (error) {
      console.error("Migration failed:", error);
      process.exit(1);
    }

    console.log("Migration completed successfully");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

runMigration();
