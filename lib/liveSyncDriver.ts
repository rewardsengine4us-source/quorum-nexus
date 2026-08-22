// The generic loyalty-portal driver.
//
// One driver for every program, mirroring the Chrome extension's approach:
// there is no per-site scripted click path here, because those rot the
// moment a site ships a redesign, and writing one per program does not
// scale past a handful. Instead every step is a *heuristic search* over the
// live DOM — "find the thing that looks like a phone field", "find the
// thing that looks like a Send OTP button" — which is how a human reads
// these pages too.
//
// Everything below runs against a real Chrome via Browserless (see
// lib/browserless.ts). Element discovery happens in-page, but the actual
// clicking and typing is done by Puppeteer against a marker attribute the
// finder leaves behind. That distinction matters: assigning `input.value`
// from a script does not fire the events React listens for, so controlled
// inputs silently revert. Real key events do not have that problem.

import type { Page } from "puppeteer-core";

const MARK = "data-qn-target";

/* ------------------------------------------------------------------ *
 * In-page helpers.
 *
 * These are stringified and shipped to the browser by page.evaluate, so
 * they must be fully self-contained — no imports, no closure over
 * anything in this module.
 * ------------------------------------------------------------------ */

const INPAGE_FINDER = `
(function () {
  if (window.__qn) return;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }

  // Everything we might match on, lowercased into one haystack.
  function describe(el) {
    var bits = [
      el.getAttribute("name"), el.id, el.getAttribute("placeholder"),
      el.getAttribute("aria-label"), el.getAttribute("autocomplete"),
      el.getAttribute("type"), el.getAttribute("data-testid"),
      el.className && typeof el.className === "string" ? el.className : ""
    ];
    // A field's own attributes are often useless ("input-3"), but its
    // visible <label> almost never is.
    if (el.id) {
      var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) bits.push(lab.textContent);
    }
    var wrapLab = el.closest("label");
    if (wrapLab) bits.push(wrapLab.textContent);
    return bits.filter(Boolean).join(" ").toLowerCase();
  }

  function textOf(el) {
    return (el.innerText || el.textContent || el.value || "").trim();
  }

  function mark(el, name) {
    document.querySelectorAll("[${MARK}='" + name + "']").forEach(function (n) {
      n.removeAttribute("${MARK}");
    });
    el.setAttribute("${MARK}", name);
    return "[${MARK}='" + name + "']";
  }

  window.__qn = {
    visible: visible,
    describe: describe,
    textOf: textOf,
    mark: mark,

    // Inputs the user could plausibly type into, in DOM order.
    inputs: function () {
      return Array.prototype.slice
        .call(document.querySelectorAll("input, textarea"))
        .filter(function (el) {
          return visible(el) && !el.disabled && !el.readOnly &&
                 el.type !== "hidden" && el.type !== "checkbox" &&
                 el.type !== "radio" && el.type !== "submit";
        });
    },

    // Anything a user could click to advance a form.
    clickables: function () {
      return Array.prototype.slice
        .call(document.querySelectorAll(
          "button, a, [role=button], input[type=submit], input[type=button]"
        ))
        .filter(visible);
    }
  };
})();
`;

async function installFinder(page: Page) {
  await page.evaluate(INPAGE_FINDER);
}

/* ------------------------------------------------------------------ *
 * Step 0 — clear the junk that sits on top of the login form.
 * ------------------------------------------------------------------ */

