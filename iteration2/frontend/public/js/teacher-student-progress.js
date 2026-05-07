document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("teacherPointsAdjustmentForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const csrfToken = form.querySelector('input[name="_csrf"]')?.value || "";
    const apiPath = form.dataset.apiPath || form.getAttribute("action") || "";
    const formData = new FormData(form);
    const payload = {
      classId: String(formData.get("classId") || "").trim(),
      direction: String(formData.get("direction") || "").trim(),
      amount: String(formData.get("amount") || "").trim(),
      reason: String(formData.get("reason") || "").trim()
    };

    if (!apiPath) return;

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Saving...";
      }

      const response = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Could not record the adjustment.");
      }

      window.location.reload();
    } catch (error) {
      window.alert(error?.message || "Could not record the adjustment.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Record Adjustment";
      }
    }
  });
});
