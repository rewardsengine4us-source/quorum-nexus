# Quorum Nexus

Credit card points transfer optimizer & voucher redemption platform.

## Stack

- Next.js 14 (App Router, TypeScript, Tailwind)
- Supabase (Postgres + RLS) — project `quorum-nexus-prod`
- Vercel (deployment)

## Status

- Real authentication via Supabase Auth magic links — any visitor can sign
  themselves up with just an email address, no password. `public.users`
  gets a row automatically via a trigger on `auth.users` insert/update.
  Row Level Security on every user-owned table (`user_cards`, `user_points`,
  `user_wishlists`, `voucher_orders`, `users`) keys on `auth.uid()`, so a
  session only ever sees its own rows — enforced by Postgres, not app code.
- Redemption ("Redeem" tab) is simulated — no real payment gateway is called.
  Orders are written straight to `voucher_orders` and instantly marked
  `completed` with a mock voucher code.
- Data layer talks to Supabase directly from the browser using the anon/
  publishable key (`lib/supabaseClient.ts`, cookie-based session via
  `@supabase/ssr`). Server routes that need to know who's calling read the
  session from the request cookie (`lib/supabaseServer.ts`) rather than
  trusting a client-supplied user id. Catalog tables (banks, credit_cards,
  loyalty_programs, transfer_routes, voucher_partners) are public-read.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000, enter an email, and click the link sent to
your inbox. Supabase's local dev email delivery depends on your project's
SMTP configuration — Supabase's built-in email service works out of the box
for testing.

Environment variables are already filled in `.env.local` (Supabase URL +
publishable/anon key — safe to expose client-side, RLS protects the data).

## Pages

- `/` — landing page / magic-link sign-in
- `/dashboard` — linked cards, points balances overview
- `/cards` — link/unlink cards, edit points balances per loyalty program
- `/routes` — transfer route explorer (card → loyalty program, ranked by
  health score, with bonus %, devaluation risk, sweet spot ranges)
- `/wishlist` — redemption goals (destination, class of travel, points needed)
- `/redeem` — voucher partner catalog + simulated redemption flow
- `/alerts` — confirmed loyalty program devaluations, sourced and dated

## Next steps (not yet built)

- Offer auto-activation (blocked on hosting a headless browser — Vercel's
  serverless runtime can't run one; needs a separate worker or hosted
  browser service)
- Chrome extension auth pairing (extension currently only calls the public,
  unauthenticated `/api/public/best-card` endpoint — no session)
- Live seat availability (`SEATS_AERO_API_KEY` not yet configured)
- Real Razorpay integration for voucher purchases (fields already exist on
  `voucher_orders`: `razorpay_order_id`, `razorpay_payment_id`)
- `user_alerts` UI (table exists, unused by the UI so far)
- `community_notes` UI (table exists, unused by the UI so far)
- The unused `otp_codes` table can be dropped — magic link auth uses
  Supabase's own token flow, not this hand-rolled one
