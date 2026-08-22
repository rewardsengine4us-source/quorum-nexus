import { NextRequest } from "next/server";
import {
  sha256Hex,
  generateBearerToken,
  hashEquals,
  getClientIp,
  RateLimiter,
} from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { select, insert, patch } from "@/lib/db";

const exchangeLimiter = new RateLimiter(900000, 20); // 20 failures per 15 min per IP

export async function POST(req: NextRequest) {
  try {
    const { code, label } = await req.json();

    if (!code || typeof code !== "string") {
      return json(400, { error: "Missing or invalid code" });
    }

    const clientIp = getClientIp(req) || "unknown";

    // Rate limit on failures
    const codeHash = sha256Hex(code);

    // Find unexpired code
    const codes = await select(
      "extension_pairing_codes",
      `code_hash=eq.${codeHash}` +
        `&expires_at=gt.${new Date().toISOString()}` +
        `&used_at=is.null` +
        `&select=id,user_id`
    );

    if (!codes || codes.length === 0) {
      // Track failure for rate limiting
      if (!exchangeLimiter.check(`fail:${clientIp}`)) {
        return json(429, { error: "Too many failed attempts" });
      }
      return json(400, { error: "Invalid or expired code" });
    }

    const codeRecord = codes[0];
    const userId = codeRecord.user_id;

    // Generate token
    const plainToken = generateBearerToken();
    const tokenHash = sha256Hex(plainToken);

    // Insert token
    await insert("extension_tokens", {
      user_id: userId,
      token_hash: tokenHash,
      label: label || "Extension Device",
      last_ip: clientIp,
    });

    // Mark code as used
    await patch("extension_pairing_codes", `id=eq.${codeRecord.id}`, {
      used_at: new Date().toISOString(),
    });

    // Return token ONLY in this response
    return json(200, {
      token: plainToken,
      label: label || "Extension Device",
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
