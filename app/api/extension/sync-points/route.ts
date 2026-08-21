import { NextRequest } from "next/server";
import { requireExtensionUser, getClientIp } from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import {
  recordSync,
  getProgramByCode,
  updateTokenLastUsed,
} from "@/lib/extensionService";

export async function POST(req: NextRequest) {
  try {
    const { userId, tokenId } = await requireExtensionUser(req);
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const { program_code, balance, expiry_date, captured_at, page_host } =
      await req.json();

    if (!program_code || typeof balance !== "number" || balance < 0) {
      return json(400, { error: "Invalid program_code or balance" });
    }

    // Resolve program
    const program = await getProgramByCode(program_code);
    if (!program) {
      return json(400, { error: `Unknown program: ${program_code}` });
    }

    // Record sync (inserts log + upserts user_points)
    const result = await recordSync(
      userId,
      tokenId,
      program.id,
      program_code,
      balance,
      expiry_date || undefined,
      page_host || undefined,
      clientIp || undefined
    );

    // Update token last_used_at
    await updateTokenLastUsed(tokenId, clientIp, userAgent);

    return json(200, {
      ok: true,
      program_code,
      balance: result.total_points,
      last_updated: result.last_updated,
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
