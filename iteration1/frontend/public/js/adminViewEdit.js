(function attachAdminViewEdit(global) {
  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = !!isLoading;
    button.textContent = isLoading ? (loadingText || "Saving...") : button.dataset.originalText;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  async function jsonFetch(url, { method = "GET", csrfToken, data } = {}) {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "CSRF-Token": csrfToken || ""
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "same-origin"
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_err) {
      payload = {};
    }

    return { response, payload };
  }

  function extractMessage(payload, fallback) {
    if (!payload) return fallback;
    if (payload.message) return String(payload.message);
    if (payload.error) return String(payload.error);
    return fallback;
  }

  function openConfirmDialog(dialog, { title, message, onConfirm }) {
    if (!dialog) return;
    const titleNode = dialog.querySelector("[data-dialog-title]");
    const messageNode = dialog.querySelector("[data-dialog-message]");
    const confirmBtn = dialog.querySelector("[data-dialog-confirm]");
    const cancelBtn = dialog.querySelector("[data-dialog-cancel]");

    if (titleNode) titleNode.textContent = title || "Please confirm";
    if (messageNode) messageNode.textContent = message || "Are you sure?";

    function cleanup() {
      confirmBtn?.removeEventListener("click", confirmHandler);
      cancelBtn?.removeEventListener("click", cancelHandler);
      dialog.removeEventListener("cancel", cancelHandler);
    }

    function closeDialog() {
      cleanup();
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }

    async function confirmHandler() {
      await onConfirm?.();
      closeDialog();
    }

    function cancelHandler() {
      closeDialog();
    }

    confirmBtn?.addEventListener("click", confirmHandler);
    cancelBtn?.addEventListener("click", cancelHandler);
    dialog.addEventListener("cancel", cancelHandler);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function createRowEditor(config) {
    const {
      rowEl,
      type,
      userId,
      initialData,
      editableFields,
      endpoint,
      csrfToken,
      fieldDefs,
      sharedState,
      mapServerData,
      onDelete,
      deleteLabel = "User"
    } = config;

    let mode = "view";
    let originalData = { ...initialData };
    let editButtonRef = null;
    const hasDeleteAction = typeof onDelete === "function";

    function updateDataset(nextData) {
      editableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(nextData, field)) {
          rowEl.dataset[field] = String(nextData[field] ?? "");
        }
      });
    }

    function getActionCell() {
      return rowEl.querySelector(".cell-actions");
    }

    function clearFieldErrors() {
      rowEl.querySelectorAll("[data-field-error]").forEach((node) => {
        node.textContent = "";
      });
    }

    function showFieldError(field, message) {
      const target = rowEl.querySelector(`[data-field-error="${field}"]`);
      if (!target) return;
      target.textContent = message || "";
    }

    function setRowBanner(message) {
      const banner = rowEl.querySelector("[data-row-error]");
      if (!banner) return;
      banner.textContent = message || "";
      banner.classList.toggle("hidden", !message);
    }

    function renderActionsView() {
      const actionCell = getActionCell();
      if (!actionCell) return;

      actionCell.innerHTML = `
        <div class="action-cell" data-actions>
          <button class="action-btn js-edit-trigger" type="button" aria-label="Edit ${esc(type)}" title="Edit ${esc(type)}">
            <i class="fa-regular fa-pen-to-square" aria-hidden="true"></i>
            <span>Edit</span>
          </button>
          ${hasDeleteAction ? `
            <button class="action-btn delete-btn js-delete-trigger" type="button" aria-label="Delete ${esc(type)}" title="Delete ${esc(type)}">
              <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
              <span>Delete</span>
            </button>
          ` : ""}
        </div>
        <div class="row-error-banner hidden" data-row-error aria-live="polite"></div>
      `;

      const editBtn = actionCell.querySelector(".js-edit-trigger");
      const deleteBtn = actionCell.querySelector(".js-delete-trigger");
      editBtn?.addEventListener("click", () => enterEdit());
      deleteBtn?.addEventListener("click", async () => {
        await onDelete?.({ userId, rowEl, type, deleteLabel });
      });
      editButtonRef = editBtn;
    }

    function renderActionsEdit() {
      const actionCell = getActionCell();
      if (!actionCell) return;

      actionCell.innerHTML = `
        <form class="action-cell" data-edit-form>
          <button class="action-btn save-btn js-save-trigger" type="submit">Save</button>
          <button class="action-btn cancel-btn js-cancel-trigger" type="button">Cancel</button>
        </form>
        <div class="row-error-banner hidden" data-row-error aria-live="polite"></div>
      `;

      const form = actionCell.querySelector("[data-edit-form]");
      const cancelBtn = actionCell.querySelector(".js-cancel-trigger");
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await save();
      });
      cancelBtn?.addEventListener("click", () => cancel());
    }

    function renderViewRow() {
      fieldDefs.forEach((fieldDef) => {
        const cell = rowEl.querySelector(fieldDef.cellSelector);
        if (!cell) return;
        if (typeof fieldDef.renderView === "function") {
          fieldDef.renderView({ cell, data: originalData, rowEl });
          return;
        }
        const field = fieldDef.fields?.[0];
        const value = field ? originalData[field] : "";
        cell.textContent = value ? String(value) : "N/A";
      });
      renderActionsView();
      clearFieldErrors();
      mode = "view";
      if (sharedState && sharedState.activeEditor === api) {
        sharedState.activeEditor = null;
      }
    }

    function renderEditRow() {
      fieldDefs.forEach((fieldDef) => {
        const cell = rowEl.querySelector(fieldDef.cellSelector);
        if (!cell) return;
        if (typeof fieldDef.renderEdit === "function") {
          cell.innerHTML = fieldDef.renderEdit(originalData);
        }
      });
      renderActionsEdit();
      clearFieldErrors();
      mode = "edit";
    }

    function collectDraft() {
      const draft = {};
      editableFields.forEach((field) => {
        const node = rowEl.querySelector(`[name="${field}"]`);
        if (!node) return;
        const value = node.value;
        draft[field] = typeof value === "string" ? value.trim() : value;
      });
      return draft;
    }

    function diffEditable(draft) {
      const changed = {};
      editableFields.forEach((field) => {
        if (String(draft[field] ?? "") !== String(originalData[field] ?? "")) {
          changed[field] = draft[field];
        }
      });
      return changed;
    }

    function enterEdit() {
      if (mode === "edit") return;
      if (sharedState && sharedState.activeEditor && sharedState.activeEditor !== api) {
        sharedState.activeEditor.cancel({ focusEdit: false });
      }
      if (sharedState) sharedState.activeEditor = api;
      setRowBanner("");
      renderEditRow();
      rowEl.querySelector("input, select, textarea")?.focus();
    }

    function cancel({ focusEdit = true } = {}) {
      updateDataset(originalData);
      renderViewRow();
      if (focusEdit) editButtonRef?.focus();
      setRowBanner("");
    }

    async function save() {
      if (mode !== "edit") return;
      const draft = collectDraft();
      const changed = diffEditable(draft);
      if (Object.keys(changed).length === 0) {
        cancel();
        return;
      }

      clearFieldErrors();
      setRowBanner("");

      const saveBtn = rowEl.querySelector(".js-save-trigger");
      setLoading(saveBtn, true, "Saving...");
      try {
        const { response, payload } = await jsonFetch(endpoint(userId), {
          method: "PATCH",
          csrfToken,
          data: changed
        });

        if (response.status === 200 && payload?.data) {
          const nextData = typeof mapServerData === "function"
            ? mapServerData(payload.data, originalData)
            : payload.data;
          originalData = { ...originalData, ...nextData };
          updateDataset(originalData);
          renderViewRow();
          editButtonRef?.focus();
          return;
        }

        if (response.status === 401 || response.status === 403) {
          cancel({ focusEdit: false });
          setRowBanner("Not authorized.");
          return;
        }

        if (response.status === 409 && payload?.field) {
          showFieldError(payload.field, payload.message || "Already exists.");
          return;
        }

        if (response.status === 422 && payload?.errors && typeof payload.errors === "object") {
          Object.entries(payload.errors).forEach(([field, message]) => {
            showFieldError(field, message);
          });
          return;
        }

        setRowBanner(extractMessage(payload, "Update failed."));
      } finally {
        setLoading(saveBtn, false);
      }
    }

    const api = {
      rowEl,
      enterEdit,
      cancel,
      save,
      renderViewRow,
      renderEditRow
    };

    renderViewRow();
    return api;
  }

  global.AdminViewEdit = {
    esc,
    setLoading,
    jsonFetch,
    extractMessage,
    openConfirmDialog,
    createRowEditor
  };
})(window);
