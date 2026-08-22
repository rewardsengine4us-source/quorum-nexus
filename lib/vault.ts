// Credential vault operations.
//
// Everything that touches a plaintext credential lives here, so the blast
// radius is one file. Callers get back structured sync results, never the
// credential itself.

import { select, selectOne, insert, patch, del } from "@/lib/db";
import { seal, open, encryptionAvailable, type Sealed } from "@/lib/crypto";

/** The only things we are permitted to read from a loyalty account. */
export const ALLOWED_SCOPE = ["points", "expiry", "transfer_bonus"] as const;
export type ScopeItem = (typeof ALLOWED_SCOPE)[number];

export const CONSENT_VERSION = "v1";

export interface VaultEntry {
  id: number;
  programId: number;
  programName: string;
  scope: string[];
  syncEnabled: boolean;
  syncFrequency: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  consentAt: string;
}

export interface SyncOutcome {
  status: "success" | "failed" | "unsupported";
  points?: number | null;
  expiry?: string | null;
  transferBonus?: string | null;
  error?: string;
}

export function vaultReady(): boolean {
  return encryptionAvailable();
}

/** Never returns secrets — only metadata safe to render. */
export async function listEntries(userId: string): Promise<VaultEntry[]> {
  const rows = await select(
    "loyalty_credentials",
    `user_id=eq.${userId}&select=id,program_id,scope,sync_enabled,sync_frequency,` +
      `last_sync_at,last_sync_status,last_sync_error,consecutive_failures,consent_at` +
      `&order=id.asc`
  );
  if (!rows.length) return [];

  const programs = await select("loyalty_programs", "select=id,program_name");
  const nameById: Record<number, string> = {};
  for (const p of programs) nameById[p.id] = p.program_name;

  return rows.map((r: any) => ({
    id: r.id,
    programId: r.program_id,
    programName: nameById[r.program_id] ?? `Program ${r.program_id}`,
    scope: r.scope ?? [],
    syncEnabled: r.sync_enabled,
    syncFrequency: r.sync_frequency,
    lastSyncAt: r.last_sync_at,
    lastSyncStatus: r.last_sync_status,
    lastSyncError: r.last_sync_error,
    consecutiveFailures: r.consecutive_failures ?? 0,
    consentAt: r.consent_at,
  }));
}

export async function storeCredential(opts: {
  userId: string;
  programId: number;
  username: string;
  secret: string;
}): Promise<{ id: number }> {
  const userId = opts.userId;

  if (!vaultReady()) {
    throw new Error(
      "Credential encryption is not configured. Set CREDENTIAL_ENCRYPTION_KEY " +
        "before storing any credential."
    );
  }
  if (!opts.username || !opts.secret) {
    throw new Error("Both username and password are required.");
  }

  const u = seal(opts.username);
  const s = seal(opts.secret);

  const row = {
    user_id: userId,
    program_id: opts.programId,
    username_cipher: u.cipher,
    username_iv: u.iv,
    username_tag: u.tag,
    secret_cipher: s.cipher,
    secret_iv: s.iv,
    secret_tag: s.tag,
    scope: ALLOWED_SCOPE,
    consent_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
    sync_enabled: true,
    sync_frequency: "weekly",
  };

  // Replace rather than duplicate — one credential per program per user.
  await del(
    "loyalty_credentials",
    `user_id=eq.${userId}&program_id=eq.${opts.programId}`
  );
  const created = await insert("loyalty_credentials", row);
  return { id: Array.isArray(created) ? created[0]?.id : created?.id };
}

export async function removeCredential(
  credentialId: number,
  userId: string
): Promise<void> {
  await del("loyalty_credentials", `id=eq.${credentialId}&user_id=eq.${userId}`);
}

export async function setSyncEnabled(
  credentialId: number,
  enabled: boolean,
  userId: string
): Promise<void> {
  await patch("loyalty_credentials", `id=eq.${credentialId}&user_id=eq.${userId}`, {
    sync_enabled: enabled,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Decrypt for the duration of one sync attempt. Callers must not persist,
 * log, or return the result.
 */
async function withCredential<T>(
  credentialId: number,
  fn: (username: string, secret: string, row: any) => Promise<T>
): Promise<T> {
  const row = await selectOne("loyalty_credentials", `id=eq.${credentialId}&select=*`);
  if (!row) throw new Error("Credential not found.");

  const username = open({
    cipher: row.username_cipher,
    iv: row.username_iv,
    tag: row.username_tag,
  } as Sealed);
  const secret = open({
    cipher: row.secret_cipher,
    iv: row.secret_iv,
    tag: row.secret_tag,
  } as Sealed);

  return fn(username, secret, row);
}

/**
 * Adapter contract. A real adapter logs into the program portal and returns
 * only points / expiry / transfer bonus.
 *
 * None are implemented yet, and that is a deliberate stopping point rather
 * than an oversight — see runSyncFor() below.
 */
export type ProgramAdapter = (
  username: string,
  secret: string
) => Promise<SyncOutcome>;

const ADAPTERS: Record<string, ProgramAdapter> = {
  // Intentionally empty. Populating this requires a browser runtime that
  // Vercel's serverless functions cannot provide (see runSyncFor).
};

export async function runSyncFor(
  credentialId: number,
  trigger: "scheduled" | "manual" = "manual"
): Promise<SyncOutcome> {
  const startedAt = new Date().toISOString();

  return withCredential(credentialId, async (username, secret, row) => {
    const program = await selectOne(
      "loyalty_programs",
      `id=eq.${row.program_id}&select=program_code,program_name`
    );
    const adapter = program ? ADAPTERS[program.program_code] : undefined;

    let outcome: SyncOutcome;
    if (!adapter) {
      outcome = {
        status: "unsupported",
        error:
          `No automated adapter is enabled for ${program?.program_name ?? "this program"} yet. ` +
          `Running one requires a headless browser, which Vercel's serverless ` +
          `runtime cannot host — it needs a hosted browser service or a separate ` +
          `worker. Credentials remain encrypted and unused until then.`,
      };
    } else {
      try {
        outcome = await adapter(username, secret);
      } catch (err: any) {
        outcome = { status: "failed", error: err.message };
      }
    }

    await insert("loyalty_sync_runs", {
      credential_id: credentialId,
      user_id: row.user_id,
      program_id: row.program_id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: outcome.status,
      points_found: outcome.points ?? null,
      expiry_found: outcome.expiry ?? null,
      transfer_bonus: outcome.transferBonus ?? null,
      error_message: outcome.error ?? null,
      trigger,
    });

    await patch("loyalty_credentials", `id=eq.${credentialId}`, {
      last_sync_at: new Date().toISOString(),
      last_sync_status: outcome.status,
      last_sync_error: outcome.error ?? null,
      consecutive_failures:
        outcome.status === "success" ? 0 : (row.consecutive_failures ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });

    // Only a real success writes to the user's balances.
    if (outcome.status === "success" && outcome.points != null) {
      const { upsert } = await import("@/lib/db");
      await upsert(
        "user_points",
        {
          user_id: row.user_id,
          program_id: row.program_id,
          total_points: outcome.points,
          expiry_date: outcome.expiry ?? null,
          last_updated: new Date().toISOString(),
        },
        "user_id,program_id"
      );
    }

    return outcome;
  });
}

/** Credentials whose weekly window has elapsed. */
export async function dueForSync(): Promise<number[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await select(
    "loyalty_credentials",
    `sync_enabled=eq.true&or=(last_sync_at.is.null,last_sync_at.lt.${cutoff})` +
      `&consecutive_failures=lt.5&select=id`
  );
  return rows.map((r: any) => r.id);
}
