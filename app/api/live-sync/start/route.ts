import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { selectOne } from "@/lib/db";
import { browserlessConfigured } from "@/lib/browserless";
import { startSync } from "@/lib/liveSync";

// Opening a browser, loading an airline site and driving two form steps
// comfortably exceeds the default 10s. 60s is the ceiling we can rely on.
export const maxDuration = 60;
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

  if (!browserlessConfigured()) {
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

    // The phone number comes from the user's own profile rather than the
    // request body, so a crafted request cannot drive a login against a
    // number the account holder never registered.
    const profile = await selectOne("users", `id=eq.${userId}&select=phone`);
    const phone = profile?.phone;
    if (!phone) {
      return NextResponse.json(
        {
          error:
            "Add your phone number on the Profile page first — that's the number the program will text.",
        },
        { status: 400 }
      );
    }

    const session = await startSync({ userId, programCode, phone });
    return NextResponse.json({ session });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to start sync." },
      { status: 500 }
    );
  }
}