/**
 * Cookie banners and region interstitials block clicks on nearly every
 * airline site. We accept nothing and consent to nothing — we only press
 * the dismissal that rejects or closes, and fall back to removing a
 * fixed-position overlay outright if there is no honest "no" button.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  await installFinder(page);
  await page.evaluate(() => {
    const qn = (window as any).__qn;
    const REJECT =
      /^(reject|decline|refuse|only necessary|necessary only|essential only|manage|close|no thanks|not now|skip|dismiss|×|✕)\b/i;

    for (const el of qn.clickables()) {
      const t = qn.textOf(el).slice(0, 40);
      const aria = (el.getAttribute("aria-label") || "").slice(0, 40);
      if (REJECT.test(t) || REJECT.test(aria)) {
        try {
          (el as HTMLElement).click();
        } catch {
          /* ignore */
        }
      }
    }

    // Whatever is left that covers the whole screen gets pulled out of the
    // way. Removing a consent banner without answering it is the same
    // outcome as never seeing it: no consent is recorded either way.
    for (const el of Array.from(document.body.querySelectorAll("div, section, aside"))) {
      const s = getComputedStyle(el as HTMLElement);
      if (s.position !== "fixed" && s.position !== "sticky") continue;
      const r = (el as HTMLElement).getBoundingClientRect();
      const coversMost =
        r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.5;
      if (coversMost && Number(s.zIndex || 0) > 10) {
        (el as HTMLElement).remove();
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * Step 1 — the phone number field.
 * ------------------------------------------------------------------ */

const PHONE_WORDS = /(phone|mobile|msisdn|contact ?number|cell|tel\b)/i;
const EMAIL_WORDS = /(e-?mail)/i;

/**
 * Scores every visible input and picks the most phone-shaped one.
 *
 * Scoring rather than a first-match selector because these pages routinely
 * contain several candidates (a search box, a newsletter signup, a
 * hidden-but-rendered desktop variant) and the honest phone field is not
 * reliably the first in DOM order.
 */
export async function findPhoneField(
  page: Page,
  hints: string[] = []
): Promise<string | null> {
  await installFinder(page);

  return page.evaluate(
    (hintList: string[], phoneSrc: string, emailSrc: string) => {
      const qn = (window as any).__qn;
      const PHONE = new RegExp(phoneSrc, "i");
      const EMAIL = new RegExp(emailSrc, "i");

      for (const h of hintList) {
        const el = document.querySelector(h) as HTMLElement | null;
        if (el && qn.visible(el)) return qn.mark(el, "phone");
      }

      let best: { el: HTMLElement; score: number } | null = null;
      for (const el of qn.inputs()) {
        const d = qn.describe(el);
        let score = 0;

        if (el.getAttribute("type") === "tel") score += 60;
        if (PHONE.test(d)) score += 50;
        if (EMAIL.test(d) && !PHONE.test(d)) score -= 60;
        if (el.getAttribute("type") === "password") score -= 100;
        if (el.getAttribute("type") === "email") score -= 80;
        if (/search|promo|coupon|newsletter/.test(d)) score -= 60;
        // A maxlength of exactly 10 is a very strong signal on Indian
        // portals, which almost universally take a bare subscriber number.
        const ml = Number(el.getAttribute("maxlength") || 0);
        if (ml === 10) score += 35;
        if (ml > 0 && ml < 6) score -= 40; // OTP digit boxes
        if (el.getAttribute("inputmode") === "numeric") score += 15;

        if (score > 0 && (!best || score > best.score)) best = { el, score };
      }

      return best ? qn.mark(best.el, "phone") : null;
    },
    hints,
    PHONE_WORDS.source,
    EMAIL_WORDS.source
  );
}

export async function fillPhone(
  page: Page,
  digits: string,
  hints: string[] = []
): Promise<boolean> {
  const selector = await findPhoneField(page, hints);
  if (!selector) return false;

  await page.click(selector, { clickCount: 3 });
  await page.type(selector, digits, { delay: 45 });
  return true;
}

/* ------------------------------------------------------------------ *
 * Step 2 — trigger the OTP.
 * ------------------------------------------------------------------ */

const SEND_OTP_WORDS =
  /(send ?(me )?(the )?otp|request ?otp|get ?otp|send ?code|otp|continue|proceed|next|sign ?in|log ?in|submit)/i;

/**
 * Presses whatever advances the form. Ranked, not first-match, because
 * "Continue" and "Send OTP" often both exist and only one is the primary.
 */
export async function clickAdvance(
  page: Page,
  hints: string[] = [],
  pattern: RegExp = SEND_OTP_WORDS
): Promise<boolean> {
  await installFinder(page);

  const selector = await page.evaluate(
    (hintList: string[], patSrc: string) => {
      const qn = (window as any).__qn;
      const PAT = new RegExp(patSrc, "i");
      const NEGATIVE = /(cancel|back|forgot|register|sign ?up|create|help|resend)/i;

      for (const h of hintList) {
        const el = document.querySelector(h) as HTMLElement | null;
        if (el && qn.visible(el)) return qn.mark(el, "advance");
      }

      let best: { el: HTMLElement; score: number } | null = null;
      for (const el of qn.clickables()) {
        const t = qn.textOf(el).slice(0, 60);
        if (!t) continue;
        if (NEGATIVE.test(t)) continue;
        const m = t.match(PAT);
        if (!m) continue;

        let score = 100 - t.length; // prefer a tight label over a paragraph
        // Explicit OTP wording beats a generic "Continue".
        if (/otp|code/i.test(t)) score += 40;
        if ((el as HTMLInputElement).type === "submit") score += 20;
        if (el.tagName === "BUTTON") score += 10;
        if ((el as HTMLButtonElement).disabled) score -= 200;

        if (!best || score > best.score) best = { el, score };
      }

      return best ? qn.mark(best.el, "advance") : null;
    },
    hints,
    pattern.source
  );

  if (!selector) return false;

  await Promise.race([
    page.click(selector),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  return true;
}

/* ------------------------------------------------------------------ *
 * Step 3 — the OTP itself.
 * ------------------------------------------------------------------ */

const OTP_WORDS = /(otp|one ?time|verification|verify|passcode|security ?code|\bcode\b)/i;

/** True once the page is actually asking for a code. */
export async function otpFieldPresent(page: Page): Promise<boolean> {
  await installFinder(page);
  return page.evaluate((otpSrc: string) => {
    const qn = (window as any).__qn;
    const OTP = new RegExp(otpSrc, "i");
    const inputs = qn.inputs();
    // Either one field that says "OTP", or the split 4-6 single-digit boxes.
    if (inputs.some((el: HTMLElement) => OTP.test(qn.describe(el)))) return true;
    const tiny = inputs.filter((el: HTMLElement) => {
      const ml = Number(el.getAttribute("maxlength") || 0);
      return ml === 1;
    });
    return tiny.length >= 4;
  }, OTP_WORDS.source);
}

/**
 * Types the code, handling both layouts: a single field, or the split
 * one-digit-per-box pattern that most Indian portals use.
 */
export async function fillOtp(
  page: Page,
  code: string,
  hints: string[] = []
): Promise<boolean> {
  await installFinder(page);
  const digits = code.replace(/\D/g, "");
  if (!digits) return false;

  const plan = await page.evaluate(
    (hintList: string[], otpSrc: string) => {
      const qn = (window as any).__qn;
      const OTP = new RegExp(otpSrc, "i");

      for (const h of hintList) {
        const el = document.querySelector(h) as HTMLElement | null;
        if (el && qn.visible(el)) return { mode: "single", sel: qn.mark(el, "otp") };
      }

      const inputs = qn.inputs();

      const boxes = inputs.filter(
        (el: HTMLElement) => Number(el.getAttribute("maxlength") || 0) === 1
      );
      if (boxes.length >= 4) {
        boxes.forEach((el: HTMLElement, i: number) => qn.mark(el, "otp" + i));
        return { mode: "split", count: boxes.length };
      }

      let best: HTMLElement | null = null;
      for (const el of inputs) {
        const d = qn.describe(el);
        if (!OTP.test(d)) continue;
        if (/phone|mobile|email/.test(d)) continue;
        best = el;
        break;
      }
      // Last resort: the only text-ish field on an otherwise bare screen is
      // almost certainly the code box even if nothing is labelled.
      if (!best && inputs.length === 1) best = inputs[0];

      return best ? { mode: "single", sel: qn.mark(best, "otp") } : null;
    },
    hints,
    OTP_WORDS.source
  );

  if (!plan) return false;

  if ((plan as any).mode === "split") {
    const count: number = (plan as any).count;
    for (let i = 0; i < Math.min(count, digits.length); i++) {
      const sel = `[${MARK}='otp${i}']`;
      await page.click(sel);
      await page.type(sel, digits[i], { delay: 60 });
    }
  } else {
    const sel = (plan as any).sel as string;
    await page.click(sel, { clickCount: 3 });
    await page.type(sel, digits, { delay: 55 });
  }
  return true;
}

const SUBMIT_OTP_WORDS =
  /(verify|submit|confirm|continue|proceed|sign ?in|log ?in|next|done)/i;

export function submitOtpPattern(): RegExp {
  return SUBMIT_OTP_WORDS;
}

/* ------------------------------------------------------------------ *
 * Step 4 — read the balance.
 *
 * This is the same generic scan the Chrome extension uses (see
 * chrome-extension/extractor.js). Kept behaviourally identical on purpose:
 * whichever path a user syncs through, a program that reads correctly in
 * one should read correctly in the other.
 * ------------------------------------------------------------------ */

export async function extractBalance(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const BALANCE_WORDS =
      /(points?|miles?|avios|credits?|balance|rewards?|nights?)/i;
    const NUMBER = /\b(\d{1,3}(?:[.,]\d{3})*|\d{2,7})\b/;

    function parseNumber(raw: string): number | null {
      const cleaned = String(raw).replace(/[.,](?=\d{3}\b)/g, "");
      const n = parseInt(cleaned, 10);
      return Number.isFinite(n) ? n : null;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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

    let best: { value: number; score: number } | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || "").trim();
      if (!BALANCE_WORDS.test(text)) continue;

      const numMatch = text.match(NUMBER);
      if (!numMatch) continue;

      const value = parseNumber(numMatch[0]);
      if (value === null || value < 10 || value > 20000000) continue;

      const wordIndex = text.search(BALANCE_WORDS);
      const numIndex = numMatch.index ?? 0;
      const distance = Math.abs(wordIndex - numIndex);
      const lengthPenalty = Math.min(text.length, 200);
      const score = 1000 - distance * 2 - lengthPenalty;

      if (!best || score > best.score) best = { value, score };
    }

    return best ? best.value : null;
  });
}

/* ------------------------------------------------------------------ *
 * Misc.
 * ------------------------------------------------------------------ */

/** Wait for the page to settle without failing the whole sync on timeout. */
export async function settle(page: Page, ms = 2500): Promise<void> {
  try {
    await page.waitForNetworkIdle({ idleTime: 600, timeout: ms });
  } catch {
    // A page that keeps a socket open forever is normal, not an error.
  }
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Short, human-readable note about where the automation currently is.
 * Shown to the user alongside the screenshot so a failure is diagnosable
 * without reading logs.
 */
export async function describePage(page: Page): Promise<string> {
  try {
    const title = await page.title();
    const url = page.url();
    return `${title || "(untitled)"} — ${url.slice(0, 120)}`;
  } catch {
    return "(page unavailable)";
  }
}
