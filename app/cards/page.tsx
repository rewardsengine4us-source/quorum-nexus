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
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [balanceProgramId, setBalanceProgramId] = useState<number | null>(null);
  const [balanceValue, setBalanceValue] = useState<string>("");

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

  // Only offer banks that actually issue a card we know about — with 73
  // banks and 50 issuing, an "all banks" list is mostly dead options.
  const banksWithCards = useMemo(() => {
    const issuing = new Set(allCards.map((c) => c.bank_id));
    return banks
      .filter((b) => issuing.has(b.id))
      .sort((a, b) => a.bank_name.localeCompare(b.bank_name));
  }, [banks, allCards]);

  const availableCards = useMemo(
    () =>
      allCards
        .filter((c) => !linkedIds.has(c.id) && bankFilter !== "all" && c.bank_id === bankFilter)
        .sort((a, b) => a.card_name.localeCompare(b.card_name)),
    [allCards, linkedIds, bankFilter]
  );

  const selectedCard = useMemo(
    () => allCards.find((c) => c.id === selectedCardId) ?? null,
    [allCards, selectedCardId]
  );

  // Only programs the user actually holds points in. With 250+ programs in
  // the catalog, rendering an input for every one buries the handful that
  // matter.
  const trackedBalances = useMemo(() => {
    const byId = new Map(programs.map((p) => [p.id, p]));
    return points
      .map((p) => ({ program: byId.get(p.program_id), points: p.total_points ?? 0 }))
      .filter(
        (entry): entry is { program: LoyaltyProgram; points: number } =>
          entry.program != null
      )
      .sort((a, b) => b.points - a.points);
  }, [points, programs]);

  // Grouped so a 250-entry dropdown stays navigable.
  const programGroups = useMemo(() => {
    const order = ["airline", "hotel", "bank", "retail", "other"];
    const labels: Record<string, string> = {
      airline: "Airlines",
      hotel: "Hotels",
      bank: "Bank reward currencies",
      retail: "Retail & lifestyle",
      other: "Other",
    };
    const buckets: Record<string, LoyaltyProgram[]> = {};
    for (const p of programs) {
      const key = order.includes(p.category ?? "") ? (p.category as string) : "other";
      (buckets[key] ||= []).push(p);
    }
    return order
      .filter((k) => buckets[k]?.length)
      .map((k) => ({
        label: labels[k],
        items: buckets[k].sort((a, b) => a.program_name.localeCompare(b.program_name)),
      }));
  }, [programs]);

  async function handleAdd(cardId: number) {
    setPendingId(cardId);
    try {
      await addUserCard(cardId);
      setSelectedCardId(null);
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

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-medium text-slate-100">Points balances</h2>
        <p className="mb-4 text-sm text-slate-500">
          Balances found by the email sync appear here automatically. Add or
          correct one manually below.
        </p>

        {trackedBalances.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Program</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {trackedBalances.map((entry) => (
                  <tr key={entry.program.id} className="border-t border-base-700/60">
                    <td className="px-4 py-2 text-slate-200">
                      {entry.program.program_name}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {entry.program.category ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        defaultValue={entry.points}
                        onBlur={(e) =>
                          handleBalanceChange(entry.program.id, e.target.value)
                        }
                        className="w-32 rounded-md border border-base-700 bg-base-900 px-2 py-1 text-right font-mono text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-surface rounded-xl p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Loyalty program
              </span>
              <select
                value={balanceProgramId ?? ""}
                onChange={(e) =>
                  setBalanceProgramId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
              >
                <option value="">Select a program…</option>
                {programGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.program_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Balance
              </span>
              <input
                type="number"
                min={0}
                value={balanceValue}
                onChange={(e) => setBalanceValue(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-right font-mono text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
              />
            </label>

            <button
              onClick={async () => {
                if (balanceProgramId == null || balanceValue === "") return;
                await handleBalanceChange(balanceProgramId, balanceValue);
                setBalanceProgramId(null);
                setBalanceValue("");
              }}
              disabled={balanceProgramId == null || balanceValue === ""}
              className="h-[38px] rounded-md bg-accent-500 px-5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
            >
              Save balance
            </button>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-medium text-slate-100">Add a card</h2>
        <p className="mb-4 text-sm text-slate-500">
          Pick your bank, then the specific card or variant.
        </p>

        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-base-800" />
        ) : (
          <div className="card-surface rounded-xl p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">Bank</span>
                <select
                  value={bankFilter === "all" ? "" : bankFilter}
                  onChange={(e) => {
                    setBankFilter(e.target.value ? Number(e.target.value) : "all");
                    setSelectedCardId(null);
                  }}
                  className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                >
                  <option value="">Select a bank…</option>
                  {banksWithCards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Card / variant
                </span>
                <select
                  value={selectedCardId ?? ""}
                  disabled={bankFilter === "all"}
                  onChange={(e) => setSelectedCardId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none disabled:opacity-40"
                >
                  <option value="">
                    {bankFilter === "all" ? "Select a bank first" : "Select a card…"}
                  </option>
                  {availableCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.card_name}
                      {c.card_tier ? ` · ${c.card_tier}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() => selectedCardId && handleAdd(selectedCardId)}
                disabled={!selectedCardId || pendingId === selectedCardId}
                className="h-[38px] shrink-0 rounded-md bg-accent-500 px-5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
              >
                {pendingId === selectedCardId ? "Adding…" : "Add card"}
              </button>
            </div>

            {bankFilter !== "all" && availableCards.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Every card from this bank is already linked.
              </p>
            )}

            {selectedCard && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-base-700 pt-4 text-xs text-slate-400">
                <span className="pill border border-base-600 bg-base-700 text-slate-300">
                  {selectedCard.primary_benefit_category ?? "general rewards"}
                </span>
                {selectedCard.annual_fee != null && (
                  <span className="pill border border-base-600 bg-base-700 text-slate-300">
                    ₹{selectedCard.annual_fee.toLocaleString()}/yr
                  </span>
                )}
                {selectedCard.is_cobranded ? (
                  <span className="pill border border-amber-900 bg-amber-950 text-amber-300">
                    co-branded · earns one currency only
                  </span>
                ) : (
                  <span className="pill border border-emerald-900 bg-emerald-950 text-emerald-300">
                    transferable points
                  </span>
                )}
                <a
                  href={`/api/affiliate/click?card=${selectedCard.id}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow sponsored"
                  className="ml-auto rounded-md border border-base-600 px-3 py-1 text-xs text-slate-300 hover:border-accent-500 hover:text-accent-400"
                >
                  Apply for this card →
                </a>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
