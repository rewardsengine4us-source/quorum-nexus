// Everything that runs *inside* the loyalty site's page, as source text.
//
// One generic driver for every program, not a scripted click path per
// site. Scripted paths rot the moment a site ships a redesign and don't
// scale past a handful of programs; these are heuristic searches over the
// live DOM — "find the phone-shaped input", "find the thing that advances
// the form" — which is how a person reads these pages anyway.
//
// Kept as strings because they are evaluated in a browser we do not
// bundle for. The balance scan is deliberately the same algorithm as
// chrome-extension/extractor.js: a program that reads correctly through
// the extension must read the same way here, or the two paths would
// quietly disagree about a user's balance.

export const MARK = "data-qn-target";

/** Installed once per page; everything else assumes window.__qn exists. */
export const FINDER = `
(function () {
  if (window.__qn) return true;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }

  function describe(el) {
    var bits = [
      el.getAttribute("name"), el.id, el.getAttribute("placeholder"),
      el.getAttribute("aria-label"), el.getAttribute("autocomplete"),
      el.getAttribute("type"), el.getAttribute("data-testid"),
      typeof el.className === "string" ? el.className : ""
    ];
    // A field's own attributes are often useless ("input-3"), but the
    // visible label attached to it almost never is.
    if (el.id) {
      try {
        var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab) bits.push(lab.textContent);
      } catch (e) {}
    }
    var wrap = el.closest ? el.closest("label") : null;
    if (wrap) bits.push(wrap.textContent);
    return bits.filter(Boolean).join(" ").toLowerCase();
  }

  function textOf(el) {
    return (el.innerText || el.textContent || el.value || "").trim();
  }

  function mark(el, name) {
    var prev = document.querySelectorAll("[${MARK}='" + name + "']");
    for (var i = 0; i < prev.length; i++) prev[i].removeAttribute("${MARK}");
    el.setAttribute("${MARK}", name);
    return "[${MARK}='" + name + "']";
  }

  window.__qn = {
    visible: visible,
    describe: describe,
    textOf: textOf,
    mark: mark,
    inputs: function () {
      return [].slice.call(document.querySelectorAll("input, textarea"))
        .filter(function (el) {
          return visible(el) && !el.disabled && !el.readOnly &&
            el.type !== "hidden" && el.type !== "checkbox" &&
            el.type !== "radio" && el.type !== "submit";
        });
    },
    clickables: function () {
      return [].slice.call(document.querySelectorAll(
        "button, a, [role=button], input[type=submit], input[type=button]"
      )).filter(visible);
    }
  };
  return true;
})()
`;

/**
 * Cookie banners and region interstitials block clicks on nearly every
 * airline site.
 *
 * We accept nothing: only reject/close controls are pressed. Where a
 * banner offers no honest "no", the overlay is removed instead — removing
 * a consent prompt without answering it records the same consent as never
 * having seen it, which is none.
 */
export const DISMISS = `
(function () {
  var qn = window.__qn;
  var REJECT = /^(reject|decline|refuse|only necessary|necessary only|essential only|close|no thanks|not now|skip|dismiss|×|✕)\\b/i;
  var n = 0;

  var c = qn.clickables();
  for (var i = 0; i < c.length; i++) {
    var t = qn.textOf(c[i]).slice(0, 40);
    var a = (c[i].getAttribute("aria-label") || "").slice(0, 40);
    if (REJECT.test(t) || REJECT.test(a)) {
      try { c[i].click(); n++; } catch (e) {}
    }
  }

  var all = document.body.querySelectorAll("div, section, aside");
  for (var j = 0; j < all.length; j++) {
    var el = all[j];
    var s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    var r = el.getBoundingClientRect();
    if (r.width > innerWidth * 0.8 && r.height > innerHeight * 0.5 &&
        Number(s.zIndex || 0) > 10) {
      // Never rip out something the user is meant to type into. A consent
      // banner is all prose and buttons; a login panel is a full-screen
      // fixed overlay with exactly the same geometry, and deleting it was
      // removing the sign-in form moments after we clicked to open it.
      if (el.querySelector("input, textarea, select, form")) continue;
      el.remove(); n++;
    }
  }
  return n;
})()
`;

/**
 * Scores every visible input and returns a selector for the most
 * phone-shaped one, or null.
 *
 * Scored rather than first-match because these pages routinely hold
 * several candidates — a search box, a newsletter signup, a rendered-but-
 * offscreen desktop variant — and the real phone field is not reliably
 * first in DOM order.
 */
export const FIND_PHONE = `
(function () {
  var qn = window.__qn;
  var PHONE = /(phone|mobile|msisdn|contact ?number|cell|tel\\b)/i;
  var EMAIL = /(e-?mail)/i;

  var best = null, bestScore = 0;
  var list = qn.inputs();
  for (var i = 0; i < list.length; i++) {
    var el = list[i], d = qn.describe(el), score = 0;
    var type = el.getAttribute("type");

    if (type === "tel") score += 60;
    if (PHONE.test(d)) score += 50;
    if (EMAIL.test(d) && !PHONE.test(d)) score -= 60;
    if (type === "password") score -= 100;
    if (type === "email") score -= 80;
    if (/search|promo|coupon|newsletter|voucher/.test(d)) score -= 60;

    var ml = Number(el.getAttribute("maxlength") || 0);
    // maxlength 10 is a very strong signal on Indian portals, which
    // almost universally want a bare subscriber number.
    if (ml === 10) score += 35;
    if (ml > 0 && ml < 6) score -= 40; // OTP digit boxes
    if (el.getAttribute("inputmode") === "numeric") score += 15;

    if (score > 0 && score > bestScore) { best = el; bestScore = score; }
  }
  return best ? qn.mark(best, "phone") : null;
})()
`;

