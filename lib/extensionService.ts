/**
 * High-level data access layer for extension pairing & loyalty sync
 */

import { select, selectOne, insert, update } from "@/lib/db";

export async function getPairingCodesForUser(userId: string) {
  return select(
    "extension_pairing_codes",
    `user_id=eq.${userId}&select=id,created_at,expires_at,used_at` +
      `&order=created_at.desc&limit=10`
  );
}

export async function getTokensForUser(userId: string) {
  return select(
    "extension_tokens",
    `user_id=eq.${userId}&select=id,label,created_at,last_used_at,revoked_at` +
      `&order=created_at.desc`
  );
}

export async function getSyncLogsForUser(userId: string, limit = 50) {
  return select(
    "extension_sync_logs",
    `user_id=eq.${userId}&select=*` +
      `&order=created_at.desc&limit=${limit}`
  );
}

export async function getPrograms() {
  return select(
    "loyalty_programs",
    `is_active=eq.true&select=id,program_code,program_name,partner_type` +
      `&order=program_name`
  );
}

export async function getProgramByCode(code: string) {
  return selectOne(
    "loyalty_programs",
    `program_code=eq.${code}&select=id,program_code,program_name`
  );
}

export async function recordSync(
  userId: string,
  tokenId: string | null,
  programId: string,
  programCode: string,
  balance: number,
  expiryDate?: string,
  pageHost?: string,
  clientIp?: string
) {
  // Insert sync log
  await insert("extension_sync_logs", {
    user_id: userId,
    token_id: tokenId,
    program_id: programId,
    program_code: programCode,
    balance,
    expiry_date: expiryDate || null,
    page_host: pageHost || null,
    sync_status: "success",
    client_ip: clientIp || null,
    created_at: new Date().toISOString(),
  });

  // Upsert user_points
  const { data, error } = await (
    await import("@/lib/supabaseClient")
  ).supabase
    .from("user_points")
    .upsert(
      {
        user_id: userId,
        program_id: programId,
        total_points: balance,
        last_updated: new Date().toISOString(),
        source: "extension",
        last_source_host: pageHost || null,
      },
      { onConflict: "user_id,program_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTokenLastUsed(
  tokenId: string,
  lastIp: string | null,
  lastUserAgent: string | null
) {
  return update("extension_tokens", tokenId, {
    last_used_at: new Date().toISOString(),
    last_ip: lastIp,
    last_user_agent: lastUserAgent,
  });
}

export async function revokeToken(tokenId: string) {
  return update("extension_tokens", tokenId, {
    revoked_at: new Date().toISOString(),
  });
}
