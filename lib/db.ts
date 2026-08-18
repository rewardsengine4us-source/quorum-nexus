// Server-only PostgREST client.
//
// Why this exists instead of @supabase/supabase-js on the server:
// supabase-js v2's server-side client was observed silently returning empty
// result sets (no error thrown) against tables the service_role key
// genuinely had access to — confirmed by an identical raw fetch() against
// the same URL/key returning the correct rows. Root cause was never fully
// pinned down; rather than keep guessing, all privileged server-side reads
// and writes go through this thin, dependency-free PostgREST wrapper instead.
//
// NEVER import this from a "use client" component — SUPABASE_SERVICE_ROLE_KEY
// must never reach the browser bundle.

const BASE_URL =
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/rest/v1/";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const DEMO_USER_ID = "demo-user-001";
export const SERVICE_KEY_PRESENT = !!SERVICE_ROLE_KEY;

function headers(extra?: Record<string, string>) {
  const h: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };
  if (extra) Object.assign(h, extra);
  return h;
}

async function request(
  method: string,
  path: string,
  body?: any,
  extraHeaders?: Record<string, string>
) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: headers(extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const msg = (json && json.message) || String(text).slice(0, 200);
    throw new Error(`postgrest ${res.status}: ${msg}`);
  }
  return json;
}

/** SELECT — query string is everything after "?" (e.g. "user_id=eq.demo-user-001&select=*") */
export async function select(table: string, query: string): Promise<any[]> {
  const rows = await request("GET", `${table}?${query}`);
  return Array.isArray(rows) ? rows : [];
}

/** SELECT one row, or null. */
export async function selectOne(table: string, query: string) {
  const rows = await select(table, `${query}&limit=1`);
  return rows.length ? rows[0] : null;
}

/** INSERT one or many rows. Returns the inserted rows. */
export async function insert(table: string, rows: any) {
  return request("POST", table, rows, { Prefer: "return=representation" });
}

/**
 * UPSERT via POST + on_conflict. Requires a matching UNIQUE index on the
 * conflict target — a *partial* unique index will not satisfy PostgREST's
 * on_conflict resolution and returns a 400.
 */
export async function upsert(
  table: string,
  rows: any,
  onConflict: string,
  ignoreDuplicates = false
) {
  const q = `${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const resolution = ignoreDuplicates
    ? "resolution=ignore-duplicates"
    : "resolution=merge-duplicates";
  return request("POST", q, rows, {
    Prefer: `${resolution},return=minimal`,
  });
}

export async function patch(table: string, query: string, body: any) {
  return request("PATCH", `${table}?${query}`, body, {
    Prefer: "return=minimal",
  });
}

export async function del(table: string, query: string) {
  return request("DELETE", `${table}?${query}`, undefined, {
    Prefer: "return=minimal",
  });
}
