// Orchestration for human-in-the-loop live sync.
//
// The shape of the thing: a sync is a conversation, not a function call.
//
//   start  -> open a real browser, type the phone number, press "send OTP",
//             park the browser, hand the user a session id
//   (user reads the SMS the program sent to *their* phone)
//   otp    -> reattach to that same browser, type the code, finish the
//             login, read the balance, write it, tear down
//
// The user typing their own OTP is not a limitation we failed to automate
// around — it is the only honest design. Loyalty programs send that code
// to the member and hold the member responsible for keeping it private.
// Anything that intercepted it silently would be doing something the
// member's own terms forbid.

import { selectOne, insert, patch, upsert } from "@/lib/db";
import {
  openBrowser,
  reopenBrowser,
  parkBrowser,
  closeBrowser,
  snapshot,
} from "@/lib/browserless";
import {
  dismissOverlays,
  fillPhone,
  clickAdvance,
  otpFieldPresent,
  fillOtp,
  submitOtpPattern,
  extractBalance,
  settle,
  describePage,
} from "@/lib/liveSyncDriver";
import {
  findLiveSyncProgram,
  localPhoneFor,
  type LiveSyncProgram,
} from "@/lib/liveSyncPrograms";

export type LiveSyncStatus =
  | "starting"
  | "awaiting_otp"
  | "resuming"
  | "success"
  | "failed"
  | "cancelled"
  | "expired";

export interface LiveSyncView {
  id: string;
  programCode: string;
  status: LiveSyncStatus;
  stepMessage: string | null;
  screenshot: string | null;
  points: number | null;
  error: string | null;
  expiresAt: string;
}

/** Columns safe to hand back to a browser. Never includes ws_endpoint. */
const PUBLIC_COLS =
  "id,program_code,status,step_message,screenshot,points_found,error_message,expires_at";

function toView(row: any): LiveSyncView {
  return {
    id: row.id,
    programCode: row.program_code,
    status: row.status,
    stepMessage: row.step_message ?? null,
    screenshot: row.screenshot ?? null,
    points: row.points_found ?? null,
    error: row.error_message ?? null,
    expiresAt: row.expires_at,
  };
}

async function update(id: string, fields: Record<string, any>) {
  await patch("live_sync_sessions", `id=eq.${id}`, {
    ...fields,
    updated_at: new Date().toISOString(),
  });
}

/** Fetch a session the caller is actually allowed to see. */
export async function getSession(
  id: string,
  userId: string
): Promise<LiveSyncView | null> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${id}&user_id=eq.${userId}&select=${PUBLIC_COLS}`
  );
  if (!row) return null;

  // A parked browser dies on Browserless's own timer; reflect that rather
  // than leaving a session that looks resumable but isn't.
  if (
    (row.status === "awaiting_otp" || row.status === "starting") &&
    new Date(row.expires_at).getTime() < Date.now()
  ) {
    await update(id, {
      status: "expired",
      error_message:
        "The session timed out before the code was entered. Start a new sync.",
    });
    row.status = "expired";
    row.error_message =
      "The session timed out before the code was entered. Start a new sync.";
  }

  return toView(row);
}

/* ------------------------------------------------------------------ */

/**
 * Phase one: get the program to text the user a code.
 *
 * Everything that can go wrong here goes wrong *loudly* and with a
 * screenshot attached, because the failure is almost always "the page did
 * not look like we expected" and a picture answers that instantly.
 */
export async function startSync(opts: {
  userId: string;
  programCode: string;
  phone: string;
}): Promise<LiveSyncView> {
  const program = findLiveSyncProgram(opts.programCode);
  if (!program) {
    throw new Error(
      `${opts.programCode} is not enabled for live sync yet.`
    );
  }

  const digits = localPhoneFor(program, opts.phone);
  if (digits.length < 7) {
    throw new Error(
      "That phone number does not look complete. Update it on your profile first."
    );
  }

  // Free-tier Browserless allows two concurrent browsers. Leaving orphans
  // parked would exhaust that within a few attempts, so a user gets one
  // live session at a time and starting a new one retires the old.
  await retireActiveSessions(opts.userId);

  const created = await insert("live_sync_sessions", {
    user_id: opts.userId,
    program_id: program.programId,
    program_code: program.code,
    status: "starting",
    step_message: "Opening a browser session…",
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  const id: string = Array.isArray(created) ? created[0].id : created.id;

  let browser = null;
  try {
    browser = await openBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(program.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await settle(page, 6000);
    await dismissOverlays(page);

    const typed = await fillPhone(page, digits, program.hints?.phone ?? []);
    if (!typed) {
      throw await withShot(
        page,
        `Could not find a phone number field on ${program.name}'s login page. ` +
          `The page may have changed, or it may be showing something other ` +
          `than the login form.`
      );
    }

    await clickAdvance(page, program.hints?.sendOtp ?? []);
    await settle(page, 8000);

    // Some portals show the code screen only after a second "Continue".
    if (!(await otpFieldPresent(page))) {
      await clickAdvance(page, program.hints?.sendOtp ?? []);
      await settle(page, 8000);
    }

    const shot = await snapshot(page);
    const reachedOtp = await otpFieldPresent(page);

    const wsEndpoint = await parkBrowser(page, 5 * 60 * 1000);

    await update(id, {
      status: "awaiting_otp",
      ws_endpoint: wsEndpoint,
      screenshot: shot,
      step_message: reachedOtp
        ? `${program.name} should be texting a code to your number now.`
        : `Sent. If ${program.name} did not ask for a code, check the ` +
          `screenshot below — the page may need a different step.`,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Parked, not closed — the browser stays alive on Browserless waiting
    // for the OTP call. Disconnecting only drops *our* socket.
    browser.disconnect();
    browser = null;

    const row = await selectOne(
      "live_sync_sessions",
      `id=eq.${id}&select=${PUBLIC_COLS}`
    );
    return toView(row);
  } catch (err: any) {
    await closeBrowser(browser);
    await update(id, {
      status: "failed",
      error_message: err.message?.slice(0, 800) ?? "Unknown error",
      screenshot: err.__shot ?? null,
      ws_endpoint: null,
    });
    const row = await selectOne(
      "live_sync_sessions",
      `id=eq.${id}&select=${PUBLIC_COLS}`
    );
    return toView(row);
  }
}

