"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// useSearchParams() opts a page out of static prerendering unless it's
// wrapped in Suspense — without this, `next build` fails prerendering "/"
// with "useSearchParams() should be wrapped in a suspense boundary" since
// this is the root route and gets prerendered eagerly (other pages using
// the same hook happened not to hit this because they aren't statically
// generated the same way). Splitting the param-reading bit into its own
// component keeps the fallback trivial — the real "Loading…" state below
// is driven by session-checking, not by this.
export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageInner />
    </Suspense>
  );
}

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams?.get("error") ?? null
  );
  const [checkingSession, setCheckingSession] = useState(true);

  // Already signed in (e.g. back button after login) — skip straight past
  // the form instead of asking for an email again.
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.replace("/dashboard");
      } else {
        setCheckingSession(false);
      }
    })();
  }, [router]);

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

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">
        Loading Quorum Nexus…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-base-700 px-4 py-1.5 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        No payments processed — points tracking only
      </div>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
        Quorum <span className="text-accent-400">Nexus</span>
      </h1>
      <p className="mt-4 max-w-xl text-balance text-slate-400">
        Track your credit card points, find the best transfer routes to airline
        and hotel programs before they devalue, and redeem for vouchers — all
        in one place.
      </p>

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
