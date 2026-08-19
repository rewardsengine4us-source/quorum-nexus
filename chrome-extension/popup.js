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
