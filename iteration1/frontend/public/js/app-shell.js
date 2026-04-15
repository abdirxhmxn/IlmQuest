(function initRoleShells() {
  const shells = Array.from(document.querySelectorAll("[data-role-shell]"));
  if (!shells.length) return;

  const MOBILE_QUERY = "(max-width: 1024px)";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizePath(pathValue) {
    const path = String(pathValue || "").split(/[?#]/)[0].replace(/\/+$/, "");
    return path || "/";
  }

  function normalizeHash(hashValue) {
    const hash = String(hashValue || "").trim();
    return hash.startsWith("#") ? hash.toLowerCase() : "";
  }

  function bestLinkForCurrentLocation(navLinks, options = {}) {
    const currentPath = normalizePath(window.location.pathname);
    const currentHash = normalizeHash(window.location.hash);
    const role = options.role || "";

    let bestMatch = null;
    let bestScore = -1;

    navLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const parsedUrl = new URL(href, window.location.origin);
      const linkPath = normalizePath(parsedUrl.pathname);
      const linkHash = normalizeHash(parsedUrl.hash);

      const samePath = currentPath === linkPath;
      const prefixPath = linkPath !== "/" && currentPath.startsWith(linkPath + "/");
      const pathMatches = samePath || prefixPath;

      let isMatch = false;
      if (linkHash) {
        isMatch = pathMatches && currentHash === linkHash;
      } else {
        isMatch = pathMatches;
      }

      if (!isMatch) return;

      const score = linkPath.length + (linkHash ? 25 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = link;
      }
    });

    if (bestMatch) return bestMatch;

    const fallbackByPath = {
      "/profile": role === "parent" ? "account" : "profile"
    };

    let fallbackKey = fallbackByPath[currentPath] || "";
    if (!fallbackKey && role === "parent" && currentPath.startsWith("/parent/child/")) {
      fallbackKey = "children";
    }
    if (!fallbackKey && role === "teacher" && currentPath.includes("attendance")) {
      fallbackKey = "attendance";
    }

    if (!fallbackKey) return null;
    return navLinks.find(
      (link) => String(link.dataset.shellNavKey || "").trim() === fallbackKey
    ) || null;
  }

  function initShell(shell) {
    const role = String(shell.dataset.roleShell || shell.dataset.shellRole || "").trim();
    const sidebar = shell.querySelector("[data-shell-toggle-surface]");
    const scrim = shell.querySelector("[data-shell-scrim]");
    const navLinks = Array.from(shell.querySelectorAll("[data-shell-nav-key]"));
    const toggleButtons = shell.querySelectorAll(
      "[data-sidebar-toggle], [data-parent-sidebar-toggle], [data-shell-toggle-button], [data-sidebar-logo-toggle], [data-parent-sidebar-logo-toggle]"
    );
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const storageKey = String(shell.dataset.shellStorageKey || `ilmquest_${role || "app"}_sidebar_collapsed`);
    const shellActiveKey = String(shell.dataset.shellActiveKey || "").trim();
    const headerUserName = shell.dataset.shellUserName || "User";
    const headerUserRole = shell.dataset.shellUserRole || (role ? role.toUpperCase() : "USER");

    function setExpanded(expanded) {
      if (!sidebar) return;
      sidebar.setAttribute("data-sidebar-expanded", expanded ? "true" : "false");
    }

    function applyDesktopPreference() {
      if (mobileQuery.matches) return;
      const collapsed = window.localStorage.getItem(storageKey) === "1";
      shell.classList.toggle("is-sidebar-collapsed", collapsed);
      setExpanded(!collapsed);
    }

    function toggleSidebar() {
      if (mobileQuery.matches) {
        const willOpen = !shell.classList.contains("is-sidebar-open");
        shell.classList.toggle("is-sidebar-open", willOpen);
        setExpanded(willOpen);
        return;
      }

      const collapsed = shell.classList.toggle("is-sidebar-collapsed");
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
      setExpanded(!collapsed);
    }

    function closeMobileSidebar() {
      shell.classList.remove("is-sidebar-open");
      if (mobileQuery.matches) setExpanded(false);
    }

    function syncForViewport() {
      if (mobileQuery.matches) {
        shell.classList.remove("is-sidebar-collapsed");
        setExpanded(shell.classList.contains("is-sidebar-open"));
        return;
      }

      shell.classList.remove("is-sidebar-open");
      applyDesktopPreference();
    }

    function syncActiveNavByLocation() {
      if (!navLinks.length) return;
      const currentHash = normalizeHash(window.location.hash);

      if (shellActiveKey && !currentHash) {
        const hasServerMatch = navLinks.some(
          (link) => String(link.dataset.shellNavKey || "").trim() === shellActiveKey
        );
        if (hasServerMatch) {
          navLinks.forEach((link) => {
            const key = String(link.dataset.shellNavKey || "").trim();
            link.classList.toggle("active", key === shellActiveKey);
          });
          return;
        }
      }

      const bestMatch = bestLinkForCurrentLocation(navLinks, { role });
      navLinks.forEach((link) => {
        link.classList.toggle("active", link === bestMatch);
      });
    }

    function injectHeaderIdentity() {
      const headers = shell.querySelectorAll(
        ".teacher-page-header, .parent-page-header, .admin-page-header, .student-page-header"
      );

      headers.forEach((header) => {
        if (
          header.querySelector(".role-header-user") ||
          header.querySelector(".teacher-header-user") ||
          header.querySelector(".parent-header-user") ||
          header.querySelector(".admin-header-user")
        ) {
          return;
        }

        const userLink = document.createElement("a");
        userLink.className = "role-header-user";
        userLink.href = "/profile";
        userLink.innerHTML =
          '<span class="role-header-user-name">' +
          escapeHtml(headerUserName) +
          "</span>" +
          '<span class="role-header-user-role">' +
          escapeHtml(headerUserRole) +
          "</span>";
        header.appendChild(userLink);
      });
    }

    sidebar?.addEventListener("click", (event) => {
      const clickedInteractive = event.target.closest(
        "a, button, input, select, textarea, label, summary, [role='button']"
      );
      if (clickedInteractive) return;
      toggleSidebar();
    });

    toggleButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        toggleSidebar();
      });
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        if (!mobileQuery.matches) return;
        closeMobileSidebar();
      });
    });

    scrim?.addEventListener("click", closeMobileSidebar);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && shell.classList.contains("is-sidebar-open")) {
        closeMobileSidebar();
      }
    });

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", syncForViewport);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(syncForViewport);
    }

    window.addEventListener("hashchange", syncActiveNavByLocation);
    window.addEventListener("popstate", syncActiveNavByLocation);

    injectHeaderIdentity();
    syncActiveNavByLocation();
    applyDesktopPreference();
    syncForViewport();
  }

  shells.forEach(initShell);
})();
