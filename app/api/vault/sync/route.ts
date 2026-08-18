import { NextRequest, NextResponse } from "next/server";
import { runSyncFor, dueForSync } from "@/lib/vault";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;

/**
 * Manual "sync now" for a single credential.
 */
export async function POST(req: NextRequest) {
  try {
    const { credentialId } = await req.json();
    if (!credentialId) {
      return NextResponse.json(
        { error: "credentialId is required." },
        { status: 400 }
      );
    }
    const outcome = await runSyncFor(Number(credentialId), "manual");
    return NextResponse.json(outcome);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Weekly scheduled run, triggered by Vercel Cron (see vercel.json).
 *
 * Vercel sets the Authorization header to `Bearer $CRON_SECRET` on cron
 * invocations. Without that check this endpoint would let anyone on the
 * internet drive logins against the user's loyalty accounts.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${secret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; refusing to run." },
      { status: 503 }
    );
  }

  try {
    const ids = await dueForSync();
    const results = [];
    for (const id of ids) {
      results.push({ id, outcome: await runSyncFor(id, "scheduled") });
    }
    return NextResponse.json({ due: ids.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
