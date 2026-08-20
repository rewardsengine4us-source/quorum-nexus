// Middleware is minimal now since auth is not required.
// We keep the response passing through unchanged.
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Public access — no session validation needed.
  return NextResponse.next({ request: { headers: request.headers } });
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
