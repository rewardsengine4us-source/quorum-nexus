import { NextRequest, NextResponse } from "next/server";
import { runSyncFor, dueForSync } from "@/lib/vault";
import { safeEqual } from "@/lib/crypto";
import { getUserIdOrPublic } from "@/lib/publicSession";
import { selectOne } from "@/lib/db";

export const maxDuration = 60;

/**
 * Manual "sync now" for a single credential.
 *
 * runSyncFor() itself doesn't take a user id — it trusts whatever
 * credentialId it's given and resolves the owning row internally. That's
 * correct for the cron path below (system-triggered, iterates every due
 * credential regardless of owner), but wrong for a request coming from the
 * browser: without an ownership check here, one visitor could trigger a
 * sync against another visitor's credentialId just by guessing a small
 * integer. getUserIdOrPublic() (rather than a real-session-only lookup)
 * keeps this check working for the shared public-demo-user too — the
 * ownership check below still enforces that a credential can only be
 * synced by whichever id it was actually created under.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdOrPublic();

  try {
    const { credentialId } = await req.json();
    if (!credentialId) {
      return NextResponse.json(
        { error: "credentialId is required." },
        { status: 400 }
      );
    }

    const owned = await selectOne(
      "loyalty_credentials",
      `id=eq.${Number(credentialId)}&user_id=eq.${userId}&select=id`
    );
    if (!owned) {
      return NextResponse.json(
        { error: "Credential not found." },
        { status: 404 }
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
