// Live loyalty-balance sync, human-in-the-loop.
//
// This function exists here rather than on Vercel for one reason: the flow
// has to stay alive while a person reads a text message. Vercel's Hobby
// functions cap at 60s, and this Browserless plan caps a *parked* browser
// at 10s, so neither could hold a browser across the wait. A Supabase
// background task gets 150s, which leaves roughly 110 seconds for the user
// to receive and type their code — enough to be dependable rather than
// lucky.
//
// The user typing their own OTP is not a gap we failed to close. Loyalty
// programs send that code to the member and hold the member responsible
// for keeping it private; anything that intercepted it silently would be
// doing something the member's own terms forbid.

import { Cdp, sleep } from "./cdp.ts";
import {
  FINDER,
  DISMISS,
  FIND_PHONE,
  findAdvance,
  OTP_PRESENT,
  PLAN_OTP,
  EXTRACT_BALANCE,
  DESCRIBE_PAGE,
  SEND_OTP_PATTERN,
  SUBMIT_OTP_PATTERN,
  OPEN_LOGIN_PATTERN,
  MARK,
} from "./inpage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Budget, measured from the moment the background task starts. Supabase
// kills the worker at 150s regardless, so we stop early enough to still
// write a useful outcome instead of dying mid-scrape.
const TOTAL_BUDGET_MS = 132_000;
const FINISH_RESERVE_MS = 22_000;

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

