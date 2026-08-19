import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * createClient() throws synchronously on a malformed URL. Because this
 * module is imported by every page, that turned one bad environment
 * variable into a total build failure: Next.js prerenders each route at
 * build time, the constructor threw, and five pages failed at once with
 * "Invalid supabaseUrl". A misconfigured key should degrade one feature,
 * not take the whole site down.
 *
 * So validate here and fall back to a syntactically valid but unroutable
 * host. The build completes, pages render, and data calls fail with an
 * error the UI already handles — while the misconfiguration is logged
 * loudly enough to find.
 */
function safeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return value;
    }
  } catch {
    // fall through
  }
  // eslint-disable-next-line no-console
  console.error(
    `[quorum-nexus] NEXT_PUBLIC_SUPABASE_URL is missing or malformed (got: ${
      value ? JSON.stringify(value.slice(0, 40)) : "empty"
    }). Expected something like https://<project-ref>.supabase.co. ` +
      "Data loading will fail until this is corrected in the deployment environment."
  );
  return "https://unconfigured.invalid";
}

if (!supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[quorum-nexus] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Data loading will fail."
  );
}

export const supabase = createClient<Database>(safeUrl(rawUrl), supabaseAnonKey);

// There is no real authentication in this build (dummy Enter gate).
// Every read/write in the app is scoped to this fixed demo user id,
// which matches the row seeded in `public.users` and the RLS policies
// applied alongside it.
export const DEMO_USER_ID = "demo-user-001";
