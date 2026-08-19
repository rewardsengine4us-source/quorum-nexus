// Refreshes the Supabase session cookie on every navigation.
//
// Supabase session tokens expire; without this, a session silently goes
// stale mid-visit and API routes start returning 401s the user can't
// explain. Running the refresh here (once per request, before any page
// or API route runs) means every server-side read of the session is
// already current by the time app code sees it.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Calling getUser() (not getSession()) is what actually triggers a
  // refresh against Supabase when the access token is stale, rather than
  // just reading whatever's in the cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and image optimization files — no session
     * relevance there, and running this on every asset request would
     * add latency for nothing.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
