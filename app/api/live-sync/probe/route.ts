import { NextRequest, NextResponse } from "next/server";
import {
  openBrowser,
  reopenBrowser,
  rawReconnect,
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

  // Candidate override, so a wrong login URL can be corrected by testing
  // rather than by guessing and redeploying each time. https only — this
  // reports a page title and whether a field was found, nothing more.
  const override = req.nextUrl.searchParams.get("url");
  if (override && !override.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "url must be https." },
      { status: 400 }
    );
  }
  const target = override || program.loginUrl;

  const steps: Record<string, any> = { program: program.name, target };
  let browser = null;

  try {
    const t0 = Date.now();
    browser = await openBrowser();
    steps.connected = true;
    steps.connectMs = Date.now() - t0;

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    const t1 = Date.now();
    await page.goto(target, {
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

    // What the page offers, so a missing phone field can be diagnosed
    // as "wrong page" versus "login is behind a button".
    steps.page = await page.evaluate(() => {
      const qn = (window as any).__qn;
      return {
        inputs: qn
          .inputs()
          .slice(0, 12)
          .map((el: HTMLElement) => ({
            type: el.getAttribute("type"),
            name: el.getAttribute("name"),
            id: el.id || null,
            placeholder: el.getAttribute("placeholder"),
            maxlength: el.getAttribute("maxlength"),
          })),
        buttons: qn
          .clickables()
          .map((el: HTMLElement) => qn.textOf(el).slice(0, 30))
          .filter(Boolean)
          .slice(0, 25),
      };
    });

    // The critical one: can this browser survive between requests?
    const raw = await rawReconnect(page, 30_000);
    steps.reconnectRaw = raw;
    steps.reconnectSupported = !!raw?.browserWSEndpoint;

    if (raw?.browserWSEndpoint) {
      // Prove the endpoint is genuinely usable, not merely returned.
      try {
        const again = await reopenBrowser(raw.browserWSEndpoint);
        steps.reattached = (await again.pages()).length > 0;
        await closeBrowser(again);
        browser = null;
      } catch (err: any) {
        steps.reattached = false;
        steps.reattachError = err.message;
      }
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
