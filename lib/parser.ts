// Regex-based extraction of loyalty-program balances, earn/redeem/expiry
// events, and credit-card linkage from real email text (subject + body,
// and PDF-statement text when no plain-text balance is found).
//
// Detection rules (sender domains, "strong"/brand-unique phrases, "weak"/
// generic brand-name phrases) live in the `detection_rules` Postgres table,
// not here — that keeps rule tuning a SQL update instead of a redeploy.

// Up to 3 leading words (e.g. "Maharaja Club Reward "), optional
// reward/bonus qualifier, then a points-currency noun.
const LEAD = "(?:[A-Za-z][A-Za-z&+'-]*\\s+){0,3}";
const CURRENCY =
  LEAD +
  "(?:reward\\s+)?(?:bonus\\s+)?(?:points?|miles|neucoins?|supercoins?|coins?|sparks|jewels|avios|qmiles|credits?|cashback(?:\\s+bonus)?)";
const NUMBER = "([\\d][\\d,]{0,14}(?:\\.\\d{1,2})?)";

const EARN_PATTERNS = [
  new RegExp(
    `(?:you(?:'ve|\\s+have)?\\s+)?earned\\s+(?:a\\s+total\\s+of\\s+)?${NUMBER}\\s*${CURRENCY}`,
    "i"
  ),
  new RegExp(
    `${NUMBER}\\s*${CURRENCY}\\s+(?:have\\s+been\\s+|has\\s+been\\s+|were\\s+|are\\s+)?(?:earned|credited|added|awarded|accrued)`,
    "i"
  ),
  new RegExp(
    `(?:credited|added|awarded)\\s+(?:you\\s+|with\\s+|your\\s+account\\s+with\\s+)?${NUMBER}\\s*${CURRENCY}`,
    "i"
  ),
];

// Currency noun is mandatory in every balance pattern — an earlier version
// made it optional and matched marketing copy like "available from 12"
// (an Amex promo) or "total 50" (an HSBC shipping notice) as balances.
const BALANCE_PATTERNS = [
  new RegExp(`${CURRENCY}\\s+balance\\s*(?:is|of|:|-)?\\s*${NUMBER}`, "i"),
  new RegExp(`balance\\s+of\\s+${NUMBER}\\s*${CURRENCY}`, "i"),
  new RegExp(
    `(?:total|current|available|closing|outstanding|unredeemed|accumulated)\\s+${CURRENCY}\\s*(?:balance)?[^\\d]{0,15}${NUMBER}`,
    "i"
  ),
  new RegExp(`you\\s+(?:now\\s+)?have\\s+${NUMBER}\\s*${CURRENCY}`, "i"),
  new RegExp(`${NUMBER}\\s*${CURRENCY}\\s+(?:are\\s+)?available`, "i"),
  new RegExp(`${CURRENCY}\\s*[:-]\\s*${NUMBER}`, "i"),
];

const EXPIRY_PATTERNS = [
  new RegExp(`${NUMBER}\\s*${CURRENCY}[^.\\n]{0,40}expir`, "i"),
  new RegExp(`expir[^.\\n]{0,40}${NUMBER}\\s*${CURRENCY}`, "i"),
];

const REDEEM_PATTERNS = [
  new RegExp(`(?:redeemed|debited|deducted)\\s+${NUMBER}\\s*${CURRENCY}`, "i"),
  new RegExp(
    `${NUMBER}\\s*${CURRENCY}\\s+(?:have\\s+been\\s+|were\\s+)?(?:redeemed|debited|deducted)`,
    "i"
  ),
];

export type EventType = "balance" | "earned" | "redeemed" | "expiring";

export interface ExtractResult {
  event: EventType;
  amount: number;
  raw: string;
}

/** Strip an HTML email body down to plain text for regex matching. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- Anti-false-positive guards -------------------------------------------

/** Reject matches immediately preceded by a currency symbol (₹1,200 is money, not points). */
function precededByMoney(text: string, index: number): boolean {
  return /(?:rs\.?|inr|usd|\$)\s*$/i.test(text.slice(Math.max(0, index - 14), index));
}

/** Reject "5X points" style multiplier callouts, not balances. */
function isMultiplier(text: string, index: number, match: string): boolean {
  return /\d\s*[xX]\s/.test(text.slice(Math.max(0, index - 3), index + match.length + 3));
}

/** Reject abbreviation truncation, e.g. "1.93L" must not parse as "1". */
function followedByLetter(text: string, index: number, raw: string): boolean {
  return /[a-zA-Z]/.test(text.charAt(index + raw.length));
}

function runPatterns(patterns: RegExp[], text: string): ExtractResult["raw"] extends never ? never : { amount: number; raw: string } | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const raw = match[1];
    const index = match.index + match[0].indexOf(raw);
    if (precededByMoney(text, index)) continue;
    if (isMultiplier(text, index, raw)) continue;
    if (followedByLetter(text, index, raw)) continue;
    const amount = parseFloat(raw.replace(/,/g, ""));
    if (!isFinite(amount) || amount <= 0) continue;
    return { amount, raw: match[0].trim() };
  }
  return null;
}