async function rest(
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function update(id: string, fields: Record<string, unknown>) {
  return rest(`live_sync_sessions?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

interface RunInput {
  sessionId: string;
  token: string;
  host?: string;
}

async function run({ sessionId, token, host }: RunInput): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + TOTAL_BUDGET_MS;
  let cdp: Cdp | null = null;

  const rows = await rest(
    `live_sync_sessions?id=eq.${sessionId}&select=*&limit=1`
  );
  const row = rows?.[0];
  if (!row) return;

  try {
    const users = await rest(
      `users?id=eq.${encodeURIComponent(row.user_id)}&select=phone&limit=1`
    );
    const phoneRaw: string | null = users?.[0]?.phone ?? null;
    if (!phoneRaw) throw new Error("No phone number on your profile.");

    // Portals want the local subscriber number, not an E.164 string.
    let digits = phoneRaw.replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length < 7) {
      throw new Error("That phone number doesn't look complete.");
    }

    await update(sessionId, { step_message: "Opening a browser…" });

    cdp = await Cdp.connect({
      token,
      host,
      sessionTimeoutMs: TOTAL_BUDGET_MS + 20_000,
    });
    await cdp.openPage();

    await update(sessionId, { step_message: "Loading the sign-in page…" });
    await cdp.navigate(row.login_url);
    await cdp.waitForReady(28_000);
    await cdp.evaluate(FINDER);
    await cdp.evaluate(DISMISS);

    // The login form is often behind a "Sign in" control rather than on
    // the landing page itself, so try to open it before giving up on
    // finding a phone field.
    let phoneSel: string | null = await cdp.evaluate(FIND_PHONE);
    if (!phoneSel) {
      const opener = await cdp.evaluate(findAdvance(OPEN_LOGIN_PATTERN));
      if (opener) {
        await cdp.click(opener);
        await sleep(3500);
        await cdp.evaluate(FINDER);
        await cdp.evaluate(DISMISS);
        phoneSel = await cdp.evaluate(FIND_PHONE);
      }
    }

    if (!phoneSel) {
      const seen = await cdp.evaluate(DESCRIBE_PAGE);
      throw Object.assign(
        new Error(
          "Couldn't find a phone number field on the sign-in page. " +
            "The page may have changed, or sign-in may sit somewhere else."
        ),
        { seen }
      );
    }

    await update(sessionId, { step_message: "Entering your number…" });
    if (!(await cdp.typeInto(phoneSel, digits))) {
      throw new Error("Found the phone field but couldn't type into it.");
    }

    const send = await cdp.evaluate(findAdvance(SEND_OTP_PATTERN));
    if (send) await cdp.click(send);
    await sleep(5000);

    // Some portals need a second "Continue" before the code screen.
    let atOtp: boolean = await cdp.evaluate(OTP_PRESENT).catch(() => false);
    if (!atOtp) {
      await cdp.evaluate(FINDER);
      const again = await cdp.evaluate(findAdvance(SEND_OTP_PATTERN));
      if (again) {
        await cdp.click(again);
        await sleep(5000);
      }
      await cdp.evaluate(FINDER).catch(() => {});
      atOtp = await cdp.evaluate(OTP_PRESENT).catch(() => false);
    }

    const shot = await cdp.screenshot();
    await update(sessionId, {
      status: "awaiting_otp",
      screenshot: shot,
      otp_submitted: null,
      step_message: atOtp
        ? "Code sent. Enter it below."
        : "Sent — if no code arrives, check the screenshot; the page may need a different step.",
      expires_at: new Date(deadline - FINISH_RESERVE_MS).toISOString(),
    });

    /* ---- wait for the human ---- */

    const waitUntilMs = deadline - FINISH_RESERVE_MS;
    let otp: string | null = null;
    while (Date.now() < waitUntilMs) {
      const [cur] = await rest(
        `live_sync_sessions?id=eq.${sessionId}&select=otp_submitted,status&limit=1`
      );
      if (cur?.status === "cancelled") {
        cdp.close();
        return;
      }
      if (cur?.otp_submitted) {
        otp = String(cur.otp_submitted).replace(/\D/g, "");
        break;
      }
      await sleep(2000);
    }

    if (!otp) {
      await update(sessionId, {
        status: "expired",
        otp_submitted: null,
        error_message:
          "No code was entered in time. Start a new sync and keep your phone handy.",
      });
      cdp.close();
      return;
    }

    /* ---- finish the login ---- */

    await update(sessionId, {
      status: "resuming",
      step_message: "Entering the code…",
      // Cleared the moment it is read. It is never a durable store.
      otp_submitted: null,
    });

    await cdp.evaluate(FINDER);
    const plan = await cdp.evaluate(PLAN_OTP);
    if (!plan) throw new Error("Couldn't find the code field on the page.");

    if (plan.mode === "split") {
      const n = Math.min(plan.count as number, otp.length);
      for (let i = 0; i < n; i++) {
        await cdp.typeInto(`[${MARK}='otp${i}']`, otp[i]);
      }
    } else {
      if (!(await cdp.typeInto(plan.sel as string, otp))) {
        throw new Error("Found the code field but couldn't type into it.");
      }
    }

    const submit = await cdp.evaluate(findAdvance(SUBMIT_OTP_PATTERN));
    if (submit) await cdp.click(submit);

    await update(sessionId, { step_message: "Reading your balance…" });
    await sleep(7000);
    await cdp.waitForReady(9000);
    await cdp.evaluate(FINDER).catch(() => {});
    await cdp.evaluate(DISMISS).catch(() => {});

    const points: number | null = await cdp.evaluate(EXTRACT_BALANCE);
    const finalShot = await cdp.screenshot();
    const where = await cdp.title();

    if (points === null || points === undefined) {
      const seen = await cdp.evaluate(DESCRIBE_PAGE).catch(() => null);
      await update(sessionId, {
        status: "failed",
        screenshot: finalShot,
        step_message: where,
        error_message:
          "Signed in, but no balance was visible on the page we landed on. " +
          "If the screenshot shows your account, the balance sits behind " +
          "another click — tell us and we'll point this program at that page." +
          (seen ? ` (saw: ${JSON.stringify(seen).slice(0, 400)})` : ""),
      });
    } else {
      await rest("user_points?on_conflict=user_id,program_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: row.user_id,
          program_id: row.program_id,
          total_points: points,
          last_updated: new Date().toISOString(),
        }),
      });

      await update(sessionId, {
        status: "success",
        points_found: points,
        screenshot: finalShot,
        step_message: where,
        error_message: null,
      });
    }

    cdp.close();
  } catch (err) {
    const e = err as Error & { seen?: unknown };
    let shot: string | null = null;
    try {
      shot = cdp ? await cdp.screenshot() : null;
    } catch { /* the page is likely gone; the message still helps */ }

    await update(sessionId, {
      status: "failed",
      screenshot: shot,
      otp_submitted: null,
      error_message:
        (e.message ?? "Unknown error").slice(0, 600) +
        (e.seen ? ` (saw: ${JSON.stringify(e.seen).slice(0, 400)})` : ""),
    }).catch(() => {});

    try {
      cdp?.close();
    } catch { /* nothing useful to do */ }
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  // Only our own server calls this, holding the service role key. There is
  // no browser-facing path to it, so there is no CORS surface to open.
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.includes(SERVICE_KEY)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: RunInput;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400 });
  }

  if (!body.sessionId || !body.token) {
    return new Response(
      JSON.stringify({ error: "sessionId and token are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Answer immediately and keep working. The caller is a Vercel function
  // that would otherwise time out long before this finishes, and the UI
  // tracks progress by polling the session row rather than this response.
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime.
  EdgeRuntime.waitUntil(run(body));

  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
