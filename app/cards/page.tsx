"use client";

import { useEffect, useMemo, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import {
  getUserCards,
  getCreditCards,
  getBanks,
  addUserCard,
  removeUserCard,
  getUserPoints,
  getLoyaltyPrograms,
  upsertUserPoints,
} from "@/lib/queries";
import type {
  UserCard,
  CreditCard,
  Bank,
  UserPoints,
  LoyaltyProgram,
} from "@/lib/types";

export default function CardsPage() {
  return (
    <RequireEntered>
      <NavBar />
      <CardsBody />
    </RequireEntered>
  );
}

function CardsBody() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [allCards, setAllCards] = useState<CreditCard[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [points, setPoints] = useState<UserPoints[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bankFilter, setBankFilter] = useState<number | "all">("all");

  async function refresh() {
    const [uc, cc, bk, up, lp] = await Promise.all([
      getUserCards(),
      getCreditCards(),
      getBanks(),
      getUserPoints(),
      getLoyaltyPrograms(),
    ]);
    setUserCards(uc);
    setAllCards(cc);
    setBanks(bk);
    setPoints(up);
    setPrograms(lp);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to load cards");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const bankById = new Map(banks.map((b) => [b.id, b]));
  const linkedIds = new Set(userCards.map((uc) => uc.credit_card_id));
  const pointsByProgram = new Map(points.map((p) => [p.program_id, p]));

  const availableCards = useMemo(
    () =>
      allCards.filter(
        (c) => !linkedIds.has(c.id) && (bankFilter === "all" || c.bank_id === bankFilter)
      ),
    [allCards, linkedIds, bankFilter]
  );

  async function handleAdd(cardId: number) {
    setPendingId(cardId);
    try {
      await addUserCard(cardId);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to link card");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(userCardId: number) {
    setPendingId(userCardId);
    try {
      await removeUserCard(userCardId);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to remove card");
    } finally {
      setPendingId(null);
    }
  }

  async function handleBalanceChange(programId: number, value: string) {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0) return;
    try {
      await upsertUserPoints(programId, n);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to update balance");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Cards & Points</h1>
      <p className="mt-1 text-sm text-slate-500">
        Link your credit cards and keep loyalty point balances up to date.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-slate-100">Your linked cards</h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-base-800" />
        ) : userCards.length === 0 ? (
          <p className="text-sm text-slate-500">No cards linked yet — add one below.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userCards.map((uc) => {
              const card = allCards.find((c) => c.id === uc.credit_card_id);
              const bank = card ? bankById.get(card.bank_id) : undefined;
              return (
                <div key={uc.id} className="card-surface flex items-start justify-between rounded-xl p-4">
                  <div>
                    <div className="text-xs text-slate-500">{bank?.bank_name}</div>
                    <div className="font-medium text-slate-100">{card?.card_name}</div>
                    {card?.card_tier && (
                      <span className="pill mt-2 bg-base-700 text-slate-300">{card.card_tier}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(uc.id)}
                    disabled={pendingId === uc.id}
                    className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40"
                  >
                    {pendingId === uc.id ? "…" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {userCards.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-slate-100">Points balances</h2>
          <p className="mb-4 text-sm text-slate-500">
            Enter your current balance for each loyalty program you track. This feeds the
            transfer route recommendations.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {programs.map((program) => {
              const existing = pointsByProgram.get(program.id);
              return (
                <div
                  key={program.id}
                  className="flex items-center justify-between rounded-lg border border-base-700 px-4 py-2.5"
                >
                  <div>
                    <div className="text-sm text-slate-200">{program.program_name}</div>
                    <div className="text-xs text-slate-500">{program.category}</div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    defaultValue={existing?.total_points ?? 0}
                    onBlur={(e) => handleBalanceChange(program.id, e.target.value)}
                    className="w-28 rounded-md border border-base-700 bg-base-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-slate-100">Add a card</h2>
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-md border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="all">All banks</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-base-800" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableCards.map((card) => {
              const bank = bankById.get(card.bank_id);
              return (
                <div key={card.id} className="card-surface flex items-start justify-between rounded-xl p-4">
                  <div>
                    <div className="text-xs text-slate-500">{bank?.bank_name}</div>
                    <div className="font-medium text-slate-100">{card.card_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {card.primary_benefit_category ?? "General rewards"}
                      {card.annual_fee ? ` · ₹${card.annual_fee.toLocaleString()}/yr` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdd(card.id)}
                    disabled={pendingId === card.id}
                    className="shrink-0 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
                  >
                    {pendingId === card.id ? "…" : "+ Add"}
                  </button>
                </div>
              );
            })}
            {availableCards.length === 0 && (
              <p className="text-sm text-slate-500">All cards in this filter are already linked.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
