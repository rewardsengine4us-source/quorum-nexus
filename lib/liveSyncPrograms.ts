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
  /** Extra CSS selectors tried *before* the generic heuristics. */
  hints?: {
    phone?: string[];
    sendOtp?: string[];
    otp?: string[];
    submitOtp?: string[];
    balance?: string[];
  };
}

export const LIVE_SYNC_PROGRAMS: LiveSyncProgram[] = [
  {
    // Air India has no standalone login URL — /login.html is a 404. Sign-in
    // is a panel opened from a header control, which the driver reaches via
    // its "open the login form" click before looking for a phone field.
    code: "ai_maharaja",
    programId: 88,
    name: "Air India Maharaja Club",
    loginUrl: "https://www.airindia.com/in/en/maharaja-club.html",
    balanceUrl: "https://www.airindia.com/in/en/maharaja-club/account-summary.html",
    stripDialCode: "91",
  },
  {
    code: "indigo_bluchip",
    programId: 191,
    name: "IndiGo BluChip",
    loginUrl: "https://www.goindigo.in/bluchip.html",
    stripDialCode: "91",
  },
  {
    code: "makemytrip_tier",
    programId: 132,
    name: "MakeMyTrip SuperMember",
    loginUrl: "https://www.makemytrip.com/",
    stripDialCode: "91",
  },
  {
    code: "accor_all",
    programId: 117,
    name: "ALL - Accor Live Limitless",
    loginUrl: "https://all.accor.com/usa/index.en.shtml",
  },
  {
    code: "marriott_bonvoy",
    programId: 114,
    name: "Marriott Bonvoy",
    loginUrl: "https://www.marriott.com/loyalty/createAccount/createAccountPage1.mi",
  },
  {
    code: "avios",
    programId: 93,
    name: "British Airways Avios",
    loginUrl: "https://www.britishairways.com/travel/loginr/execclub/_gf/en_gb",
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
