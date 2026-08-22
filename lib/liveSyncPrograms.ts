// The entire per-program surface of live sync.
//
// Deliberately tiny. All the actual work — finding the phone field, finding
// the "send OTP" button, finding the OTP boxes, reading the balance — is
// done by generic heuristics in lib/liveSyncDriver.ts, exactly like the
// Chrome extension's single extractor.js. Adding a program here should
// normally mean adding a login URL and nothing else.
//
// Only add `hints` when a site genuinely defeats the generic finder, and
// keep them as *extra* candidates rather than replacements — that way a
// site redesign degrades back to the generic path instead of breaking.

export interface LiveSyncProgram {
  /** Matches loyalty_programs.program_code */
  code: string;
  /** Matches loyalty_programs.id — kept here so a sync never needs a lookup round-trip. */
  programId: number;
  name: string;
  /** Page that offers phone/mobile login. */
  loginUrl: string;
  /**
   * Where the balance lives once logged in. Omit when the balance is
   * already visible on the post-login landing page.
   */
  balanceUrl?: string;
  /**
   * Country dialling code stripped before typing, because most Indian
   * portals want a bare 10-digit number and reject "+91...".
   */
  stripDialCode?: string;
  /** Measured, not assumed — see Reachability. */
  reachability?: Reachability;
  /** Extra CSS selectors tried *before* the generic heuristics. */
  hints?: {
    phone?: string[];
    sendOtp?: string[];
    otp?: string[];
    submitOtp?: string[];
    balance?: string[];
  };
}

/**
 * Whether a program is reachable by server-side automation at all.
 *
 * This is not a guess. Air India and IndiGo both answer our requests with
 * an Akamai "Access Denied" page (errors.edgesuite.net, with a reference
 * number) — bot protection refusing a datacenter IP outright, not a
 * selector problem we can code around. Airlines are the most-scraped sites
 * on the internet and buy protection accordingly.
 *
 * Blocked programs stay listed rather than being deleted, because the
 * honest answer to "why can't I sync Air India?" is "their edge blocks
 * servers, use the browser extension" — and the extension genuinely does
 * work there, since it runs from the member's own browser and IP.
 */
export type Reachability = "ok" | "blocked_by_bot_protection";

export const LIVE_SYNC_PROGRAMS: LiveSyncProgram[] = [
  {
    // Accor's homepage is a booking search with no login form; auth lives
    // on permalink.accor.com, which renders the form directly.
    code: "accor_all",
    programId: 117,
    name: "ALL - Accor Live Limitless",
    loginUrl:
      "https://permalink.accor.com/account/login?client=ALLHEADER&languageCode=en",
    balanceUrl: "https://permalink.accor.com/account/my-account?languageCode=en",
    reachability: "ok",
  },
  {
    code: "marriott_bonvoy",
    programId: 114,
    name: "Marriott Bonvoy",
    loginUrl: "https://www.marriott.com/sign-in.mi",
    balanceUrl: "https://www.marriott.com/loyalty/myAccount/default.mi",
    reachability: "ok",
  },
  {
    code: "makemytrip_tier",
    programId: 132,
    name: "MakeMyTrip SuperMember",
    loginUrl: "https://www.makemytrip.com/",
    stripDialCode: "91",
    reachability: "ok",
  },
  {
    code: "avios",
    programId: 93,
    name: "British Airways Avios",
    loginUrl: "https://www.britishairways.com/travel/loginr/execclub/_gf/en_gb",
    reachability: "ok",
  },
  {
    // Measured, not assumed: returns an Akamai Access Denied page.
    code: "ai_maharaja",
    programId: 88,
    name: "Air India Maharaja Club",
    loginUrl: "https://www.airindia.com/in/en/maharaja-club.html",
    balanceUrl: "https://www.airindia.com/in/en/maharaja-club/account-summary.html",
    stripDialCode: "91",
    reachability: "blocked_by_bot_protection",
  },
  {
    // Same Akamai block as Air India.
    code: "indigo_bluchip",
    programId: 191,
    name: "IndiGo BluChip",
    loginUrl: "https://www.goindigo.in/bluchip.html",
    stripDialCode: "91",
    reachability: "blocked_by_bot_protection",
  },
];

export function findLiveSyncProgram(code: string): LiveSyncProgram | undefined {
  return LIVE_SYNC_PROGRAMS.find((p) => p.code === code);
}

/**
 * Portals almost universally want the local subscriber number, not an
 * E.164 string. Strip formatting and the country code so a profile stored
 * as "+91 98765 43210" still types correctly into a 10-digit field.
 */
export function localPhoneFor(program: LiveSyncProgram, phone: string): string {
  let digits = String(phone).replace(/\D/g, "");
  const cc = program.stripDialCode;
  if (cc && digits.length > 10 && digits.startsWith(cc)) {
    digits = digits.slice(cc.length);
  }
  return digits;
}
