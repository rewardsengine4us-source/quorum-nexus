import { NextRequest } from "next/server";
import { requireExtensionUser, requireWebsiteUser } from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { revokeToken } from "@/lib/extensionService";
import { selectOne } from "@/lib/db";

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

      // Verify ownership (service-role lookup, since token belongs to userId)
      const data = await selectOne(
        "extension_tokens",
        `id=eq.${token_id}&user_id=eq.${userId}&select=id`
      );

      if (!data) {
        return json(404, { error: "Token not found" });
      }

      tokenId = token_id;
    }

    if (!tokenId) {
      return json(400, { error: "No token to revoke" });
    }

    await revokeToken(tokenId);

    return json(200, { ok: true, revoked: true });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
