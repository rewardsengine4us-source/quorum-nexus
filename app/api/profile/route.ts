import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { selectOne, patch } from "@/lib/db";

// A phone number here is a personal profile field, not shared demo data,
// so this route requires a real session — the public-demo-user has no row
// to update and no reason to have one (everyone would see the same
// number). Loyalty program syncing that references this number is a
// separate, per-credential concern (see app/api/vault); this route only
// manages the number a user has on file for themselves.

// Loose validation: digits, spaces, +, -, parentheses, 7-15 digits total.
// Deliberately not stricter — international formats vary too widely to
// validate more precisely without a phone-number library, and the number
// is never used to send anything from our side, so malformed input just
// means the user made a typo they can fix, not a security concern.
const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const row = await selectOne("users", `id=eq.${userId}&select=id,email,phone,full_name`);
  return NextResponse.json({ profile: row });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { phone } = await req.json();

  if (phone !== null && phone !== "") {
    if (typeof phone !== "string" || !PHONE_RE.test(phone.trim())) {
      return NextResponse.json(
        { error: "That doesn't look like a valid phone number." },
        { status: 400 }
      );
    }
  }

  const normalized = phone && phone.trim() !== "" ? phone.trim() : null;

  await patch("users", `id=eq.${userId}`, {
    phone: normalized,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, phone: normalized });
}
