"use client";

import { useEffect, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import { getVoucherPartners, getVoucherOrders, createDemoVoucherOrder } from "@/lib/queries";
import type { VoucherPartner, VoucherOrder } from "@/lib/types";

export default function RedeemPage() {
  return (
    <RequireEntered>
      <NavBar />
      <RedeemBody />
    </RequireEntered>
  );
}

function RedeemBody() {
  const [partners, setPartners] = useState<VoucherPartner[]>([]);
  const [orders, setOrders] = useState<VoucherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ partner: VoucherPartner; denom: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const [p, o] = await Promise.all([getVoucherPartners(), getVoucherOrders()]);
    setPartners(p);
    setOrders(o);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to load redemption catalog");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function confirmRedeem() {
    if (!confirming) return;
    setSubmitting(true);
    try {
      await createDemoVoucherOrder(confirming.partner.id, confirming.denom);
      setConfirming(null);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Redeem</h1>
      <p className="mt-1 text-sm text-slate-500">
        Convert value into gift vouchers from partner brands.
      </p>
      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-300">
        Demo mode — orders are simulated instantly, no real payment is processed.
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-slate-100">Voucher partners</h2>
        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-base-800" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((partner) => (
              <div key={partner.id} className="card-surface rounded-xl p-4">
                <div className="font-medium text-slate-100">{partner.partner_name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Delivered in ~{partner.fulfillment_latency_minutes ?? 60} min
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(partner.voucher_denominations ?? []).map((d) => (
                    <button
                      key={d}
                      onClick={() => setConfirming({ partner, denom: d })}
                      className="rounded-md border border-base-700 px-3 py-1 text-xs text-slate-200 hover:border-accent-500 hover:text-accent-400"
                    >
                      ₹{d}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-slate-100">Your redemption history</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No redemptions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-base-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-800 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const partner = partners.find((p) => p.id === order.partner_id);
                  return (
                    <tr key={order.id} className="border-t border-base-700/60">
                      <td className="px-4 py-2 text-slate-200">{partner?.partner_name ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-slate-100">₹{order.denomination}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`pill ${
                            order.status === "completed"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-900"
                              : "bg-base-700 text-slate-300"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">
                        {order.voucher_code ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-6">
          <div className="card-surface w-full max-w-sm rounded-xl p-6">
            <h3 className="text-lg font-medium text-slate-100">Confirm redemption</h3>
            <p className="mt-2 text-sm text-slate-400">
              ₹{confirming.denom} voucher from {confirming.partner.partner_name}. This is a
              simulated demo order — no real charge occurs.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-md border border-base-700 px-4 py-2 text-sm text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmRedeem}
                disabled={submitting}
                className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-40"
              >
                {submitting ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
