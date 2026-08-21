import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireExtensionUser, requireWebsiteUser } from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { revokeToken } from "@/lib/extensionService";

export async function POST(req: NextRequest) {
  try {
    const { token_id } = await req.json();

    let tokenId: string | null = null;

    // Two auth modes:
    // 1. Bearer: revoke self
    // 2. Session: revoke by ID (admin)
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { tokenId: tid } = await requireExtensionUser(req);
      tokenId = tid;
    } else {
      // Session auth + token_id parameter
      const userId = await requireWebsiteUser(req);
      if (!token_id) {
        return json(400, { error: "Missing token_id" });
      }

      // Verify ownership
      const supabase = createSupabaseServerClient(req);
      const { data } = await supabase
        .from("extension_tokens")
        .select("id")
        .eq("id", token_id)
        .eq("user_id", userId)
        .single();

      if (!data) {
        return json(404, { error: "Token not found" });
      }

      tokenId = token_id;
    }

    await revokeToken(tokenId);

    return json(200, { ok: true, revoked: true });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
