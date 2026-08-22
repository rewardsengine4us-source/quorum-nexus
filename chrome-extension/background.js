// Service worker. Holds the latest page-info per tab in memory (cleared on
// tab close/navigation) and refreshes the extension's badge with a quick
// hint once the API responds, so the answer is visible without opening the
// popup.
//
// This file is also the ONLY place the extension's bearer token exists.
// Content scripts (content.js, loyalty-content.js) never see it — they
// only send plain messages here, and this worker attaches the token when
// calling the API.

const API_BASE = "https://quorum-nexus.vercel.app";
const tabInfo = new Map(); // tabId -> { merchant, domain, url, result }

// ---------- Token storage (background/popup only) ----------

async function qnGetToken() {
  const { qn_ext_token } = await chrome.storage.local.get("qn_ext_token");
  return qn_ext_token || null;
}

async function qnSetToken(token) {
  await chrome.storage.local.set({ qn_ext_token: token });
}

async function qnClearToken() {
  await chrome.storage.local.remove("qn_ext_token");
}

// ---------- Loyalty balance sync ----------

// Debounce per program so a chatty SPA re-render doesn't spam the API —
// same balance reported twice within 10s is skipped.
const lastSyncAt = new Map(); // program_code -> timestamp

/**
 * Returns { ok, error } rather than swallowing failures.
 *
 * The previous version caught everything and returned nothing, so a sync
 * that 401'd looked exactly like one that succeeded — and "Capture balance"
 * could report success while writing nothing. Automatic captures still stay
 * quiet (a mid-browse toast is not useful), but the manual button now tells
 * the truth about what happened.
 */
async function qnSyncPoints(candidate, { force = false } = {}) {
  const token = await qnGetToken();
  if (!token) return { ok: false, error: "Not paired with the website yet." };

  // Debounce per program so a chatty SPA re-render doesn't spam the API.
  // The manual button bypasses it: the user explicitly asked, and being
  // told "nothing happened" because of an invisible timer is baffling.
  const now = Date.now();
  const last = lastSyncAt.get(candidate.program_code) || 0;
  if (!force && now - last < 10000) return { ok: true, skipped: "debounced" };
  lastSyncAt.set(candidate.program_code, now);

  try {
    const res = await fetch(`${API_BASE}/api/extension/sync-points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(candidate),
    });
    if (res.status === 401) {
      await qnClearToken();
      return { ok: false, error: "This device was unpaired. Pair again." };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Sync failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not reach the server: ${e.message}` };
  }
}

// ---------- One message router ----------
//
// Every handler lives here, in a single listener, on purpose.
//
// Chrome runs EVERY registered onMessage listener for EVERY message. When
// handlers were split across six listeners, clicking "Pair" ran all six:
// the five that didn't care hit their `if (type !== ...) return;` guard and
// returned undefined, which tells Chrome "no async reply coming". That was
// enough to tear the response channel down before the one genuinely async
// handler — waiting on fetch — could call sendResponse. The popup's callback
// fired with undefined, the token was never stored, and pairing had never
// once succeeded. Zero rows in extension_tokens, ever.
//
// A single listener with a single `return true` cannot have that problem:
// there is no second listener to close the channel early.

