import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { del, insert, DEMO_USER_ID } from "@/lib/db";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
);

function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin));
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) return redirect(req, `/email-settings?error=${error}`);
  if (!code) return redirect(req, `/email-settings?error=no_code`);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress || "unknown";

    // Replace any prior connection for this user+provider rather than
    // accumulating duplicate rows across reconnects.
    await del(
      "email_connections",
      `user_id=eq.${DEMO_USER_ID}&oauth_provider=eq.gmail`
    );
    await insert("email_connections", {
      user_id: DEMO_USER_ID,
      oauth_provider: "gmail",
      email,
      access_token: tokens.access_token || "",
      refresh_token: tokens.refresh_token,
    });

    return redirect(req, "/email-settings");
  } catch (err: any) {
    console.error("Gmail OAuth callback error:", err);
    return redirect(req, `/email-settings?error=${encodeURIComponent(err.message || "unknown")}`);
  }
}
