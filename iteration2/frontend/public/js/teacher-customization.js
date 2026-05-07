(function teacherCustomizationPage() {
  const form = document.getElementById("customizationForm");
  if (!form) return;

  const subjectsList = document.getElementById("subjectsList");
  const categoriesList = document.getElementById("categoriesList");
  const weightSummary = document.getElementById("weightSummary");
  const sectionsInput = document.getElementById("sectionsJson");
  const subjectsInput = document.getElementById("subjectsJson");
  const categoriesInput = document.getElementById("gradingCategoriesJson");
  const memorizationScaleInput = document.getElementById("memorizationScaleJson");
  const subacScaleInput = document.getElementById("subacScaleJson");

  let customizationState = {};
  try {
    customizationState = JSON.parse(document.getElementById("teacherCustomizationState")?.textContent || "{}");
  } catch (_err) {
    customizationState = {};
  }

  const defaultScaleSet = customizationState.defaultGradingScaleSet || {};
  const selectedScaleSet = customizationState.selectedGradingScaleSet || {};

  function toSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category";
  }

  function addSubjectRow() {
    const row = document.createElement("div");
    row.className = "list-row subject-row";
    row.dataset.isArchived = "false";
    row.innerHTML = `
      <input type="hidden" class="subject-key" value="">
      <div class="row-main">
        <label>Subject Label</label>
        <input type="text" class="subject-name" maxlength="60" required>
        <small class="row-meta">Key will be generated on save</small>
      </div>
      <div class="row-small">
        <label>Visible</label>
        <input type="checkbox" class="subject-active" checked>
      </div>
      <div class="row-small">
        <label>Order</label>
        <input type="number" class="subject-order" min="0" value="0">
      </div>
      <div class="row-actions">
        <span class="status-badge active">Active</span>
        <button type="button" class="btn-danger remove-row">Remove</button>
      </div>
    `;
    subjectsList?.appendChild(row);
  }

  function addCategoryRow() {
    const row = document.createElement("div");
    row.className = "list-row category-row";
    row.dataset.isDefault = "false";
    row.dataset.isArchived = "false";
    row.innerHTML = `
      <input type="hidden" class="category-key" value="">
      <input type="hidden" class="category-default" value="false">
      <div class="row-main">
        <label>Category Label</label>
        <input type="text" class="category-name" maxlength="60" required>
        <small class="row-meta">Key will be generated on save</small>
      </div>
      <div class="row-small">
        <label>Weight %</label>
        <input type="number" class="category-weight" min="0" max="100" step="0.1" value="0" required>
      </div>
      <div class="row-small">
        <label>Active</label>
        <input type="checkbox" class="category-active" checked>
      </div>
      <div class="row-small">
        <label>Order</label>
        <input type="number" class="category-order" min="0" value="0">
      </div>
      <div class="row-actions">
        <span class="status-badge active">Active</span>
        <button type="button" class="btn-danger remove-row">Remove</button>
      </div>
    `;
    categoriesList?.appendChild(row);
    updateWeightSummary();
  }

  function updateWeightSummary() {
    if (!weightSummary) return;
    const total = Array.from(document.querySelectorAll(".category-row")).reduce((sum, row) => {
      const active = row.querySelector(".category-active")?.checked;
      if (!active) return sum;
      const weight = Number(row.querySelector(".category-weight")?.value || 0);
      return sum + (Number.isFinite(weight) ? weight : 0);
    }, 0);

    const rounded = Math.round(total * 100) / 100;
    weightSummary.textContent = `Active Weight Total: ${rounded}%`;
    weightSummary.classList.toggle("error", Math.abs(rounded - 100) > 0.01);
  }

  function updateRowStatus(row, type) {
    const badge = row?.querySelector(".status-badge");
    if (!badge) return;

    const active = row.querySelector(`.${type}-active`)?.checked;
    const archived = row.dataset.isArchived === "true";

    badge.classList.remove("active", "inactive", "archived");

    if (active) {
      badge.textContent = "Active";
      badge.classList.add("active");
      return;
    }

    if (archived) {
      badge.textContent = "Archived";
      badge.classList.add("archived");
      return;
    }

    badge.textContent = "Hidden";
    badge.classList.add("inactive");
  }

  function updateScaleRowStatus(row) {
    const badge = row?.querySelector(".scale-status-badge");
    if (!badge) return;

    const active = row.querySelector(".scale-mark-active")?.checked;
    const counts = row.querySelector(".scale-mark-counts")?.checked;

    badge.classList.remove("active", "inactive", "archived");

    if (!active) {
      badge.textContent = "Hidden";
      badge.classList.add("inactive");
      return;
    }

    badge.textContent = counts ? "Counts In Grade" : "Tracked Only";
    badge.classList.add("active");
  }

  function getScaleRows(systemKey) {
    return Array.from(document.querySelectorAll(`[data-scale-editor="${systemKey}"] [data-scale-row]`));
  }

  function serializeScale(systemKey) {
    const selectedScale = selectedScaleSet?.[systemKey] || {};
    const defaultScale = defaultScaleSet?.[systemKey] || {};
    const baseScale = Object.keys(selectedScale).length ? selectedScale : defaultScale;
    const maxValue = Number(baseScale.maxValue || defaultScale.maxValue || 4);

    return {
      key: String(baseScale.key || systemKey),
      name: String(baseScale.name || ""),
      description: String(baseScale.description || ""),
      maxValue,
      marks: getScaleRows(systemKey).map((row, index) => {
        const value = Number(row.querySelector(".scale-mark-value")?.value || 0);
        const sortOrder = Number(row.querySelector(".scale-mark-order")?.value ?? index);
        return {
          key: String(row.querySelector(".scale-mark-key")?.value || ""),
          symbol: String(row.querySelector(".scale-mark-symbol")?.value || ""),
          label: String(row.querySelector(".scale-mark-label")?.value || "").trim(),
          description: String(row.querySelector(".scale-mark-description")?.value || "").trim(),
          value: Number.isFinite(value) ? value : 0,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
          active: row.querySelector(".scale-mark-active")?.checked || false,
          countsTowardGrade: row.querySelector(".scale-mark-counts")?.checked || false
        };
      })
    };
  }

  function restoreScale(systemKey) {
    const defaultScale = defaultScaleSet?.[systemKey];
    if (!defaultScale || !Array.isArray(defaultScale.marks)) return;

    const marksByKey = new Map(defaultScale.marks.map((mark) => [String(mark.key || ""), mark]));
    getScaleRows(systemKey).forEach((row, index) => {
      const markKey = String(row.querySelector(".scale-mark-key")?.value || "");
      const defaultMark = marksByKey.get(markKey);
      if (!defaultMark) return;

      const valueInput = row.querySelector(".scale-mark-value");
      const orderInput = row.querySelector(".scale-mark-order");
      const labelInput = row.querySelector(".scale-mark-label");
      const descriptionInput = row.querySelector(".scale-mark-description");
      const activeInput = row.querySelector(".scale-mark-active");
      const countsInput = row.querySelector(".scale-mark-counts");

      if (labelInput) labelInput.value = defaultMark.label || "";
      if (descriptionInput) descriptionInput.value = defaultMark.description || "";
      if (valueInput) valueInput.value = Number(defaultMark.value || 0);
      if (orderInput) orderInput.value = Number.isFinite(Number(defaultMark.sortOrder))
        ? Number(defaultMark.sortOrder)
        : index;
      if (activeInput) activeInput.checked = Boolean(defaultMark.active);
      if (countsInput) countsInput.checked = Boolean(defaultMark.countsTowardGrade);

      updateScaleRowStatus(row);
    });
  }

  function validateScaleSelections() {
    const memorizationScale = serializeScale("memorization");
    const subacScale = serializeScale("subac");

    const activeMemorizationMarks = memorizationScale.marks.filter((mark) => mark.active);
    if (!activeMemorizationMarks.length) {
      window.alert("At least one active memorization grading mark is required.");
      return false;
    }
    if (!activeMemorizationMarks.some((mark) => mark.countsTowardGrade)) {
      window.alert("At least one memorization grading mark must count toward the grade.");
      return false;
    }

    const activeSubacMarks = subacScale.marks.filter((mark) => mark.active);
    if (!activeSubacMarks.length) {
      window.alert("At least one active Subac grading mark is required.");
      return false;
    }

    memorizationScaleInput.value = JSON.stringify(memorizationScale);
    subacScaleInput.value = JSON.stringify(subacScale);
    return true;
  }

  document.getElementById("addSubjectBtn")?.addEventListener("click", addSubjectRow);
  document.getElementById("addCategoryBtn")?.addEventListener("click", addCategoryRow);

  document.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-scale-restore]");
    if (restoreButton) {
      restoreScale(String(restoreButton.getAttribute("data-scale-restore") || ""));
      return;
    }

    const removeButton = event.target.closest(".remove-row");
    if (!removeButton) return;
    const row = removeButton.closest(".list-row");
    if (!row) return;
    row.remove();
    updateWeightSummary();
  });

  document.addEventListener("input", (event) => {
    if (event.target.classList.contains("category-weight") || event.target.classList.contains("category-active")) {
      updateWeightSummary();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.classList.contains("subject-active")) {
      const row = event.target.closest(".subject-row");
      if (row && event.target.checked && row.dataset.isArchived === "true") {
        row.dataset.isArchived = "false";
      }
      updateRowStatus(row, "subject");
    }

    if (event.target.classList.contains("category-active")) {
      const row = event.target.closest(".category-row");
      if (row && event.target.checked && row.dataset.isArchived === "true") {
        row.dataset.isArchived = "false";
      }
      updateRowStatus(row, "category");
      updateWeightSummary();
    }

    if (
      event.target.classList.contains("scale-mark-active")
      || event.target.classList.contains("scale-mark-counts")
    ) {
      updateScaleRowStatus(event.target.closest("[data-scale-row]"));
    }
  });

  form.addEventListener("submit", (event) => {
    const sections = Array.from(document.querySelectorAll(".section-row")).map((row, index) => ({
      key: row.querySelector(".section-key")?.value,
      label: row.querySelector(".section-label")?.value || "",
      visible: row.querySelector(".section-visible")?.checked || false,
      order: Number(row.querySelector(".section-order")?.value ?? index)
    }));

    const subjects = Array.from(document.querySelectorAll(".subject-row")).map((row, index) => ({
      key: row.querySelector(".subject-key")?.value || "",
      label: row.querySelector(".subject-name")?.value || "",
      name: row.querySelector(".subject-name")?.value || "",
      active: row.querySelector(".subject-active")?.checked || false,
      order: Number(row.querySelector(".subject-order")?.value ?? index),
      isArchived: row.dataset.isArchived === "true"
    }));

    const categories = Array.from(document.querySelectorAll(".category-row")).map((row, index) => {
      const name = row.querySelector(".category-name")?.value || "";
      const key = row.querySelector(".category-key")?.value || toSlug(name);
      return {
        key,
        label: name,
        name,
        weight: Number(row.querySelector(".category-weight")?.value || 0),
        active: row.querySelector(".category-active")?.checked || false,
        order: Number(row.querySelector(".category-order")?.value ?? index),
        isDefault: row.querySelector(".category-default")?.value === "true",
        isArchived: row.dataset.isArchived === "true"
      };
    });

    const activeTotal = categories.reduce((sum, category) => (
      category.active ? sum + Number(category.weight || 0) : sum
    ), 0);

    if (Math.abs(activeTotal - 100) > 0.01) {
      event.preventDefault();
      window.alert("Active grading category weights must total exactly 100%.");
      return;
    }

    if (!validateScaleSelections()) {
      event.preventDefault();
      return;
    }

    sectionsInput.value = JSON.stringify(sections);
    subjectsInput.value = JSON.stringify(subjects);
    categoriesInput.value = JSON.stringify(categories);
  });

  updateWeightSummary();
  document.querySelectorAll(".subject-row").forEach((row) => updateRowStatus(row, "subject"));
  document.querySelectorAll(".category-row").forEach((row) => updateRowStatus(row, "category"));
  document.querySelectorAll("[data-scale-row]").forEach((row) => updateScaleRowStatus(row));
})();
