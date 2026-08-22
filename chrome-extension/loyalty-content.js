// Runs on every page (same <all_urls> scope as content.js). Cheap early
// exit if the hostname isn't a known loyalty program, so this does nothing
// on the other 99% of sites a user visits.
//
// Security: this file NEVER sees the bearer token. It only reports numbers
// it read off the visible page via chrome.runtime.sendMessage; the
// background service worker is the only place the token lives and the
// only place that talks to the API.

(function () {
  const programCode = self.qnResolveProgram(location.hostname);
  if (!programCode) return;

  function scanAndSend() {
    const result = self.qnExtractBalance(programCode);
    if (!result) return;
    chrome.runtime.sendMessage({
      type: "QN_LOYALTY_CANDIDATE",
      program_code: result.program_code,
      balance: result.balance,
      page_host: location.hostname.replace(/^www\./, ""),
      captured_at: new Date().toISOString(),
    });
  }

  scanAndSend();

  // Loyalty account pages are often SPAs (React/Angular dashboards) that
  // render the balance widget after an XHR completes — same debounced
  // mutation-observer pattern as content.js.
  let lastScan = Date.now();
  const observer = new MutationObserver(() => {
    if (Date.now() - lastScan > 4000) {
      lastScan = Date.now();
      scanAndSend();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
