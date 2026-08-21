import { NextRequest } from "next/server";
import {
  requireWebsiteUser,
  generatePairingCode,
  sha256Hex,
  getClientIp,
  RateLimiter,
} from "@/lib/extensionAuth";
import { json } from "@/lib/extensionCors";
import { insert, select } from "@/lib/db";

const createLimiter = new RateLimiter(3600000, 8); // 8 per hour per user
const expireLimiter = new RateLimiter(3600000, 3); // max 3 unexpired at once

export async function POST(req: NextRequest) {
  try {
    const userId = await requireWebsiteUser(req);
    const clientIp = getClientIp(req);

    // Rate limit: 8 codes per user per hour
    if (!createLimiter.check(`create:${userId}`)) {
      return json(429, { error: "Too many pairing code requests" });
    }

    // Check for unexpired codes
    const unexpired = await select(
      "extension_pairing_codes",
      `user_id=eq.${userId}&used_at=is.null` +
        `&expires_at=gt.${new Date().toISOString()}&select=id`
    );

    if (unexpired && unexpired.length >= 3) {
      return json(400, {
        error: "You have too many active pairing codes. Revoke one first.",
      });
    }

    // Generate code
    const plainCode = generatePairingCode();
    const codeHash = sha256Hex(plainCode);
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();

    // Store hash only
    await insert("extension_pairing_codes", {
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
      client_ip: clientIp,
    });

    // Return plaintext code ONLY in this response
    return json(200, {
      code: plainCode,
      display: plainCode,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
