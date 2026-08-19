// Award search: chart pricing + live seat availability.
//
// These are two genuinely different questions and the codebase keeps them
// apart on purpose:
//
//   "What does DEL->LHR business normally cost?"
//        -> award_charts. Deterministic, always available, no API needed.
//
//   "Is a business seat actually open on 14 March 2027?"
//        -> live seat inventory. There is no free public source for this.
//           Airlines don't publish award inventory APIs, and scraping
//           award calendars breaks constantly and violates most carriers'
//           terms. The commercial providers (seats.aero, AwardFares,
//           point.me, roame) all charge for API access.
//
// So live availability is behind an adapter gated on SEATS_AERO_API_KEY.
// Without a key the search still returns real chart pricing and says
// plainly that availability is not being checked, rather than inventing
// seat counts.

import { select } from "@/lib/db";

export type Cabin = "economy" | "premium" | "business" | "first";

export interface AirportRow {
  id: number;
  iata: string;
  name: string;
  city: string;
  country: string;
  region: string;
}

export interface ChartResult {
  programId: number;
  programName: string;
  pointsOneWay: number;
  pointsPeak: number | null;
  isDynamic: boolean;
  confidence: string;
  sourceNote: string | null;
  logoUrl: string | null;
  /** True only when the figure was checked against a dated source. */
  pointsVerified: boolean;
  /** Cash component, which for dynamic programmes often matters more. */
  taxesNote: string | null;
  /** Populated when the user has a balance in this program. */
  userBalance?: number | null;
  shortfall?: number | null;
}

export interface LiveAvailability {
  available: boolean;
  seats: number | null;
  points: number | null;
  cabin: string;
  program: string;
  fetchedAt: string;
}

export interface AwardSearchResult {
  origin: AirportRow | null;
  destination: AirportRow | null;
  date: string | null;
  cabin: Cabin;
  charts: ChartResult[];
  live: LiveAvailability[];
  liveStatus: "disabled" | "ok" | "error";
  liveMessage: string;
}

export const CABINS: Cabin[] = ["economy", "premium", "business", "first"];

export async function findAirport(query: string): Promise<AirportRow | null> {
  const q = (query || "").trim();
  if (!q) return null;

  // Exact IATA first, then city name.
  if (/^[A-Za-z]{3}$/.test(q)) {
    const byIata = await select(
      "airports",
      `iata=eq.${q.toUpperCase()}&select=id,iata,name,city,country,region&limit=1`
    );
    if (byIata.length) return byIata[0] as AirportRow;
  }

  const byCity = await select(
    "airports",
    `city=ilike.${encodeURIComponent(q)}&select=id,iata,name,city,country,region&limit=1`
  );
  if (byCity.length) return byCity[0] as AirportRow;

  const fuzzy = await select(
    "airports",
    `or=(city.ilike.*${encodeURIComponent(q)}*,name.ilike.*${encodeURIComponent(q)}*)` +
      `&select=id,iata,name,city,country,region&limit=1`
  );
  return fuzzy.length ? (fuzzy[0] as AirportRow) : null;
}

export async function chartsFor(
  fromRegion: string,
  toRegion: string,
  cabin: Cabin
): Promise<ChartResult[]> {
  const rows = await select(
    "award_charts",
    `from_region=eq.${fromRegion}&to_region=eq.${toRegion}&cabin=eq.${cabin}` +
      `&select=program_id,points_one_way,points_peak,is_dynamic,confidence,source_note,points_verified,taxes_note` +
      `&order=points_one_way.asc`
  );
  if (!rows.length) return [];

  const programs = await select("loyalty_programs", "select=id,program_name,logo_url");
  const nameById: Record<number, string> = {};
  const logoById: Record<number, string | null> = {};
  for (const p of programs) {
    nameById[p.id] = p.program_name;
    logoById[p.id] = p.logo_url ?? null;
  }

  return rows.map((r: any) => ({
    programId: r.program_id,
    programName: nameById[r.program_id] ?? `Program ${r.program_id}`,
    pointsOneWay: r.points_one_way,
    pointsPeak: r.points_peak,
    isDynamic: r.is_dynamic,
    confidence: r.confidence,
    sourceNote: r.source_note,
    logoUrl: logoById[r.program_id] ?? null,
    pointsVerified: !!r.points_verified,
    taxesNote: r.taxes_note ?? null,
  }));
}

/**
 * Live seat availability via seats.aero's Partner API.
 *
 * Returns liveStatus "disabled" when no key is configured — the caller
 * surfaces that to the user rather than pretending availability is unknown
 * for some transient reason.
 */
export async function liveAvailability(
  originIata: string,
  destIata: string,
  date: string,
  cabin: Cabin
): Promise<{ status: "disabled" | "ok" | "error"; message: string; results: LiveAvailability[] }> {
  const key = process.env.SEATS_AERO_API_KEY;
  if (!key) {
    return {
      status: "disabled",
      message:
        "Live seat availability is not enabled. Award inventory has no free public " +
        "source; it requires a paid provider such as the seats.aero Partner API. " +
        "Set SEATS_AERO_API_KEY to turn this on. Points figures below are published " +
        "award-chart levels and remain accurate.",
      results: [],
    };
  }

  const cabinParam =
    cabin === "premium" ? "premium" : cabin === "first" ? "first" : cabin;

  try {
    const url =
      `https://seats.aero/partnerapi/search?origin_airport=${encodeURIComponent(originIata)}` +
      `&destination_airport=${encodeURIComponent(destIata)}` +
      `&start_date=${encodeURIComponent(date)}&end_date=${encodeURIComponent(date)}` +
      `&cabin=${encodeURIComponent(cabinParam)}&take=50`;

    const res = await fetch(url, {
      headers: { "Partner-Authorization": key, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        status: "error",
        message: `Live availability provider returned HTTP ${res.status}.`,
        results: [],
      };
    }

    const body = await res.json();
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];

    const results: LiveAvailability[] = rows.map((r) => ({
      available: true,
      seats: r.RemainingSeats ?? null,
      points: r.MileageCost ?? null,
      cabin: r.Cabin ?? cabin,
      program: r.Source ?? "unknown",
      fetchedAt: new Date().toISOString(),
    }));

    return {
      status: "ok",
      message: results.length
        ? `${results.length} live award option(s) found.`
        : "No award seats found for this date in this cabin.",
      results,
    };
  } catch (err: any) {
    return {
      status: "error",
      message: `Live availability lookup failed: ${err.message}`,
      results: [],
    };
  }
}
