import { NextResponse } from "next/server";

/**
 * JSON response with security headers for extension API endpoints
 * Prevents caching, clickjacking, and XSS
 */
export function json(
  status: number,
  body: Record<string, any>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
    },
  });
}
