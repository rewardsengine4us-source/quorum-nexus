import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { startSync, liveSyncConfigured } from "@/lib/liveSync";

// This route only hands the job to the Supabase worker and returns; the
// browser work runs there for up to two minutes afterwards. 30s is ample
// and keeps a wedged handoff from sitting on a connection.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Requires a real session on purpose. The shared public-demo-user has no
 * phone number of its own, and driving a login "as" it would mean one
 * visitor's real loyalty balance landing in a row every other visitor can
 * read. Live sync is the one feature where public mode cannot apply.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to sync a loyalty account." },
      { status: 401 }
    );
  }

  if (!liveSyncConfigured()) {
    return NextResponse.json(
      {
        error:
          "Live sync is not configured on this deployment — BROWSERLESS_API_KEY is missing.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const programCode = String(body.programCode || "");
    if (!programCode) {
      return NextResponse.json(
        { error: "programCode is required." },
        { status: 400 }
      );
    }

    // No phone in the payload on purpose — startSync reads it from the
    // user's own profile, so a crafted request cannot drive a login
    // against a number this account never registered.
    const session = await startSync({ userId, programCode });
    return NextResponse.json({ session });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to start sync." },
      { status: 500 }
    );
  }
}
