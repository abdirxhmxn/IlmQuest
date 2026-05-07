(function teacherGradesPage() {
  const payloadNode = document.getElementById("teacherGradebookPayload");
  if (!payloadNode) return;

  const payload = JSON.parse(payloadNode.textContent || "{}");
  const csrfToken = String(payload.csrfToken || "");
  const classStateById = new Map(
    (Array.isArray(payload.classes) ? payload.classes : []).map((classState) => [String(classState.id || ""), classState])
  );

  const drawerShell = document.querySelector("[data-gradebook-drawer]");
  const drawerForm = document.getElementById("gradebookDrawerForm");
  const drawerStatus = document.getElementById("gradebookDrawerStatus");
  const drawerMarkGrid = document.getElementById("drawerMarkGrid");
  const drawerSubacFields = document.getElementById("drawerSubacFields");
  const drawerStudentName = document.getElementById("drawerStudentName");
  const drawerDateLabel = document.getElementById("drawerDateLabel");
  const drawerDayLabel = document.getElementById("drawerDayLabel");
  const drawerContextLabel = document.getElementById("drawerContextLabel");
  const drawerClassId = document.getElementById("drawerClassId");
  const drawerStudentId = document.getElementById("drawerStudentId");
  const drawerSystemKey = document.getElementById("drawerSystemKey");
  const drawerColumnKey = document.getElementById("drawerColumnKey");
  const drawerDateKey = document.getElementById("drawerDateKey");
  const drawerMarkKey = document.getElementById("drawerMarkKey");
  const drawerReviewer = document.getElementById("drawerReviewer");
  const drawerPortion = document.getElementById("drawerPortion");
  const drawerNote = document.getElementById("drawerNote");
  const drawerSaveBtn = document.getElementById("gradebookDrawerSaveBtn");

  let activeDrawerContext = null;
  let longPressTimer = null;

  function getClassState(classId) {
    return classStateById.get(String(classId || "")) || null;
  }

  function getStudentState(classId, studentId) {
    const classState = getClassState(classId);
    if (!classState) return null;
    return (Array.isArray(classState.students) ? classState.students : []).find(
      (student) => String(student.id || "") === String(studentId || "")
    ) || null;
  }

  function flattenRegularCells(studentState) {
    return (Array.isArray(studentState?.regularCells) ? studentState.regularCells : [])
      .flatMap((group) => Array.isArray(group.entries) ? group.entries : []);
  }

  function getCellState(classId, studentId, systemKey, columnKey, dateKey) {
    const studentState = getStudentState(classId, studentId);
    if (!studentState) return null;

    if (String(systemKey || "") === "subac") {
      return (Array.isArray(studentState.subacCells) ? studentState.subacCells : []).find(
        (cell) => String(cell.columnKey || "") === String(columnKey || "")
          && String(cell.dateKey || "") === String(dateKey || "")
      ) || null;
    }

    return flattenRegularCells(studentState).find(
      (cell) => String(cell.columnKey || "") === String(columnKey || "")
        && String(cell.dateKey || "") === String(dateKey || "")
    ) || null;
  }

  function getMarksForSystem(classId, systemKey) {
    const classState = getClassState(classId);
    if (!classState) return [];
    if (String(systemKey || "") === "subac") return Array.isArray(classState.subacScale?.marks) ? classState.subacScale.marks : [];
    return Array.isArray(classState.regularScale?.marks) ? classState.regularScale.marks : [];
  }

  function setCellTransientState(cellEl, mode) {
    if (!cellEl) return;
    cellEl.classList.remove("is-saving", "is-saved", "is-error");
    if (mode) cellEl.classList.add(`is-${mode}`);
  }

  function syncCellDom(cellEl, cellState) {
    if (!cellEl || !cellState) return;
    const select = cellEl.querySelector("[data-gradebook-select]");
    const state = cellEl.querySelector("[data-gradebook-cell-state]");
    if (select) {
      select.value = cellState.markKey || "";
      select.dataset.markKey = cellState.markKey || "";
    }
    if (state) {
      state.textContent = cellState.symbol || "";
      state.title = cellState.label || "";
    }
  }

  function syncRegularRowDom(classId, studentState) {
    const rowEl = document.querySelector(`.gradebook-row[data-row-kind="regular"][data-class-id="${classId}"][data-student-id="${studentState.id}"]`);
    if (!rowEl) return;

    const regularCells = flattenRegularCells(studentState);
    const domCells = rowEl.querySelectorAll(".gradebook-cell");
    regularCells.forEach((cellState, index) => {
      syncCellDom(domCells[index], cellState);
    });

    rowEl.querySelector('[data-summary-for="q"]').textContent = studentState.regularSummary?.q?.percentLabel || "N/A";
    rowEl.querySelector('[data-summary-for="w"]').textContent = studentState.regularSummary?.w?.percentLabel || "N/A";
    rowEl.querySelector('[data-summary-for="s"]').textContent = studentState.regularSummary?.s?.percentLabel || "N/A";
  }

  function syncSubacRowDom(classId, studentState) {
    const rowEl = document.querySelector(`.gradebook-row[data-row-kind="subac"][data-class-id="${classId}"][data-student-id="${studentState.id}"]`);
    if (!rowEl) return;

    const domCells = rowEl.querySelectorAll(".gradebook-cell");
    (Array.isArray(studentState.subacCells) ? studentState.subacCells : []).forEach((cellState, index) => {
      syncCellDom(domCells[index], cellState);
    });

    (Array.isArray(studentState.subacSummary?.countOrder) ? studentState.subacSummary.countOrder : []).forEach((mark) => {
      const cell = rowEl.querySelector(`[data-subac-count="${mark.key}"]`);
      if (cell) cell.textContent = String(studentState.subacSummary?.counts?.[mark.key] || 0);
    });

    const earnedCell = rowEl.querySelector("[data-subac-earned]");
    const totalCell = rowEl.querySelector("[data-subac-total]");
    const gradeCell = rowEl.querySelector("[data-subac-grade]");
    if (earnedCell) earnedCell.textContent = studentState.subacSummary?.pointsEarnedLabel || "0";
    if (totalCell) totalCell.textContent = studentState.subacSummary?.totalPointsLabel || "0";
    if (gradeCell) gradeCell.textContent = studentState.subacSummary?.gradePercentLabel || "N/A";
  }

  function syncSubacHeaders(classId) {
    const classState = getClassState(classId);
    if (!classState) return;
    (Array.isArray(classState.subacDateColumns) ? classState.subacDateColumns : []).forEach((column) => {
      const reviewerCell = document.querySelector(`[data-subac-reviewer="${column.dateKey}"]`);
      const portionCell = document.querySelector(`[data-subac-portion="${column.dateKey}"]`);
      if (reviewerCell) reviewerCell.textContent = `Reviewer: ${column.reviewerSummary}`;
      if (portionCell) portionCell.textContent = `Portion: ${column.portionSummary}`;
    });
  }

  function updateStateFromResponse(classId, updatedRow, subacDateColumns) {
    const classState = getClassState(classId);
    if (!classState || !updatedRow) return;
    const studentIndex = (Array.isArray(classState.students) ? classState.students : []).findIndex(
      (student) => String(student.id || "") === String(updatedRow.id || "")
    );
    if (studentIndex >= 0) {
      classState.students[studentIndex] = updatedRow;
    }
    if (Array.isArray(subacDateColumns)) {
      classState.subacDateColumns = subacDateColumns;
    }
    syncRegularRowDom(classId, updatedRow);
    syncSubacRowDom(classId, updatedRow);
    syncSubacHeaders(classId);
  }

  function getCellContextFromElement(cellEl) {
    if (!cellEl) return null;
    const classId = String(cellEl.dataset.classId || "");
    const studentId = String(cellEl.dataset.studentId || "");
    const systemKey = String(cellEl.dataset.systemKey || "");
    const columnKey = String(cellEl.dataset.columnKey || "");
    const dateKey = String(cellEl.dataset.dateKey || "");
    const cellState = getCellState(classId, studentId, systemKey, columnKey, dateKey);
    const studentState = getStudentState(classId, studentId);
    return {
      classId,
      studentId,
      systemKey,
      columnKey,
      dateKey,
      cellEl,
      cellState,
      studentState
    };
  }

  function renderDrawerMarks(classId, systemKey, selectedMarkKey) {
    const marks = getMarksForSystem(classId, systemKey);
    drawerMarkGrid.innerHTML = "";

    marks.forEach((mark) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gradebook-mark-btn${selectedMarkKey === mark.key ? " is-active" : ""}`;
      button.dataset.markKey = mark.key;
      if (!mark.active && selectedMarkKey !== mark.key) {
        button.disabled = true;
      }
      button.innerHTML = `
        <strong>${mark.symbol}</strong>
        <span>${mark.label}</span>
      `;
      drawerMarkGrid.appendChild(button);
    });
  }

  function openDrawer(context) {
    if (!drawerShell || !context?.cellState || !context?.studentState) return;
    activeDrawerContext = context;

    drawerClassId.value = context.classId;
    drawerStudentId.value = context.studentId;
    drawerSystemKey.value = context.systemKey;
    drawerColumnKey.value = context.columnKey;
    drawerDateKey.value = context.dateKey;
    drawerMarkKey.value = context.cellState.markKey || "";

    drawerStudentName.textContent = context.studentState.name || "Student";
    drawerDateLabel.textContent = context.cellState.dateLabel || "—";
    drawerDayLabel.textContent = context.cellState.dayLabel || "—";
    drawerContextLabel.textContent = context.cellState.columnLongLabel || context.cellState.columnLabel || "Grade";

    drawerReviewer.value = context.cellState.reviewer || "";
    drawerPortion.value = context.cellState.portion || "";
    drawerNote.value = context.cellState.note || "";
    drawerSubacFields.hidden = context.systemKey !== "subac";

    renderDrawerMarks(context.classId, context.systemKey, context.cellState.markKey || "");
    drawerStatus.textContent = "";
    drawerSaveBtn.disabled = false;
    drawerShell.hidden = false;
    document.body.classList.add("drawer-open");
    window.requestAnimationFrame(() => {
      const preferredTarget = drawerMarkGrid.querySelector(".gradebook-mark-btn.is-active:not([disabled])")
        || drawerMarkGrid.querySelector(".gradebook-mark-btn:not([disabled])")
        || drawerNote;
      preferredTarget?.focus();
    });
  }

  function closeDrawer() {
    activeDrawerContext = null;
    if (drawerShell) drawerShell.hidden = true;
    document.body.classList.remove("drawer-open");
  }

  function clearLongPress() {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  async function saveGradebookCell(data, cellEl) {
    const response = await fetch("/api/teacher/gradebook/cell", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        _csrf: csrfToken,
        ...data
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_err) {
      payload = {};
    }

    if (!response.ok || payload.success === false) {
      const message = payload.message || payload.error || "Could not save gradebook cell.";
      throw new Error(message);
    }

    if (payload.updatedRow) {
      updateStateFromResponse(String(data.classId || ""), payload.updatedRow, payload.subacDateColumns);
    }

    const updatedCell = getCellState(data.classId, data.studentId, data.systemKey, data.columnKey, data.dateKey);
    if (cellEl && updatedCell) {
      syncCellDom(cellEl, updatedCell);
      setCellTransientState(cellEl, "saved");
      window.setTimeout(() => setCellTransientState(cellEl, null), 1200);
    }

    return payload;
  }

  async function handleSelectSave(selectEl) {
    const cellEl = selectEl.closest(".gradebook-cell");
    const classId = String(selectEl.dataset.classId || "");
    const studentId = String(selectEl.dataset.studentId || "");
    const systemKey = String(selectEl.dataset.systemKey || "");
    const columnKey = String(selectEl.dataset.columnKey || "");
    const dateKey = String(selectEl.dataset.dateKey || "");
    const nextMarkKey = String(selectEl.value || "");
    const previousMarkKey = String(selectEl.dataset.markKey || "");
    const currentState = getCellState(classId, studentId, systemKey, columnKey, dateKey);

    if (!nextMarkKey) {
      selectEl.value = previousMarkKey || "";
      return;
    }

    setCellTransientState(cellEl, "saving");

    try {
      await saveGradebookCell({
        classId,
        studentId,
        systemKey,
        columnKey,
        dateKey,
        markKey: nextMarkKey,
        note: currentState?.note || "",
        reviewer: currentState?.reviewer || "",
        portion: currentState?.portion || ""
      }, cellEl);
    } catch (err) {
      selectEl.value = previousMarkKey || "";
      setCellTransientState(cellEl, "error");
      window.setTimeout(() => setCellTransientState(cellEl, null), 1500);
      const state = cellEl?.querySelector("[data-gradebook-cell-state]");
      if (state) state.textContent = "Retry";
      window.setTimeout(() => {
        const refreshed = getCellState(classId, studentId, systemKey, columnKey, dateKey);
        if (state) state.textContent = refreshed?.symbol || "";
      }, 1500);
    }
  }

  function activateTab(classId) {
    document.querySelectorAll("[data-gradebook-class-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.classId === classId);
    });
    document.querySelectorAll("[data-gradebook-class-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.classId === classId);
    });
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-gradebook-class-tab]");
    if (tab) {
      activateTab(String(tab.dataset.classId || ""));
      return;
    }

    const detailBtn = event.target.closest("[data-gradebook-detail]");
    if (detailBtn) {
      const cellEl = detailBtn.closest(".gradebook-cell");
      const context = getCellContextFromElement(cellEl);
      openDrawer(context);
      return;
    }

    if (event.target.matches("[data-gradebook-drawer-close]")) {
      closeDrawer();
      return;
    }

    const markBtn = event.target.closest(".gradebook-mark-btn");
    if (markBtn) {
      drawerMarkKey.value = String(markBtn.dataset.markKey || "");
      drawerMarkGrid.querySelectorAll(".gradebook-mark-btn").forEach((button) => {
        button.classList.toggle("is-active", button === markBtn);
      });
    }
  });

  document.addEventListener("change", (event) => {
    const selectEl = event.target.closest("[data-gradebook-select]");
    if (selectEl) {
      handleSelectSave(selectEl);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const cellEl = event.target.closest(".gradebook-cell");
    if (!cellEl) return;
    if (event.target.closest("[data-gradebook-select], [data-gradebook-detail]")) return;

    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      openDrawer(getCellContextFromElement(cellEl));
      clearLongPress();
    }, 420);
  });

  document.addEventListener("pointerup", clearLongPress);
  document.addEventListener("pointercancel", clearLongPress);
  document.addEventListener("pointermove", clearLongPress);
  document.addEventListener("scroll", clearLongPress, true);

  document.addEventListener("contextmenu", (event) => {
    const cellEl = event.target.closest(".gradebook-cell");
    if (!cellEl) return;
    event.preventDefault();
    openDrawer(getCellContextFromElement(cellEl));
  });

  drawerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeDrawerContext) return;
    if (!drawerMarkKey.value) {
      drawerStatus.textContent = "Select a grading mark before saving.";
      return;
    }

    drawerSaveBtn.disabled = true;
    drawerStatus.textContent = "Saving...";
    const cellEl = activeDrawerContext.cellEl;
    setCellTransientState(cellEl, "saving");

    try {
      await saveGradebookCell({
        classId: drawerClassId.value,
        studentId: drawerStudentId.value,
        systemKey: drawerSystemKey.value,
        columnKey: drawerColumnKey.value,
        dateKey: drawerDateKey.value,
        markKey: drawerMarkKey.value,
        note: drawerNote.value,
        reviewer: drawerReviewer.value,
        portion: drawerPortion.value
      }, cellEl);

      const refreshedContext = getCellContextFromElement(cellEl);
      activeDrawerContext = refreshedContext;
      if (refreshedContext) {
        drawerStatus.textContent = "Saved successfully.";
      }
    } catch (err) {
      drawerStatus.textContent = err.message || "Could not save details.";
      setCellTransientState(cellEl, "error");
      window.setTimeout(() => setCellTransientState(cellEl, null), 1500);
    } finally {
      drawerSaveBtn.disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !drawerShell?.hidden) {
      event.preventDefault();
      drawerForm?.requestSubmit();
      return;
    }

    if (event.key === "Escape" && !drawerShell?.hidden) {
      closeDrawer();
    }
  });

  if (Array.isArray(payload.classes) && payload.classes[0]?.id) {
    activateTab(String(payload.classes[0].id));
  }
})();
