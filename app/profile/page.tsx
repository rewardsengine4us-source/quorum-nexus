"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";

interface Profile {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
}

export default function ProfilePage() {
  return (
    <>
      <NavBar />
      <ProfileBody />
    </>
  );
}

function ProfileBody() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.status === 401) {
          setSignedIn(false);
          return;
        }
        const data = await res.json();
        setProfile(data.profile);
        setPhone(data.profile?.phone ?? "");
      } catch (e: any) {
        setError(e.message ?? "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSuccess("✓ Phone number saved");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!signedIn && !loading) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-50">Profile</h1>
        <p className="mt-3 text-sm text-slate-500">
          Sign in to add a phone number to your account — it's used to help
          identify which loyalty program accounts are yours when syncing
          balances.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-lg bg-accent-500 px-6 py-3 text-sm font-medium text-base-950 hover:bg-accent-400"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        Contact info used for loyalty program syncing.
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

      {loading ? (
        <div className="mt-8 h-32 animate-pulse rounded-xl bg-base-800" />
      ) : (
        <div className="mt-8 card-surface rounded-xl p-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Email
            </span>
            <input
              value={profile?.email ?? ""}
              disabled
              className="w-full rounded-md border border-base-700 bg-base-800 px-3 py-2.5 text-sm text-slate-400"
            />
          </label>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Phone number
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              className="w-full rounded-md border border-base-700 bg-base-900 px-3 py-2.5 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
            />
            <span className="mt-1.5 block text-xs text-slate-600">
              Used when a loyalty program requires your registered phone
              number to log in (e.g. Air India Maharaja Club).
            </span>
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="mt-5 rounded-md bg-accent-500 px-6 py-2.5 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </main>
  );
}
