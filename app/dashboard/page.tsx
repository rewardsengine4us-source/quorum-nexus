"use client";

import { useEffect, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import { supabase } from "@/lib/supabaseClient";
import {
  getUserCards,
  getUserPoints,
  getCreditCards,
  getBanks,
  getLoyaltyPrograms,
} from "@/lib/queries";
import type {
  UserCard,
  UserPoints,
  CreditCard,
  Bank,
  LoyaltyProgram,
} from "@/lib/types";
import Link from "next/link";

// Not exported — a named export from a page.tsx fails the Next.js App
// Router build (only the default export + a known config allowlist are
// permitted). Kept local to this file rather than lib/ since it's a
// one-off UI concern, not shared logic.
//
// Raw Supabase/GoTrue errors ("JWT issued at future", "Invalid API key",
// etc.) are not something a user can act on and shouldn't be shown
// verbatim — they point at an env var or clock-skew problem on our end,
// not anything wrong with the user's account.
function friendlyDashboardError(rawMessage?: string): string {
  const msg = (rawMessage || "").toLowerCase();
  if (msg.includes("jwt") || msg.includes("api key") || msg.includes("invalid token")) {
    return "Couldn't load your dashboard right now — this looks like a configuration issue on our end, not something wrong with your account. Try reloading in a minute.";
  }
  return rawMessage || "Failed to load dashboard";
}

export default function DashboardPage() {
  return (
    <RequireEntered>
      <NavBar />
      <DashboardBody />
    </RequireEntered>
  );
}

function DashboardBody() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [points, setPoints] = useState<UserPoints[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [uc, up, cc, bk, lp, session] = await Promise.all([
          getUserCards(),
          getUserPoints(),
          getCreditCards(),
          getBanks(),
          getLoyaltyPrograms(),
          supabase.auth.getUser(),
        ]);
        setUserCards(uc);
        setPoints(up);
        setCards(cc);
        setBanks(bk);
        setPrograms(lp);
        setEmail(session.data.user?.email ?? null);
      } catch (e: any) {
        setError(friendlyDashboardError(e?.message));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const programById = new Map(programs.map((p) => [p.id, p]));

  const totalPoints = points.reduce((sum, p) => sum + (p.total_points ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Dashboard</h1>
      {email && <p className="mt-1 text-sm text-slate-500">{email}</p>}

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Linked cards" value={userCards.length.toString()} />
        <StatCard label="Loyalty programs tracked" value={points.length.toString()} />
        <StatCard label="Total points" value={totalPoints.toLocaleString()} accent />
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">Your cards</h2>
          <Link href="/cards" className="text-sm text-accent-400 hover:underline">
            Manage cards →
          </Link>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : userCards.length === 0 ? (
          <EmptyState
            text="No cards linked yet."
            cta="Link your first card"
            href="/cards"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userCards.map((uc) => {
              const card = cardById.get(uc.credit_card_id);
              const bank = card ? bankById.get(card.bank_id) : undefined;
              return (
                <div key={uc.id} className="card-surface rounded-xl p-4">
                  <div className="text-xs text-slate-500">{bank?.bank_name}</div>
                  <div className="mt-1 font-medium text-slate-100">
                    {card?.card_name ?? "Unknown card"}
                  </div>
                  {card?.card_tier && (
                    <span className="pill mt-2 bg-base-700 text-slate-300">
                      {card.card_tier}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">Points balances</h2>
          <Link href="/cards" className="text-sm text-accent-400 hover:underline">
            Update balances →
          </Link>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : points.length === 0 ? (
          <EmptyState
            text="No points tracked yet. Link a card to start tracking balances."
            cta="Go to cards"
            href="/cards"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Program</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => {
                  const program = programById.get(p.program_id);
                  return (
                    <tr key={p.id} className="border-t border-base-700/60">
                      <td className="px-4 py-2 text-slate-200">
                        {program?.program_name ?? "Unknown program"}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{program?.category ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-100">
                        {(p.total_points ?? 0).toLocaleString()}{" "}
                        <span className="text-xs text-slate-500">
                          {program?.points_name ?? "pts"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface rounded-xl p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent ? "text-accent-400" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="card-surface rounded-xl p-8 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
      >
        {cta}
      </Link>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-base-800" />
      ))}
    </div>
  );
}
