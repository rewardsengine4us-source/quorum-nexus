// Server-side Supabase client that reads/writes the session from Next.js
// cookies, for use inside API routes (app/api/**/route.ts).
//
// This is a different client from lib/supabaseClient.ts (anon key, browser,
// no cookie access) and lib/db.ts (service role key, bypasses RLS entirely).
// This one runs with the anon key but resolves auth.uid() from the
// requester's own session cookie, so RLS applies exactly as it would for
// that user querying from the browser -- the correct choice for routes
// where "who is this request for" should come from the session, not a
// body parameter a client could spoof.
//
// NOT for privileged operations that must read/write data the current
// user doesn't own (e.g. resolving an award chart for everyone) -- those
// still go through lib/db.ts's service-role client.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // set() throws when called from a Server Component render
            // rather than a Route Handler/Server Action. Every caller of
            // this client in this app is a Route Handler, where it's
            // always safe, but the try/catch keeps this file reusable
            // without becoming a crash site if that ever changes.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see get()'s comment
          }
        },
      },
    }
  );
}

/**
 * The signed-in user's id, or null if the request has no valid session.
 * Every API route that used to default to a shared demo user id should
 * call this and reject with 401 on null, rather than silently falling
 * back to someone else's data.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
