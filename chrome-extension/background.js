// Service worker. Holds the latest page-info per tab in memory (cleared on
// tab close/navigation) and refreshes the extension's badge with a quick
// hint once the API responds, so the answer is visible without opening the
// popup.

const API_BASE = "https://quorum-nexus.vercel.app";
const tabInfo = new Map(); // tabId -> { merchant, domain, url, result }

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
