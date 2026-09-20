import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // Step 1: Check if column already exists by querying the table
    console.log("Checking if backupAutomatic column exists...");
    const { data, error: selectError } = await supabase
      .from("OrganizationSettings")
      .select("*")
      .limit(1);

    if (!selectError && data && data[0]) {
      const record = data[0] as Record<string, unknown>;
      if ("backupAutomatic" in record) {
        return NextResponse.json({
          success: true,
          message: "Column backupAutomatic already exists",
          columnExists: true,
        });
      }
    }

    // Step 2: Try to use raw SQL execution via supabase client
    // This requires SQL execution capability, which might not be available via PostgREST
    console.log("Attempting to add column via raw SQL...");

    // Try using the admin API to execute SQL directly
    // Note: This requires a special RPC function or direct database access
    const sqlQuery = `
      ALTER TABLE "OrganizationSettings"
      ADD COLUMN IF NOT EXISTS "backupAutomatic" boolean NOT NULL DEFAULT true;
    `;

    // Attempt to call a hypothetical sql_exec RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "sql_exec",
      { query: sqlQuery }
    );

    if (!rpcError) {
      return NextResponse.json({
        success: true,
        message: "Migration successful - column added",
        columnExists: true,
      });
    }

    // If RPC doesn't work, provide instructions
    console.log("RPC method not available:", rpcError);

    return NextResponse.json({
      success: false,
      message:
        "Column does not exist and RPC SQL execution is not available. Please use Supabase Dashboard to run the migration.",
      columnExists: false,
      instructions: {
        method1: "Supabase Dashboard",
        steps: [
          "Go to https://app.supabase.com/project/nibzfmjwisfdmwublvyu",
          "Open SQL Editor",
          "Run: ALTER TABLE \"OrganizationSettings\" ADD COLUMN IF NOT EXISTS \"backupAutomatic\" boolean NOT NULL DEFAULT true;",
          "Refresh the page",
        ],
        method2: "Supabase CLI",
        command: "supabase db push",
      },
      fallback: "Your backup toggle is working with localStorage persistence",
    });
  } catch (error) {
    console.error("Migration endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
