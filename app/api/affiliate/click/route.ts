import { NextRequest, NextResponse } from "next/server";
import { select, selectOne, insert, DEMO_USER_ID } from "@/lib/db";

/**
 * Records an apply-click and redirects to the destination.
 *
 * Redirecting server-side (rather than logging from the browser after the
 * fact) means the click is recorded even if the user's connection drops
 * mid-navigation, and keeps the tracking URL out of the page source.
 */
export async function GET(req: NextRequest) {
  const cardId = Number(req.nextUrl.searchParams.get("card"));
  if (!cardId) {
    return NextResponse.json({ error: "card is required." }, { status: 400 });
  }

  try {
    // Highest-priority live offer wins; fall back to any offer's fallback_url.
    const offers = await select(
      "affiliate_offers",
      `credit_card_id=eq.${cardId}&select=id,network,tracking_url,fallback_url,is_live` +
        `&order=is_live.desc,priority.asc&limit=1`
    );
    const offer = offers[0];

    let destination = offer?.is_live
      ? offer.tracking_url || offer.fallback_url
      : offer?.fallback_url;

    if (!destination) {
      const card = await selectOne(
        "credit_cards",
        `id=eq.${cardId}&select=official_url`
      );
      destination = card?.official_url ?? null;
    }

    if (!destination) {
      return NextResponse.json(
        { error: "No apply link is configured for this card yet." },
        { status: 404 }
      );
    }

    // Fire-and-forget: a tracking failure must never block the redirect.
    insert("affiliate_clicks", {
      offer_id: offer?.id ?? null,
      credit_card_id: cardId,
      user_id: DEMO_USER_ID,
      referrer: req.headers.get("referer"),
      device_hint: /mobile/i.test(req.headers.get("user-agent") ?? "")
        ? "mobile"
        : "desktop",
    }).catch(() => {});

    return NextResponse.redirect(destination, 302);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
