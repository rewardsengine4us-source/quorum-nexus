// AES-256-GCM envelope for credential secrets.
//
// The key comes from CREDENTIAL_ENCRYPTION_KEY and never touches the
// database, so a Postgres dump on its own cannot recover a credential.
// Every value gets a fresh random IV, and GCM's auth tag makes tampering
// detectable rather than silently decrypting to garbage.
//
// Server-only. Importing this from a client component would leak the key
// into the browser bundle.

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the GCM standard
const KEY_BYTES = 32;

export interface Sealed {
  cipher: string;
  iv: string;
  tag: string;
}

function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it to the Vercel project."
    );
  }

  // Accept base64 or hex; both are common ways to paste a 32-byte key.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`
    );
  }
  return key;
}

/** True when a usable key is configured — lets the UI fail loudly but safely. */
export function encryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): Sealed {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: Sealed): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(sealed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(sealed.cipher, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Constant-time comparison, for anything that compares a secret-derived
 * value (cron tokens, webhook signatures).
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
