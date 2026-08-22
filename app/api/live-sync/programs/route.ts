import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/supabaseServer";
import { selectOne } from "@/lib/db";
import { browserlessConfigured } from "@/lib/browserless";
import { LIVE_SYNC_PROGRAMS } from "@/lib/liveSyncPrograms";

export const dynamic = "force-dynamic";

/**
 * What the live-sync page needs to render itself: which programs are
 * wired up, whether the deployment can actually run a browser, and whether
 * this user has the phone number the whole flow depends on.
 */
export async function GET() {
  const userId = await getSessionUserId();

  let phone: string | null = null;
  if (userId) {
    const profile = await selectOne("users", `id=eq.${userId}&select=phone`);
    phone = profile?.phone ?? null;
  }

  return NextResponse.json({
    signedIn: !!userId,
    configured: browserlessConfigured(),
    phone,
    programs: LIVE_SYNC_PROGRAMS.map((p) => ({
      code: p.code,
      name: p.name,
      loginUrl: p.loginUrl,
    })),
  });
}
