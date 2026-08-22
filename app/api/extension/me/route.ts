import { NextRequest } from "next/server";
import { requireExtensionUser, getClientIp } from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { updateTokenLastUsed } from "@/lib/extensionService";

export async function GET(req: NextRequest) {
  try {
    const { userId, tokenId } = await requireExtensionUser(req);
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    // Touch last_used_at
    await updateTokenLastUsed(tokenId, clientIp, userAgent);

    return json(200, {
      ok: true,
      connected: true,
      user_id: userId,
      last_used_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return json(401, { error: err.message });
  }
}