/** Ranked search for whatever advances the form. Returns a selector. */
export function findAdvance(patternSource: string): string {
  return `
(function () {
  var qn = window.__qn;
  var PAT = new RegExp(${JSON.stringify(patternSource)}, "i");
  var NEG = /(cancel|back|forgot|register|sign ?up|create account|help|resend|privacy|terms)/i;

  var best = null, bestScore = -1e9;
  var list = qn.clickables();
  for (var i = 0; i < list.length; i++) {
    var el = list[i], t = qn.textOf(el).slice(0, 60);
    var aria = (el.getAttribute("aria-label") || "").slice(0, 60);
    var label = t || aria;
    if (!label) continue;
    if (NEG.test(label)) continue;
    if (!PAT.test(label)) continue;

    var score = 100 - label.length;       // a tight label beats a paragraph
    if (/otp|code/i.test(label)) score += 40;
    if (el.type === "submit") score += 20;
    if (el.tagName === "BUTTON") score += 10;
    if (el.disabled) score -= 200;

    if (score > bestScore) { best = el; bestScore = score; }
  }
  return best ? qn.mark(best, "advance") : null;
})()
`;
}

/** True once the page is actually asking for a code. */
export const OTP_PRESENT = `
(function () {
  var qn = window.__qn;
  var OTP = /(otp|one ?time|verification|verify|passcode|security ?code|\\bcode\\b)/i;
  var list = qn.inputs();
  for (var i = 0; i < list.length; i++) {
    if (OTP.test(qn.describe(list[i]))) return true;
  }
  var tiny = 0;
  for (var j = 0; j < list.length; j++) {
    if (Number(list[j].getAttribute("maxlength") || 0) === 1) tiny++;
  }
  return tiny >= 4;
})()
`;

/**
 * Plans how to type the code. Portals split roughly evenly between one
 * field and the one-digit-per-box layout, so both are handled.
 */
export const PLAN_OTP = `
(function () {
  var qn = window.__qn;
  var OTP = /(otp|one ?time|verification|verify|passcode|security ?code|\\bcode\\b)/i;
  var list = qn.inputs();

  var boxes = list.filter(function (el) {
    return Number(el.getAttribute("maxlength") || 0) === 1;
  });
  if (boxes.length >= 4) {
    for (var i = 0; i < boxes.length; i++) qn.mark(boxes[i], "otp" + i);
    return { mode: "split", count: boxes.length };
  }

  for (var j = 0; j < list.length; j++) {
    var d = qn.describe(list[j]);
    if (!OTP.test(d)) continue;
    if (/phone|mobile|email/.test(d)) continue;
    return { mode: "single", sel: qn.mark(list[j], "otp") };
  }

  // Last resort: the only field on an otherwise bare screen is almost
  // certainly the code box even when nothing is labelled.
  if (list.length === 1) return { mode: "single", sel: qn.mark(list[0], "otp") };
  return null;
})()
`;

/**
 * The balance scan. Byte-for-byte the same strategy as the extension's
 * extractor.js: find a number sitting next to a balance-shaped word,
 * closest and tightest match wins.
 */
export const EXTRACT_BALANCE = `
(function () {
  var WORDS = /(points?|miles?|avios|credits?|balance|rewards?|nights?)/i;
  var NUM = /\\b(\\d{1,3}(?:[.,]\\d{3})*|\\d{2,7})\\b/;

  function parseNum(raw) {
    var cleaned = String(raw).replace(/[.,](?=\\d{3}\\b)/g, "");
    var n = parseInt(cleaned, 10);
    return isFinite(n) ? n : null;
  }

  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      var el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      var s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  var best = null, bestScore = -1e9, node;
  while ((node = walker.nextNode())) {
    var text = node.nodeValue.trim();
    if (!WORDS.test(text)) continue;
    var m = text.match(NUM);
    if (!m) continue;

    var value = parseNum(m[0]);
    if (value === null || value < 10 || value > 20000000) continue;

    var distance = Math.abs(text.search(WORDS) - (m.index || 0));
    var score = 1000 - distance * 2 - Math.min(text.length, 200);
    if (score > bestScore) { best = value; bestScore = score; }
  }
  return best;
})()
`;

/** What the page offers, for diagnosing a failure without a rerun. */
export const DESCRIBE_PAGE = `
(function () {
  var qn = window.__qn;
  return {
    inputs: qn.inputs().slice(0, 12).map(function (el) {
      return {
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        id: el.id || null,
        placeholder: el.getAttribute("placeholder"),
        maxlength: el.getAttribute("maxlength")
      };
    }),
    buttons: qn.clickables().map(function (el) {
      return (qn.textOf(el) || el.getAttribute("aria-label") || "").slice(0, 24);
    }).filter(Boolean).slice(0, 24),
    url: location.href
  };
})()
`;

export const SEND_OTP_PATTERN =
  "(send ?(me )?(the )?otp|request ?otp|get ?otp|send ?code|otp|sign ?in|log ?in|continue|proceed|next|submit)";

export const SUBMIT_OTP_PATTERN =
  "(verify|submit|confirm|continue|proceed|sign ?in|log ?in|next|done)";

export const OPEN_LOGIN_PATTERN =
  "(sign ?in|log ?in|login|my ?account|member ?login)";
