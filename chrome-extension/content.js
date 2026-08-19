// Runs on every page. Extracts a best-effort merchant name and hands it to
// the background worker, which caches per-tab so the popup can read it
// instantly instead of re-scraping the DOM each time it opens.

function guessMerchantName() {
  const ogSite = document.querySelector('meta[property="og:site_name"]');
  if (ogSite?.content) return ogSite.content.trim();

  const appName = document.querySelector('meta[name="application-name"]');
  if (appName?.content) return appName.content.trim();

  // Fall back to the hostname's second-level domain, title-cased.
  // e.g. "www.amazon.in" -> "Amazon"
  const host = location.hostname.replace(/^www\./, "");
  const parts = host.split(".");
  const base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function send() {
  chrome.runtime.sendMessage({
    type: "QN_PAGE_INFO",
    merchant: guessMerchantName(),
    domain: location.hostname.replace(/^www\./, ""),
    url: location.href,
  });
}

send();

// SPA checkout flows (Amazon, Flipkart, etc.) often change content without a
// full navigation. Re-send on major DOM mutations, throttled.
let lastSend = Date.now();
const observer = new MutationObserver(() => {
  if (Date.now() - lastSend > 4000) {
    lastSend = Date.now();
    send();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
