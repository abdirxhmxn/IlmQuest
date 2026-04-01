(function initParentShell() {
  const shell = document.getElementById("parentShell");
  if (!shell) return;

  const toggleButtons = document.querySelectorAll("[data-parent-sidebar-toggle]");
  const logoButtons = document.querySelectorAll("[data-parent-sidebar-logo-toggle]");
  const scrim = document.querySelector("[data-parent-sidebar-scrim]");
  const mobileQuery = window.matchMedia("(max-width: 1080px)");
  const STORAGE_KEY = "ilmquest_parent_sidebar_collapsed";
  const headerUserName = shell.dataset.shellUserName || "Parent User";
  const headerUserRole = shell.dataset.shellUserRole || "PARENT";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function injectHeaderIdentity() {
    const headers = document.querySelectorAll(".parent-page-header");
    headers.forEach((header) => {
      if (header.querySelector(".parent-header-user")) return;
      const userLink = document.createElement("a");
      userLink.className = "parent-header-user";
      userLink.href = "/profile";
      userLink.innerHTML =
        '<span class="parent-header-user-name">' +
        escapeHtml(headerUserName) +
        "</span>" +
        '<span class="parent-header-user-role">' +
        escapeHtml(headerUserRole) +
        "</span>";
      header.appendChild(userLink);
    });
  }

  function setButtonExpanded(expanded) {
    toggleButtons.forEach((button) => {
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      button.textContent = expanded ? "Hide Menu" : "Show Menu";
    });
  }

  function applyDesktopPreference() {
    if (mobileQuery.matches) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const collapsed = stored === "1";
    shell.classList.toggle("parent-sidebar-collapsed", collapsed);
    setButtonExpanded(!collapsed);
  }

  function toggleSidebar() {
    if (mobileQuery.matches) {
      const isOpen = shell.classList.contains("parent-sidebar-open");
      shell.classList.toggle("parent-sidebar-open", !isOpen);
      setButtonExpanded(!isOpen);
      return;
    }

    const collapsed = shell.classList.toggle("parent-sidebar-collapsed");
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    setButtonExpanded(!collapsed);
  }

  function syncForViewport() {
    if (mobileQuery.matches) {
      shell.classList.remove("parent-sidebar-collapsed");
      setButtonExpanded(shell.classList.contains("parent-sidebar-open"));
    } else {
      shell.classList.remove("parent-sidebar-open");
      applyDesktopPreference();
    }
  }

  toggleButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  logoButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  scrim?.addEventListener("click", () => {
    shell.classList.remove("parent-sidebar-open");
    setButtonExpanded(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("parent-sidebar-open")) {
      shell.classList.remove("parent-sidebar-open");
      setButtonExpanded(false);
    }
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncForViewport);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncForViewport);
  }

  injectHeaderIdentity();
  applyDesktopPreference();
  syncForViewport();
})();
