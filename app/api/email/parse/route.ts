import { NextResponse } from "next/server";
import { runSync } from "@/lib/gmailSync";

export async function POST() {
  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Email sync error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET mirrors POST so a sync can be triggered from a plain browser
// navigation or fetch() during testing, without wiring up a UI button.
export async function GET() {
  return POST();
}
