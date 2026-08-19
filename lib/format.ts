// Shared display formatters.
//
// Deliberately NOT colocated in a page.tsx / route.ts — Next.js App Router
// only permits a specific set of exports from those files, so a stray
// helper export fails the build with:
//   Type error: Page "..." does not match the required types of a Next.js
//   Page. "formatRatio" is not a valid Page export field.

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Transfer ratios are stored as a decimal: program points received per
 * 1 card point spent. Display convention is the opposite order — everyone
 * quotes these as "points spent : points received" (e.g. "2:1" means you
 * spend 2 card points to get 1 mile). A stored ratio of 0.5 (half a mile
 * per card point, i.e. 2 points buys 1 mile) must render as "2:1", not
 * "1:2" — the earlier version inverted this and showed the ratio backwards
 * on every route.
 *
 *   stored 0.5   -> "2:1"   (spend 2, get 1 — Amex MR -> most airlines)
 *   stored 1.25  -> "4:5"   (spend 4, get 5 — a rare bonus-rate transfer)
 *   stored 0.4   -> "5:2"   (spend 5, get 2)
 *   stored 1     -> "1:1"   (spend 1, get 1 — the common best case)
 *
 * Ratios that don't reduce to a clean small pair (e.g. 0.33) are rounded
 * to the nearest clean approximation and marked "~" rather than printed
 * as a literal "33:100", which nobody in this industry writes that way.
 */
export function formatRatio(ratio: number | null | undefined): string {
  if (ratio == null || !isFinite(ratio) || ratio <= 0) return "—";

  // Smallest denominator (capped small — real transfer ratios are always
  // clean small-integer pairs like 1:1, 2:1, 5:4) that turns the ratio into
  // a whole number.
  const MAX_CLEAN_DENOMINATOR = 20;
  let denominator = 1;
  while (
    denominator <= MAX_CLEAN_DENOMINATOR &&
    Math.abs(ratio * denominator - Math.round(ratio * denominator)) > 1e-9
  ) {
    denominator++;
  }

  let numerator: number;
  let approx = false;

  if (denominator > MAX_CLEAN_DENOMINATOR) {
    // No clean small fraction — find the closest small-denominator
    // approximation instead (e.g. 0.33 -> ~3:1) and mark it approximate,
    // rather than printing an ugly exact pair like "33:100", which nobody
    // in this industry writes that way.
    approx = true;
    let bestNum = 1;
    let bestDen = 1;
    let bestError = Infinity;
    for (let d = 1; d <= MAX_CLEAN_DENOMINATOR; d++) {
      const n = Math.round(ratio * d);
      if (n <= 0) continue;
      const error = Math.abs(ratio - n / d);
      if (error < bestError) {
        bestError = error;
        bestNum = n;
        bestDen = d;
      }
    }
    const divisor = gcd(bestNum, bestDen) || 1;
    numerator = bestNum / divisor;
    denominator = bestDen / divisor;
  } else {
    numerator = Math.round(ratio * denominator);
    const divisor = gcd(numerator, denominator) || 1;
    numerator /= divisor;
    denominator /= divisor;
  }

  // "received" (numerator) : "spent" (denominator) is the storage order;
  // flip to the display convention of "spent : received".
  return `${approx ? "~" : ""}${denominator}:${numerator}`;
}
