// Live sync, Vercel side.
//
// This file used to drive the browser itself. It no longer does, and the
// reason is worth recording: a phone-OTP login has to stay alive while a
// person reads a text message. Vercel Hobby functions stop at 60s, and
// this Browserless plan refuses to park a browser for longer than 10s
// (measured, not assumed — it answers "Reconnect timeout exceeds the
// maximum allowed limit (10000ms)"). Neither can hold a browser across
// that wait, so the whole run moved to a Supabase background task with a
// 150s budget.
//
// What is left here is thin on purpose: create the row, kick off the edge
// function, accept the code the user types, and read status back. All the
// browser work lives in supabase/functions/live-sync/.

import { selectOne, insert, patch } from "@/lib/db";
import { findLiveSyncProgram, type LiveSyncProgram } from "@/lib/liveSyncPrograms";

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

/** Columns safe to hand to a browser. Never includes the OTP. */
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

export function liveSyncConfigured(): boolean {
  return !!(
    process.env.BROWSERLESS_API_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/* ------------------------------------------------------------------ */

export async function getSession(
  id: string,
  userId: string
): Promise<LiveSyncView | null> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${id}&user_id=eq.${userId}&select=${PUBLIC_COLS}`
  );
  if (!row) return null;

  // The edge function writes its own terminal states, but if the worker
  // dies outright nothing would ever move this row off "starting". Treat a
  // lapsed deadline as expired so the UI stops waiting on a ghost.
  const stale =
    (row.status === "awaiting_otp" ||
      row.status === "starting" ||
      row.status === "resuming") &&
    new Date(row.expires_at).getTime() < Date.now() - 15_000;

  if (stale) {
    await update(id, {
      status: "expired",
      error_message:
        "The session ended before it finished. Start a new sync.",
    });
    row.status = "expired";
    row.error_message = "The session ended before it finished. Start a new sync.";
  }

  return toView(row);
}

/* ------------------------------------------------------------------ */

/**
 * Create the session and hand it to the edge function.
 *
 * Returns as soon as the worker has accepted the job — it will run for up
 * to two minutes after this resolves, and the UI follows along by polling
 * getSession rather than waiting here.
 */
export async function startSync(opts: {
  userId: string;
  programCode: string;
}): Promise<LiveSyncView> {
  const program = findLiveSyncProgram(opts.programCode);
  if (!program) {
    throw new Error(`${opts.programCode} is not enabled for live sync yet.`);
  }

  // Read from the profile, not from the request, so a crafted call cannot
  // drive a login against a number this account never registered.
  const profile = await selectOne("users", `id=eq.${opts.userId}&select=phone`);
  if (!profile?.phone) {
    throw new Error(
      "Add your phone number on the Profile page first — that's the number the program will text."
    );
  }

  // The free Browserless tier allows two concurrent browsers, so one live
  // session per user at a time; starting a new one retires the old.
  await cancelActiveSessions(opts.userId);

  const created = await insert("live_sync_sessions", {
    user_id: opts.userId,
    program_id: program.programId,
    program_code: program.code,
    login_url: program.loginUrl,
    status: "starting",
    step_message: "Starting…",
    expires_at: new Date(Date.now() + 150_000).toISOString(),
  });
  const id: string = Array.isArray(created) ? created[0].id : created.id;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  try {
    const res = await fetch(`${base}/functions/v1/live-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: id,
        // Passed per-invocation rather than stored as a Supabase secret,
        // so the Browserless key lives in exactly one place.
        token: browserlessKey,
        host: process.env.BROWSERLESS_HOST || undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `The sync worker rejected the job (${res.status}): ${text.slice(0, 200)}`
      );
    }
  } catch (err: any) {
    await update(id, {
      status: "failed",
      error_message: err.message?.slice(0, 600) ?? "Could not start the worker.",
    });
  }

  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${id}&select=${PUBLIC_COLS}`
  );
  return toView(row);
}

/* ------------------------------------------------------------------ */

/**
 * Hand the code to the running worker.
 *
 * Writing it to the row is the whole mechanism: the edge function is
 * sitting in a poll loop watching this column, and clears it the moment
 * it reads it. The code is never durable and never leaves our server for
 * anywhere but the loyalty program's own login form.
 */
export async function submitOtp(opts: {
  userId: string;
  sessionId: string;
  otp: string;
}): Promise<LiveSyncView> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${opts.sessionId}&user_id=eq.${opts.userId}&select=id,status,expires_at`
  );
  if (!row) throw new Error("Session not found.");
  if (row.status !== "awaiting_otp") {
    throw new Error(
      `This session is ${row.status}, not waiting for a code. Start a new sync.`
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("The session timed out. Start a new sync.");
  }

  await update(opts.sessionId, {
    otp_submitted: opts.otp.replace(/\D/g, ""),
    otp_submitted_at: new Date().toISOString(),
    step_message: "Code received, finishing sign-in…",
  });

  const fresh = await selectOne(
    "live_sync_sessions",
    `id=eq.${opts.sessionId}&select=${PUBLIC_COLS}`
  );
  return toView(fresh);
}

/* ------------------------------------------------------------------ */

/**
 * Mark a session cancelled. The worker checks this on every poll and
 * closes its browser when it sees it, which frees the concurrency slot
 * without waiting for the full timeout.
 */
export async function cancelSync(id: string, userId: string): Promise<void> {
  const row = await selectOne(
    "live_sync_sessions",
    `id=eq.${id}&user_id=eq.${userId}&select=id`
  );
  if (!row) return;
  await update(id, {
    status: "cancelled",
    otp_submitted: null,
    step_message: null,
  });
}

async function cancelActiveSessions(userId: string): Promise<void> {
  await patch(
    "live_sync_sessions",
    `user_id=eq.${userId}&status=in.(starting,awaiting_otp,resuming)`,
    {
      status: "cancelled",
      otp_submitted: null,
      updated_at: new Date().toISOString(),
    }
  );
}

export type { LiveSyncProgram };