/* ------------------------------------------------------------------ */

/**
 * Phase two: the user hands us the code they just received, we finish the
 * login in the *same* browser and read the balance.
 */
export async function submitOtp(opts: {
  userId: string;
  sessionId: string;
  otp: string;
}): Promise<LiveSyncView> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${opts.sessionId}&user_id=eq.${opts.userId}&select=*`
  );
  if (!row) throw new Error("Session not found.");
  if (row.status !== "awaiting_otp") {
    throw new Error(
      `This session is ${row.status}, not waiting for a code. Start a new sync.`
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await update(row.id, {
      status: "expired",
      error_message: "The session timed out. Start a new sync.",
      ws_endpoint: null,
    });
    throw new Error("The session timed out. Start a new sync.");
  }
  if (!row.ws_endpoint) {
    throw new Error("This session has no live browser attached.");
  }

  const program = findLiveSyncProgram(row.program_code);
  await update(row.id, { status: "resuming", step_message: "Entering the code…" });

  let browser = null;
  try {
    browser = await reopenBrowser(row.ws_endpoint);
    const pages = await browser.pages();
    const page = pages[pages.length - 1];
    if (!page) throw new Error("The parked browser had no open page left.");
    page.setDefaultTimeout(30000);

    const typed = await fillOtp(page, opts.otp, program?.hints?.otp ?? []);
    if (!typed) {
      throw await withShot(
        page,
        "Could not find the code field on the page. See the screenshot below."
      );
    }

    await clickAdvance(
      page,
      program?.hints?.submitOtp ?? [],
      submitOtpPattern()
    );
    await settle(page, 12000);

    if (program?.balanceUrl) {
      try {
        await page.goto(program.balanceUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await settle(page, 8000);
      } catch {
        // Stay on whatever page we landed on and try to read it anyway.
      }
    }

    await dismissOverlays(page);
    const points = await extractBalance(page);
    const shot = await snapshot(page);
    const where = await describePage(page);

    await closeBrowser(browser);
    browser = null;

    if (points === null) {
      await update(row.id, {
        status: "failed",
        screenshot: shot,
        ws_endpoint: null,
        step_message: where,
        error_message:
          "Signed in, but no balance was visible on the page we landed on. " +
          "If the screenshot shows your account, the balance may sit behind " +
          "another click — tell us and we'll point this program at that page.",
      });
    } else {
      await upsert(
        "user_points",
        {
          user_id: row.user_id,
          program_id: row.program_id,
          total_points: points,
          last_updated: new Date().toISOString(),
        },
        "user_id,program_id"
      );

      await update(row.id, {
        status: "success",
        points_found: points,
        screenshot: shot,
        ws_endpoint: null,
        step_message: where,
        error_message: null,
      });
    }

    const fresh = await selectOne(
      "live_sync_sessions",
      `id=eq.${row.id}&select=${PUBLIC_COLS}`
    );
    return toView(fresh);
  } catch (err: any) {
    await closeBrowser(browser);
    await update(row.id, {
      status: "failed",
      error_message: err.message?.slice(0, 800) ?? "Unknown error",
      screenshot: err.__shot ?? null,
      ws_endpoint: null,
    });
    const fresh = await selectOne(
      "live_sync_sessions",
      `id=eq.${row.id}&select=${PUBLIC_COLS}`
    );
    return toView(fresh);
  }
}

/* ------------------------------------------------------------------ */

export async function cancelSync(id: string, userId: string): Promise<void> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${id}&user_id=eq.${userId}&select=id,ws_endpoint,status`
  );
  if (!row) return;
  await tearDown(row);
}

/** Close any browser this user still has parked, then mark it cancelled. */
async function retireActiveSessions(userId: string): Promise<void> {
  const row = await selectOne(
    "live_sync_sessions",
    `user_id=eq.${userId}&status=in.(starting,awaiting_otp,resuming)` +
      `&select=id,ws_endpoint,status&order=created_at.desc`
  );
  if (row) await tearDown(row);
}

async function tearDown(row: any): Promise<void> {
  if (row.ws_endpoint) {
    try {
      const b = await reopenBrowser(row.ws_endpoint);
      await closeBrowser(b);
    } catch {
      // Already dead on Browserless's side, which is the outcome we wanted.
    }
  }
  await update(row.id, {
    status: "cancelled",
    ws_endpoint: null,
    step_message: null,
  });
}

/**
 * Attach a screenshot to an error so the caller can show the user exactly
 * what the automation was looking at when it gave up.
 */
async function withShot(page: any, message: string): Promise<Error> {
  const err: any = new Error(message);
  err.__shot = await snapshot(page);
  return err;
}

export type { LiveSyncProgram };
