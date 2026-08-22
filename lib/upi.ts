// UPI QR parsing and MCC resolution.
//
// A UPI QR is a deep link:
//   upi://pay?pa=merchant@bank&pn=Merchant%20Name&mc=5411&tr=...&am=...
//
//   pa  payee VPA          — always present
//   pn  payee name         — usually present
//   mc  merchant category  — OFTEN MISSING, or the placeholder "0000"
//
// That last point is the whole problem. Paytm's static QRs commonly omit
// `mc` altogether and PhonePe's frequently carry 0000, so a scanner that
// only reads `mc` returns "unknown" on a large share of real-world QRs.
// This is a property of the payload, not of the parser — no amount of
// better regex recovers a field that was never encoded.
//
// Hence the fallback chain in resolveMcc().

export interface ParsedUpi {
  valid: boolean;
  vpa: string | null;
  payeeName: string | null;
  mcc: string | null;
  amount: string | null;
  /** VPA handle after the @, e.g. "paytm", "ybl", "okhdfcbank". */
  handle: string | null;
  /** VPA prefix before the @, often the merchant identifier. */
  prefix: string | null;
  raw: string;
}

const PLACEHOLDER_MCCS = new Set(["", "0000", "0", "null", "undefined"]);

export function parseUpiQr(raw: string): ParsedUpi {
  const text = (raw || "").trim();
  const empty: ParsedUpi = {
    valid: false,
    vpa: null,
    payeeName: null,
    mcc: null,
    amount: null,
    handle: null,
    prefix: null,
    raw: text,
  };
  if (!text) return empty;

  // Accept the full deep link or a bare query string.
  let query = text;
  const schemeMatch = /^upi:\/\/[^?]*\?(.*)$/i.exec(text);
  if (schemeMatch) {
    query = schemeMatch[1];
  } else if (!text.includes("=")) {
    // A bare VPA pasted on its own is still useful.
    if (/^[\w.\-]+@[\w.\-]+$/.test(text)) {
      const [prefix, handle] = text.split("@");
      return {
        ...empty,
        valid: true,
        vpa: text,
        prefix: prefix.toLowerCase(),
        handle: handle.toLowerCase(),
      };
    }
    return empty;
  }

  const params = new URLSearchParams(query);
  const vpa = params.get("pa");
  if (!vpa) return empty;

  const rawMcc = (params.get("mc") ?? "").trim();
  const mcc = PLACEHOLDER_MCCS.has(rawMcc.toLowerCase()) ? null : rawMcc;

  const [prefix, handle] = vpa.includes("@") ? vpa.split("@") : [vpa, ""];

  return {
    valid: true,
    vpa,
    payeeName: params.get("pn"),
    mcc,
    amount: params.get("am"),
    handle: handle ? handle.toLowerCase() : null,
    prefix: prefix ? prefix.toLowerCase() : null,
    raw: text,
  };
}

export type ResolutionSource =
  | "qr_mcc"
  | "merchant_name"
  | "vpa_handle"
  | "unresolved";

export interface MccResolution {
  mcc: string | null;
  category: string | null;
  description: string | null;
  merchantName: string | null;
  source: ResolutionSource;
  explanation: string;
}

export interface MerchantRow {
  match_type: string;
  match_value: string;
  mcc: string;
  merchant_name: string;
}

export interface MccRow {
  mcc: string;
  description: string;
  category: string;
}

/**
 * Resolution chain. Each step is strictly weaker than the last, and the
 * result says which one fired so the UI can be honest about confidence.
 */
export function resolveMcc(
  parsed: ParsedUpi,
  merchants: MerchantRow[],
  mccs: MccRow[]
): MccResolution {
  const mccByCode = new Map(mccs.map((m) => [m.mcc, m]));

  // 1. The QR told us directly.
  if (parsed.mcc && mccByCode.has(parsed.mcc)) {
    const row = mccByCode.get(parsed.mcc)!;
    return {
      mcc: row.mcc,
      category: row.category,
      description: row.description,
      merchantName: parsed.payeeName,
      source: "qr_mcc",
      explanation: "Category read directly from the QR code.",
    };
  }
  if (parsed.mcc) {
    return {
      mcc: parsed.mcc,
      category: null,
      description: null,
      merchantName: parsed.payeeName,
      source: "qr_mcc",
      explanation: `QR carried MCC ${parsed.mcc}, which isn't in our table yet.`,
    };
  }

  // 2. Merchant name. Longest match wins so "reliance digital" beats
  //    "reliance fresh" on a string containing both.
  const name = (parsed.payeeName ?? "").toLowerCase();
  if (name) {
    const hits = merchants
      .filter((m) => m.match_type === "name" && name.includes(m.match_value))
      .sort((a, b) => b.match_value.length - a.match_value.length);
    if (hits.length) {
      const hit = hits[0];
      const row = mccByCode.get(hit.mcc);
      return {
        mcc: hit.mcc,
        category: row?.category ?? null,
        description: row?.description ?? null,
        merchantName: hit.merchant_name,
        source: "merchant_name",
        explanation:
          "The QR carried no category, so the merchant name was matched instead.",
      };
    }
  }

  // 3. VPA prefix. Weakest signal — identifies the payment handle, which is
  //    often just the acquiring bank rather than the merchant.
  const vpaText = `${parsed.prefix ?? ""}@${parsed.handle ?? ""}`;
  const vpaHits = merchants
    .filter((m) => m.match_type === "vpa" && vpaText.includes(m.match_value))
    .sort((a, b) => b.match_value.length - a.match_value.length);
  if (vpaHits.length) {
    const hit = vpaHits[0];
    const row = mccByCode.get(hit.mcc);
    return {
      mcc: hit.mcc,
      category: row?.category ?? null,
      description: row?.description ?? null,
      merchantName: hit.merchant_name,
      source: "vpa_handle",
      explanation:
        "No category or recognisable name in the QR; matched on the UPI address.",
    };
  }

  // 4. Say so, rather than guessing.
  return {
    mcc: null,
    category: null,
    description: null,
    merchantName: parsed.payeeName,
    source: "unresolved",
    explanation:
      "This QR carries no merchant category, and the merchant isn't in our " +
      "lookup yet. Static UPI QRs from Paytm and PhonePe frequently omit the " +
      "category entirely — that data isn't in the code to read.",
  };
}
