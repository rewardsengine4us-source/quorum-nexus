// Portal accelerator lookup, shared by /api/scan/resolve and
// /api/public/best-card.
//
// Issuer portals (HDFC SmartBuy, Axis Travel EDGE, Kotak Unbox, RBL's
// Nova/Lumiere sites) multiply the base rate when a purchase is routed
// through them. This is deliberately kept separate from the MCC rate:
// a PharmEasy order carries MCC 5912 whether or not it went via
// SmartBuy, so the accelerator is a property of *how* you pay, not of
// the merchant category. Folding it into card_reward_rules would
// overstate every pharmacy purchase.
//
// So the accelerator is returned alongside the normal rate as an
// "if you route it through X you'd get Y instead" hint, never silently
// substituted for the earned rate.

import { select } from "@/lib/db";

export interface PortalBoost {
  portalName: string;
  effectiveRate: number | null;
  multiplier: number | null;
  notes: string | null;
  verified: boolean;
}

/**
 * Accelerators that could apply to this purchase, keyed by card id.
 *
 * A row matches when either:
 *  - it names a merchant and that string appears in the merchant name, or
 *  - it has no merchant and its category matches the resolved category.
 *
 * Unverified rows are returned too, but carry verified:false so the UI
 * can present them as "this partner exists, rate unconfirmed" instead of
 * quoting a number we haven't sourced.
 */
export async function portalBoostsFor(
  category: string | null,
  merchantName: string | null
): Promise<Map<number, PortalBoost>> {
  const out = new Map<number, PortalBoost>();
  if (!category && !merchantName) return out;

  const rows = await select(
    "card_portal_accelerators",
    "select=credit_card_id,portal_name,merchant_match,category,multiplier," +
      "effective_rate,notes,verified"
  );

  const name = (merchantName ?? "").toLowerCase();

  for (const r of rows as any[]) {
    const merchantHit =
      r.merchant_match && name && name.includes(String(r.merchant_match).toLowerCase());
    const categoryHit = !r.merchant_match && category && r.category === category;
    if (!merchantHit && !categoryHit) continue;

    // A merchant-specific row is more precise than a category-wide one,
    // and a verified rate beats an unverified one.
    const existing = out.get(r.credit_card_id);
    const better =
      !existing ||
      (!!merchantHit && !existing.notes?.startsWith("category")) ||
      (r.verified && !existing.verified) ||
      (r.effective_rate ?? 0) > (existing.effectiveRate ?? 0);

    if (better) {
      out.set(r.credit_card_id, {
        portalName: r.portal_name,
        effectiveRate: r.effective_rate != null ? Number(r.effective_rate) : null,
        multiplier: r.multiplier != null ? Number(r.multiplier) : null,
        notes: r.notes ?? null,
        verified: !!r.verified,
      });
    }
  }

  return out;
}
