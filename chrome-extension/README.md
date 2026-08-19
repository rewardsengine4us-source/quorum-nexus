# Quorum Nexus — Chrome Extension (MVP)

Shows the best-earning card for the site you're currently on, via badge text
and a popup. Talks to `GET /api/public/best-card` on the main app — no login,
no cookies, no data stored beyond the current tab's merchant/domain in memory.

## What it does

- Content script reads `og:site_name` / `application-name` meta tags (or
  falls back to the hostname) to guess the merchant, plus the domain.
- Background service worker calls the public API, caches the result per tab,
  and sets the toolbar badge to the top card's multiplier (e.g. "5x").
- Popup shows the full ranked list.

## What it deliberately doesn't do yet

- No login / linked-card awareness — recommendations are ranked against the
  full catalog, not narrowed to cards you actually hold. Wiring that in
  requires either (a) an OAuth-style pairing flow between the extension and
  your Quorum Nexus account, or (b) a paste-in API key. Neither is built.
- No checkout-page-specific parsing (cart total, payment method already
  selected, etc.) — merchant identity only, at the tab level.
- No Chrome Web Store listing — this loads as an unpacked/dev extension only,
  which caps installs at people who load it manually. Publishing needs a
  one-time $5 Chrome Web Store developer registration and a review pass
  (usually a few days), plus real icon assets (see below).
- Icons are currently omitted from the manifest — Chrome shows its default
  puzzle-piece icon. Needs real 16/48/128px PNGs before a store listing.

## Local install (for testing)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this `chrome-extension/` folder
4. Visit any site — the toolbar badge should populate within a second or two

## API it depends on

`GET https://quorum-nexus.vercel.app/api/public/best-card?merchant=X&domain=Y`

Rate-limited to 30 req/min per IP (in-memory, per serverless instance — not a
hard global cap, just a deterrent against catalog scraping).
