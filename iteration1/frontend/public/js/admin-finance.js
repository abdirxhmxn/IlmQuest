(function initAdminFinancePage() {
  const summaryRoot = document.querySelector("[data-finance-summary-root]");
  if (!summaryRoot) return;

  const linkTokenForm = document.getElementById("financeLinkTokenForm");
  const connectForm = document.getElementById("financeConnectForm");
  const syncForm = document.getElementById("financeSyncForm");
  const actionStatus = document.getElementById("financeActionStatus");
  const linkTokenOutput = document.getElementById("financeLinkTokenOutput");
  const csrfToken =
    linkTokenForm?.querySelector('input[name="_csrf"]')?.value ||
    connectForm?.querySelector('input[name="_csrf"]')?.value ||
    syncForm?.querySelector('input[name="_csrf"]')?.value ||
    "";

  const summaryEls = {
    monthlyIncome: document.getElementById("financeMonthlyIncomeValue"),
    monthlyExpense: document.getElementById("financeMonthlyExpenseValue"),
    netCashFlow: document.getElementById("financeNetCashFlowValue"),
    entryCount: document.getElementById("financeEntryCountValue"),
    unmatchedCount: document.getElementById("financeUnmatchedCountValue"),
    matchedCount: document.getElementById("financeMatchedCountValue"),
    lastSyncAt: document.getElementById("financeLastSyncAtValue"),
    lastSyncStatus: document.getElementById("financeLastSyncStatusValue"),
    lastSyncMessage: document.getElementById("financeLastSyncMessageValue")
  };

  const tableBodies = {
    entries: document.getElementById("financeEntriesBody"),
    unmatched: document.getElementById("financeUnmatchedBody")
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, tone) {
    if (!actionStatus) return;
    actionStatus.textContent = message || "";
    actionStatus.classList.remove("is-success", "is-error", "is-info");
    if (!message) return;
    actionStatus.classList.add(
      tone === "error" ? "is-error" : tone === "success" ? "is-success" : "is-info"
    );
  }

  function formToUrlEncoded(form) {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      params.append(key, value);
    });
    return params.toString();
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch (_err) {
      payload = {};
    }
    return { response, payload };
  }

  function renderEntryRows(rows) {
    if (!tableBodies.entries) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tableBodies.entries.innerHTML = '<tr><td colspan="8" class="empty-row">No finance entries found.</td></tr>';
      return;
    }

    tableBodies.entries.innerHTML = rows
      .map((row) => `
        <tr>
          <td><span class="status-chip status-${row.entryType === "income" ? "paid" : "due"}">${escapeHtml(row.entryTypeLabel || "")}</span></td>
          <td>${escapeHtml(row.categoryLabel || "")}</td>
          <td class="mono-cell">${escapeHtml(row.amountLabel || "$0.00")}</td>
          <td>${escapeHtml(row.dateLabel || "N/A")}</td>
          <td>${escapeHtml(row.source || "")}</td>
          <td>${escapeHtml(row.status || "")}</td>
          <td>${escapeHtml(row.memo || row.reference || "—")}</td>
          <td>
            <form action="/admin/finance/entries/${encodeURIComponent(row.id)}/archive" method="POST">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <button type="submit" class="table-action">Archive</button>
            </form>
          </td>
        </tr>
      `)
      .join("");
  }

  function renderUnmatchedRows(rows) {
    if (!tableBodies.unmatched) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tableBodies.unmatched.innerHTML = '<tr><td colspan="7" class="empty-row">No unmatched bank transactions.</td></tr>';
      return;
    }

    tableBodies.unmatched.innerHTML = rows
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.dateLabel || "N/A")}</td>
          <td class="strong-cell">${escapeHtml(row.description || "Bank transaction")}</td>
          <td>${escapeHtml(row.accountName || "Bank Account")}</td>
          <td>${escapeHtml(row.direction || "")}</td>
          <td class="mono-cell">${escapeHtml(row.amountLabel || "$0.00")}</td>
          <td>${escapeHtml(row.category || "")}</td>
          <td>
            <form class="reconcile-form" action="/admin/finance/reconcile" method="POST">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
              <input type="hidden" name="bankTransactionId" value="${escapeHtml(row.id)}" />
              <select name="action" required>
                <option value="ignore">Ignore</option>
                <option value="match_entry">Match Entry</option>
              </select>
              <input type="text" name="targetId" placeholder="Optional match id" />
              <button type="submit" class="table-action">Apply</button>
            </form>
          </td>
        </tr>
      `)
      .join("");
  }

  function applySummary(finance) {
    const summary = finance?.summary || {};
    if (summaryEls.monthlyIncome) summaryEls.monthlyIncome.textContent = summary.monthlyIncomeLabel || "$0.00";
    if (summaryEls.monthlyExpense) summaryEls.monthlyExpense.textContent = summary.monthlyExpenseLabel || "$0.00";
    if (summaryEls.netCashFlow) {
      summaryEls.netCashFlow.textContent = summary.netCashFlowLabel || "$0.00";
      const numericNet = Number(summary.netCashFlow || 0);
      summaryEls.netCashFlow.classList.toggle("is-positive", numericNet >= 0);
      summaryEls.netCashFlow.classList.toggle("is-negative", numericNet < 0);
    }
    if (summaryEls.unmatchedCount) summaryEls.unmatchedCount.textContent = String(Number(summary.unmatchedCount || 0));
    if (summaryEls.matchedCount) summaryEls.matchedCount.textContent = String(Number(summary.matchedCount || 0));
    if (summaryEls.lastSyncAt) summaryEls.lastSyncAt.textContent = summary.lastSyncAtLabel || "Never";
    if (summaryEls.lastSyncStatus) summaryEls.lastSyncStatus.textContent = summary.lastSyncStatus || "never";
    if (summaryEls.lastSyncMessage) summaryEls.lastSyncMessage.textContent = summary.lastSyncMessage || "No issues reported.";
    const entryRows = finance?.entries?.rows || [];
    if (summaryEls.entryCount) summaryEls.entryCount.textContent = String(entryRows.length);
    renderEntryRows(entryRows);
    renderUnmatchedRows(finance?.bank?.unmatchedRows || []);
  }

  async function refreshSummary() {
    const { response, payload } = await jsonFetch("/admin/finance/summary", { method: "GET" });
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || "Could not refresh finance summary.");
    }
    applySummary(payload.finance || {});
  }

  linkTokenForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Creating link token...", "info");

    const { response, payload } = await jsonFetch("/admin/finance/bank/link-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formToUrlEncoded(linkTokenForm)
    });

    if (!response.ok || !payload?.success) {
      setStatus(payload?.message || "Could not create link token.", "error");
      return;
    }

    if (linkTokenOutput) {
      linkTokenOutput.value = payload?.data?.linkToken || "";
    }
    setStatus("Link token created. Use it with Plaid Link to retrieve a public token.", "success");
  });

  connectForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Connecting bank account...", "info");

    const { response, payload } = await jsonFetch(connectForm.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formToUrlEncoded(connectForm)
    });

    if (!response.ok || !payload?.success) {
      setStatus(payload?.message || "Could not connect bank account.", "error");
      return;
    }

    setStatus(payload?.message || "Bank connected.", "success");
    await refreshSummary().catch(() => null);
    connectForm.reset();
  });

  syncForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Syncing bank transactions...", "info");

    const { response, payload } = await jsonFetch(syncForm.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formToUrlEncoded(syncForm)
    });

    if (!response.ok || !payload?.success) {
      setStatus(payload?.message || "Bank sync failed.", "error");
      return;
    }

    if (payload?.data?.finance) {
      applySummary(payload.data.finance);
    } else {
      await refreshSummary().catch(() => null);
    }

    setStatus(payload?.message || "Bank sync complete.", response.status === 207 ? "info" : "success");
  });

  const entryTypeEl = document.getElementById("financeEntryType");
  const categoryEl = document.getElementById("financeEntryCategory");
  entryTypeEl?.addEventListener("change", () => {
    if (!categoryEl) return;
    categoryEl.setAttribute(
      "list",
      entryTypeEl.value === "expense" ? "financeExpenseCategories" : "financeIncomeCategories"
    );
  });
})();
