import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars are missing. Copy .env.local.example to .env.local and fill them in."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// There is no real authentication in this build (dummy Enter gate).
// Every read/write in the app is scoped to this fixed demo user id,
// which matches the row seeded in `public.users` and the RLS policies
// applied alongside it.
export const DEMO_USER_ID = "demo-user-001";
