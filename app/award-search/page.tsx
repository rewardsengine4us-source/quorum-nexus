"use client";

import { useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";

interface ChartRow {
  programId: number;
  programName: string;
  pointsOneWay: number;
  pointsPeak: number | null;
  isDynamic: boolean;
  confidence: string;
  sourceNote: string | null;
  userBalance: number | null;
  shortfall: number | null;
}

interface LiveRow {
  available: boolean;
  seats: number | null;
  points: number | null;
  cabin: string;
  program: string;
  fetchedAt: string;
}

interface Airport {
  id: number;
  iata: string;
  name: string;
  city: string;
  country: string;
  region: string;
}

const CABIN_LABELS: Record<string, string> = {
  economy: "Economy",
  premium: "Premium Economy",
  business: "Business",
  first: "First",
};

export default function AwardSearchPage() {
  return (
    <RequireEntered>
      <NavBar />
      <AwardSearchBody />
    </RequireEntered>
  );
}

function AwardSearchBody() {
  const [from, setFrom] = useState("Delhi");
  const [to, setTo] = useState("London");
  const [date, setDate] = useState("");
  const [cabin, setCabin] = useState("business");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [liveMessage, setLiveMessage] = useState<string>("");
  const [searched, setSearched] = useState(false);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to, cabin });
      if (date) qs.set("date", date);
      const res = await fetch(`/api/awards/search?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");

      setOrigin(data.origin);
      setDestination(data.destination);
      setCharts(data.charts || []);
      setLive(data.live || []);
      setLiveStatus(data.liveStatus || "");
      setLiveMessage(data.liveMessage || "");
      setSearched(true);
    } catch (e: any) {
      setError(e.message ?? "Search failed");
      setCharts([]);
      setLive([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Award Search</h1>
      <p className="mt-1 text-sm text-slate-500">
        Points required to fly a route, across every program that serves it —
        checked against the balances you actually hold.
      </p>

      <div className="card-surface mt-6 rounded-xl p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">From</span>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Delhi or DEL"
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="London or LHR"
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Cabin</span>
            <select
              value={cabin}
              onChange={(e) => setCabin(e.target.value)}
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            >
              {Object.entries(CABIN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={search}
            disabled={loading || !from || !to}
            className="h-[38px] rounded-md bg-accent-500 px-6 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {searched && origin && destination && (
        <div className="mt-6 text-sm text-slate-400">
          <span className="font-mono text-slate-200">{origin.iata}</span>{" "}
          {origin.city} → <span className="font-mono text-slate-200">{destination.iata}</span>{" "}
          {destination.city}
          <span className="text-slate-600"> · </span>
          {CABIN_LABELS[cabin]}
          <span className="text-slate-600"> · one way</span>
        </div>
      )}

      {searched && liveMessage && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            liveStatus === "ok"
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
              : liveStatus === "error"
              ? "border-red-900 bg-red-950/40 text-red-300"
              : "border-base-700 bg-base-800/60 text-slate-400"
          }`}
        >
          {liveMessage}
        </div>
      )}

      {live.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-medium text-slate-100">
            Live availability
          </h2>
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Program</th>
                  <th className="px-4 py-2 font-medium">Cabin</th>
                  <th className="px-4 py-2 text-right font-medium">Points</th>
                  <th className="px-4 py-2 text-right font-medium">Seats</th>
                </tr>
              </thead>
              <tbody>
                {live.map((liveRow, i) => (
                  <tr key={i} className="border-t border-base-700/60">
                    <td className="px-4 py-2 text-slate-200">{liveRow.program}</td>
                    <td className="px-4 py-2 text-slate-400">{liveRow.cabin}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-100">
                      {liveRow.points != null ? liveRow.points.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {liveRow.seats ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {searched && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-medium text-slate-100">
            Points required
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Published award-chart levels for this region pair. Programs marked
            &ldquo;dynamic&rdquo; price by demand, so treat those as typical
            saver levels rather than fixed rates.
          </p>

          {charts.length === 0 ? (
            <div className="card-surface rounded-xl p-8 text-center text-sm text-slate-500">
              No award chart data for {origin?.region} → {destination?.region} in{" "}
              {CABIN_LABELS[cabin]} yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-base-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-base-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Program</th>
                    <th className="px-4 py-2 text-right font-medium">Points</th>
                    <th className="px-4 py-2 text-right font-medium">Peak</th>
                    <th className="px-4 py-2 text-right font-medium">You hold</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.map((chartRow) => {
                    const canBook =
                      chartRow.userBalance != null && chartRow.userBalance >= chartRow.pointsOneWay;
                    return (
                      <tr key={chartRow.programId} className="border-t border-base-700/60">
                        <td className="px-4 py-2">
                          <div className="text-slate-200">{chartRow.programName}</div>
                          {chartRow.sourceNote && (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {chartRow.sourceNote}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-100">
                          {chartRow.pointsOneWay.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-500">
                          {chartRow.pointsPeak != null
                            ? chartRow.pointsPeak.toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-300">
                          {chartRow.userBalance != null
                            ? chartRow.userBalance.toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {canBook ? (
                            <span className="pill border border-emerald-900 bg-emerald-950 text-xs text-emerald-300">
                              enough points
                            </span>
                          ) : chartRow.shortfall != null ? (
                            <span className="pill border border-amber-900 bg-amber-950 text-xs text-amber-300">
                              {chartRow.shortfall.toLocaleString()} short
                            </span>
                          ) : chartRow.isDynamic ? (
                            <span className="pill border border-base-600 bg-base-700 text-xs text-slate-400">
                              dynamic pricing
                            </span>
                          ) : (
                            <span className="pill border border-base-600 bg-base-700 text-xs text-slate-400">
                              published chart
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
