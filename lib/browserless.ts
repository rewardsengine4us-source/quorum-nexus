// Thin wrapper around Browserless.io, the hosted-Chrome service that makes
// live sync possible at all.
//
// Why a hosted browser: Vercel's serverless runtime cannot host Chromium,
// and no loyalty program offers a public balance API. See lib/vault.ts,
// whose ADAPTERS map has always been empty for exactly this reason.
//
// Why *reconnect* specifically: a phone-OTP login is not a single request.
// We open the browser, trigger the SMS, then have to wait for a human to
// read their own phone and hand us the code. That wait can be a minute,
// and it spans separate HTTP requests to a stateless function. Browserless
// solves this with the `Browserless.reconnect` CDP command: it keeps the
// browser (and its cookies, and its half-finished login) alive for a set
// window and hands back an endpoint we can reattach to later.

import puppeteer, { type Browser, type Page } from "puppeteer-core";

const DEFAULT_HOST = "production-sfo.browserless.io";

export function browserlessConfigured(): boolean {
  return !!process.env.BROWSERLESS_API_KEY;
}

function token(): string {
  const t = process.env.BROWSERLESS_API_KEY;
  if (!t) {
    throw new Error(
      "BROWSERLESS_API_KEY is not set. Live sync needs a hosted browser; " +
        "set the key in the Vercel project's environment variables."
    );
  }
  return t;
}

function host(): string {
  return process.env.BROWSERLESS_HOST || DEFAULT_HOST;
}

/** Fresh browser session. Caller is responsible for parking or closing it. */
export async function openBrowser(): Promise<Browser> {
  const url =
    `wss://${host()}?token=${encodeURIComponent(token())}` +
    // Ask for a stealthier profile; loyalty portals are behind bot
    // detection often enough that the default headless fingerprint gets
    // served a challenge page instead of the login form.
    `&stealth=true&headless=new`;

  return puppeteer.connect({
    browserWSEndpoint: url,
    // Full-page screenshots are what the user sees; a phone-ish viewport
    // keeps them readable on the device they're most likely holding.
    defaultViewport: { width: 430, height: 900, deviceScaleFactor: 1 },
  });
}

/** Reattach to a browser previously parked with parkBrowser(). */
export async function reopenBrowser(wsEndpoint: string): Promise<Browser> {
  return puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: { width: 430, height: 900, deviceScaleFactor: 1 },
  });
}

/**
 * Keep this browser alive without holding the HTTP request open, and
 * return the endpoint needed to pick it back up.
 *
 * `timeoutMs` is how long Browserless will hold it *idle*. Too short and a
 * user who fumbles for their phone loses the session; too long and we burn
 * one of only two concurrent browsers on the free tier. Five minutes is a
 * deliberate middle — comfortably longer than any SMS, short enough that
 * an abandoned attempt frees up quickly.
 */
export async function parkBrowser(
  page: Page,
  timeoutMs = 5 * 60 * 1000
): Promise<string> {
  const cdp = await page.createCDPSession();
  try {
    const res: any = await cdp.send(
      // Not in puppeteer's typed CDP protocol — this is a Browserless
      // extension command, hence the cast.
      "Browserless.reconnect" as any,
      { timeout: timeoutMs } as any
    );
    const endpoint = res?.browserWSEndpoint;
    if (!endpoint || typeof endpoint !== "string") {
      throw new Error("Browserless.reconnect returned no browserWSEndpoint.");
    }
    return endpoint;
  } catch (err: any) {
    throw new Error(
      `Could not park the browser session for OTP entry: ${err.message}. ` +
        `This usually means the Browserless plan or endpoint does not support ` +
        `reconnects.`
    );
  } finally {
    // Detaching the CDP session is fine; the browser itself stays up until
    // the reconnect window lapses.
    try {
      await cdp.detach();
    } catch {
      /* already gone */
    }
  }
}

/** Best-effort teardown. Never throws — callers are usually already erroring. */
export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    /* nothing useful to do */
  }
}

/** Small base64 JPEG of the current page, for showing the user what we see. */
export async function snapshot(page: Page): Promise<string | null> {
  try {
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 55,
      encoding: "base64",
      fullPage: false,
    });
    return `data:image/jpeg;base64,${buf}`;
  } catch {
    return null;
  }
}
