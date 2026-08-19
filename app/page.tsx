import Link from "next/link";

// Deliberately a plain server component: no "use client", no hooks, no
// session check, no form. The root route needs to render as static
// content a crawler or a fetch can read directly, with nothing gating it
// -- not a click, not an email field, not a redirect. Sign-in lives at
// /login instead, one link away for anyone who wants it.
export default function LandingPage() {
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
      <Link
        href="/login"
        className="mt-10 rounded-lg bg-accent-500 px-8 py-3 text-base font-semibold text-base-950 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400"
      >
        Sign in
      </Link>
      <p className="mt-4 text-xs text-slate-600">
        No password to remember — we email you a one-time link instead.
      </p>
    </main>
  );
}
