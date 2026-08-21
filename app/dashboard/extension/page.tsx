"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import RequireEntered from "@/components/RequireEntered";

interface Token {
  id: string;
  label?: string;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

export default function ExtensionPage() {
  return (
    <RequireEntered>
      <NavBar />
      <ExtensionBody />
    </RequireEntered>
  );
}

function ExtensionBody() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load tokens on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/extension/tokens");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setTokens(data.tokens || []);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function generateCode() {
    setGeneratingCode(true);
    setError(null);
    try {
      const res = await fetch("/api/extension/create-pairing-code", {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setPairingCode(data.code);
        setExpiresAt(data.expires_at);
        setSuccess("✓ Pairing code generated. 8-minute expiry.");
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function revokeToken(tokenId: string) {
    try {
      const res = await fetch("/api/extension/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_id: tokenId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
      } else {
        setTokens(tokens.filter((t) => t.id !== tokenId));
        setSuccess("✓ Device revoked.");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  function copyCode() {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setSuccess("✓ Copied to clipboard");
      setTimeout(() => setSuccess(null), 2000);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">
        Chrome Extension Setup
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Pair your Chrome extension to capture loyalty balances automatically.
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
        <h2 className="mb-4 text-lg font-medium text-slate-100">
          Generate Pairing Code
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Install the Quorum Nexus Chrome extension, then paste this code in the
          popup to pair your device.
        </p>

        {pairingCode ? (
          <div className="rounded-lg border border-base-700 bg-base-800 p-6">
            <div className="text-center">
              <div className="text-4xl font-mono font-bold text-accent-500 mb-4">
                {pairingCode}
              </div>
              <div className="text-xs text-slate-500 mb-4">
                Expires in 8 minutes
              </div>
              <button
                onClick={copyCode}
                className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
              >
                Copy Code
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={generateCode}
            disabled={generatingCode}
            className="rounded-lg bg-accent-500 px-6 py-3 font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {generatingCode ? "Generating…" : "Generate Code"}
          </button>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-slate-100">
          Paired Devices
        </h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-base-800" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-slate-500">
            No devices paired yet. Generate a code above to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Device</th>
                  <th className="px-4 py-2 font-medium">Paired</th>
                  <th className="px-4 py-2 font-medium">Last Used</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr
                    key={token.id}
                    className={
                      token.revoked_at
                        ? "border-t border-base-700/60 opacity-50"
                        : "border-t border-base-700/60"
                    }
                  >
                    <td className="px-4 py-2 text-slate-200">
                      {token.label || "Device"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(token.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {token.last_used_at
                        ? new Date(token.last_used_at).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => revokeToken(token.id)}
                        disabled={!!token.revoked_at}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                      >
                        {token.revoked_at ? "Revoked" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-base-700 bg-base-800/50 p-6">
        <h3 className="font-medium text-slate-200 mb-2">v1 Programs</h3>
        <p className="text-xs text-slate-500 mb-3">
          Currently supported: Aeroplan, Avios (British Airways), Accor,
          Marriott Bonvoy, MakeMyTrip, Air India.
        </p>
        <p className="text-xs text-slate-600">
          After testing, we will add every remaining loyalty program in the
          catalog.
        </p>
      </section>
    </main>
  );
}
