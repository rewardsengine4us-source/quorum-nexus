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

  const filteredRoutes = useMemo(() => {
    return routes
      .filter((r) => (scope === "mine" ? myCardIds.has(r.from_card_id) : true))
      .filter((r) => {
        if (categoryFilter === "all") return true;
        const program = programById.get(r.to_program_id);
        return program?.category === categoryFilter;
      })
      .sort((a, b) => (b.health_score ?? 0) - (a.health_score ?? 0));
  }, [routes, scope, categoryFilter, myCardIds, programById]);

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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-base-700 text-sm">
          <button
            onClick={() => setScope("mine")}
            className={`px-3 py-1.5 ${scope === "mine" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
          >
            My cards
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1.5 ${scope === "all" ? "bg-accent-500 text-base-950" : "text-slate-300"}`}
          >
            All cards
          </button>
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-8 h-64 animate-pulse rounded-xl bg-base-800" />
      ) : scope === "mine" && userCards.length === 0 ? (
        <div className="card-surface mt-8 rounded-xl p-8 text-center text-sm text-slate-500">
          Link a card first, or switch to &ldquo;All cards&rdquo; to browse every route.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
