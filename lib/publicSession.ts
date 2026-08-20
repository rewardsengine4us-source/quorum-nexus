// Public mode: all unauthenticated users share a demo user ID.
// This enables the site to work fully without authentication, with all
// visitors seeing and editing the same shared demo data.

import { getSessionUserId } from "./supabaseServer";

export const PUBLIC_DEMO_USER_ID = "public-demo-user";

/**
 * Get the current user's ID, or fall back to the public demo user.
 * Used in public mode to allow unauthenticated access.
 */
export async function getUserIdOrPublic(): Promise<string> {
  const userId = await getSessionUserId();
  return userId ?? PUBLIC_DEMO_USER_ID;
}
