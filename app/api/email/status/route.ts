import { NextResponse } from "next/server";
import { select, selectOne, SERVICE_KEY_PRESENT } from "@/lib/db";
import { getSessionUserId } from "@/lib/supabaseServer";

/** Total rows scanned, via PostgREST's exact-count header. */
async function countScanned(userId: string): Promise<number | null> {
  try {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/rest/v1/";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const res = await fetch(
      `${base}email_parsing_logs?user_id=eq.${userId}&select=id`,
      {
        method: "HEAD",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          Prefer: "count=exact",
          Range: "0-0",
        },
        cache: "no-store",
      }
    );
    const range = res.headers.get("content-range");
    if (!range) return null;
    const total = range.split("/")[1];
    return total && total !== "*" ? Number(total) : null;
  } catch {
    return null;
  }
}

// Surfaces real Postgrest errors in `diag` instead of silently returning
// empty arrays — this is what originally revealed the RLS-grant and
// supabase-js-vs-raw-fetch bugs. Keep it; it's cheap and it's saved hours.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let connection = null;
  let logs: any[] = [];
  let programs: Record<number, string> = {};
  let diagError: string | null = null;

  try {
    connection = await selectOne(
      "email_connections",
      `user_id=eq.${userId}&oauth_provider=eq.gmail&select=id,email,oauth_provider,last_sync_at,created_at`
    );

    // Only surface emails that actually yielded a points figure.
    //
    // Every scanned message gets logged (that's what makes re-syncs
    // idempotent), but the vast majority are noise — LinkedIn digests,
    // OTPs, marketing blasts. Some of those even pick up a spurious
    // program_id from weak brand-name matching (a LinkedIn email
    // mentioning someone who works at HSBC, for example). None of it
    // belongs in a user-facing "Parsing History" view, which is about
    // points found, not mail scanned.
    logs = await select(
      "email_parsing_logs",
      `user_id=eq.${userId}&parse_status=eq.success&extracted_balance=not.is.null` +
        `&select=id,email_subject,sender,extracted_points,extracted_balance,program_id,parse_status,detected_via,event_type,source,created_at` +
        `&order=id.desc&limit=150`
    );

    const programRows = await select("loyalty_programs", "select=id,program_name");
    for (const p of programRows) programs[p.id] = p.program_name;
  } catch (err: any) {
    diagError = err.message;
  }

  const scannedTotal = await countScanned(userId);

  return NextResponse.json({
    connection,
    logs,
    programs,
    scannedTotal,
    diag: { keyPresent: SERVICE_KEY_PRESENT, error: diagError },
  });
}
