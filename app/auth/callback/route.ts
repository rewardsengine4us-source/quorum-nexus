import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// Where the magic link email points. Supabase appends ?code=... on
// success; exchanging it here (server-side) sets the session cookie via
// lib/supabaseServer.ts's cookie adapter before redirecting into the app,
// so the very first page load after clicking the link is already
// authenticated instead of needing a client-side round trip first.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/dashboard";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, req.nextUrl.origin)
      );
    }
  }

  return NextResponse.redirect(new URL(next, req.nextUrl.origin));
}
