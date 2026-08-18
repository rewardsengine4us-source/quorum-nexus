"use client";

import { useEffect, useState } from "react";
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
              {logs.length} balance{logs.length === 1 ? "" : "s"} extracted from{" "}
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
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Detected via</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-base-700/60">
                    <td className="px-4 py-2 text-slate-200">
                      {log.program_id ? programs[log.program_id] ?? "—" : "—"}
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-2 text-xs text-slate-400"
                      title={log.email_subject || ""}
                    >
                      {log.email_subject || "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-100">
                      {log.extracted_balance != null
                        ? log.extracted_balance.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="pill border border-base-600 bg-base-700 text-xs text-slate-300">
                        {log.source === "pdf" ? "PDF statement" : "email body"}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {log.detected_via || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
