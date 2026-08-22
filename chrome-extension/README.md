# Quorum Nexus — Chrome Extension

Two things, both automatic once installed:

1. **Best card at checkout** — badge + popup showing which of your cards
   earns the most at the site you're on.
2. **Loyalty balance sync** — after pairing once with your account, the
   extension reads your points/miles balance off loyalty program sites you
   already visit and log into, and keeps it in sync on Quorum Nexus. No
   password is ever seen or stored by the extension.

## Loyalty sync: how it works (and how to add a program)

There is **one generic extractor**, not one per program. `extractor.js`
scans the visible page for a number sitting next to a balance-shaped word
("points", "miles", "avios", "balance", "rewards", "nights", ...) and picks
the closest, most plausible match. The exact same code runs on every site.

The only thing that's program-specific is `programs.js` — a flat list
mapping hostname(s) to a `program_code`:

```js
{ hosts: ["aircanada.com", "aeroplan.aircanada.com"], program: "aeroplan" },
```

**To add another program: add one line to that array.** No new extractor
function, no manifest edit, no new host permission, no rebuild of anything
else. The content script already runs on every page (same as the
checkout-detection script) and just exits immediately on the pages that
aren't a recognized loyalty site.

v1 ships with six programs pre-wired: Aeroplan, Avios (British Airways),
Accor, Marriott Bonvoy, MakeMyTrip, Air India. The generic extractor is what
makes scaling this to the full 250+ program catalog just a matter of
appending rows — it was built this way from the start rather than as a
special case.

Because the extractor is heuristic (it doesn't know each site's markup), it
can occasionally miss a balance on a page with unusual layout. The popup's
"Capture balance on this page" button re-runs it on demand as a manual
fallback for that case.

## Pairing (once per device)

1. Sign in at `quorum-nexus.vercel.app` and open **Dashboard → Extension**.
2. Click "Generate code" — you'll get a code like `AB2X9-KQ7M4`, valid 8
   minutes.
3. Open the extension popup, paste the code under "Loyalty balance sync",
   click "Pair device".

The bearer token issued by pairing lives only in the extension's background
service worker (`chrome.storage.local`), never in a content script and
never on the website. Content scripts only ever send plain numbers
(`{ program_code, balance }`) via `chrome.runtime.sendMessage` — they have
no way to read or transmit the token even if compromised by a malicious
page. Disconnecting from the popup revokes the token server-side.

## Best-card-at-checkout: how it works

- Content script reads `og:site_name` / `application-name` meta tags (or
  falls back to the hostname) to guess the merchant, plus the domain.
- Background service worker calls the public API, caches the result per tab,
  and sets the toolbar badge to the top card's multiplier (e.g. "5x").
- Popup shows the full ranked list.

This part is unauthenticated and ranks against the full card catalog, not
narrowed to cards you actually hold — pairing (above) is what personalizes
loyalty balances, not this.

## What it deliberately doesn't do yet

- No Chrome Web Store listing — this loads as an unpacked/dev extension only.
  Publishing needs a one-time $5 Chrome Web Store developer registration and
  a review pass.
- The generic extractor is tuned for common "balance widget" layouts; a
  program with an unusual UI may need the manual capture button rather than
  picking the balance up automatically.

## Local install (for testing)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this `chrome-extension/` folder
4. Visit any site — the toolbar badge should populate within a second or two
5. Pair once via the popup (see above) to enable loyalty sync

## APIs it depends on

- `GET https://quorum-nexus.vercel.app/api/public/best-card?merchant=X&domain=Y`
  — unauthenticated, rate-limited to 30 req/min per IP.
- `POST /api/extension/exchange-code`, `GET /api/extension/me`,
  `POST /api/extension/sync-points`, `POST /api/extension/revoke` — pairing
  and sync, bearer-authenticated (see `app/api/extension/` in the main repo).
