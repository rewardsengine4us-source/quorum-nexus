import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { getSession, cancelSync } from "@/lib/liveSync";

export const dynamic = "force-dynamic";

/** Poll a session's state. Never returns the browser endpoint. */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const session = await getSession(id, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({ session });
}

/**
 * Abandon a session and free the remote browser.
 *
 * Worth an explicit endpoint rather than leaving it to the timeout: the
 * free Browserless tier allows two concurrent browsers, so a user who
 * changes their mind should not have to wait five minutes to retry.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  await cancelSync(id, userId);
  return NextResponse.json({ ok: true });
}
