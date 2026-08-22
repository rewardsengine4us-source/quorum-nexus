const merchantEl = document.getElementById("merchant");
const contentEl = document.getElementById("content");

function renderCards(data) {
  if (!data.cards?.length) {
    contentEl.className = "state";
    contentEl.textContent = data.category
      ? `No earning rates recorded for ${data.category} yet.`
      : "Couldn't identify a spending category for this site yet.";
    return;
  }

  const [best, ...rest] = data.cards;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="card">
      <div class="bank">${escapeHtml(best.bankName)}</div>
      <div class="name">${escapeHtml(best.cardName)}</div>
      <div class="rate">${best.rate}× per ₹100</div>
      ${best.isAccelerated ? '<span class="pill">accelerated category</span>' : ""}
    </div>
    ${
      rest.length
        ? `<div class="alt-list">${rest
            .map(
              (c) =>
                `<div class="alt-row"><span class="n">${escapeHtml(c.cardName)}</span><span class="r">${c.rate}×</span></div>`
            )
            .join("")}</div>`
        : ""
    }
  `;
  contentEl.className = "";
  contentEl.replaceChildren(div);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function poll(attempt = 0) {
  chrome.runtime.sendMessage({ type: "QN_GET_ACTIVE_INFO" }, (info) => {
    if (!info) {
      contentEl.textContent = "No page detected. Try reloading the tab.";
      return;
    }
    merchantEl.textContent = info.merchant || info.domain;
    if (info.result) {
      renderCards(info.result);
    } else if (attempt < 8) {
      setTimeout(() => poll(attempt + 1), 400);
    } else {
      contentEl.textContent = "Taking longer than expected — try reopening this.";
    }
  });
}

poll();

// ---------- Loyalty balance sync (pairing / capture / disconnect) ----------

const qnStatusEl = document.getElementById("qnStatus");
const qnPairForm = document.getElementById("qnPairForm");
const qnConnectedActions = document.getElementById("qnConnectedActions");
const qnCodeInput = document.getElementById("qnCodeInput");
const qnPairBtn = document.getElementById("qnPairBtn");
const qnCaptureBtn = document.getElementById("qnCaptureBtn");
const qnDisconnectBtn = document.getElementById("qnDisconnectBtn");
const qnMsg = document.getElementById("qnMsg");

function qnShowMsg(text, kind) {
  qnMsg.textContent = text || "";
  qnMsg.className = "qn-msg" + (kind ? " " + kind : "");
}

function qnRenderConnected(connected) {
  qnStatusEl.textContent = connected ? "connected" : "not connected";
  qnStatusEl.className = "qn-status" + (connected ? " connected" : "");
  qnPairForm.style.display = connected ? "none" : "block";
  qnConnectedActions.style.display = connected ? "block" : "none";
}

function qnRefreshStatus() {
  chrome.runtime.sendMessage({ type: "QN_STATUS" }, (res) => {
    qnRenderConnected(!!res?.connected);
  });
}

qnPairBtn.addEventListener("click", () => {
  const code = qnCodeInput.value.trim().toUpperCase();
  if (!code) {
    qnShowMsg("Enter the pairing code from the website.", "error");
    return;
  }
  qnPairBtn.disabled = true;
  qnShowMsg("Pairing…");
  chrome.runtime.sendMessage({ type: "QN_PAIR", code }, (res) => {
    qnPairBtn.disabled = false;
    if (res?.ok) {
      qnCodeInput.value = "";
      qnShowMsg("Paired.", "ok");
      qnRenderConnected(true);
    } else {
      qnShowMsg(res?.error || "Pairing failed.", "error");
    }
  });
});

qnCaptureBtn.addEventListener("click", () => {
  qnCaptureBtn.disabled = true;
  qnShowMsg("Reading this page…");
  chrome.runtime.sendMessage({ type: "QN_CAPTURE_NOW" }, (res) => {
    qnCaptureBtn.disabled = false;
    if (res?.ok) {
      qnShowMsg(`Synced ${res.program_code}: ${res.balance.toLocaleString()}`, "ok");
    } else {
      qnShowMsg(res?.error || "Couldn't read a balance on this page.", "error");
    }
  });
});

qnDisconnectBtn.addEventListener("click", () => {
  qnDisconnectBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "QN_DISCONNECT" }, () => {
    qnDisconnectBtn.disabled = false;
    qnShowMsg("Disconnected.", "");
    qnRenderConnected(false);
  });
});

qnRefreshStatus();
