import { NextRequest, NextResponse } from "next/server";
import { select } from "@/lib/db";
import { resolveMcc, type MerchantRow, type MccRow } from "@/lib/upi";
import { portalBoostsFor } from "@/lib/rewards";

// Public, unauthenticated endpoint for the Chrome extension. The extension
// runs on the user's machine with no server session, so this can't use the
// "mine"-scoped /api/scan/resolve path — it always ranks against the full
// catalog. No PII is accepted or stored; only a merchant name/domain and an
// optional MCC guess derived from page content.
//
// CORS is open (chrome-extension:// origins don't send a normal Origin
// PostgREST-style check would understand, and this endpoint returns nothing
// sensitive), but rate-limited per IP to prevent scraping the whole card
// catalog rate table via brute-force merchant name queries.
//
// Rate limiting here is in-memory and per-serverless-instance, which is an
// honest, cheap deterrent — not a real distributed limiter. Vercel spins up
// multiple instances under load, so a determined scraper can exceed the
// nominal cap. If this becomes a real abuse vector, move to Upstash/Vercel KV.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);
  if (hits.size > 5000) {
    // Cheap guard against unbounded memory growth from spoofed IPs.
    for (const [key, arr] of hits) {
      if (!arr.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return timestamps.length > MAX_PER_WINDOW;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: corsHeaders() }
    );
  }

  const merchant = (req.nextUrl.searchParams.get("merchant") || "").trim();
  const domain = (req.nextUrl.searchParams.get("domain") || "").trim();
  if (!merchant && !domain) {
    return NextResponse.json(
      { error: "Provide a merchant name or domain." },
      { status: 400, headers: corsHeaders() }
    );
  }

  try {
    const [merchants, mccs] = await Promise.all([
      select("merchant_mcc", "select=match_type,match_value,mcc,merchant_name"),
      select("mcc_codes", "select=mcc,description,category"),
    ]);

    // Reuse the same fallback chain the QR scanner uses: name match first,
    // then a weaker "domain as handle" match, so a merchant known to the
    // catalog by name resolves the same way regardless of entry point.
    const fakeParsed = {
      valid: true,
      vpa: null,
      payeeName: merchant || null,
      mcc: null,
      amount: null,
      handle: domain ? domain.toLowerCase() : null,
      prefix: null,
      raw: merchant || domain,
    };
    const resolution = resolveMcc(
      fakeParsed as any,
      merchants as MerchantRow[],
      mccs as MccRow[]
    );

    let cards: any[] = [];
    if (resolution.category) {
      const rules = await select(
        "card_reward_rules",
        `or=(category.eq.${resolution.category},category.eq.base)` +
          `&select=credit_card_id,category,reward_rate,notes`
      );
      const allCards = await select(
        "credit_cards",
        "select=id,card_name,bank_id&is_active=eq.true"
      );
      const banks = await select("banks", "select=id,bank_name");
      const bankName: Record<number, string> = {};
      for (const b of banks) bankName[b.id] = b.bank_name;

      const categoryRate = new Map<number, { rate: number; notes: string | null }>();
      const baseRate = new Map<number, { rate: number; notes: string | null }>();
      for (const r of rules) {
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
        resolution.merchantName ?? merchant
      );

      const cardById = new Map(allCards.map((c: any) => [c.id, c]));
      cards = [...best.entries()]
        .map(([cardId, info]) => {
          const card = cardById.get(cardId);
          if (!card) return null;
          const boost = boosts.get(cardId);
          return {
            cardName: card.card_name,
            bankName: bankName[card.bank_id] ?? "",
            rate: info.rate,
            isAccelerated: info.category !== "base",
            // Reported separately from `rate`: the accelerator only pays
            // out if the purchase is routed through the portal, so it
            // must not be presented as the rate earned by tapping.
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
        // Rank on the best rate reachable with the card, not just the
        // tap rate. HDFC Infinia earns 3.3 at a pharmacy counter but far
        // more through SmartBuy — ranking on the tap rate alone buries
        // the card that would actually be the best choice here.
        .sort(
          (a: any, b: any) =>
            Math.max(b.rate, b.portal?.rate ?? 0) -
            Math.max(a.rate, a.portal?.rate ?? 0)
        );

      const top = cards.slice(0, 5);

      // A card whose accelerator has an unconfirmed multiplier cannot be
      // ranked on it — we would be asserting a number we don't have. But
      // dropping it entirely hides a real partnership the user could act
      // on, so append those separately, capped, and clearly caveated.
      const extraPartners = cards
        .slice(5)
        .filter((c: any) => c.portal && c.portal.rate == null)
        .slice(0, 3);

      cards = [...top, ...extraPartners];
    }

    return NextResponse.json(
      {
        merchant: resolution.merchantName ?? merchant,
        category: resolution.category,
        source: resolution.source,
        cards,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: corsHeaders() }
    );
  }
}
