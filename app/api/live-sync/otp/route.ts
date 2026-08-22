import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { submitOtp } from "@/lib/liveSync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Relays the code the user received on their own phone into the browser
 * session that asked for it.
 *
 * The code is used once, immediately, and never written to the database —
 * it exists only for the lifetime of this request.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || "");
    const otp = String(body.otp || "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }
    if (!/^\d{4,8}$/.test(otp.replace(/\s/g, ""))) {
      return NextResponse.json(
        { error: "Enter the 4–8 digit code you were sent." },
        { status: 400 }
      );
    }

    // submitOtp resolves the session against userId itself, so a guessed
    // session id belonging to someone else simply will not be found.
    const session = await submitOtp({ userId, sessionId, otp });
    return NextResponse.json({ session });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to submit code." },
      { status: 500 }
    );
  }
}
