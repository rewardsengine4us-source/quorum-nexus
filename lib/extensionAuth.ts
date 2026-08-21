import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "./supabaseServer";

/**
 * SHA-256 hex digest of a string
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Timing-safe comparison of two hex strings
 * Prevents timing-based attacks that could leak hash prefixes
 */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a random pairing code: 10 chars from custom alphabet
 * Alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0, 1 to avoid confusion)
 * Format: XXXXX-XXXXX (with dash for readability)
 */
export function generatePairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Generate a bearer token: "qn_ext_" + 32 random bytes in base64url
 * Returns plaintext; hash before storing in DB
 */
export function generateBearerToken(): string {
  const random = randomBytes(32).toString("base64url");
  return `qn_ext_${random}`;
}

/**
 * Extract client IP from request, checking X-Forwarded-For first
 */
export function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? null;
}

/**
 * Require authenticated website session (rejects public-demo-user)
 * Returns userId if valid session, throws if not authenticated or demo user
 */
export async function requireWebsiteUser(req: NextRequest): Promise<string> {
  const supabase = createSupabaseServerClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Not authenticated");
  }

  // Demo user cannot create pairing codes
  if (user.id === "public-demo-user") {
    throw new Error("Demo user cannot create pairing codes");
  }

  return user.id;
}

/**
 * Require bearer token authentication (from extension)
 * Returns { userId, tokenId } if valid, throws if invalid
 */
export async function requireExtensionUser(
  req: NextRequest
): Promise<{ userId: string; tokenId: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("Missing bearer token");
  }

  const tokenHash = sha256Hex(token);
  const { select } = await import("@/lib/db");

  const tokens = await select(
    "extension_tokens",
    `token_hash=eq.${tokenHash}&select=id,user_id,revoked_at`
  );

  if (!tokens || tokens.length === 0) {
    throw new Error("Invalid or expired token");
  }

  const tokenRecord = tokens[0];
  if (tokenRecord.revoked_at) {
    throw new Error("Token has been revoked");
  }

  return {
    userId: tokenRecord.user_id,
    tokenId: tokenRecord.id,
  };
}

/**
 * Simple in-memory rate limiter with sliding window
 * Used for pairing code generation (per-user) and exchange (per-IP)
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private window: number; // milliseconds
  private max: number;

  constructor(windowMs: number = 3600000, maxRequests: number = 8) {
    this.window = windowMs;
    this.max = maxRequests;
  }

  check(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Bucket expired or doesn't exist
      this.buckets.set(key, { count: 1, resetAt: now + this.window });
      return true;
    }

    if (bucket.count < this.max) {
      bucket.count++;
      return true;
    }

    return false;
  }

  remaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) {
      return this.max;
    }
    return Math.max(0, this.max - bucket.count);
  }
}
