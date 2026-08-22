import { NextRequest, NextResponse } from "next/server";
import {
  openBrowser,
  reopenBrowser,
  parkBrowser,
  closeBrowser,
  browserlessConfigured,
} from "@/lib/browserless";
import {
  dismissOverlays,
  findPhoneField,
  settle,
  describePage,
} from "@/lib/liveSyncDriver";
import { findLiveSyncProgram } from "@/lib/liveSyncPrograms";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Read-only smoke test for the live-sync plumbing.
 *
 * It exists because the two assumptions live sync rests on are both
 * unverifiable from a build: that this Browserless plan supports
 * `Browserless.reconnect` (without it the whole park-for-OTP design is
 * impossible), and that a given program's login page actually exposes a
 * phone field to our generic finder. Discovering either of those by
 * having a user burn a real OTP would be a poor trade.
 *
 * Deliberately never types anything, never submits anything, and never
 * triggers an SMS. It loads a page, looks, and reports.
 *
 * Unauthenticated on purpose — it touches no user data and there is no
 * session to check against when calling it from a deploy check. The cost
 * of abuse is bounded to Browserless units, so it is rate limited to one
 * run at a time, globally.
 */

let lastRun = 0;
const MIN_GAP_MS = 20_000;

export async function GET(req: NextRequest) {
  if (!browserlessConfigured()) {
    return NextResponse.json(
      { ok: false, error: "BROWSERLESS_API_KEY is not set." },
      { status: 503 }
    );
  }

  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) {
    return NextResponse.json(
      { ok: false, error: "Probe is rate limited. Try again shortly." },
      { status: 429 }
    );
  }
  lastRun = now;

  const code = req.nextUrl.searchParams.get("program") || "ai_maharaja";
  const program = findLiveSyncProgram(code);
  if (!program) {
    return NextResponse.json(
      { ok: false, error: `Unknown program ${code}.` },
      { status: 400 }
    );
  }

  const steps: Record<string, any> = { program: program.name };
  let browser = null;

  try {
    const t0 = Date.now();
    browser = await openBrowser();
    steps.connected = true;
    steps.connectMs = Date.now() - t0;

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    const t1 = Date.now();
    await page.goto(program.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await settle(page, 6000);
    steps.loadedMs = Date.now() - t1;
    steps.landedOn = await describePage(page);

    await dismissOverlays(page);

    const phoneSel = await findPhoneField(page, program.hints?.phone ?? []);
    steps.phoneFieldFound = !!phoneSel;
    steps.phoneSelector = phoneSel;

    // The critical one: can this browser survive between requests?
    try {
      const ws = await parkBrowser(page, 30_000);
      steps.reconnectSupported = true;
      // Prove the endpoint is genuinely usable, not just returned.
      const again = await reopenBrowser(ws);
      const pages = await again.pages();
      steps.reattached = pages.length > 0;
      await closeBrowser(again);
      browser = null;
    } catch (err: any) {
      steps.reconnectSupported = false;
      steps.reconnectError = err.message;
    }

    await closeBrowser(browser);
    browser = null;

    return NextResponse.json({
      ok: steps.reconnectSupported === true,
      steps,
    });
  } catch (err: any) {
    await closeBrowser(browser);
    return NextResponse.json(
      { ok: false, error: err.message, steps },
      { status: 500 }
    );
  }
}
