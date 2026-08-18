// Core Gmail sync logic — deliberately NOT inside app/api/email/parse/route.ts,
// because Next.js App Router route files may only export HTTP-method handlers
// (GET, POST, etc.) plus a small set of reserved config names. A plain
// exported helper like `runSync` fails the build with:
//   Type error: Route "..." does not match the required types of a
//   Next.js Route. "runSync" is not a valid Route export field.

import { google } from "googleapis";
import { select, selectOne, upsert, patch, DEMO_USER_ID } from "@/lib/db";
import {
  htmlToText,
  parseEmail,
  findCard,
  extractLast4,
  type DetectionRule,
  type CardCatalogEntry,
} from "@/lib/parser";

// Three targeted searches rather than one broad query: recent statements
// are the most reliable source of a true balance figure, older mail is
// searched more narrowly to keep the total message count manageable.
const SEARCH_QUERIES = [
  'newer_than:3y ("points balance" OR "reward points balance" OR "available points" OR "total points" OR "points summary" OR "miles balance" OR "account summary" OR "your points")',
  'newer_than:2y ("credit card" statement OR "card ending" OR "card statement")',
  'newer_than:1y (points OR miles OR rewards OR loyalty OR neucoins OR supercoins OR avios OR skywards OR bonvoy OR "membership rewards" OR "reward points")',
];

const MESSAGES_PER_QUERY = 34;
const CONCURRENCY = 8;
const MAX_PDFS_PER_RUN = 8;
const MAX_PDF_BYTES = 6 * 1024 * 1024;

function headerValue(headers: any[], name: string): string {
  const h = (headers || []).find(
    (x) => x.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function extractBody(part: any): string {
  if (!part) return "";
  if (part.body?.data) {
    const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
    return part.mimeType === "text/html" ? htmlToText(decoded) : decoded;
  }
  if (part.parts) {
    // Prefer text/plain, fall back to text/html, else recurse into the first part.
    const plain = part.parts.find((p: any) => p.mimeType === "text/plain");
    const html = part.parts.find((p: any) => p.mimeType === "text/html");
    if (plain) return extractBody(plain);
    if (html) return extractBody(html);
    return part.parts.map(extractBody).join("\n");
  }
  return "";
}

interface PdfAttachment {
  attachmentId: string;
  filename: string;
  size: number;
}

function findPdfAttachments(part: any, out: PdfAttachment[] = []): PdfAttachment[] {
  if (!part) return out;
  if (
    part.filename &&
    /\.pdf$/i.test(part.filename) &&
    part.body?.attachmentId
  ) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      size: part.body.size || 0,
    });
  }
  if (part.parts) part.parts.forEach((p: any) => findPdfAttachments(p, out));
  return out;
}

export interface SyncResult {
  scanned: number;
  processed: number;
  matched: number;
  unmatched: number;
  pdfs: number;
  cardsLinked: number;
  programsTouched: number;
}