/** Priority: redeemed > balance > earned > expiring (most specific/certain first). */
export function extract(text: string): ExtractResult | null {
  const redeemed = runPatterns(REDEEM_PATTERNS, text);
  if (redeemed) return { event: "redeemed", ...redeemed };

  const balance = runPatterns(BALANCE_PATTERNS, text);
  if (balance) return { event: "balance", ...balance };

  const earned = runPatterns(EARN_PATTERNS, text);
  if (earned) return { event: "earned", ...earned };

  const expiring = runPatterns(EXPIRY_PATTERNS, text);
  if (expiring) return { event: "expiring", ...expiring };

  return null;
}

// --- Program detection ------------------------------------------------

function domainOf(from: string): string {
  const match = /@([A-Za-z0-9.-]+)/.exec(from || "");
  return match ? match[1].toLowerCase() : "";
}

function containsWord(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export interface DetectionRule {
  program_code: string;
  domains: string[];
  strong: string[];
  weak: string[];
}

export interface DetectResult {
  programCode: string;
  via: string;
}

/** Priority: sender domain match > brand-unique phrase > generic brand name. */
export function detect(
  from: string,
  text: string,
  rules: DetectionRule[]
): DetectResult | null {
  const domain = domainOf(from);
  const lower = text.toLowerCase();

  if (domain) {
    for (const rule of rules) {
      for (const d of rule.domains || []) {
        if (domain === d || domain.endsWith("." + d)) {
          return { programCode: rule.program_code, via: `sender:${d}` };
        }
      }
    }
  }
  for (const rule of rules) {
    for (const phrase of rule.strong || []) {
      if (containsWord(lower, phrase)) {
        return { programCode: rule.program_code, via: `currency:${phrase}` };
      }
    }
  }
  for (const rule of rules) {
    for (const phrase of rule.weak || []) {
      if (containsWord(lower, phrase)) {
        return { programCode: rule.program_code, via: `brand:${phrase}` };
      }
    }
  }
  return null;
}

export interface ParsedEmail {
  programCode: string | null;
  via: string | null;
  event: EventType | null;
  amount: number | null;
  evidence: string | null;
}

export function parseEmail(
  from: string,
  subject: string,
  body: string,
  rules: DetectionRule[]
): ParsedEmail {
  const text = `${subject}\n${body}`;
  const detection = detect(from, text, rules);
  const extraction = extract(text);
  return {
    programCode: detection ? detection.programCode : null,
    via: detection ? detection.via : null,
    event: extraction ? extraction.event : null,
    amount: extraction ? extraction.amount : null,
    evidence: extraction ? extraction.raw : null,
  };
}

// --- Credit-card auto-detection -----------------------------------------

// Words too generic to identify a specific card product on their own.
const STOP_WORDS = new Set([
  "bank",
  "card",
  "cards",
  "credit",
  "the",
  "club",
  "plus",
  "metal",
  "gold",
  "black",
  "charge",
  "private",
  "premier",
  "signature",
  "amex",
  "hdfc",
  "axis",
  "icici",
  "hsbc",
  "kotak",
  "yes",
  "idfc",
  "rbl",
  "sbi",
  "bob",
  "indusind",
  "federal",
]);

export interface CardCatalogEntry {
  id: number;
  card_name: string;
  bank_id: number;
}

/**
 * Match a card catalog entry against free text. Requires BOTH a distinctive
 * (>=4 char, non-stop-word) product token from the card name AND the bank's
 * name to appear in the text — matching on the product token alone produced
 * false positives (e.g. a promotional email mentioning "HSBC" and "travel"
 * in different contexts linking "HSBC Travel One").
 */
export function findCard(
  text: string,
  cards: CardCatalogEntry[],
  bankNames: Record<number, string>
): CardCatalogEntry | null {
  const padded = " " + text.toLowerCase() + " ";
  let best: { card: CardCatalogEntry; token: string } | null = null;

  for (const card of cards) {
    const tokens = String(card.card_name || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    if (!tokens.length) continue;

    const productToken = tokens[tokens.length - 1].replace(/[^a-z0-9]/g, "");
    if (productToken.length < 4) continue;
    if (!new RegExp(`\\b${productToken}\\b`).test(padded)) continue;

    const bankName = String(bankNames[card.bank_id] || "")
      .toLowerCase()
      .split(/\s+/)[0];
    if (bankName && bankName.length > 2 && !padded.includes(bankName)) continue;

    if (!best || productToken.length > best.token.length) {
      best = { card, token: productToken };
    }
  }
  return best ? best.card : null;
}

export function extractLast4(text: string): string | null {
  const match = /ending\s*(?:in\s*|with\s*)?(?:[xX*]{2,})?\s*(\d{2,4})\b/.exec(text);
  return match ? match[1] : null;
}
