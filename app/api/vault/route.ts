import { NextRequest, NextResponse } from "next/server";
import { select } from "@/lib/db";
import {
  listEntries,
  storeCredential,
  removeCredential,
  setSyncEnabled,
  vaultReady,
  ALLOWED_SCOPE,
  CONSENT_VERSION,
} from "@/lib/vault";

export async function GET() {
  try {
    const [entries, adapters] = await Promise.all([
      listEntries(),
      select("loyalty_sync_adapters", "select=*&order=display_name.asc"),
    ]);

    return NextResponse.json({
      ready: vaultReady(),
      scope: ALLOWED_SCOPE,
      consentVersion: CONSENT_VERSION,
      entries,
      adapters,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "toggle") {
      await setSyncEnabled(Number(body.credentialId), !!body.enabled);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "store") {
      if (!body.consent) {
        return NextResponse.json(
          { error: "Consent is required before storing a credential." },
          { status: 400 }
        );
      }

      // The client identifies programs by code; resolve to an id here so the
      // UI never has to know internal ids.
      let programId = Number(body.programId);
      if (!programId && body.programCode) {
        const rows = await select(
          "loyalty_programs",
          `program_code=eq.${encodeURIComponent(String(body.programCode))}&select=id&limit=1`
        );
        programId = rows[0]?.id;
      }
      if (!programId) {
        return NextResponse.json(
          { error: "Unknown loyalty program." },
          { status: 400 }
        );
      }

      const { id } = await storeCredential({
        programId,
        username: String(body.username ?? ""),
        secret: String(body.secret ?? ""),
      });
      return NextResponse.json({ ok: true, id });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    // Never echo the request body back — it contains a password.
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }
    await removeCredential(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
