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
  latitude: number | null;
  longitude: number | null;
}

const AIRPORT_COLS =
  "id,iata,name,city,country,region,latitude,longitude";

/**
 * Great-circle distance in statute miles.
 *
 * Distance-band programmes (the Avios family, Aeroplan, Asia Miles, JAL)
 * price on miles actually flown, so a region pair is the wrong unit:
 * Delhi-London and Delhi-Lisbon are both IN->EUR but land in different
 * bands at different prices. Airlines publish band boundaries against
 * great-circle distance, which is what this computes.
 */
export function distanceMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
  /** Set when the figure came from a distance band rather than a region pair. */
  bandName?: string | null;
  distanceMiles?: number | null;
  pricingModel?: string | null;
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
      `iata=eq.${q.toUpperCase()}&select=${AIRPORT_COLS}&order=id.asc&limit=1`
    );
    if (byIata.length) return byIata[0] as AirportRow;
  }

  const byCity = await select(
    "airports",
    `city=ilike.${encodeURIComponent(q)}&select=${AIRPORT_COLS}&order=id.asc&limit=1`
  );
  if (byCity.length) return byCity[0] as AirportRow;

  const fuzzy = await select(
    "airports",
    `or=(city.ilike.*${encodeURIComponent(q)}*,name.ilike.*${encodeURIComponent(q)}*)` +
      `&select=${AIRPORT_COLS}&order=id.asc&limit=1`
  );
  return fuzzy.length ? (fuzzy[0] as AirportRow) : null;
}

export async function chartsFor(
  fromRegion: string,
  toRegion: string,
  cabin: Cabin,
  miles?: number | null
): Promise<ChartResult[]> {
  const rows = await select(
    "award_charts",
    `from_region=eq.${fromRegion}&to_region=eq.${toRegion}&cabin=eq.${cabin}` +
      `&select=program_id,points_one_way,points_peak,is_dynamic,confidence,source_note,points_verified,taxes_note` +
      `&order=points_one_way.asc`
  );

  const programs = await select(
    "loyalty_programs",
    "select=id,program_name,logo_url,pricing_model"
  );
  const nameById: Record<number, string> = {};
  const logoById: Record<number, string | null> = {};
  const modelById: Record<number, string | null> = {};
  for (const p of programs) {
    nameById[p.id] = p.program_name;
    logoById[p.id] = p.logo_url ?? null;
    modelById[p.id] = p.pricing_model ?? null;
  }

  const results: ChartResult[] = rows.map((r: any) => ({
    programId: r.program_id,
    programName: nameById[r.program_id] ?? `Program ${r.program_id}`,
    pointsOneWay: r.points_one_way,
    pointsPeak: r.points_peak,
    isDynamic: r.is_dynamic,
    confidence: r.confidence,
    sourceNote: r.source_note,
    logoUrl: logoById[r.program_id] ?? null,
    pricingModel: modelById[r.program_id] ?? null,
    bandName: null,
    distanceMiles: miles != null ? Math.round(miles) : null,
    pointsVerified: !!r.points_verified,
    taxesNote: r.taxes_note ?? null,
  }));

  // Distance-band programmes override the region-pair figure entirely.
  // The band is the actual published price for this specific distance,
  // whereas the region row is at best an average across the region.
  if (miles != null && isFinite(miles)) {
    const bands = await select(
      "award_distance_bands",
      `cabin=eq.${cabin}&min_miles=lte.${Math.round(miles)}` +
        `&select=program_id,band_name,min_miles,max_miles,points_off_peak,points_peak,source_url,verified,notes`
    );

    const byProgram = new Map<number, any>();
    for (const b of bands) {
      // min_miles filter is applied server-side; the open-ended top band
      // has a null max, so it always matches once min is satisfied.
      if (b.max_miles != null && miles > b.max_miles) continue;
      byProgram.set(b.program_id, b);
    }

    for (const [programId, b] of byProgram) {
      const existing = results.find((r) => r.programId === programId);
      const row: ChartResult = {
        programId,
        programName: nameById[programId] ?? `Program ${programId}`,
        pointsOneWay: b.points_off_peak,
        pointsPeak: b.points_peak ?? null,
        isDynamic: false,
        confidence: "published",
        sourceNote:
          `${b.band_name} (${Math.round(miles).toLocaleString()} mi) — priced on distance flown. ` +
          (b.notes ?? ""),
        logoUrl: logoById[programId] ?? null,
        pricingModel: "distance_band",
        bandName: b.band_name,
        distanceMiles: Math.round(miles),
        pointsVerified: !!b.verified,
        taxesNote: existing?.taxesNote ?? null,
      };
      if (existing) Object.assign(existing, row);
      else results.push(row);
    }
  }

  return results.sort((a, b) => a.pointsOneWay - b.pointsOneWay);
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
