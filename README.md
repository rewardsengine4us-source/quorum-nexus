# Quorum Nexus

Credit card points transfer optimizer & voucher redemption platform.

## Stack

- Next.js 14 (App Router, TypeScript, Tailwind)
- Supabase (Postgres + RLS) — project `quorum-nexus-prod`
- Vercel (deployment)
- Gmail API (googleapis) — live email sync for loyalty-point balances
- pdf-parse — fallback extraction from PDF statement attachments

## Project history

This repo previously held an early prototype (Razorpay checkout, phone/email
OTP auth, dummy voucher data). That work is preserved in git history but is
no longer the active codebase — it was superseded by a real, working product
that was for a time deployed directly to Vercel via one-off file-tree
uploads, disconnected from this repo. This commit reunifies the two: the
code here now matches what's actually live in production, and going forward
changes should land as normal commits/PRs, not ad-hoc redeploys.

## Status

- No real user authentication yet. The landing page has an **Enter** button
  that sets a local flag and drops every visitor into the same fixed demo
  account (`demo-user-001`, seeded in `public.users`).
- Gmail sync is real and live: OAuth connect, deep search across recent
  mail, regex-based extraction of loyalty-program balances (with
  anti-false-positive guards), PDF statement parsing when no plain-text
  balance is found, and best-effort credit-card auto-linking from email
  content. See `lib/parser.ts` and `app/api/email/`.
- Server-side privileged Supabase access goes through `lib/db.ts` — a
  hand-written PostgREST client — not `@supabase/supabase-js`. supabase-js's
  server-side client was found to silently return empty results despite
  valid `service_role` access; root cause undetermined, so all privileged
  reads/writes were moved off it rather than continuing to debug blind.
- Redemption ("Redeem" tab) is simulated — no real payment gateway is
  called. Orders are written straight to `voucher_orders` and instantly
  marked `completed` with a mock voucher code.
- Client-side reads (catalog tables, user-owned tables scoped by RLS) go
  through the anon/publishable Supabase key directly from the browser.
  `email_connections` / `email_parsing_logs` are **not** browser-readable —
  RLS grants those to `service_role` only — so those two tables are always
  read via `/api/email/status`, never via the browser Supabase client.

## Running locally

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:3000 and click **Enter**.

Required environment variables (set in Vercel project settings — never
commit real values):

\`\`\`
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only, used by lib/db.ts
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_APP_URL
GOOGLE_CLOUD_PROJECT_ID
\`\`\`

## Pages

- `/` — landing page / Enter gate
- `/dashboard` — linked cards, points balances overview
- `/cards` — link/unlink cards, edit points balances per loyalty program
- `/routes` — transfer route explorer (card → loyalty program, ranked by
  health score, with bonus %, devaluation risk, sweet spot ranges)
- `/wishlist` — redemption goals (destination, class of travel, points needed)
- `/redeem` — voucher partner catalog + simulated redemption flow
- `/email-settings` — connect Gmail, trigger a manual sync, view parsing history

## Roadmap (in progress)

- Loyalty-program login sync (weekly + on-demand), scoped to points/expiry/
  transfer-bonus data only, via an encrypted credential vault
- Offer auto-activation across linked issuers (MaxRewards-style)
- QR scanner with merchant-name-to-MCC fallback for in-store "best card"
  recommendations
- Companion Chrome extension for best-card-at-checkout on e-commerce sites
- Card affiliate links + click-through income tracking
- Real user authentication (schema has an `otp_codes` table, suggesting phone OTP)
- Real Razorpay integration for voucher purchases (fields already exist on
  `voucher_orders`: `razorpay_order_id`, `razorpay_payment_id`)
- `user_alerts` / `devaluation_alerts` UI (tables exist, unused by the UI so far)
- `community_notes` UI (tables exist, unused by the UI so far)
