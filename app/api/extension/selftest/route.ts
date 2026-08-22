import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * End-to-end check of the extension pairing handshake.
 *
 * Exists because pairing had never once succeeded — zero rows in
 * extension_tokens, ever — and the only way to confirm a fix was to watch a
 * human click a button in a browser. That is a poor loop: it conflates a
 * server bug, a stale extension build, and a browser messaging bug, which is
 * exactly the confusion that let this sit broken.
 *
 * This drives the real endpoints over HTTP the same way the extension does:
 * mint a code, exchange it for a token, use the token, revoke it. No
 * mocking, so a pass genuinely means the server half works.
 *
 * Gated on a caller-supplied secret compared against CRON_SECRET, because it
 * creates and revokes real tokens. Delete once pairing is proven in the wild.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.nextUrl.searchParams.get("key");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const base = req.nextUrl.origin;
  const steps: Record<string, unknown> = {};

  try {
    const ex = await fetch(`${base}/api/extension/exchange-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, label: "selftest" }),
      cache: "no-store",
    });
    const exBody = await ex.json().catch(() => ({}));
    steps.exchange = { status: ex.status, gotToken: !!exBody.token };

    if (!exBody.token) {
      steps.exchangeError = exBody.error ?? null;
      return NextResponse.json({ ok: false, steps });
    }

    const me = await fetch(`${base}/api/extension/me`, {
      headers: { Authorization: `Bearer ${exBody.token}` },
      cache: "no-store",
    });
    steps.me = { status: me.status, body: await me.json().catch(() => null) };

    const sync = await fetch(`${base}/api/extension/sync-points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${exBody.token}`,
      },
      body: JSON.stringify({
        program_code: "marriott_bonvoy",
        balance: 12345,
        page_host: "marriott.com",
        captured_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    steps.syncPoints = { status: sync.status, body: await sync.json().catch(() => null) };

    const rev = await fetch(`${base}/api/extension/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${exBody.token}`,
      },
      body: "{}",
      cache: "no-store",
    });
    steps.revoke = { status: rev.status };

    const ok =
      (steps.exchange as any).gotToken &&
      (steps.me as any).status === 200 &&
      (steps.syncPoints as any).status === 200;

    return NextResponse.json({ ok, steps });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, steps }, { status: 500 });
  }
}
