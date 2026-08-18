"use client";

import { useEffect, useMemo, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import {
  getUserCards,
  getCreditCards,
  getBanks,
  getLoyaltyPrograms,
  getTransferRoutes,
} from "@/lib/queries";
import type {
  UserCard,
  CreditCard,
  Bank,
  LoyaltyProgram,
  TransferRoute,
} from "@/lib/types";
import { formatRatio } from "@/lib/format";

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-950 text-emerald-300 border border-emerald-900",
  medium: "bg-amber-950 text-amber-300 border border-amber-900",
  high: "bg-red-950 text-red-300 border border-red-900",
};


export default function RoutesPage() {
  return (
    <RequireEntered>
      <NavBar />
      <RoutesBody />
    </RequireEntered>
  );
}

function RoutesBody() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [allCards, setAllCards] = useState<CreditCard[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [routes, setRoutes] = useState<TransferRoute[]>([]);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [bankFilter, setBankFilter] = useState<number | "all">("all");
  const [cardFilter, setCardFilter] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [uc, cc, bk, lp] = await Promise.all([
          getUserCards(),
          getCreditCards(),
          getBanks(),
          getLoyaltyPrograms(),
        ]);
        setUserCards(uc);
        setAllCards(cc);
        setBanks(bk);
        setPrograms(lp);
        const r = await getTransferRoutes();
        setRoutes(r);
      } catch (e: any) {
        setError(e.message ?? "Failed to load transfer routes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cardById = new Map(allCards.map((c) => [c.id, c]));
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const programById = new Map(programs.map((p) => [p.id, p]));
  const myCardIds = new Set(userCards.map((uc) => uc.credit_card_id));

  const categories = useMemo(
    () => Array.from(new Set(programs.map((p) => p.category).filter(Boolean))) as string[],
    [programs]
  );

  // A card only belongs in the transfer explorer if it actually has
  // transfer partners. Co-branded cards (Vistara, IndiGo, Marriott, fuel and
  // retail tie-ups) earn one currency directly and have no route to choose,
  // so they carry no routes and are excluded here by construction.
  const cardIdsWithRoutes = useMemo(
    () => new Set(routes.map((r) => r.from_card_id)),
    [routes]
  );

  const transferableBanks = useMemo(() => {
    const bankIds = new Set(
      allCards.filter((c) => cardIdsWithRoutes.has(c.id)).map((c) => c.bank_id)
    );
    return banks
      .filter((b) => bankIds.has(b.id))
      .sort((a, b) => a.bank_name.localeCompare(b.bank_name));
  }, [banks, allCards, cardIdsWithRoutes]);

  const transferableCardsForBank = useMemo(() => {
    if (bankFilter === "all") return [];
    return allCards
      .filter((c) => c.bank_id === bankFilter && cardIdsWithRoutes.has(c.id))
      .sort((a, b) => a.card_name.localeCompare(b.card_name));
  }, [allCards, bankFilter, cardIdsWithRoutes]);

  const filteredRoutes = useMemo(() => {
    return routes
      .filter((r) => {
        if (scope === "mine") return myCardIds.has(r.from_card_id);
        if (cardFilter != null) return r.from_card_id === cardFilter;
        if (bankFilter !== "all") {
          const card = cardById.get(r.from_card_id);
          return card?.bank_id === bankFilter;
        }
        return false;
      })
      .filter((r) => {
        if (categoryFilter === "all") return true;
        const program = programById.get(r.to_program_id);
        return program?.category === categoryFilter;
      })
      // Group by card, then by partner type (airlines before hotels), then
      // alphabetically. Sorting purely by health score scattered partners
      // from the same card across the whole list.
      .sort((a, b) => {
        const cardA = cardById.get(a.from_card_id);
        const cardB = cardById.get(b.from_card_id);
        const nameCmp = (cardA?.card_name ?? "").localeCompare(cardB?.card_name ?? "");
        if (nameCmp !== 0) return nameCmp;

        const progA = programById.get(a.to_program_id);
        const progB = programById.get(b.to_program_id);
        const rank = (c?: string | null) =>
          c === "airline" ? 0 : c === "hotel" ? 1 : 2;
        const catCmp = rank(progA?.category) - rank(progB?.category);
        if (catCmp !== 0) return catCmp;

        return (progA?.program_name ?? "").localeCompare(progB?.program_name ?? "");
      });
  }, [
    routes, scope, categoryFilter, myCardIds, programById,
    bankFilter, cardFilter, cardById,
  ]);

  // Partner counts per card, so the header can say "18 partners" rather
  // than leaving the user to count cards.
  const routeSummary = useMemo(() => {
    const byCard = new Map<number, number>();
    for (const r of filteredRoutes) {
      byCard.set(r.from_card_id, (byCard.get(r.from_card_id) ?? 0) + 1);
    }
    return { cards: byCard.size, partners: filteredRoutes.length };
  }, [filteredRoutes]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Transfer Route Explorer</h1>
      <p className="mt-1 text-sm text-slate-500">
        Best card → loyalty program transfer routes, ranked by health score.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex overflow-hidden rounded-md border border-base-700 text-sm">
          <button
            onClick={() => {
              setScope("mine");
              setBankFilter("all");
              setCardFilter(null);
            }}
            className={`px-3 py-1.5 ${scope === "mine" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
          >
            My cards
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1.5 ${scope === "all" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
          >
            Browse by card
          </button>
        </div>

        {scope === "all" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Bank</span>
              <select
                value={bankFilter === "all" ? "" : bankFilter}
                onChange={(e) => {
                  setBankFilter(e.target.value ? Number(e.target.value) : "all");
                  setCardFilter(null);
                }}
                className="rounded-md border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-slate-200"
              >
                <option value="">Select a bank…</option>
                {transferableBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Card</span>
              <select
                value={cardFilter ?? ""}
                disabled={bankFilter === "all"}
                onChange={(e) => setCardFilter(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
              >
                <option value="">
                  {bankFilter === "all" ? "Select a bank first" : "All cards from this bank"}
                </option>
                {transferableCardsForBank.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.card_name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Partner type</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="all">All partners</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="mt-8 h-64 animate-pulse rounded-xl bg-base-800" />
      ) : scope === "mine" && userCards.length === 0 ? (
        <div className="card-surface mt-8 rounded-xl p-8 text-center text-sm text-slate-500">
          Link a card first, or switch to &ldquo;Browse by card&rdquo; to explore every route.
        </div>
      ) : scope === "mine" && filteredRoutes.length === 0 ? (
        <div className="card-surface mt-8 rounded-xl p-8 text-center text-sm text-slate-500">
          None of your linked cards earn transferable points. Co-branded cards
          (Vistara, IndiGo, Marriott and similar) earn a single airline or hotel
          currency directly, so there is nothing to transfer.
        </div>
      ) : scope === "all" && bankFilter === "all" ? (
        <div className="card-surface mt-8 rounded-xl p-8 text-center text-sm text-slate-500">
          Select a bank above to see its transfer partners.
        </div>
      ) : (
        <>
        {routeSummary.partners > 0 && (
          <p className="mt-6 text-xs text-slate-500">
            {routeSummary.partners} transfer partner
            {routeSummary.partners === 1 ? "" : "s"} across {routeSummary.cards} card
            {routeSummary.cards === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredRoutes.map((route) => {
            const card = cardById.get(route.from_card_id);
            const bank = card ? bankById.get(card.bank_id) : undefined;
            const program = programById.get(route.to_program_id);
            const risk = (route.devaluation_risk ?? "low").toLowerCase();
            return (
              <div key={route.id} className="card-surface rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-slate-500">
                      {bank?.bank_name} · {card?.card_name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-slate-100">
                      <span className="font-medium">{program?.program_name}</span>
                      <span className="text-xs text-slate-500">({program?.category})</span>
                    </div>
                  </div>
                  <span className={`pill ${RISK_STYLES[risk] ?? RISK_STYLES.low}`}>
                    {risk} risk
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Metric label="Ratio" value={formatRatio(route.transfer_ratio)} />
                  <Metric
                    label="Bonus"
                    value={route.bonus_percent ? `+${route.bonus_percent}%` : "—"}
                    highlight={!!route.bonus_percent}
                  />
                  <Metric label="Health" value={`${route.health_score ?? "—"}/100`} />
                  <Metric
                    label="Processing"
                    value={route.processing_time_days ? `${route.processing_time_days}d` : "—"}
                  />
                </div>

                {(route.sweet_spot_min_points || route.sweet_spot_max_points) && (
                  <div className="mt-3 text-xs text-slate-500">
                    Sweet spot: {route.sweet_spot_min_points?.toLocaleString() ?? "0"} –{" "}
                    {route.sweet_spot_max_points?.toLocaleString() ?? "∞"} points
                  </div>
                )}
              </div>
            );
          })}
          {filteredRoutes.length === 0 && (
            <p className="text-sm text-slate-500">No routes match this filter.</p>
          )}
        </div>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono ${highlight ? "text-gold-400" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}
