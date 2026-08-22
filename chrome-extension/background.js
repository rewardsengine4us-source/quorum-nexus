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

async function qnSyncPoints(candidate) {
  const token = await qnGetToken();
  if (!token) return; // not paired yet, nothing to do

  const now = Date.now();
  const last = lastSyncAt.get(candidate.program_code) || 0;
  if (now - last < 10000) return;
  lastSyncAt.set(candidate.program_code, now);

  try {
    await fetch(`${API_BASE}/api/extension/sync-points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(candidate),
    });
  } catch {
    // Silent by design: a failed sync isn't user-actionable mid-browse.
    // The popup's "Capture balance" button gives an explicit retry path.
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "QN_LOYALTY_CANDIDATE") return;
  qnSyncPoints({
    program_code: msg.program_code,
    balance: msg.balance,
    page_host: msg.page_host,
    captured_at: msg.captured_at,
  });
});

// ---------- Pairing ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "QN_PAIR") return;
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/extension/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: msg.code, label: "Chrome Extension" }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        sendResponse({ ok: false, error: data.error || "Pairing failed" });
        return;
      }
      await qnSetToken(data.token);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: "Network error" });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "QN_STATUS") return;
  (async () => {
    const token = await qnGetToken();
    if (!token) {
      sendResponse({ connected: false });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/extension/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      sendResponse({ connected: !!data.connected, last_used_at: data.last_used_at });
    } catch {
      sendResponse({ connected: true }); // token exists; API just unreachable
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "QN_DISCONNECT") return;
  (async () => {
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
    sendResponse({ ok: true });
  })();
  return true;
});

// Manual "Capture balance" button in the popup: re-run the extractor on
// the active tab right now instead of waiting for the next DOM mutation.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "QN_CAPTURE_NOW") return;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      sendResponse({ ok: false, error: "No active tab" });
      return;
    }
    try {
      // Inject the shared lookup + extractor, then run them. Works even if
      // this page wasn't already matched by the declarative content_scripts
      // block (e.g. a program not yet in programs.js's host list, or the
      // user wants to try capturing from an unrelated page).
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["programs.js", "extractor.js"],
      });
      const [{ result: candidate }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const code = self.qnResolveProgram(location.hostname);
          return self.qnExtractBalance(code);
        },
      });
      if (!candidate) {
        sendResponse({ ok: false, error: "No balance found on this page" });
        return;
      }
      await qnSyncPoints({
        ...candidate,
        page_host: tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "",
        captured_at: new Date().toISOString(),
      });
      sendResponse({ ok: true, ...candidate });
    } catch (e) {
      sendResponse({ ok: false, error: "Could not read this page" });
    }
  });
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "QN_PAGE_INFO" || !sender.tab?.id) return;
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
});

chrome.tabs.onRemoved.addListener((tabId) => tabInfo.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabInfo.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});

// Popup asks for whatever we currently know about the active tab.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "QN_GET_ACTIVE_INFO") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    sendResponse(tab ? tabInfo.get(tab.id) ?? null : null);
  });
  return true; // keep the message channel open for the async sendResponse
});
