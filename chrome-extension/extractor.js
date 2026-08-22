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

  // Collect visible text nodes once, in document order, so a number can be
  // scored against words in *neighbouring* nodes as well as its own.
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.trim();
    if (text) nodes.push({ text, el: node.parentElement });
  }

  let best = null; // { value, score }

  for (let i = 0; i < nodes.length; i++) {
    const { text, el } = nodes[i];

    const numMatch = text.match(QN_NUMBER);
    if (!numMatch) continue;

    const value = qnParseNumber(numMatch[0]);
    if (value === null || value < 10 || value > 20000000) continue; // sanity bounds

    const numIndex = numMatch.index ?? 0;
    let score = null;

    if (QN_BALANCE_WORDS.test(text)) {
      // Best case: the number and the word share a text node
      // ("48,250 Points"), so their distance is directly measurable.
      const distance = Math.abs(text.search(QN_BALANCE_WORDS) - numIndex);
      score = 1000 - distance * 2 - Math.min(text.length, 200);
    } else {
      // Otherwise look for a balance word in the surrounding markup. Real
      // dashboards nearly always split the label from the figure, because
      // they are styled differently:
      //
      //   <div class="label">Points balance</div>
      //   <div class="value">48,250</div>
      //
      // Requiring both in one text node meant the layout used by most
      // account pages returned nothing at all. This was the single reason
      // the extractor found no balance on a page that plainly showed one.
      const context = qnNearbyText(nodes, i, el);
      if (!QN_BALANCE_WORDS.test(context)) continue;

      // Ranked below a same-node match: the association is inferred from
      // proximity rather than read directly, so it deserves less trust
      // when both kinds of candidate exist on one page.
      score = 700 - Math.min(text.length, 200);

      // A bare number in its own element is exactly what a value node
      // looks like; a number buried in prose usually is not.
      if (/^[\d.,\s]+$/.test(text)) score += 120;
    }

    if (best === null || score > best.score) {
      best = { value, score };
    }
  }

  return best ? best.value : null;
}

/**
 * Text near a candidate number: its immediate siblings, plus the text of
 * the nearest ancestor small enough to still be one widget rather than the
 * whole page.
 *
 * The ancestor cap matters — without it, `body.innerText` would satisfy the
 * balance-word test on virtually any loyalty site, and every stray number
 * on the page would score as a balance.
 */
function qnNearbyText(nodes, index, el) {
  let parts = [];

  // Adjacent text nodes in document order: label immediately before the
  // value is the overwhelmingly common shape, but handle either order.
  for (let j = Math.max(0, index - 3); j <= Math.min(nodes.length - 1, index + 2); j++) {
    if (j !== index) parts.push(nodes[j].text);
  }

  // Walk up a few levels for a container that reads like a single widget.
  let up = el;
  for (let depth = 0; depth < 4 && up; depth++) {
    const t = (up.innerText || up.textContent || "").trim();
    if (t && t.length <= 200) {
      parts.push(t);
      break;
    }
    up = up.parentElement;
  }

  return parts.join(" ");
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
