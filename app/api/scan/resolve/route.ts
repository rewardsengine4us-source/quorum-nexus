import { NextRequest, NextResponse } from "next/server";
import { select, DEMO_USER_ID } from "@/lib/db";
import { parseUpiQr, resolveMcc } from "@/lib/upi";
import { portalBoostsFor } from "@/lib/rewards";

export async function POST(req: NextRequest) {
  try {
    const { qr, scope } = await req.json();
    const parsed = parseUpiQr(String(qr ?? ""));

    if (!parsed.valid) {
      return NextResponse.json(
        {
          error:
            "That doesn't look like a UPI QR. Expected an upi:// link or a VPA " +
            "like merchant@bank.",
        },
        { status: 400 }
      );
    }

    const [merchants, mccs] = await Promise.all([
      select("merchant_mcc", "select=match_type,match_value,mcc,merchant_name"),
      select("mcc_codes", "select=mcc,description,category"),
    ]);

    const resolution = resolveMcc(parsed, merchants as any, mccs as any);

    // Rank cards for this category. "mine" limits to linked cards, which is
    // the question that actually matters at a checkout counter.
    let cards: any[] = [];
    if (resolution.category) {
      const rules = await select(
        "card_reward_rules",
        `or=(category.eq.${resolution.category},category.eq.base)` +
          `&select=credit_card_id,category,reward_rate,notes`
      );

      const allCards = await select(
        "credit_cards",
        "select=id,card_name,bank_id,is_cobranded&is_active=eq.true"
      );
      const banks = await select("banks", "select=id,bank_name");
      const bankName: Record<number, string> = {};
      for (const b of banks) bankName[b.id] = b.bank_name;

      let allowedIds: Set<number> | null = null;
      if (scope === "mine") {
        const linked = await select(
          "user_cards",
          `user_id=eq.${DEMO_USER_ID}&select=credit_card_id`
        );
        allowedIds = new Set(linked.map((l: any) => l.credit_card_id));
      }

      // A card's applicable rate is its category-specific rate if it has one,
      // otherwise its base rate. Category always wins over base regardless of
      // the numbers, because that is how the card actually pays out.
      const categoryRate = new Map<number, { rate: number; notes: string | null }>();
      const baseRate = new Map<number, { rate: number; notes: string | null }>();

      for (const r of rules) {
        if (allowedIds && !allowedIds.has(r.credit_card_id)) continue;
        const target = r.category === "base" ? baseRate : categoryRate;
        const existing = target.get(r.credit_card_id);
        if (!existing || r.reward_rate > existing.rate) {
          target.set(r.credit_card_id, { rate: r.reward_rate, notes: r.notes });
        }
      }

      const best = new Map<number, { rate: number; category: string; notes: string | null }>();
      for (const [cardId, info] of categoryRate) {
        best.set(cardId, { ...info, category: resolution.category });
      }
      for (const [cardId, info] of baseRate) {
        if (!best.has(cardId)) best.set(cardId, { ...info, category: "base" });
      }

      const boosts = await portalBoostsFor(
        resolution.category,
        resolution.merchantName ?? parsed.payeeName
      );

      const cardById = new Map(allCards.map((c: any) => [c.id, c]));
      cards = [...best.entries()]
        .map(([cardId, info]) => {
          const card = cardById.get(cardId);
          if (!card) return null;
          const boost = boosts.get(cardId);
          return {
            cardId,
            cardName: card.card_name,
            bankName: bankName[card.bank_id] ?? "",
            rate: info.rate,
            isAccelerated: info.category !== "base",
            notes: info.notes,
            // Kept distinct from `rate` — scanning a QR at the counter
            // earns the base/category rate; the portal rate only applies
            // if the same purchase is made through the issuer's portal.
            portal: boost
              ? {
                  name: boost.portalName,
                  rate: boost.effectiveRate,
                  multiplier: boost.multiplier,
                  verified: boost.verified,
                  notes: boost.notes,
                }
              : null,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.rate - a.rate)
        .slice(0, 8);
    }

    return NextResponse.json({
      parsed: {
        vpa: parsed.vpa,
        payeeName: parsed.payeeName,
        amount: parsed.amount,
        mccInQr: parsed.mcc,
      },
      resolution,
      cards,
      scope: scope === "mine" ? "mine" : "all",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
