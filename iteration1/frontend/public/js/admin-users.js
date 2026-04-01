(function initAdminUsersPage() {
  const root = document.querySelector(".users-page");
  if (!root || !window.AdminViewEdit) return;

  const csrfToken = root.dataset.csrfToken || "";
  const deleteDialog = document.getElementById("deleteUserDialog");
  const sharedState = { activeEditor: null };

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tables = {
    studentTable: document.getElementById("studentTable"),
    teacherTable: document.getElementById("teacherTable"),
    parentTable: document.getElementById("parentTable")
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.entries(tables).forEach(([id, table]) => {
        table?.classList.toggle("hidden", id !== btn.dataset.target);
      });
    });
  });

  function formatDateForView(value) {
    if (!value) return "N/A";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return parsed.toLocaleDateString("en-US");
  }

  function deleteUserRow({ userId, rowEl, type, deleteLabel }) {
    AdminViewEdit.openConfirmDialog(deleteDialog, {
      title: `Delete ${deleteLabel}`,
      message: `This ${type} will be soft-deleted. You can restore later.`,
      onConfirm: async () => {
        const { response } = await AdminViewEdit.jsonFetch(`/admin/users/${userId}`, {
          method: "DELETE",
          csrfToken
        });
        if (response.ok) {
          if (sharedState.activeEditor && sharedState.activeEditor.rowEl === rowEl) {
            sharedState.activeEditor = null;
          }
          rowEl.remove();
        }
      }
    });
  }

  function initStudentPickerFiltering(scope) {
    const pickers = scope.querySelectorAll("[data-student-picker]");
    pickers.forEach((picker) => {
      const searchInput = picker.querySelector("[data-student-search]");
      const options = picker.querySelectorAll(".student-option");
      if (!searchInput || !options.length) return;

      searchInput.addEventListener("input", () => {
        const query = String(searchInput.value || "").trim().toLowerCase();
        options.forEach((option) => {
          const searchable = option.dataset.studentText || "";
          const matches = !query || searchable.includes(query);
          option.classList.toggle("hidden-option", !matches);
        });
      });
    });
  }

  initStudentPickerFiltering(document);

  function buildAvatarActionMarkup(userId, hasAvatar) {
    const safeUserId = encodeURIComponent(String(userId || ""));
    const safeCsrfQuery = encodeURIComponent(csrfToken || "");
    const safeCsrfField = AdminViewEdit.esc(csrfToken || "");
    const uploadLabel = hasAvatar ? "Replace Avatar" : "Add Avatar";
    const removeMarkup = hasAvatar ? `
      <form class="inline-avatar-form js-avatar-remove-form" action="/admin/users/${safeUserId}/avatar/remove?_csrf=${safeCsrfQuery}" method="POST">
        <input type="hidden" name="_csrf" value="${safeCsrfField}" />
        <button class="action-btn action-btn-avatar-remove" type="submit" title="Remove avatar image">
          <span>Remove Avatar</span>
        </button>
      </form>
    ` : "";

    return `
      <form class="inline-avatar-form js-avatar-upload-form" action="/admin/users/${safeUserId}/avatar?_csrf=${safeCsrfQuery}" method="POST" enctype="multipart/form-data">
        <input type="hidden" name="_csrf" value="${safeCsrfField}" />
        <label class="action-btn action-btn-avatar" title="Upload avatar image">
          <span>${uploadLabel}</span>
          <input class="js-avatar-input" type="file" name="avatar" accept=".jpg,.jpeg,.png" />
        </label>
      </form>
      ${removeMarkup}
    `;
  }

  function attachAvatarActions(actionCell) {
    const input = actionCell.querySelector(".js-avatar-input");
    const form = actionCell.querySelector(".js-avatar-upload-form");
    if (input && form && input.dataset.bound !== "1") {
      input.dataset.bound = "1";
      input.addEventListener("change", () => {
        if (!input.files || !input.files.length) return;
        form.submit();
      });
    }

    const removeForm = actionCell.querySelector(".js-avatar-remove-form");
    if (!removeForm || removeForm.dataset.bound === "1") return;
    removeForm.dataset.bound = "1";
    removeForm.addEventListener("submit", (event) => {
      const confirmed = window.confirm("Remove this user's profile picture?");
      if (!confirmed) event.preventDefault();
    });
  }

  const studentFieldDefs = [
    {
      cellSelector: ".cell-name",
      fields: ["firstName", "lastName"],
      renderView: ({ cell, data }) => {
        const fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
        cell.textContent = fullName || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit row-split">
          <input type="text" name="firstName" value="${AdminViewEdit.esc(data.firstName)}" required />
          <input type="text" name="lastName" value="${AdminViewEdit.esc(data.lastName)}" required />
        </div>
        <div class="field-error" data-field-error="firstName"></div>
        <div class="field-error" data-field-error="lastName"></div>
      `
    },
    {
      cellSelector: ".cell-age",
      fields: ["age"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.age || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="number" name="age" min="1" max="99" value="${AdminViewEdit.esc(data.age)}" required />
          <div class="field-error" data-field-error="age"></div>
        </div>
      `
    },
    {
      cellSelector: ".cell-program",
      fields: ["programType"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.programType || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <select name="programType" required>
            <option value="Tahfiidth" ${data.programType === "Tahfiidth" ? "selected" : ""}>Tahfiidth</option>
            <option value="Khatm" ${data.programType === "Khatm" ? "selected" : ""}>Khatm</option>
          </select>
          <div class="field-error" data-field-error="programType"></div>
        </div>
      `
    },
    {
      cellSelector: ".cell-grade",
      fields: ["gradeLevel"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.gradeLevel || "N/A";
      },
      renderEdit: (data) => {
        const levels = ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
        return `
          <div class="cell-edit">
            <select name="gradeLevel" required>
              ${levels.map((level) => `<option value="${level}" ${data.gradeLevel === level ? "selected" : ""}>${level}</option>`).join("")}
            </select>
            <div class="field-error" data-field-error="gradeLevel"></div>
          </div>
        `;
      }
    },
    {
      cellSelector: ".cell-enrollment",
      fields: ["enrollmentDate"],
      renderView: ({ cell, data }) => {
        cell.textContent = formatDateForView(data.enrollmentDate);
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="date" name="enrollmentDate" value="${AdminViewEdit.esc(data.enrollmentDate)}" required />
          <div class="field-error" data-field-error="enrollmentDate"></div>
        </div>
      `
    },
    {
      cellSelector: ".cell-username",
      fields: ["userName"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.userName || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="text" name="userName" value="${AdminViewEdit.esc(data.userName)}" required />
          <div class="field-error" data-field-error="userName"></div>
        </div>
      `
    },
    {
      cellSelector: ".cell-email",
      fields: ["email"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.email || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="email" name="email" value="${AdminViewEdit.esc(data.email)}" required />
          <div class="field-error" data-field-error="email"></div>
        </div>
      `
    }
  ];

  const teacherFieldDefs = [
    {
      cellSelector: ".t-cell-name",
      fields: ["firstName", "lastName"],
      renderView: ({ cell, data }) => {
        const fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
        cell.textContent = fullName || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit row-split">
          <input type="text" name="firstName" value="${AdminViewEdit.esc(data.firstName)}" required />
          <input type="text" name="lastName" value="${AdminViewEdit.esc(data.lastName)}" required />
        </div>
        <div class="field-error" data-field-error="firstName"></div>
        <div class="field-error" data-field-error="lastName"></div>
      `
    },
    {
      cellSelector: ".t-cell-subjects",
      fields: ["subjects"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.subjects || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="text" name="subjects" value="${AdminViewEdit.esc(data.subjects)}" placeholder="Comma separated subjects" />
          <div class="field-error" data-field-error="subjects"></div>
        </div>
      `
    },
    {
      cellSelector: ".t-cell-hire",
      fields: ["hireDate"],
      renderView: ({ cell, data }) => {
        cell.textContent = formatDateForView(data.hireDate);
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="date" name="hireDate" value="${AdminViewEdit.esc(data.hireDate)}" />
          <div class="field-error" data-field-error="hireDate"></div>
        </div>
      `
    }
  ];

  const parentFieldDefs = [
    {
      cellSelector: ".p-cell-name",
      fields: ["firstName", "lastName"],
      renderView: ({ cell, data }) => {
        const fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
        cell.textContent = fullName || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit row-split">
          <input type="text" name="firstName" value="${AdminViewEdit.esc(data.firstName)}" required />
          <input type="text" name="lastName" value="${AdminViewEdit.esc(data.lastName)}" required />
        </div>
        <div class="field-error" data-field-error="firstName"></div>
        <div class="field-error" data-field-error="lastName"></div>
      `
    },
    {
      cellSelector: ".p-cell-tuition",
      fields: ["monthlyTuitionAmount"],
      renderView: ({ cell, data }) => {
        const amount = Number(data.monthlyTuitionAmount || 0);
        cell.textContent = Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="number" name="monthlyTuitionAmount" min="0" step="0.01" value="${AdminViewEdit.esc(data.monthlyTuitionAmount)}" />
          <div class="field-error" data-field-error="monthlyTuitionAmount"></div>
        </div>
      `
    },
    {
      cellSelector: ".p-cell-billing",
      fields: ["billingDayOfMonth"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.billingDayOfMonth || "1";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="number" name="billingDayOfMonth" min="1" max="28" value="${AdminViewEdit.esc(data.billingDayOfMonth)}" />
          <div class="field-error" data-field-error="billingDayOfMonth"></div>
        </div>
      `
    },
    {
      cellSelector: ".p-cell-currency",
      fields: ["currency"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.currency || "USD";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <select name="currency">
            ${["USD", "CAD", "EUR", "GBP"].map((currency) => `<option value="${currency}" ${data.currency === currency ? "selected" : ""}>${currency}</option>`).join("")}
          </select>
          <div class="field-error" data-field-error="currency"></div>
        </div>
      `
    },
    {
      cellSelector: ".p-cell-username",
      fields: ["userName"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.userName || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="text" name="userName" value="${AdminViewEdit.esc(data.userName)}" required />
          <div class="field-error" data-field-error="userName"></div>
        </div>
      `
    },
    {
      cellSelector: ".p-cell-email",
      fields: ["email"],
      renderView: ({ cell, data }) => {
        cell.textContent = data.email || "N/A";
      },
      renderEdit: (data) => `
        <div class="cell-edit">
          <input type="email" name="email" value="${AdminViewEdit.esc(data.email)}" required />
          <div class="field-error" data-field-error="email"></div>
        </div>
      `
    }
  ];

  document.querySelectorAll(".student-row").forEach((rowEl) => {
    const hasAvatar = Boolean(String(rowEl.dataset.profileImage || "").trim());
    const initialData = {
      firstName: rowEl.dataset.firstName || "",
      lastName: rowEl.dataset.lastName || "",
      age: rowEl.dataset.age || "",
      programType: rowEl.dataset.programType || "",
      gradeLevel: rowEl.dataset.gradeLevel || "",
      enrollmentDate: rowEl.dataset.enrollmentDate || "",
      userName: rowEl.dataset.userName || "",
      email: rowEl.dataset.email || ""
    };

    AdminViewEdit.createRowEditor({
      rowEl,
      type: "student",
      userId: rowEl.dataset.id,
      initialData,
      editableFields: ["firstName", "lastName", "age", "programType", "gradeLevel", "enrollmentDate", "userName", "email"],
      endpoint: (id) => `/admin/users/${id}`,
      csrfToken,
      fieldDefs: studentFieldDefs,
      sharedState,
      mapServerData: (serverData) => ({
        firstName: serverData.firstName || "",
        lastName: serverData.lastName || "",
        age: serverData.age == null ? "" : String(serverData.age),
        programType: serverData.programType || "",
        gradeLevel: serverData.gradeLevel || "",
        enrollmentDate: serverData.enrollmentDate ? String(serverData.enrollmentDate).slice(0, 10) : "",
        userName: serverData.userName || "",
        email: serverData.email || ""
      }),
      extraViewActionsHtml: buildAvatarActionMarkup(rowEl.dataset.id, hasAvatar),
      onViewActionsRendered: (actionCell) => {
        attachAvatarActions(actionCell);
      },
      onDelete: deleteUserRow,
      deleteLabel: "Student"
    });
  });

  document.querySelectorAll(".teacher-row").forEach((rowEl) => {
    const hasAvatar = Boolean(String(rowEl.dataset.profileImage || "").trim());
    const initialData = {
      firstName: rowEl.dataset.firstName || "",
      lastName: rowEl.dataset.lastName || "",
      subjects: rowEl.dataset.subjects || "",
      hireDate: rowEl.dataset.hireDate || ""
    };

    AdminViewEdit.createRowEditor({
      rowEl,
      type: "teacher",
      userId: rowEl.dataset.id,
      initialData,
      editableFields: ["firstName", "lastName", "subjects", "hireDate"],
      endpoint: (id) => `/admin/users/${id}`,
      csrfToken,
      fieldDefs: teacherFieldDefs,
      sharedState,
      mapServerData: (serverData) => ({
        firstName: serverData.firstName || "",
        lastName: serverData.lastName || "",
        subjects: Array.isArray(serverData.subjects) ? serverData.subjects.join(", ") : "",
        hireDate: serverData.hireDate ? String(serverData.hireDate).slice(0, 10) : ""
      }),
      extraViewActionsHtml: buildAvatarActionMarkup(rowEl.dataset.id, hasAvatar),
      onViewActionsRendered: (actionCell) => {
        attachAvatarActions(actionCell);
      },
      onDelete: deleteUserRow,
      deleteLabel: "Teacher"
    });
  });

  document.querySelectorAll(".parent-row").forEach((rowEl) => {
    const hasAvatar = Boolean(String(rowEl.dataset.profileImage || "").trim());
    const initialData = {
      firstName: rowEl.dataset.firstName || "",
      lastName: rowEl.dataset.lastName || "",
      userName: rowEl.dataset.userName || "",
      email: rowEl.dataset.email || "",
      monthlyTuitionAmount: rowEl.dataset.monthlyTuitionAmount || "0",
      billingDayOfMonth: rowEl.dataset.billingDayOfMonth || "1",
      currency: rowEl.dataset.currency || "USD"
    };

    AdminViewEdit.createRowEditor({
      rowEl,
      type: "parent",
      userId: rowEl.dataset.id,
      initialData,
      editableFields: ["firstName", "lastName", "userName", "email", "monthlyTuitionAmount", "billingDayOfMonth", "currency"],
      endpoint: (id) => `/admin/users/${id}`,
      csrfToken,
      fieldDefs: parentFieldDefs,
      sharedState,
      mapServerData: (serverData) => ({
        firstName: serverData.firstName || "",
        lastName: serverData.lastName || "",
        userName: serverData.userName || "",
        email: serverData.email || "",
        monthlyTuitionAmount: String(serverData.monthlyTuitionAmount ?? 0),
        billingDayOfMonth: String(serverData.billingDayOfMonth ?? 1),
        currency: serverData.currency || "USD"
      }),
      extraViewActionsHtml: `
        ${buildAvatarActionMarkup(rowEl.dataset.id, hasAvatar)}
        <button class="action-btn js-manage-children-trigger" type="button" aria-label="Manage children" title="Manage children">
          <span>Children</span>
        </button>
      `,
      onViewActionsRendered: (actionCell, currentRow) => {
        attachAvatarActions(actionCell);
        const manageBtn = actionCell.querySelector(".js-manage-children-trigger");
        manageBtn?.addEventListener("click", () => openChildrenDialog(currentRow));
      },
      onDelete: deleteUserRow,
      deleteLabel: "Parent"
    });
  });

  const studentCatalogScript = document.getElementById("studentCatalogData");
  const studentCatalog = studentCatalogScript
    ? JSON.parse(studentCatalogScript.textContent || "[]")
    : [];

  const childrenDialog = document.getElementById("parentChildrenDialog");
  const childrenListEl = document.getElementById("parentChildrenList");
  const childrenSearchEl = document.getElementById("parentChildrenSearch");
  const childrenRelationshipEl = document.getElementById("parentChildrenRelationship");
  const childrenSaveBtn = document.getElementById("parentChildrenSave");
  const childrenCancelBtn = document.getElementById("parentChildrenCancel");
  const childrenErrorEl = document.getElementById("parentChildrenError");
  let activeParentRow = null;
  let dialogSelectedChildren = new Set();

  function renderChildrenOptions(query) {
    if (!childrenListEl) return;
    childrenListEl.innerHTML = "";
    const normalizedQuery = String(query || "").trim().toLowerCase();

    studentCatalog.forEach((student) => {
      const searchable = `${student.fullName || ""} ${student.gradeLevel || ""} ${student.programType || ""}`.toLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return;

      const label = document.createElement("label");
      label.className = "student-option";
      label.dataset.studentText = searchable;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = student.id;
      input.checked = dialogSelectedChildren.has(String(student.id));
      input.addEventListener("change", () => {
        if (input.checked) dialogSelectedChildren.add(String(student.id));
        else dialogSelectedChildren.delete(String(student.id));
      });

      const main = document.createElement("span");
      main.className = "student-option-main";
      main.textContent = student.fullName || "Unknown Student";

      const meta = document.createElement("span");
      meta.className = "student-option-meta";
      const grade = student.gradeLevel || "N/A";
      const program = student.programType || "N/A";
      meta.textContent = `${grade} · ${program}`;

      label.appendChild(input);
      label.appendChild(main);
      label.appendChild(meta);
      childrenListEl.appendChild(label);
    });

    if (!childrenListEl.children.length) {
      const empty = document.createElement("p");
      empty.className = "picker-empty";
      empty.textContent = "No students match your search.";
      childrenListEl.appendChild(empty);
    }
  }

  function closeChildrenDialog() {
    if (!childrenDialog) return;
    activeParentRow = null;
    dialogSelectedChildren = new Set();
    if (childrenErrorEl) childrenErrorEl.textContent = "";
    if (childrenSearchEl) childrenSearchEl.value = "";
    if (typeof childrenDialog.close === "function") childrenDialog.close();
  }

  function openChildrenDialog(parentRow) {
    if (!childrenDialog || !parentRow) return;
    activeParentRow = parentRow;
    if (childrenErrorEl) childrenErrorEl.textContent = "";

    const selectedIds = new Set(
      String(parentRow.dataset.childIds || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );
    dialogSelectedChildren = selectedIds;
    renderChildrenOptions("");

    if (typeof childrenDialog.showModal === "function") {
      childrenDialog.showModal();
    }
  }

  async function saveChildrenAssignments() {
    if (!activeParentRow) return;
    if (childrenErrorEl) childrenErrorEl.textContent = "";

    const parentId = activeParentRow.dataset.id;
    const selectedChildren = Array.from(dialogSelectedChildren);
    const relationship = childrenRelationshipEl?.value || "Guardian";
    childrenSaveBtn.disabled = true;

    try {
      const { response, payload } = await AdminViewEdit.jsonFetch(`/admin/parents/${parentId}/children`, {
        method: "PUT",
        csrfToken,
        data: {
          children: selectedChildren,
          relationship
        }
      });

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to save child assignments.");
      }

      const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
      activeParentRow.dataset.childIds = children.map((entry) => entry.childID).join(",");

      const cell = activeParentRow.querySelector(".p-cell-children");
      if (cell) {
        cell.textContent = children.length
          ? children.map((entry) => `${entry.childName} (${entry.relationship})`).join(", ")
          : "N/A";
      }

      closeChildrenDialog();
    } catch (err) {
      if (childrenErrorEl) {
        childrenErrorEl.textContent = err.message || "Unable to save child assignments.";
      }
    } finally {
      childrenSaveBtn.disabled = false;
    }
  }

  childrenSearchEl?.addEventListener("input", () => {
    if (!activeParentRow) return;
    renderChildrenOptions(childrenSearchEl.value);
  });

  childrenSaveBtn?.addEventListener("click", saveChildrenAssignments);
  childrenCancelBtn?.addEventListener("click", closeChildrenDialog);
  childrenDialog?.addEventListener("cancel", closeChildrenDialog);
})();
