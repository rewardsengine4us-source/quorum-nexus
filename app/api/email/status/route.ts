import { NextResponse } from "next/server";
import { select, selectOne, SERVICE_KEY_PRESENT, DEMO_USER_ID } from "@/lib/db";

// Surfaces real Postgrest errors in `diag` instead of silently returning
// empty arrays — this is what originally revealed the RLS-grant and
// supabase-js-vs-raw-fetch bugs. Keep it; it's cheap and it's saved hours.
export async function GET() {
  let connection = null;
  let logs: any[] = [];
  let programs: Record<number, string> = {};
  let diagError: string | null = null;

  try {
    connection = await selectOne(
      "email_connections",
      `user_id=eq.${DEMO_USER_ID}&oauth_provider=eq.gmail&select=id,email,oauth_provider,last_sync_at,created_at`
    );

    logs = await select(
      "email_parsing_logs",
      `user_id=eq.${DEMO_USER_ID}&select=id,email_subject,sender,extracted_points,extracted_balance,program_id,parse_status,detected_via,event_type,source,created_at&order=id.desc&limit=150`
    );

    const programRows = await select("loyalty_programs", "select=id,program_name");
    for (const p of programRows) programs[p.id] = p.program_name;
  } catch (err: any) {
    diagError = err.message;
  }

  return NextResponse.json({
    connection,
    logs,
    programs,
    diag: { keyPresent: SERVICE_KEY_PRESENT, error: diagError },
  });
}