const QN_HANDLERS = {
  // Fire-and-forget: a content script reporting a balance it spotted.
  QN_LOYALTY_CANDIDATE: async (msg) => {
    await qnSyncPoints({
      program_code: msg.program_code,
      balance: msg.balance,
      page_host: msg.page_host,
      captured_at: msg.captured_at,
    });
    return { ok: true };
  },

  QN_PAIR: async (msg) => {
    const code = String(msg.code || "").trim().toUpperCase();
    if (!code) return { ok: false, error: "Enter the pairing code from the website." };
    try {
      const res = await fetch(`${API_BASE}/api/extension/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, label: "Chrome Extension" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        return { ok: false, error: data.error || `Pairing failed (HTTP ${res.status})` };
      }
      await qnSetToken(data.token);
      return { ok: true };
    } catch (e) {
      // Surface the real reason rather than a blanket "Network error" —
      // that phrasing sent us hunting a connectivity problem that did not
      // exist while the actual fault was in this file.
      return { ok: false, error: `Could not reach the server: ${e.message}` };
    }
  },

  QN_STATUS: async () => {
    const token = await qnGetToken();
    if (!token) return { connected: false };
    try {
      const res = await fetch(`${API_BASE}/api/extension/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Token was revoked server-side; stop claiming we are connected.
        await qnClearToken();
        return { connected: false };
      }
      const data = await res.json();
      return { connected: !!data.connected, last_used_at: data.last_used_at };
    } catch {
      return { connected: true }; // token exists; API just unreachable
    }
  },

  QN_DISCONNECT: async () => {
    const token = await qnGetToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/api/extension/revoke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: "{}",
        });
      } catch {
        // Best-effort: clear locally regardless of network outcome.
      }
    }
    await qnClearToken();
    return { ok: true };
  },

  // Manual "Capture balance": re-run the extractor on the active tab now
  // rather than waiting for the next DOM mutation.
  QN_CAPTURE_NOW: async () => {
    const token = await qnGetToken();
    if (!token) return { ok: false, error: "Pair with the website first." };

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return { ok: false, error: "No active tab" };

    try {
      // Inject the shared lookup + extractor, then run them. Works even on a
      // page the declarative content_scripts block didn't match.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["programs.js", "extractor.js"],
      });
      const [{ result: candidate }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const code = self.qnResolveProgram(location.hostname);
          if (!code) return { __noProgram: true, host: location.hostname };
          return self.qnExtractBalance(code);
        },
      });

      if (candidate?.__noProgram) {
        return {
          ok: false,
          error: `${candidate.host} isn't a recognised loyalty program yet.`,
        };
      }
      if (!candidate) {
        return {
          ok: false,
          error: "Couldn't find a balance on this page. Open your account or points page and try again.",
        };
      }

      const synced = await qnSyncPoints({
        ...candidate,
        page_host: tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "",
        captured_at: new Date().toISOString(),
      }, { force: true });
      if (!synced.ok) return { ok: false, error: synced.error };
      return { ok: true, ...candidate };
    } catch (e) {
      return { ok: false, error: `Could not read this page: ${e.message}` };
    }
  },

  QN_GET_ACTIVE_INFO: async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return tab ? tabInfo.get(tab.id) ?? null : null;
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Badge upkeep is genuinely fire-and-forget and needs the sender's tab, so
  // it stays outside the router's request/response shape.
  if (msg?.type === "QN_PAGE_INFO") {
    qnHandlePageInfo(msg, sender);
    return false;
  }

  const handler = QN_HANDLERS[msg?.type];
  if (!handler) return false;

  handler(msg, sender)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ ok: false, error: e?.message || "Unexpected error" }));

  return true; // one listener, one open channel
});

// ---------- Badge ----------

function qnHandlePageInfo(msg, sender) {
  if (!sender.tab?.id) return;
  const tabId = sender.tab.id;
  const existing = tabInfo.get(tabId);

  // Skip a redundant lookup if the domain hasn't actually changed.
  if (existing?.domain === msg.domain) return;

  tabInfo.set(tabId, { merchant: msg.merchant, domain: msg.domain, url: msg.url, result: null });
  chrome.action.setBadgeText({ tabId, text: "…" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748b" });

  const qs = new URLSearchParams({ merchant: msg.merchant, domain: msg.domain });
  fetch(`${API_BASE}/api/public/best-card?${qs.toString()}`)
    .then((r) => r.json())
    .then((data) => {
      const entry = tabInfo.get(tabId);
      if (!entry) return;
      entry.result = data;
      tabInfo.set(tabId, entry);
      if (data.cards?.length) {
        chrome.action.setBadgeText({ tabId, text: String(Math.round(data.cards[0].rate)) + "x" });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
      } else {
        chrome.action.setBadgeText({ tabId, text: "" });
      }
    })
    .catch(() => {
      chrome.action.setBadgeText({ tabId, text: "" });
    });
}

chrome.tabs.onRemoved.addListener((tabId) => tabInfo.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabInfo.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});

