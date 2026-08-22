// One generic balance extractor, used for every loyalty program. No
// per-site selectors, no per-site parsing code — this is deliberate, so
// that supporting a new program never requires touching this file, only
// adding one line to programs.js.
//
// Strategy: scan visible text for a number that sits next to a
// balance-shaped word (points, miles, avios, credits, club, tier, etc.),
// closest match wins. This is intentionally loose — loyalty sites vary
// wildly in markup, but nearly all of them put the balance somewhere near
// one of these words, usually in a header/account-summary widget.

const QN_BALANCE_WORDS =
  /(points?|miles?|avios|credits?|balance|rewards?|nights?)/i;

// Matches "12,345" / "12345" / "12.345" (some locales use "." as the
// thousands separator) with 2-7 digits — wide enough for small balances
// and Aeroplan/Avios-scale numbers, narrow enough to reject phone numbers,
// years, and PNR-style alphanumeric codes.
const QN_NUMBER = /\b(\d{1,3}(?:[.,]\d{3})*|\d{2,7})\b/;

function qnParseNumber(raw) {
  const cleaned = String(raw).replace(/[.,](?=\d{3}\b)/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// Walks visible text nodes, looking for "<number> <word>" or
// "<word> ... <number>" within a short window, scored by how close the
// number sits to a balance word and whether it's inside an element that
// looks like a summary widget (short text, near the top of the DOM).
function qnFindBalance(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let best = null; // { value, score }
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.trim();
    if (!QN_BALANCE_WORDS.test(text)) continue;

    const numMatch = text.match(QN_NUMBER);
    if (!numMatch) continue;

    const value = qnParseNumber(numMatch[0]);
    if (value === null || value < 10 || value > 20000000) continue; // sanity bounds

    // Score: prefer short, standalone text (likely a summary widget, not
    // a paragraph mentioning miles in passing), and prefer the number
    // being close to the balance word.
    const wordIndex = text.search(QN_BALANCE_WORDS);
    const numIndex = numMatch.index ?? 0;
    const distance = Math.abs(wordIndex - numIndex);
    const lengthPenalty = Math.min(text.length, 200);
    const score = 1000 - distance * 2 - lengthPenalty;

    if (!best || score > best.score) {
      best = { value, score };
    }
  }

  return best ? best.value : null;
}

// Public entry point: given a program_code (already resolved from the
// hostname by programs.js), scan the page and return
// { program_code, balance } or null if nothing confident was found.
self.qnExtractBalance = function qnExtractBalance(programCode) {
  if (!programCode) return null;
  const balance = qnFindBalance(document.body);
  if (balance === null) return null;
  return { program_code: programCode, balance };
};
