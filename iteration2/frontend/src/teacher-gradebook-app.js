import Alpine from "alpinejs";
import htmx from "htmx.org";

window.Alpine = Alpine;
window.htmx = htmx;

Alpine.data("gradebookDrawer", () => ({
  open: false,
  selectedCell: null,
  init() {
    this.open = false;
    this.selectedCell = null;
    document.body.classList.remove("drawer-open");
    window.__gradebookDrawer = this;
  },
  show(cellContext = null) {
    this.selectedCell = cellContext || null;
    this.open = true;
    document.body.classList.add("drawer-open");
  },
  close() {
    this.open = false;
    this.selectedCell = null;
    document.body.classList.remove("drawer-open");
  }
}));

Alpine.start();

(function teacherGradebookApp() {
  const payloadNode = document.getElementById("teacherGradebookPayload");
  if (!payloadNode) return;

  const payload = JSON.parse(payloadNode.textContent || "{}");
  const csrfToken = String(payload.csrfToken || "");
  const classes = Array.isArray(payload.classes) ? payload.classes : [];
  const focusDateKey = String(payload.focusDateKey || "");
  const classStateById = new Map(
    classes.map((classView) => [String(classView.id || ""), classView])
  );
  const pendingMutations = new Map();
  const undoStack = [];
  let currentTabClassId = String(payload.activeClassId || classes?.[0]?.id || "");

  console.log(`[grading-v1] client rendered with ${classes.length} class(es)`);
  classes.forEach((classView) => {
    console.log(
      `[grading-v1] class ${String(classView.id || "unknown")} has ${Number(classView.studentCount || 0)} student(s), ${Number((classView.trackerColumns || classView.dateColumns || []).length || 0)} tracker date group(s), ${Number((classView.assessmentColumns || []).length || 0)} assessment column(s)`
    );
  });

  function getActiveClassPanel() {
    return Array.from(document.querySelectorAll("[data-gradebook-class-panel]")).find((panel) => (
      panel.classList.contains("is-active")
    )) || null;
  }

  function resetPanelScroll(panelEl) {
    const scroller = panelEl?.querySelector(".gradebook-v1-scroll");
    if (!(scroller instanceof HTMLElement)) return;

    const moveToTrackerEdge = () => {
      const focusHeader = focusDateKey
        ? panelEl?.querySelector(`[data-tracker-date-group][data-date-key="${focusDateKey}"]`)
        : null;

      if (focusHeader instanceof HTMLElement) {
        const stickyColumnWidth = panelEl?.querySelector(".gradebook-v1-student.sticky-col")?.getBoundingClientRect?.().width || 220;
        scroller.scrollLeft = Math.max(focusHeader.offsetLeft - stickyColumnWidth - 16, 0);
        return;
      }

      scroller.scrollLeft = 0;
    };

    // Some browsers restore nested horizontal scroll state after paint.
    moveToTrackerEdge();
    window.requestAnimationFrame(moveToTrackerEdge);
    window.setTimeout(moveToTrackerEdge, 40);
  }

  function activateClassTab(classId) {
    currentTabClassId = classId;
    document.querySelectorAll("[data-gradebook-class-tab]").forEach((button) => {
      button.classList.toggle("is-active", String(button.dataset.classId || "") === classId);
    });

    let activePanel = null;
    document.querySelectorAll("[data-gradebook-class-panel]").forEach((panel) => {
      const isActive = String(panel.dataset.classId || "") === classId;
      panel.classList.toggle("is-active", isActive);
      if (isActive) activePanel = panel;
    });

    resetPanelScroll(activePanel);
  }

  function resetInitialViewport() {
    resetPanelScroll(getActiveClassPanel());
  }

  function getDrawerShell() {
    return document.querySelector("[data-gradebook-drawer-shell]");
  }

  function setDrawerOpenState(open, cellContext = null) {
    const drawer = window.__gradebookDrawer;
    if (drawer) {
      if (open) drawer.show(cellContext || null);
      else drawer.close();
    }

    const drawerShell = getDrawerShell();
    if (!drawerShell) return;

    drawerShell.hidden = !open;
    drawerShell.dataset.open = open ? "true" : "false";
    drawerShell.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("drawer-open", open);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function encodeFormBody(formEl) {
    return new URLSearchParams(new FormData(formEl)).toString();
  }

  async function readErrorMessage(response, fallbackMessage) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      return data?.message || fallbackMessage;
    }

    const text = await response.text().catch(() => "");
    return text.trim() || fallbackMessage;
  }

  async function requestJson(url, { method = "GET", formEl = null, body = null } = {}) {
    const headers = {
      Accept: "application/json",
      "X-IlmQuest-Async": "true"
    };

    let requestBody = body;
    if (formEl) {
      requestBody = encodeFormBody(formEl);
    }

    if (requestBody != null && method !== "GET") {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : requestBody
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Gradebook request failed."));
    }

    return response.json();
  }

  function getDrawerContentElement() {
    return document.getElementById("gradebookDrawerContent");
  }

  function setDrawerContentHtml(html) {
    const target = getDrawerContentElement();
    if (!target) return;
    target.innerHTML = html;
  }

  function renderDrawerPlaceholder(message, detail = "") {
    return `
      <div class="gradebook-v1-drawer-placeholder">
        <h3>${escapeHtml(message)}</h3>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
      </div>
    `;
  }

  function buildDrawerOptionMarkup(detail) {
    const options = Array.isArray(detail?.options) ? detail.options : [];
    const selectedMarkKey = String(detail?.cell?.markKey || "");

    return [
      `<option value="">— Clear —</option>`,
      ...options.map((option) => {
        const optionKey = String(option?.key || "");
        const symbol = escapeHtml(option?.symbol || "");
        const label = escapeHtml(option?.label || "");
        const selected = optionKey === selectedMarkKey ? " selected" : "";
        return `<option value="${escapeHtml(optionKey)}"${selected}>${symbol}${label ? ` · ${label}` : ""}</option>`;
      })
    ].join("");
  }

  function buildDrawerHistoryMarkup(detail) {
    const history = Array.isArray(detail?.history) ? detail.history : [];
    if (!history.length) {
      return `<p>No audit history for this cell yet.</p>`;
    }

    return `
      <ul>
        ${history.map((entry) => `
          <li class="${entry?.isCurrent ? "is-current" : ""}">
            <strong>${escapeHtml(entry?.markSymbol || "—")}</strong>
            <span>${escapeHtml(entry?.markLabel || "Cleared")}</span>
            <small>${escapeHtml(entry?.action || "set")} · #${escapeHtml(entry?.sequenceNumber || 0)} · ${escapeHtml(entry?.actorName || "Staff")} · ${escapeHtml(entry?.createdAtLabel || "N/A")}</small>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderDrawerDetail(detail, savedMessage = "") {
    const cell = detail?.cell || {};
    return `
      <div class="gradebook-v1-drawer-head">
        <p class="gradebook-v1-kicker">Cell Details</p>
        <h3>${escapeHtml(detail?.studentName || "Student")}</h3>
        <p>${escapeHtml(cell?.detailLabel || "Grade Cell")} · ${escapeHtml(detail?.periodName || "")}</p>
        ${savedMessage ? `<p class="gradebook-v1-inline-success">${escapeHtml(savedMessage)}</p>` : ""}
      </div>

      <form class="gradebook-v1-drawer-form" action="/api/teacher/gradebook/cell/detail" method="POST" data-gradebook-drawer-form>
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="classId" value="${escapeHtml(detail?.classId || "")}">
        <input type="hidden" name="studentId" value="${escapeHtml(detail?.studentId || "")}">
        <input type="hidden" name="gradingPeriodId" value="${escapeHtml(detail?.gradingPeriodId || "")}">
        <input type="hidden" name="category" value="${escapeHtml(cell?.category || "")}">
        <input type="hidden" name="dateKey" value="${escapeHtml(cell?.dateKey || "")}">
        <input type="hidden" name="columnKey" value="${escapeHtml(cell?.columnKey || "")}">
        <input type="hidden" name="assessmentId" value="${escapeHtml(cell?.assessmentId || "")}">
        <input type="hidden" name="clientEventId" value="" data-gradebook-client-event-id>

        <label>
          <span>Mark</span>
          <select name="markKey">
            ${buildDrawerOptionMarkup(detail)}
          </select>
        </label>

        ${cell?.category === "subac" ? `
          <div class="gradebook-v1-drawer-grid">
            <label>
              <span>Reviewer</span>
              <input type="text" name="reviewer" maxlength="120" value="${escapeHtml(cell?.reviewer || "")}">
            </label>
            <label>
              <span>Revision Portion</span>
              <input type="text" name="revisionPortion" maxlength="120" value="${escapeHtml(cell?.revisionPortion || "")}">
            </label>
          </div>
        ` : ""}

        ${cell?.category === "behavior" ? `
          <label>
            <span>Behavior Subcategory</span>
            <input type="text" name="behaviorSubcategory" maxlength="80" value="${escapeHtml(cell?.behaviorSubcategory || "")}" placeholder="Adab, focus, effort...">
          </label>
        ` : ""}

        ${detail?.isClosed && detail?.postCloseEditEnabled ? `
          <label class="gradebook-v1-drawer-check">
            <input type="checkbox" name="postCloseEdit" value="true"${cell?.postCloseEdit ? " checked" : ""}>
            <span>Mark this as a post-close edit</span>
          </label>
          <label>
            <span>Post-close reason</span>
            <textarea name="postCloseReason" rows="2" maxlength="240">${escapeHtml(cell?.postCloseReason || "")}</textarea>
          </label>
        ` : ""}

        <label>
          <span>Internal Comment</span>
          <textarea name="internalComment" rows="4" maxlength="1600">${escapeHtml(cell?.internalComment || "")}</textarea>
        </label>

        <label>
          <span>Parent-facing Comment</span>
          <textarea name="parentComment" rows="4" maxlength="1600">${escapeHtml(cell?.parentComment || "")}</textarea>
        </label>

        <div class="gradebook-v1-drawer-actions">
          <button class="gradebook-v1-btn gradebook-v1-btn-primary" type="submit">Save Details</button>
          <button
            class="gradebook-v1-btn gradebook-v1-btn-secondary"
            type="button"
            data-gradebook-undo
            data-class-id="${escapeHtml(detail?.classId || "")}"
            data-student-id="${escapeHtml(detail?.studentId || "")}"
            data-grading-period-id="${escapeHtml(detail?.gradingPeriodId || "")}"
            data-category="${escapeHtml(cell?.category || "")}"
            data-date-key="${escapeHtml(cell?.dateKey || "")}"
            data-column-key="${escapeHtml(cell?.columnKey || "")}"
            data-assessment-id="${escapeHtml(cell?.assessmentId || "")}"
          >Undo Last Change</button>
        </div>
      </form>

      <section class="gradebook-v1-history">
        <h4>History</h4>
        ${buildDrawerHistoryMarkup(detail)}
      </section>
    `;
  }

  function buildClientEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function formatPercent(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return `${Number(value).toFixed(1)}%`;
  }

  function buildDefaultSummaryCells() {
    return {
      cashar: { display: "—", value: null },
      writing: { display: "—", value: null },
      subject: { display: "—", value: null },
      subac: { display: "—", value: null },
      attendance: { display: "—", value: null },
      behavior: { display: "—", value: null },
      assessment: { display: "—", value: null },
      final: { display: "—", value: null }
    };
  }

  function ensureSummaryCells(rowState) {
    if (!rowState) return buildDefaultSummaryCells();
    rowState.summaryCells = {
      ...buildDefaultSummaryCells(),
      ...(rowState.summaryCells || {})
    };
    return rowState.summaryCells;
  }

  function toCalcEvent(event = {}) {
    return {
      coordinateKey: event.coordinateKey,
      category: event.category,
      assessmentId: event.assessmentId,
      action: event.action || "set",
      mark: {
        key: event.mark?.key || "",
        symbol: event.mark?.symbol || "",
        label: event.mark?.label || "",
        normalizedValue: Number.isFinite(Number(event.mark?.normalizedValue)) ? Number(event.mark.normalizedValue) : null,
        countsTowardGrade: event.mark?.countsTowardGrade !== false
      },
      sequenceNumber: Number(event.sequenceNumber || 0)
    };
  }

  function getClassState(classId) {
    return classStateById.get(String(classId || "")) || null;
  }

  function getStudentRowState(classId, studentId) {
    const classState = getClassState(classId);
    if (!classState) return null;
    return (Array.isArray(classState.students) ? classState.students : []).find(
      (student) => String(student.id || "") === String(studentId || "")
    ) || null;
  }

  function getKeySystemForCell(classState, category) {
    if (category === "subac") return "subac";
    if (category === "attendance") return "attendance";
    if (category === "behavior") return "behavior";
    return "cashar";
  }

  function findOptionForCell(classState, category, markKey) {
    const keySystemKey = getKeySystemForCell(classState, category);
    const options = Array.isArray(classState?.keySystemOptions?.[keySystemKey]) ? classState.keySystemOptions[keySystemKey] : [];
    return options.find((option) => String(option.key || "") === String(markKey || "")) || null;
  }

  function findCellState(rowState, context) {
    if (context.category === "assessment") {
      return (Array.isArray(rowState.assessmentCells) ? rowState.assessmentCells : []).find(
        (cell) => String(cell.stableCellKey || "") === String(context.stableCellKey || "")
          || String(cell.assessmentId || "") === String(context.assessmentId || "")
      ) || null;
    }

    const dateGroup = (Array.isArray(rowState.dailyGroups) ? rowState.dailyGroups : []).find(
      (entry) => String(entry.dateKey || "") === String(context.dateKey || "")
    );
    if (!dateGroup) return null;
    return (Array.isArray(dateGroup.cells) ? dateGroup.cells : []).find(
      (cell) => String(cell.stableCellKey || "") === String(context.stableCellKey || "")
        || (
          String(cell.columnKey || "") === String(context.columnKey || "")
          && String(cell.category || "") === String(context.category || "")
        )
    ) || null;
  }

  function updateEventCollection(rowState, context, nextMarkKey, classState) {
    const currentEvents = Array.isArray(rowState?.clientState?.liveEvents) ? rowState.clientState.liveEvents : [];
    const existingIndex = currentEvents.findIndex((event) => String(event.coordinateKey || "") === String(context.coordinateKey || ""));
    const option = findOptionForCell(classState, context.category, nextMarkKey);

    if (!nextMarkKey || !option) {
      if (existingIndex >= 0) currentEvents.splice(existingIndex, 1);
      return;
    }

    const nextEvent = {
      coordinateKey: context.coordinateKey,
      category: context.category,
      dateKey: context.dateKey || "",
      columnKey: context.columnKey || "",
      assessmentId: context.assessmentId || "",
      action: "set",
      sequenceNumber: Number(Date.now()),
      mark: {
        key: option.key,
        symbol: option.symbol || "",
        label: option.label || "",
        normalizedValue: Number.isFinite(Number(option.normalizedValue)) ? Number(option.normalizedValue) : null,
        countsTowardGrade: option.countsTowardGrade !== false
      },
      metadata: {
        reviewer: "",
        revisionPortion: "",
        behaviorSubcategory: ""
      }
    };

    if (existingIndex >= 0) {
      currentEvents.splice(existingIndex, 1, nextEvent);
    } else {
      currentEvents.push(nextEvent);
    }
  }

  function updateCellState(rowState, context, nextMarkKey, classState) {
    const cell = findCellState(rowState, context);
    if (!cell) return;
    const option = findOptionForCell(classState, context.category, nextMarkKey);
    cell.markKey = nextMarkKey || "";
    cell.symbol = option?.symbol || "";
    cell.label = option?.label || "";
    cell.normalizedValue = Number.isFinite(Number(option?.normalizedValue)) ? Number(option.normalizedValue) : null;
    cell.tone = !option
      ? "empty"
      : option.countsTowardGrade === false
        ? "empty"
        : option.normalizedValue >= 0.85
          ? "excellent"
          : option.normalizedValue >= 0.65
            ? "strong"
            : option.normalizedValue >= 0.4
              ? "watch"
              : "critical";
  }

  function applyConfirmedEventToRowState(rowState, context, eventData, classState) {
    if (!rowState || !context) return;
    const currentEvents = Array.isArray(rowState?.clientState?.liveEvents) ? rowState.clientState.liveEvents : [];
    const existingIndex = currentEvents.findIndex((event) => String(event.coordinateKey || "") === String(context.coordinateKey || ""));
    const markKey = String(eventData?.mark?.key || "");

    if (!markKey || eventData?.action === "clear") {
      if (existingIndex >= 0) currentEvents.splice(existingIndex, 1);
      updateCellState(rowState, context, "", classState);
      recalculateRowSummaries(rowState);
      return;
    }

    const confirmedEvent = {
      coordinateKey: String(eventData.coordinateKey || context.coordinateKey || ""),
      stableCellKey: String(eventData.stableCellKey || context.stableCellKey || ""),
      category: String(eventData.category || context.category || ""),
      dateKey: String(eventData.dateKey || context.dateKey || ""),
      columnKey: String(eventData.columnKey || context.columnKey || ""),
      assessmentId: String(eventData.assessmentId || context.assessmentId || ""),
      action: String(eventData.action || "set"),
      sequenceNumber: Number(eventData.sequenceNumber || Date.now()),
      mark: {
        key: markKey,
        symbol: String(eventData?.mark?.symbol || ""),
        label: String(eventData?.mark?.label || ""),
        normalizedValue: Number.isFinite(Number(eventData?.mark?.normalizedValue)) ? Number(eventData.mark.normalizedValue) : null,
        countsTowardGrade: eventData?.mark?.countsTowardGrade !== false
      },
      metadata: {
        reviewer: "",
        revisionPortion: "",
        behaviorSubcategory: ""
      }
    };

    if (existingIndex >= 0) {
      currentEvents.splice(existingIndex, 1, confirmedEvent);
    } else {
      currentEvents.push(confirmedEvent);
    }

    updateCellState(rowState, context, markKey, classState);
    recalculateRowSummaries(rowState);
  }

  function applyDetailToRowState(detail) {
    const classId = String(detail?.classId || "");
    const studentId = String(detail?.studentId || "");
    const classState = getClassState(classId);
    const rowState = getStudentRowState(classId, studentId);
    if (!classState || !rowState || !detail?.cell) return;

    const context = {
      classId,
      studentId,
      coordinateKey: String(detail.cell.coordinateKey || ""),
      stableCellKey: String(detail.cell.stableCellKey || ""),
      category: String(detail.cell.category || ""),
      dateKey: String(detail.cell.dateKey || ""),
      columnKey: String(detail.cell.columnKey || ""),
      assessmentId: String(detail.cell.assessmentId || "")
    };

    const currentHistory = (Array.isArray(detail.history) ? detail.history : []).find((entry) => entry?.isCurrent);
    applyConfirmedEventToRowState(rowState, context, {
      coordinateKey: context.coordinateKey,
      stableCellKey: context.stableCellKey,
      category: context.category,
      dateKey: context.dateKey,
      columnKey: context.columnKey,
      assessmentId: context.assessmentId,
      action: detail.cell.markKey ? "set" : "clear",
      sequenceNumber: Number(currentHistory?.sequenceNumber || Date.now()),
      mark: {
        key: String(detail.cell.markKey || ""),
        symbol: String(detail.cell.symbol || ""),
        label: String(detail.cell.label || ""),
        normalizedValue: Number.isFinite(Number(detail.cell.normalizedValue)) ? Number(detail.cell.normalizedValue) : null,
        countsTowardGrade: detail.cell.countsTowardGrade !== false
      }
    }, classState);

    const cellState = findCellState(rowState, context);
    if (cellState) {
      cellState.reviewer = String(detail.cell.reviewer || "");
      cellState.revisionPortion = String(detail.cell.revisionPortion || "");
      cellState.behaviorSubcategory = String(detail.cell.behaviorSubcategory || "");
      cellState.postCloseEdit = detail.cell.postCloseEdit === true;
      cellState.postCloseReason = String(detail.cell.postCloseReason || "");
      cellState.hasInternalComment = Boolean(detail.cell.internalComment);
      cellState.hasParentComment = Boolean(detail.cell.parentComment);
    }

    syncRowDom(classId, studentId);
  }

  function recalculateRowSummaries(rowState) {
    const calc = window.IlmQuestCalculations;
    if (!calc || typeof calc.calculateStudentSummary !== "function") return;

    const summary = calc.calculateStudentSummary(
      (Array.isArray(rowState?.clientState?.liveEvents) ? rowState.clientState.liveEvents : []).map(toCalcEvent)
    );
    rowState.clientState.summary = summary;
    const summaryCells = ensureSummaryCells(rowState);

    const categoryTotals = summary.categoryTotals || {};
    summaryCells.cashar.display = formatPercent(Number(categoryTotals.cashar?.average) * 100);
    summaryCells.cashar.value = Number.isFinite(Number(categoryTotals.cashar?.average)) ? Number(categoryTotals.cashar.average) : null;
    summaryCells.writing.display = formatPercent(Number(categoryTotals.writing?.average) * 100);
    summaryCells.writing.value = Number.isFinite(Number(categoryTotals.writing?.average)) ? Number(categoryTotals.writing.average) : null;
    summaryCells.subject.display = formatPercent(Number(categoryTotals.subject?.average) * 100);
    summaryCells.subject.value = Number.isFinite(Number(categoryTotals.subject?.average)) ? Number(categoryTotals.subject.average) : null;
    summaryCells.subac.display = formatPercent(Number(categoryTotals.subac?.average) * 100);
    summaryCells.subac.value = Number.isFinite(Number(categoryTotals.subac?.average)) ? Number(categoryTotals.subac.average) : null;
    summaryCells.attendance.display = formatPercent(Number(categoryTotals.attendance?.average) * 100);
    summaryCells.attendance.value = Number.isFinite(Number(categoryTotals.attendance?.average)) ? Number(categoryTotals.attendance.average) : null;
    summaryCells.behavior.display = formatPercent(Number(categoryTotals.behavior?.average) * 100);
    summaryCells.behavior.value = Number.isFinite(Number(categoryTotals.behavior?.average)) ? Number(categoryTotals.behavior.average) : null;
    summaryCells.assessment.display = formatPercent(Number(categoryTotals.assessment?.average) * 100);
    summaryCells.assessment.value = Number.isFinite(Number(categoryTotals.assessment?.average)) ? Number(categoryTotals.assessment.average) : null;
    summaryCells.final.display = formatPercent(summary.finalPercentage);
    summaryCells.final.value = Number.isFinite(Number(summary.finalPercentage)) ? Number(summary.finalPercentage) : null;
  }

  function syncRowDom(classId, studentId) {
    const rowState = getStudentRowState(classId, studentId);
    if (!rowState) return;
    const summaryState = ensureSummaryCells(rowState);

    const rowEl = document.querySelector(`[data-gradebook-row][data-class-id="${classId}"][data-student-id="${studentId}"]`);
    if (!rowEl) return;

    rowEl.querySelectorAll("[data-gradebook-cell]").forEach((cellEl) => {
      const context = readCellContext(cellEl);
      const cellState = findCellState(rowState, context);
      if (!cellState) return;
      const select = cellEl.querySelector("[data-gradebook-select]");
      const symbol = cellEl.querySelector("[data-gradebook-cell-symbol]");
      const existingIndicator = cellEl.querySelector(".gradebook-v1-comment-indicator");
      if (select) {
        select.value = cellState.markKey || "";
        select.dataset.markKey = cellState.markKey || "";
      }
      if (symbol) symbol.textContent = cellState.symbol || "";
      cellEl.classList.remove("is-empty", "is-excellent", "is-strong", "is-watch", "is-critical");
      cellEl.classList.add(`is-${cellState.tone || "empty"}`);
      cellEl.classList.toggle("has-comment", Boolean(cellState.hasInternalComment || cellState.hasParentComment));
      if (cellState.hasInternalComment || cellState.hasParentComment) {
        if (!existingIndicator) {
          const indicator = document.createElement("span");
          indicator.className = "gradebook-v1-comment-indicator";
          cellEl.appendChild(indicator);
        }
      } else if (existingIndicator) {
        existingIndicator.remove();
      }
    });

    const summaryCells = rowEl.querySelectorAll(".gradebook-v1-summary");
    const values = [
      summaryState.cashar.display,
      summaryState.writing.display,
      summaryState.subject.display,
      summaryState.subac.display,
      summaryState.attendance.display,
      summaryState.behavior.display,
      summaryState.assessment.display,
      summaryState.final.display
    ];
    summaryCells.forEach((cell, index) => {
      cell.textContent = values[index] || "N/A";
    });
  }

  function replaceRowState(classId, studentId, nextRowState) {
    const classState = getClassState(classId);
    if (!classState) return;
    const studentIndex = (Array.isArray(classState.students) ? classState.students : []).findIndex(
      (student) => String(student.id || "") === String(studentId || "")
    );
    if (studentIndex >= 0) {
      classState.students.splice(studentIndex, 1, nextRowState);
    }
  }

  function readFormContext(formEl) {
    const getField = (name) => String(formEl.querySelector(`[name="${name}"]`)?.value || "");
    return {
      classId: getField("classId"),
      studentId: getField("studentId"),
      gradingPeriodId: getField("gradingPeriodId"),
      category: getField("category"),
      dateKey: getField("dateKey"),
      columnKey: getField("columnKey"),
      assessmentId: getField("assessmentId"),
      coordinateKey: formEl.closest("[data-gradebook-cell]")?.dataset.coordinateKey || "",
      stableCellKey: formEl.closest("[data-gradebook-cell]")?.dataset.stableCellKey || "",
      markKey: String(formEl.querySelector("[name='markKey']")?.value || "")
    };
  }

  function readCellContext(cellEl) {
    return {
      classId: String(cellEl.dataset.classId || ""),
      studentId: String(cellEl.dataset.studentId || ""),
      coordinateKey: String(cellEl.dataset.coordinateKey || ""),
      stableCellKey: String(cellEl.dataset.stableCellKey || ""),
      category: String(cellEl.dataset.category || ""),
      dateKey: String(cellEl.dataset.dateKey || ""),
      columnKey: String(cellEl.dataset.columnKey || ""),
      assessmentId: String(cellEl.dataset.assessmentId || "")
    };
  }

  function optimisticApply(formEl) {
    const context = readFormContext(formEl);
    const classState = getClassState(context.classId);
    const rowState = getStudentRowState(context.classId, context.studentId);
    if (!classState || !rowState) return null;

    const snapshot = clone(rowState);
    updateEventCollection(rowState, context, context.markKey, classState);
    updateCellState(rowState, context, context.markKey, classState);
    recalculateRowSummaries(rowState);
    syncRowDom(context.classId, context.studentId);
    return {
      context,
      previousRowState: snapshot
    };
  }

  function restoreRowFromSnapshot(classId, studentId, previousRowState) {
    replaceRowState(classId, studentId, previousRowState);
    syncRowDom(classId, studentId);
  }

  async function handleSelectChange(selectEl) {
    const formEl = selectEl.closest("[data-gradebook-cell-form]");
    if (!formEl) return;
    const clientEventInput = formEl.querySelector("[data-gradebook-client-event-id]");
    const clientEventId = buildClientEventId();
    if (clientEventInput) clientEventInput.value = clientEventId;

    const pending = optimisticApply(formEl);
    if (pending) {
      pending.clientEventId = clientEventId;
      pending.formEl = formEl;
      pendingMutations.set(clientEventId, pending);
    }

    const cellEl = formEl.closest("[data-gradebook-cell]");
    if (cellEl) cellEl.classList.add("is-saving");
    try {
      const data = await requestJson(formEl.action, {
        method: "POST",
        formEl
      });
      const confirmedPending = pendingMutations.get(clientEventId);
      if (confirmedPending) {
        const rowState = getStudentRowState(confirmedPending.context.classId, confirmedPending.context.studentId);
        const classState = getClassState(confirmedPending.context.classId);
        if (rowState && classState && data?.event) {
          applyConfirmedEventToRowState(rowState, confirmedPending.context, data.event, classState);
          syncRowDom(confirmedPending.context.classId, confirmedPending.context.studentId);
        }
        undoStack.push({
          classId: confirmedPending.context.classId,
          studentId: confirmedPending.context.studentId,
          gradingPeriodId: confirmedPending.context.gradingPeriodId,
          category: confirmedPending.context.category,
          dateKey: confirmedPending.context.dateKey,
          columnKey: confirmedPending.context.columnKey,
          assessmentId: confirmedPending.context.assessmentId
        });
      }
      pendingMutations.delete(clientEventId);
      cellEl?.classList.remove("is-saving");
    } catch (error) {
      const failedPending = pendingMutations.get(clientEventId);
      if (failedPending) {
        restoreRowFromSnapshot(failedPending.context.classId, failedPending.context.studentId, failedPending.previousRowState);
        pendingMutations.delete(clientEventId);
      }
      if (cellEl) {
        cellEl.classList.remove("is-saving");
        cellEl.classList.add("is-error");
        window.setTimeout(() => cellEl.classList.remove("is-error"), 1200);
      }
      console.error("[grading-v1] cell save failed:", error);
      window.alert(error.message || "Grade save failed.");
    }
  }

  async function loadDrawerDetail(context, { savedMessage = "" } = {}) {
    const classState = getClassState(context.classId);
    const params = new URLSearchParams({
      classId: context.classId,
      studentId: context.studentId,
      gradingPeriodId: context.gradingPeriodId || classState?.gradingPeriod?.id || "",
      category: context.category,
      dateKey: context.dateKey,
      columnKey: context.columnKey,
      assessmentId: context.assessmentId
    });

    setDrawerContentHtml(renderDrawerPlaceholder("Loading cell details...", "Pulling comments, history, and metadata for this cell."));

    try {
      const data = await requestJson(`/api/teacher/gradebook/cell/detail?${params.toString()}`);
      if (!data?.detail) {
        throw new Error("Cell details could not be loaded.");
      }
      applyDetailToRowState(data.detail);
      setDrawerContentHtml(renderDrawerDetail(data.detail, savedMessage));
    } catch (error) {
      console.error("[grading-v1] drawer load failed:", error);
      setDrawerContentHtml(renderDrawerPlaceholder("Unable to load this cell", error.message || "Please try again."));
    }
  }

  function openDrawerForCell(cellEl) {
    const context = readCellContext(cellEl);
    setDrawerOpenState(true, context);
    loadDrawerDetail(context);
  }

  async function submitUndo(payload) {
    const response = await fetch("/api/teacher/gradebook/cell/undo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        _csrf: csrfToken,
        ...payload
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Undo failed.");
    }

    const data = await response.json();
    if (data?.rowState) {
      replaceRowState(data.classId, data.studentId, data.rowState);
      syncRowDom(data.classId, data.studentId);
    }
    return data;
  }

  async function handleDrawerFormSubmit(formEl) {
    const clientEventInput = formEl.querySelector("[data-gradebook-client-event-id]");
    if (clientEventInput) clientEventInput.value = buildClientEventId();

    const data = await requestJson(formEl.action, {
      method: "POST",
      formEl
    });

    if (!data?.detail) {
      throw new Error(data?.message || "Cell details could not be saved.");
    }

    applyDetailToRowState(data.detail);
    setDrawerContentHtml(renderDrawerDetail(data.detail, data.message || "Cell details saved."));
  }

  function bindKeyboardNavigation(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.matches("[data-gradebook-select]")) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (target.size > 1) return;
    event.preventDefault();

    const currentCell = target.closest("[data-gradebook-cell]");
    const currentRow = target.closest("[data-gradebook-row]");
    if (!currentCell || !currentRow) return;

    const rowCells = Array.from(currentRow.querySelectorAll("[data-gradebook-cell]"));
    const cellIndex = rowCells.indexOf(currentCell);
    if (cellIndex < 0) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const nextCell = rowCells[cellIndex + delta];
      nextCell?.querySelector("[data-gradebook-select]")?.focus();
      return;
    }

    const tableBody = currentRow.parentElement;
    const allRows = Array.from(tableBody?.querySelectorAll("[data-gradebook-row]") || []);
    const rowIndex = allRows.indexOf(currentRow);
    if (rowIndex < 0) return;

    const nextRowIndex = event.key === "ArrowUp" ? rowIndex - 1 : rowIndex + 1;
    const nextRow = allRows[nextRowIndex];
    if (!nextRow) return;
    const nextRowCells = Array.from(nextRow.querySelectorAll("[data-gradebook-cell]"));
    nextRowCells[cellIndex]?.querySelector("[data-gradebook-select]")?.focus();
  }

  document.addEventListener("change", (event) => {
    const selectEl = event.target;
    if (selectEl instanceof HTMLSelectElement && selectEl.matches("[data-gradebook-select]")) {
      handleSelectChange(selectEl);
      return;
    }

    const focusDateInput = event.target;
    if (focusDateInput instanceof HTMLInputElement && focusDateInput.matches("[data-gradebook-focus-date]")) {
      focusDateInput.form?.requestSubmit();
    }
  });

  document.addEventListener("submit", (event) => {
    const drawerForm = event.target;
    if (!(drawerForm instanceof HTMLFormElement) || !drawerForm.matches("[data-gradebook-drawer-form]")) return;
    event.preventDefault();
    handleDrawerFormSubmit(drawerForm).catch((error) => {
      console.error("[grading-v1] drawer save failed:", error);
      window.alert(error.message || "Cell detail save failed.");
    });
  });

  document.addEventListener("keydown", (event) => {
    bindKeyboardNavigation(event);

    if (event.key === "Escape") {
      setDrawerOpenState(false);
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      const activeElement = document.activeElement;
      const isTextEntry = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      if (isTextEntry) return;
      const lastMutation = undoStack.pop();
      if (!lastMutation) return;
      event.preventDefault();
      submitUndo(lastMutation).catch((error) => window.alert(error.message));
    }
  });

  document.addEventListener("click", (event) => {
    const drawerCloseTrigger = event.target.closest("[data-gradebook-drawer-close], [data-gradebook-drawer-backdrop]");
    if (drawerCloseTrigger) {
      setDrawerOpenState(false);
      return;
    }

    const tabButton = event.target.closest("[data-gradebook-class-tab]");
    if (tabButton) {
      const classId = String(tabButton.dataset.classId || "");
      activateClassTab(classId);
      return;
    }

    const drawerButton = event.target.closest("[data-gradebook-drawer-open]");
    if (drawerButton) {
      const cellEl = drawerButton.closest("[data-gradebook-cell]");
      if (cellEl) openDrawerForCell(cellEl);
      return;
    }

    const gradebookCell = event.target.closest("[data-gradebook-cell]");
    if (gradebookCell) {
      const clickedInteractiveControl = Boolean(
        event.target.closest(
          "select, option, input, textarea, button, a, [data-gradebook-cell-form], .gradebook-v1-select-wrap"
        )
      );
      if (!clickedInteractiveControl) {
        openDrawerForCell(gradebookCell);
      }
      return;
    }

    const undoButton = event.target.closest("[data-gradebook-undo]");
    if (undoButton) {
      submitUndo({
        classId: undoButton.dataset.classId,
        studentId: undoButton.dataset.studentId,
        gradingPeriodId: undoButton.dataset.gradingPeriodId,
        category: undoButton.dataset.category,
        dateKey: undoButton.dataset.dateKey,
        columnKey: undoButton.dataset.columnKey,
        assessmentId: undoButton.dataset.assessmentId
      })
        .then(() => {
          const context = {
            classId: undoButton.dataset.classId,
            studentId: undoButton.dataset.studentId,
            gradingPeriodId: undoButton.dataset.gradingPeriodId,
            category: undoButton.dataset.category,
            dateKey: undoButton.dataset.dateKey,
            columnKey: undoButton.dataset.columnKey,
            assessmentId: undoButton.dataset.assessmentId
          };
          loadDrawerDetail(context, {
            savedMessage: "Last cell change undone."
          });
        })
        .catch((error) => window.alert(error.message));
    }
  });

  document.body.addEventListener("gradebookRowState", (event) => {
    const detail = event.detail || {};
    if (!detail.classId || !detail.studentId || !detail.rowState) return;
    replaceRowState(String(detail.classId), String(detail.studentId), detail.rowState);
    syncRowDom(String(detail.classId), String(detail.studentId));
  });

  activateClassTab(currentTabClassId);
  window.addEventListener("load", resetInitialViewport, { once: true });
  window.addEventListener("pageshow", resetInitialViewport);
})();
