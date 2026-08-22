"use client";

import { useEffect, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";

interface VaultEntry {
  id: number;
  programId: number;
  programName: string;
  scope: string[];
  syncEnabled: boolean;
  syncFrequency: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  consentAt: string;
}

interface Adapter {
  program_code: string;
  display_name: string;
  login_url: string | null;
  adapter_status: string;
  requires_mfa: boolean;
  tos_risk: string;
  notes: string | null;
}

export default function LoyaltySyncPage() {
  return (
    <RequireEntered>
      <NavBar />
      <LoyaltySyncBody />
    </RequireEntered>
  );
}

function LoyaltySyncBody() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [programCode, setProgramCode] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  async function load() {
    const res = await fetch("/api/vault", { cache: "no-store" });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setEntries(data.entries || []);
    setAdapters(data.adapters || []);
    setReady(!!data.ready);
    setScope(data.scope || []);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e: any) {
        setError(e.message ?? "Failed to load vault");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleStore() {
    setSaving(true);
    setError(null);
    try {
      const adapter = adapters.find((a) => a.program_code === programCode);
      if (!adapter) throw new Error("Pick a program first.");

      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "store",
          programCode,
          username,
          secret,
          consent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to store credential");

      setUsername("");
      setSecret("");
      setConsent(false);
      setShowForm(false);
      setNotice("Credential stored and encrypted.");
      setTimeout(() => setNotice(null), 4000);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to store credential");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(id: number) {
    setSyncingId(id);
    setError(null);
    try {
      const res = await fetch("/api/vault/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: id }),
      });
      const data = await res.json();
      setNotice(data.error || `Sync finished: ${data.status}`);
      setTimeout(() => setNotice(null), 8000);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleRemove(id: number) {
    try {
      await fetch(`/api/vault?id=${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to remove");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Loyalty Program Sync</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect a loyalty account to refresh balances automatically each week,
        or on demand.
      </p>

      {!ready && (
        <div className="mt-6 rounded-lg border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-300">
          <strong>Encryption key not configured.</strong> Credentials cannot be
          stored until <code className="font-mono">CREDENTIAL_ENCRYPTION_KEY</code>{" "}
          is set in the Vercel project. Generate one with{" "}
          <code className="font-mono">openssl rand -base64 32</code>.
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-6 rounded-lg border border-base-700 bg-base-800/60 p-4 text-sm text-slate-300">
          {notice}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-slate-100">
          What this reads
        </h2>
        <div className="card-surface rounded-xl p-5 text-sm text-slate-400">
          <p>
            A connected account is read for three things only:
          </p>
          <ul className="mt-3 space-y-1.5">
            <li className="flex gap-2">
              <span className="text-emerald-400">•</span> Points balance
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">•</span> Points expiry date
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">•</span> Transfer bonus offers
            </li>
          </ul>
          <p className="mt-3">
            Nothing else is parsed or stored — no transactions, no statements,
            no personal details, no travel history. Credentials are encrypted
            with AES-256-GCM before they reach the database, and the key is
            held outside it.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">
            Connected accounts
          </h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            disabled={!ready}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {showForm ? "Cancel" : "Connect an account"}
          </button>
        </div>

        {showForm && (
          <div className="card-surface mb-4 rounded-xl p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Program
                </span>
                <select
                  value={programCode}
                  onChange={(e) => setProgramCode(e.target.value)}
                  className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                >
                  <option value="">Select…</option>
                  {adapters.map((a) => (
                    <option key={a.program_code} value={a.program_code}>
                      {a.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Membership number or email
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Password
                </span>
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
                />
              </label>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I authorise Quorum Nexus to sign in to this account on my behalf
                to read my points balance, expiry and transfer bonuses. I
                understand many loyalty programs prohibit automated access in
                their terms, that I can disconnect at any time, and that doing
                so deletes the stored credential.
              </span>
            </label>

            <button
              onClick={handleStore}
              disabled={saving || !consent || !programCode || !username || !secret}
              className="mt-4 rounded-md bg-accent-500 px-5 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
            >
              {saving ? "Encrypting…" : "Store securely"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-base-800" />
        ) : entries.length === 0 ? (
          <div className="card-surface rounded-xl p-8 text-center text-sm text-slate-500">
            No accounts connected yet.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="card-surface flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
              >
                <div>
                  <div className="font-medium text-slate-100">
                    {entry.programName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {entry.syncFrequency} ·{" "}
                    {entry.lastSyncAt
                      ? `last run ${new Date(entry.lastSyncAt).toLocaleString()}`
                      : "never run"}
                    {entry.lastSyncStatus ? ` · ${entry.lastSyncStatus}` : ""}
                  </div>
                  {entry.lastSyncError && (
                    <div className="mt-1.5 max-w-xl text-xs text-amber-300">
                      {entry.lastSyncError}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSync(entry.id)}
                    disabled={syncingId === entry.id}
                    className="rounded-md border border-base-700 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40"
                  >
                    {syncingId === entry.id ? "Syncing…" : "Sync now"}
                  </button>
                  <button
                    onClick={() => handleRemove(entry.id)}
                    className="rounded-md border border-base-700 px-3 py-1.5 text-xs text-slate-500 hover:text-red-400"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium text-slate-100">
          Program support
        </h2>
        <div className="overflow-hidden rounded-xl border border-base-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-base-800 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Program</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">MFA</th>
                <th className="px-4 py-2 font-medium">Terms</th>
              </tr>
            </thead>
            <tbody>
              {adapters.map((a) => (
                <tr key={a.program_code} className="border-t border-base-700/60">
                  <td className="px-4 py-2 text-slate-200">{a.display_name}</td>
                  <td className="px-4 py-2">
                    <span className="pill border border-base-600 bg-base-700 text-xs text-slate-400">
                      {a.adapter_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {a.requires_mfa ? "required" : "no"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{a.tos_risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Automated login needs a headless browser, which Vercel&rsquo;s
          serverless runtime cannot host. Enabling a program requires a hosted
          browser service or a separate worker process. Until then credentials
          stay encrypted and unused, and every program above reports{" "}
          <span className="font-mono">planned</span> rather than pretending to
          work.
        </p>
      </section>
    </main>
  );
}
