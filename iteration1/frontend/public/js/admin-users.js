(function initAdminUsersPage() {
  const root = document.querySelector(".users-page");
  if (!root || !window.AdminViewEdit) return;

  const csrfToken = root.dataset.csrfToken || "";
  const deleteDialog = document.getElementById("deleteUserDialog");
  const sharedState = { activeEditor: null };

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tables = {
    studentTable: document.getElementById("studentTable"),
    teacherTable: document.getElementById("teacherTable")
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

  document.querySelectorAll(".student-row").forEach((rowEl) => {
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
      onDelete: deleteUserRow,
      deleteLabel: "Student"
    });
  });

  document.querySelectorAll(".teacher-row").forEach((rowEl) => {
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
      onDelete: deleteUserRow,
      deleteLabel: "Teacher"
    });
  });
})();
