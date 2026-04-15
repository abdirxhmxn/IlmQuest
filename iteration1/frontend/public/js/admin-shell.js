/**
 * Admin shell controller.
 * Keeps sidebar behavior and lightweight header identity injection consistent
 * across all admin pages without coupling templates to repeated UI logic.
 */
(function initAdminShell() {
  const shell = document.getElementById("adminShell");
  if (!shell) return;

  const toggleButtons = document.querySelectorAll("[data-sidebar-toggle]");
  const logoButtons = document.querySelectorAll("[data-sidebar-logo-toggle]");
  const scrim = document.querySelector("[data-admin-sidebar-scrim]");
  const mobileQuery = window.matchMedia("(max-width: 1024px)");
  const STORAGE_KEY = "ilmquest_admin_sidebar_collapsed";
  const headerUserName = shell.dataset.shellUserName || "Admin User";
  const headerUserRole = shell.dataset.shellUserRole || "ADMIN";

  /**
   * Escapes user-derived strings before they are inserted into innerHTML.
   * This prevents accidental markup injection in the header identity block.
   */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Adds a compact profile identity chip to each admin page header.
   * The chip is injected once to preserve existing server-rendered structures.
   */
  function injectHeaderIdentity() {
    const headers = document.querySelectorAll(".admin-page-header");
    headers.forEach((header) => {
      if (header.querySelector(".admin-header-user")) return;
      const userLink = document.createElement("a");
      userLink.className = "admin-header-user";
      userLink.href = "/profile";
      userLink.innerHTML =
        '<span class="admin-header-user-name">' +
        escapeHtml(headerUserName) +
        "</span>" +
        '<span class="admin-header-user-role">' +
        escapeHtml(headerUserRole) +
        "</span>";
      header.appendChild(userLink);
    });
  }

  /**
   * Synchronizes aria-expanded state for accessibility on all sidebar toggles.
   */
  function setButtonsExpanded(expanded) {
    toggleButtons.forEach((button) => {
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  /**
   * Applies persisted desktop collapse preference from localStorage.
   * We skip this path on mobile because sidebar interaction is drawer-based.
   */
  function applyDesktopPreference() {
    if (mobileQuery.matches) return;
    const collapsed = window.localStorage.getItem(STORAGE_KEY) === "1";
    shell.classList.toggle("sidebar-collapsed", collapsed);
    setButtonsExpanded(!collapsed);
  }

  /**
   * Handles sidebar state transition for both desktop (collapse) and mobile (drawer).
   */
  function toggleSidebar() {
    if (mobileQuery.matches) {
      const nextOpen = !shell.classList.contains("sidebar-open");
      shell.classList.toggle("sidebar-open", nextOpen);
      setButtonsExpanded(nextOpen);
      return;
    }

    const collapsed = shell.classList.toggle("sidebar-collapsed");
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    setButtonsExpanded(!collapsed);
  }

  /**
   * Resets incompatible sidebar states when the viewport crosses breakpoints.
   */
  function syncForViewport() {
    if (mobileQuery.matches) {
      shell.classList.remove("sidebar-collapsed");
      setButtonsExpanded(shell.classList.contains("sidebar-open"));
      return;
    }

    shell.classList.remove("sidebar-open");
    applyDesktopPreference();
  }

  toggleButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  logoButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  scrim?.addEventListener("click", () => {
    shell.classList.remove("sidebar-open");
    setButtonsExpanded(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("sidebar-open")) {
      shell.classList.remove("sidebar-open");
      setButtonsExpanded(false);
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
