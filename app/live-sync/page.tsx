"use client";

import { useEffect, useRef, useState } from "react";
import NavBar from "@/components/NavBar";

// Built mobile-first on purpose. The whole point of this flow is that the
// user has their phone in hand — the SMS lands on the same device they're
// most likely holding, so the code field has to be reachable with a thumb
// and the layout has to survive a 390px viewport.

interface ProgramOpt {
  code: string;
  name: string;
  loginUrl: string;
}

interface Session {
  id: string;
  programCode: string;
  status:
    | "starting"
    | "awaiting_otp"
    | "resuming"
    | "success"
    | "failed"
    | "cancelled"
    | "expired";
  stepMessage: string | null;
  screenshot: string | null;
  points: number | null;
  error: string | null;
  expiresAt: string;
}

export default function LiveSyncPage() {
  return (
    <>
      <NavBar />
      <LiveSyncBody />
    </>
  );
}

function LiveSyncBody() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [phone, setPhone] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ProgramOpt[]>([]);

  const [programCode, setProgramCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // The worker owns `status`, and it only flips to "resuming" on its next
  // poll — up to two seconds after we hand over the code. Without this the
  // OTP box would sit there looking unsubmitted and invite a double entry.
  const [submitted, setSubmitted] = useState(false);

  const otpRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/live-sync/programs", { cache: "no-store" });
        const data = await res.json();
        setSignedIn(!!data.signedIn);
        setConfigured(!!data.configured);
        setPhone(data.phone ?? null);
        setPrograms(data.programs || []);
        if (data.programs?.length) setProgramCode(data.programs[0].code);
      } catch (e: any) {
        setError(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // A visible countdown, because "type this within five minutes" is only
  // fair if the user can see how much of it is left.
  useEffect(() => {
    if (session?.status !== "awaiting_otp") {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.status, session?.expiresAt]);

  useEffect(() => {
    if (session?.status === "awaiting_otp") otpRef.current?.focus();
  }, [session?.status]);

  // The browser work happens in a background worker, not in the request
  // that started it, so progress arrives by polling rather than by the
  // response to /start. Stops as soon as the session reaches a terminal
  // state so an idle tab isn't hitting the API forever.
  useEffect(() => {
    const id = session?.id;
    const live =
      session?.status === "starting" ||
      session?.status === "awaiting_otp" ||
      session?.status === "resuming";
    if (!id || !live) return;

    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-sync/session?id=${id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.session) setSession(data.session);
      } catch {
        // A dropped poll is not worth surfacing; the next one will do.
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session?.id, session?.status]);

  async function start() {
    setBusy(true);
    setError(null);
    setOtp("");
    setSubmitted(false);
    setSession(null);
    try {
      const res = await fetch("/api/live-sync/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setSession(data.session);
    } catch (e: any) {
      setError(e.message ?? "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live-sync/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit code");
      setSubmitted(true);
      setSession(data.session);
    } catch (e: any) {
      setError(e.message ?? "Failed to submit code");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!session) return;
    await fetch(`/api/live-sync/session?id=${session.id}`, { method: "DELETE" });
    setSession(null);
    setOtp("");
    setSubmitted(false);
  }

  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <div className="h-40 animate-pulse rounded-xl bg-base-800" />
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-50">Live sync</h1>
        <p className="mt-3 text-sm text-slate-500">
          Sign in to pull your balances straight from the loyalty programs.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-lg bg-accent-500 px-6 py-3 text-sm font-medium text-base-950"
        >
          Sign in
        </a>
      </main>
    );
  }

  const active = session?.status === "awaiting_otp" && !submitted;
  const done = session?.status === "success";
  const working =
    session?.status === "starting" ||
    session?.status === "resuming" ||
    (session?.status === "awaiting_otp" && submitted);

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-50">Live sync</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        We open a real browser, sign in with your registered phone number, and
        read your balance. The program texts the code to you — type it in below
        and we finish the login in the same session.
      </p>

      {!configured && (
        <Banner tone="warn">
          Live sync isn&apos;t configured on this deployment yet.
        </Banner>
      )}

      {!phone && (
        <Banner tone="warn">
          Add your phone number on the{" "}
          <a href="/profile" className="underline">
            Profile page
          </a>{" "}
          first — that&apos;s the number the program will text.
        </Banner>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {/* -------- step 1: pick a program -------- */}
      {!session && (
        <div className="card-surface mt-6 rounded-xl p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Program
            </span>
            <select
              value={programCode}
              onChange={(e) => setProgramCode(e.target.value)}
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-3 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            >
              {programs.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {phone && (
            <p className="mt-3 text-xs text-slate-600">
              Signing in as <span className="text-slate-400">{phone}</span> —{" "}
              <a href="/profile" className="underline">
                change
              </a>
            </p>
          )}

          <button
            onClick={start}
            disabled={busy || !phone || !configured}
            className="mt-5 w-full rounded-lg bg-accent-500 px-6 py-3.5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {busy ? "Opening browser…" : "Sync now"}
          </button>
          <p className="mt-2.5 text-center text-xs text-slate-600">
            Takes about 20–40 seconds before the code arrives.
          </p>
        </div>
      )}

      {/* -------- in flight -------- */}
      {working && (
        <div className="card-surface mt-6 rounded-xl p-5 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-base-700 border-t-accent-500" />
          <p className="mt-3 text-sm text-slate-300">
            {session?.stepMessage ?? "Working…"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Keep this page open — your code is on the way.
          </p>
          <button
            onClick={cancel}
            className="mt-4 rounded-lg border border-base-700 px-4 py-2 text-xs text-slate-400"
          >
            Cancel
          </button>
        </div>
      )}

      {/* -------- step 2: relay the code -------- */}
      {active && (
        <div className="card-surface mt-6 rounded-xl p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-slate-200">
              Enter the code you were sent
            </h2>
            {secondsLeft !== null && (
              <span
                className={`text-xs tabular-nums ${
                  secondsLeft < 60 ? "text-amber-400" : "text-slate-600"
                }`}
              >
                {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          {session?.stepMessage && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              {session.stepMessage}
            </p>
          )}

          <input
            ref={otpRef}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="mt-4 w-full rounded-md border border-base-700 bg-base-900 px-3 py-4 text-center text-2xl tracking-[0.4em] text-slate-100 focus:border-accent-500 focus:outline-none"
          />

          <button
            onClick={sendOtp}
            disabled={busy || otp.length < 4}
            className="mt-4 w-full rounded-lg bg-accent-500 px-6 py-3.5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {busy ? "Finishing sign-in…" : "Submit code"}
          </button>
          <button
            onClick={cancel}
            disabled={busy}
            className="mt-2 w-full rounded-lg border border-base-700 px-6 py-3 text-sm text-slate-400 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {/* -------- outcome -------- */}
      {done && (
        <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/40 p-5">
          <p className="text-xs uppercase tracking-wide text-emerald-500">
            Synced
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-300">
            {session!.points?.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Saved to your balances.
          </p>
          <button
            onClick={() => {
              setSession(null);
              setOtp("");
              setSubmitted(false);
            }}
            className="mt-4 rounded-lg border border-emerald-800 px-4 py-2 text-xs text-emerald-300"
          >
            Sync another
          </button>
        </div>
      )}

      {session &&
        (session.status === "failed" ||
          session.status === "expired" ||
          session.status === "cancelled") && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-5">
            <p className="text-sm text-red-300">
              {session.error ?? `Session ${session.status}.`}
            </p>
            <button
              onClick={() => {
                setSession(null);
                setOtp("");
                setSubmitted(false);
                setError(null);
              }}
              className="mt-4 rounded-lg border border-red-800 px-4 py-2 text-xs text-red-300"
            >
              Try again
            </button>
          </div>
        )}

      {/* The screenshot is the whole debugging story when something goes
          sideways — it shows the user exactly what the automation saw. */}
      {session?.screenshot && (
        <details className="mt-5" open={session.status !== "success"}>
          <summary className="cursor-pointer text-xs text-slate-500">
            What the browser is looking at
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.screenshot}
            alt="Live browser view"
            className="mt-3 w-full rounded-lg border border-base-700"
          />
        </details>
      )}

      <p className="mt-8 text-xs leading-relaxed text-slate-600">
        We never see or store your code — it&apos;s passed straight through to
        the live session and discarded. Nothing is kept after the balance is
        read.
      </p>
    </main>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warn" | "error";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-900 bg-red-950/40 text-red-300"
      : "border-amber-900 bg-amber-950/30 text-amber-300";
  return (
    <div className={`mt-5 rounded-lg border p-4 text-sm ${cls}`}>{children}</div>
  );
}
