"use client";

import { useEffect, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import { getWishlist, addWishlistItem, deleteWishlistItem } from "@/lib/queries";
import type { UserWishlist } from "@/lib/types";

export default function WishlistPage() {
  return (
    <RequireEntered>
      <NavBar />
      <WishlistBody />
    </RequireEntered>
  );
}

function WishlistBody() {
  const [items, setItems] = useState<UserWishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [destination, setDestination] = useState("");
  const [classOfTravel, setClassOfTravel] = useState("economy");
  const [targetDate, setTargetDate] = useState("");
  const [pointsNeeded, setPointsNeeded] = useState("");
  const [priority, setPriority] = useState("1");

  async function refresh() {
    const data = await getWishlist();
    setItems(data);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to load wishlist");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) return;
    setSubmitting(true);
    try {
      await addWishlistItem({
        destination: destination.trim(),
        class_of_travel: classOfTravel,
        target_date: targetDate || null,
        estimated_points_needed: pointsNeeded ? Number(pointsNeeded) : null,
        priority: Number(priority),
      });
      setDestination("");
      setTargetDate("");
      setPointsNeeded("");
      await refresh();
    } catch (err: any) {
      setError(err.message ?? "Failed to add wishlist item");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteWishlistItem(id);
      await refresh();
    } catch (err: any) {
      setError(err.message ?? "Failed to delete item");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Redemption Wishlist</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track the trips you&rsquo;re saving points for.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="card-surface mt-8 rounded-xl p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">Destination</label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tokyo, Japan"
              className="mt-1 w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Class of travel</label>
            <select
              value={classOfTravel}
              onChange={(e) => setClassOfTravel(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium Economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Target date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Estimated points needed</label>
            <input
              type="number"
              min={0}
              value={pointsNeeded}
              onChange={(e) => setPointsNeeded(e.target.value)}
              placeholder="e.g. 120000"
              className="mt-1 w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Priority (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add to wishlist"}
        </button>
      </form>

      <section className="mt-10">
        {loading ? (
          <div className="h-32 animate-pulse rounded-xl bg-base-800" />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No wishlist items yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="card-surface flex items-center justify-between rounded-xl p-4">
                <div>
                  <div className="font-medium text-slate-100">{item.destination}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.class_of_travel ?? "economy"}
                    {item.target_date ? ` · by ${item.target_date}` : ""}
                    {item.estimated_points_needed
                      ? ` · ~${item.estimated_points_needed.toLocaleString()} points`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="pill bg-base-700 text-slate-300">P{item.priority ?? 1}</span>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
