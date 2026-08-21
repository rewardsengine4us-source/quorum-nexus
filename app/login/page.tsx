"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// useSearchParams() opts a page out of static prerendering unless it's
// wrapped in Suspense — without this, `next build` fails prerendering the
// route with "useSearchParams() should be wrapped in a suspense boundary".
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams?.get("error") ?? null
  );

  // Note: this page intentionally does NOT auto-redirect to /dashboard on
  // an existing session. The site is fully public — /dashboard is already
  // reachable without signing in — so /login's only job is to always be
  // available as the one place a visitor can trade a shared/anonymous view
  // for a real account. Bouncing away from it on any truthy session
  // (including a stale one left over from earlier testing) made it
  // impossible to sign in again without first finding a sign-out control.

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to send sign-in link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-base-700 px-4 py-1.5 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        No payments processed — points tracking only
      </div>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
        Sign in to <span className="text-accent-400">Quorum Nexus</span>
      </h1>

      {sent ? (
        <div className="mt-10 max-w-sm rounded-xl border border-emerald-900 bg-emerald-950/40 p-5 text-sm text-emerald-300">
          Check <span className="font-medium text-emerald-200">{email}</span> for
          a sign-in link. It expires shortly, so use it soon after it arrives.
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="mt-10 w-full max-w-sm">
          <label className="block text-left">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2.5 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={sending || !email}
            className="mt-4 w-full rounded-lg bg-accent-500 px-8 py-3 text-base font-semibold text-base-950 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 max-w-sm rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-600">
        No password to remember — we email you a one-time link instead.
      </p>
    </main>
  );
}