export async function runSync(): Promise<SyncResult> {
  const connection = await selectOne(
    "email_connections",
    `user_id=eq.${DEMO_USER_ID}&oauth_provider=eq.gmail&select=*`
  );
  if (!connection) {
    throw new Error("No Gmail connection found. Connect Gmail first.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
  );
  oauth2Client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
  });
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await patch("email_connections", `id=eq.${connection.id}`, {
        access_token: tokens.access_token,
      }).catch(() => {});
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Collect candidate message IDs across all queries, deduped.
  const seenIds = new Set<string>();
  for (const q of SEARCH_QUERIES) {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: MESSAGES_PER_QUERY,
    });
    for (const m of res.data.messages || []) {
      if (m.id) seenIds.add(m.id);
    }
  }

  const alreadyLogged = await select(
    "email_parsing_logs",
    `user_id=eq.${DEMO_USER_ID}&select=email_id`
  );
  const loggedIds = new Set(alreadyLogged.map((r: any) => r.email_id));
  const candidateIds = [...seenIds].filter((id) => !loggedIds.has(id));

  const rules: DetectionRule[] = await select("detection_rules", "select=*&is_active=eq.true");
  const programs = await select("loyalty_programs", "select=id,program_code");
  const programIdByCode: Record<string, number> = {};
  for (const p of programs) programIdByCode[p.program_code] = p.id;

  const cards: CardCatalogEntry[] = await select(
    "credit_cards",
    "select=id,card_name,bank_id&is_active=eq.true"
  );
  const banks = await select("banks", "select=id,bank_name");
  const bankNameById: Record<number, string> = {};
  for (const b of banks) bankNameById[b.id] = b.bank_name;

  const balances: Record<number, { value: number; when: number }> = {};
  const linkedCards: Record<number, { cardId: number; last4: string | null }> = {};
  const logRows: any[] = [];
  let pdfCount = 0;
  let matched = 0;
  let unmatched = 0;

  async function processMessage(id: string) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    const payload = msg.data.payload;
    const headers = payload?.headers || [];
    const from = headerValue(headers, "From");
    const subject = headerValue(headers, "Subject");
    const internalDate = Number(msg.data.internalDate || "0");

    const body = extractBody(payload);
    let source: "body" | "pdf" = "body";
    let parsed = parseEmail(from, subject, body, rules);

    if (!parsed.amount && pdfCount < MAX_PDFS_PER_RUN) {
      const pdfs = findPdfAttachments(payload);
      for (const pdf of pdfs) {
        if (pdfCount >= MAX_PDFS_PER_RUN) break;
        if (pdf.size > MAX_PDF_BYTES) continue;
        try {
          const att = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: id,
            id: pdf.attachmentId,
          });
          if (!att.data.data) continue;
          const buf = Buffer.from(att.data.data, "base64");
          pdfCount++;
          const pdfParse = require("pdf-parse/lib/pdf-parse.js");
          const result = await pdfParse(buf);
          const pdfParsed = parseEmail(from, subject, result.text || "", rules);
          if (pdfParsed.amount) {
            parsed = pdfParsed;
            source = "pdf";
            break;
          }
        } catch {
          // Password-protected or malformed PDFs are a known, disclosed
          // limitation — skip and move on rather than fail the whole sync.
        }
      }
    }

    const programId = parsed.programCode ? programIdByCode[parsed.programCode] : null;
    const usable = !!(programId && parsed.amount && parsed.event === "balance");

    if (usable) {
      matched++;
      const existing = balances[programId!];
      if (!existing || internalDate > existing.when) {
        balances[programId!] = { value: parsed.amount!, when: internalDate };
      }
    } else {
      unmatched++;
    }

    const fullText = `${subject}\n${body}`;
    const card = findCard(fullText, cards, bankNameById);
    if (card && !linkedCards[card.id]) {
      linkedCards[card.id] = { cardId: card.id, last4: extractLast4(fullText) };
    }

    logRows.push({
      user_id: DEMO_USER_ID,
      email_id: id,
      email_subject: subject,
      sender: from,
      extracted_balance: parsed.amount,
      program_id: programId,
      parse_status: usable ? "success" : "no_match",
      detected_via: parsed.via,
      event_type: parsed.event,
      source,
      card_hint: card ? card.card_name : null,
      raw_email_snippet: parsed.evidence,
    });
  }

  for (let i = 0; i < candidateIds.length; i += CONCURRENCY) {
    const batch = candidateIds.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((id) => processMessage(id).catch(() => {})));
  }

  if (logRows.length) {
    await upsert("email_parsing_logs", logRows, "user_id,email_id", true);
  }

  for (const [programId, { value }] of Object.entries(balances)) {
    await upsert(
      "user_points",
      {
        user_id: DEMO_USER_ID,
        program_id: Number(programId),
        total_points: value,
        last_updated: new Date().toISOString(),
      },
      "user_id,program_id"
    );
  }

  for (const { cardId, last4 } of Object.values(linkedCards)) {
    await upsert(
      "user_cards",
      {
        user_id: DEMO_USER_ID,
        credit_card_id: cardId,
        notes: last4
          ? `Detected in your inbox - ending ${last4}`
          : "Detected in your inbox",
      },
      "user_id,credit_card_id"
    );
  }

  await patch("email_connections", `id=eq.${connection.id}`, {
    last_sync_at: new Date().toISOString(),
  });

  return {
    scanned: candidateIds.length + loggedIds.size,
    processed: candidateIds.length,
    matched,
    unmatched,
    pdfs: pdfCount,
    cardsLinked: Object.keys(linkedCards).length,
    programsTouched: Object.keys(balances).length,
  };
}
