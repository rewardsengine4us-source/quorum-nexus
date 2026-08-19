import { NextResponse } from "next/server";
import { del } from "@/lib/db";
import { getSessionUserId } from "@/lib/supabaseServer";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    await del(
      "email_connections",
      `user_id=eq.${userId}&oauth_provider=eq.gmail`
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
