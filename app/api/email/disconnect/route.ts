import { NextResponse } from "next/server";
import { del, DEMO_USER_ID } from "@/lib/db";

export async function POST() {
  try {
    await del(
      "email_connections",
      `user_id=eq.${DEMO_USER_ID}&oauth_provider=eq.gmail`
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
