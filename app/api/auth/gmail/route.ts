import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getSessionUserId } from "@/lib/supabaseServer";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
);

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Google's OAuth round trip carries no Quorum Nexus session state on its
// own — the callback runs as a fresh request from Google's redirect, and
// without something tying it back to who started the flow, it would have
// no way to know which account to attach the connection to. Requiring a
// live session here (rather than trusting anything echoed back through
// Google) means the callback can re-read the session itself instead of
// trusting a value that round-tripped through a third party.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.redirect(
      new URL(
        "/?error=" + encodeURIComponent("Sign in before connecting Gmail."),
        process.env.NEXT_PUBLIC_APP_URL
      )
    );
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  return NextResponse.redirect(url);
}
