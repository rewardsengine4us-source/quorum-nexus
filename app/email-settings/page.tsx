"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";

// email_connections / email_parsing_logs are locked down to service_role
// only (no anon-key RLS policy) — this page must go through the
// /api/email/status route, never query these tables via the browser
// supabase client directly, or it will always render as "not connected"
// even when a connection genuinely exists.
interface EmailConnection {
  id: number;
  email: string;
  oauth_provider: string;
  last_sync_at: string | null;
  created_at: string;
}
interface EmailParsingLog {
  id: number;
  email_subject: string | null;
  sender: string | null;
  extracted_points: number | null;
  extracted_balance: number | null;
  program_id: number | null;
  parse_status: string;
  detected_via: string | null;
  event_type: string | null;
  source: string | null;
  created_at: string;
}

export default function EmailSettingsPage() {
  return (
    <RequireEntered>
      <NavBar />
      <EmailSettingsBody />
    </RequireEntered>
  );
}

function EmailSettingsBody() {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [logs, setLogs] = useState<EmailParsingLog[]>([]);
  const [scannedTotal, setScannedTotal] = useState<number | null>(null);
  const [programs, setPrograms] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const errorMsg = searchParams?.get("error");
  const [expandedProgram, setExpandedProgram] = useState<number | "unknown" | null>(null);

  // The API returns one row per successfully parsed email (needed server-side
  // to keep re-syncs idempotent), which is a raw activity log, not what a
  // user wants to see — the same program can appear a dozen times as its
  // balance updates month over month. Collapse to the single latest reading
  // per program for display; older readings are still available per-program
  // via the expander rather than deleted from view.
  const latestByProgram = useMemo(() => {
    // logs are already ordered id.desc from the API, so the first row seen
    // per program is the most recent.
    const latest = new Map<number | "unknown", EmailParsingLog>();
    const history = new Map<number | "unknown", EmailParsingLog[]>();
    for (const log of logs) {
      const key = log.program_id ?? "unknown";
      if (!latest.has(key)) latest.set(key, log);
      const list = history.get(key) ?? [];
      list.push(log);
      history.set(key, list);
    }
    return { latest: [...latest.entries()], history };
  }, [logs]);

  useEffect(() => {
    if (errorMsg) {
      setError(`Connection failed: ${errorMsg}`);
      setTimeout(() => setError(null), 5000);
    }
  }, [errorMsg]);

  async function loadStatus() {
    const res = await fetch("/api/email/status", { cache: "no-store" });
    const data = await res.json();
    if (data.diag?.error) throw new Error(data.diag.error);
    setConnection(data.connection || null);
    setLogs(data.logs || []);
    setScannedTotal(typeof data.scannedTotal === "number" ? data.scannedTotal : null);
    setPrograms(data.programs || {});
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadStatus();
      } catch (e: any) {
        setError(e.message ?? "Failed to load email settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/email/parse", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      setSuccess(
        `✓ Scanned ${data.scanned} · matched ${data.matched} · ${data.programsTouched} program(s) updated · ${data.cardsLinked} card(s) linked`
      );
      setTimeout(() => setSuccess(null), 6000);
      await loadStatus();
    } catch (e: any) {
      setError(e.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    try {
      const res = await fetch("/api/email/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setConnection(null);
      setSuccess("✓ Disconnected Gmail");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message ?? "Failed to disconnect");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Email Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect your email to automatically extract loyalty points from transaction notifications.
      </p>

      {success && (
        <div className="mt-6 rounded-lg border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-slate-100">Gmail Connection</h2>
        {loading ? (
          <div className="h-32 animate-pulse rounded-xl bg-base-800" />
        ) : connection ? (
          <div className="card-surface rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-100">{connection.email}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Connected • Last synced {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "never"}
                </div>
              </div>
              <button
                onClick={disconnect}
                className="rounded-md border border-base-700 px-4 py-2 text-sm text-slate-300 hover:border-red-700 hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <a
            href="/api/auth/gmail"
            className="inline-block rounded-lg bg-accent-500 px-6 py-3 font-medium text-base-950 hover:bg-accent-400"
          >
            Connect Gmail
          </a>
        )}
      </section>

      {connection && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-slate-100">Manual Sync</h2>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="rounded-md bg-base-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-base-600 disabled:opacity-40"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          </div>
          <p className="text-sm text-slate-500">
            Manually trigger parsing of recent reward emails from Gmail. Emails are normally synced automatically via webhook.
          </p>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-slate-100">Points Found</h2>
          {scannedTotal != null && (
            <span className="text-xs text-slate-500">
              {latestByProgram.latest.length} program
              {latestByProgram.latest.length === 1 ? "" : "s"} from{" "}
              {scannedTotal.toLocaleString()} emails scanned
            </span>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">
            No points balances found yet. Run a sync to scan your inbox.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Program</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                  <th className="px-4 py-2 font-medium">Last updated</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {latestByProgram.latest.map(([key, log]) => {
                  const history = latestByProgram.history.get(key) ?? [];
                  const isExpanded = expandedProgram === key;
                  return (
                    <Fragment key={key}>
                      <tr className="border-t border-base-700/60">
                        <td className="px-4 py-2 text-slate-200">
                          {log.program_id ? programs[log.program_id] ?? "—" : "Unrecognized program"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-100">
                          {log.extracted_balance != null
                            ? log.extracted_balance.toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {history.length > 1 && (
                            <button
                              onClick={() => setExpandedProgram(isExpanded ? null : key)}
                              className="text-xs text-slate-500 hover:text-slate-300"
                            >
                              {isExpanded ? "Hide" : `${history.length - 1} earlier`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded &&
                        history.slice(1).map((h) => (
                          <tr key={`hist-${h.id}`} className="border-t border-base-700/30 bg-base-900/40">
                            <td className="px-4 py-2 pl-8 text-xs text-slate-500">
                              {h.email_subject || "—"}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                              {h.extracted_balance != null ? h.extracted_balance.toLocaleString() : "—"}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-600">
                              {new Date(h.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2"></td>
                          </tr>
                        ))}
                    </Fragment>
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
