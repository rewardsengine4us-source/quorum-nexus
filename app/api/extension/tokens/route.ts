import { NextRequest } from "next/server";
import { requireWebsiteUser } from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { getTokensForUser } from "@/lib/extensionService";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireWebsiteUser(req);
    const tokens = await getTokensForUser(userId);

    return json(200, {
      tokens: tokens.map((t: any) => ({
        id: t.id,
        label: t.label,
        created_at: t.created_at,
        last_used_at: t.last_used_at,
        revoked_at: t.revoked_at,
      })),
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
