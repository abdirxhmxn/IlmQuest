(function initAdminAnnouncements() {
  const form = document.querySelector(".announcement-form");
  if (!form) return;

  const globalRadio = form.querySelector('input[name="visibilityMode"][value="global"]');
  const scopedRadio = form.querySelector('input[name="visibilityMode"][value="scoped"]');
  const roleCheckboxes = form.querySelectorAll('input[name="targetRoles"]');
  const targetSelects = form.querySelectorAll(
    'select[name="targetClassIds"], select[name="targetTeacherIds"], select[name="targetStudentIds"], select[name="targetParentIds"]'
  );

  function hasScopedSelection() {
    const hasRole = Array.from(roleCheckboxes).some((entry) => entry.checked);
    const hasTargets = Array.from(targetSelects).some((select) =>
      Array.from(select.options).some((option) => option.selected)
    );
    return hasRole || hasTargets;
  }

  function syncVisibilityMode() {
    if (!globalRadio || !scopedRadio) return;
    if (hasScopedSelection()) {
      scopedRadio.checked = true;
    } else if (!scopedRadio.checked) {
      globalRadio.checked = true;
    }
  }

  roleCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", syncVisibilityMode);
  });
  targetSelects.forEach((select) => {
    select.addEventListener("change", syncVisibilityMode);
  });

  const scopeSearchInputs = form.querySelectorAll("[data-scope-filter]");
  scopeSearchInputs.forEach((input) => {
    const targetId = input.getAttribute("data-scope-filter");
    const targetSelect = targetId ? document.getElementById(targetId) : null;
    if (!targetSelect) return;

    input.addEventListener("input", () => {
      const query = String(input.value || "").trim().toLowerCase();
      Array.from(targetSelect.options).forEach((option) => {
        if (!query) {
          option.hidden = false;
          return;
        }
        const text = String(option.textContent || "").toLowerCase();
        option.hidden = !text.includes(query);
      });
    });
  });
})();
