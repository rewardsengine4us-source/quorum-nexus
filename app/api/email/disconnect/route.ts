import { NextResponse } from "next/server";
import { del } from "@/lib/db";
import { getUserIdOrPublic } from "@/lib/publicSession";

export async function POST() {
  const userId = await getUserIdOrPublic();

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
