(function profileEditModeBootstrap() {
  const card = document.querySelector("[data-profile-edit-card]");
  if (!card) return;

  const toggleButton = card.querySelector("[data-profile-edit-toggle]");
  const cancelButton = card.querySelector("[data-profile-edit-cancel]");
  const viewBlock = card.querySelector("[data-profile-contact-view]");
  const editForm = card.querySelector("[data-profile-edit-form]");
  if (!toggleButton || !viewBlock || !editForm) return;

  const setEditing = (isEditing) => {
    card.classList.toggle("is-editing", Boolean(isEditing));
    viewBlock.hidden = Boolean(isEditing);
    editForm.hidden = !isEditing;
    toggleButton.textContent = isEditing ? "Editing..." : "Edit Profile";
    toggleButton.disabled = Boolean(isEditing);
  };

  toggleButton.addEventListener("click", () => {
    setEditing(true);
    const firstInput = editForm.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      setEditing(false);
    });
  }

  if (document.querySelector(".profile-flash-error")) {
    setEditing(true);
  } else {
    setEditing(false);
  }
})();
