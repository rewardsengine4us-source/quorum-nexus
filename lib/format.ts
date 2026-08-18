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
 * Transfer ratios are stored as a decimal (program points received per
 * 1 card point). Points and miles are always quoted as a whole-number
 * pair — "0.5:1" is not how anyone writes it. Scale to the smallest
 * integer pair and reduce:
 *
 *   0.5  -> 1:2      1.25 -> 5:4      2.5 -> 5:2      1 -> 1:1
 */
export function formatRatio(ratio: number | null | undefined): string {
  if (ratio == null || !isFinite(ratio) || ratio <= 0) return "—";

  // Smallest denominator that turns the ratio into a whole number.
  let denominator = 1;
  while (
    denominator <= 1000 &&
    Math.abs(ratio * denominator - Math.round(ratio * denominator)) > 1e-9
  ) {
    denominator++;
  }

  const numerator = Math.round(ratio * denominator);
  const divisor = gcd(numerator, denominator) || 1;
  return `${numerator / divisor}:${denominator / divisor}`;
}
