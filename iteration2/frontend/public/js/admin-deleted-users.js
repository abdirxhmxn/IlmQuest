(function initDeletedUsersPage() {
  const dialog = document.getElementById("permanentDeleteDialog");
  const forms = document.querySelectorAll("[data-permanent-delete-form]");
  if (!dialog || !forms.length || !window.AdminViewEdit) return;

  forms.forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const userName = form.dataset.userName || "this account";

      AdminViewEdit.openConfirmDialog(dialog, {
        title: "Confirm Permanent Delete",
        message: `Permanently delete ${userName}? This cannot be undone.`,
        onConfirm: async () => {
          HTMLFormElement.prototype.submit.call(form);
        }
      });
    });
  });
})();
