(function initParentShell() {
  const shell = document.getElementById("parentShell");
  if (!shell) return;

  const shellActiveKey = String(shell.dataset.shellActiveKey || "").trim();
  const sidebar = document.getElementById("parentSidebar");
  const toggleButtons = document.querySelectorAll("[data-parent-sidebar-toggle]");
  const logoButtons = document.querySelectorAll("[data-parent-sidebar-logo-toggle]");
  const scrim = document.querySelector("[data-parent-sidebar-scrim]");
  const navLinks = Array.from(document.querySelectorAll(".parent-sidebar-link"));
  const mobileQuery = window.matchMedia("(max-width: 1080px)");
  const STORAGE_KEY = "ilmquest_parent_sidebar_collapsed";
  const headerUserName = shell.dataset.shellUserName || "Parent User";
  const headerUserRole = shell.dataset.shellUserRole || "PARENT";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
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

  function setSidebarExpanded(expanded) {
    if (!sidebar) return;
    sidebar.setAttribute("data-sidebar-expanded", expanded ? "true" : "false");
  }

  function setButtonsExpanded(expanded) {
    toggleButtons.forEach((button) => {
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (button.childElementCount === 0) {
        button.textContent = expanded ? "Hide Menu" : "Show Menu";
      }
    });
    setSidebarExpanded(expanded);
  }

  function applyDesktopPreference() {
    if (mobileQuery.matches) return;
    const collapsed = window.localStorage.getItem(STORAGE_KEY) === "1";
    shell.classList.toggle("parent-sidebar-collapsed", collapsed);
    setButtonsExpanded(!collapsed);
  }

  function toggleSidebar() {
    if (mobileQuery.matches) {
      const isOpen = shell.classList.contains("parent-sidebar-open");
      shell.classList.toggle("parent-sidebar-open", !isOpen);
      setButtonsExpanded(!isOpen);
      return;
    }

    const collapsed = shell.classList.toggle("parent-sidebar-collapsed");
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    setButtonsExpanded(!collapsed);
  }

  function syncForViewport() {
    if (mobileQuery.matches) {
      shell.classList.remove("parent-sidebar-collapsed");
      setButtonsExpanded(shell.classList.contains("parent-sidebar-open"));
      return;
    }

    shell.classList.remove("parent-sidebar-open");
    applyDesktopPreference();
  }

  function syncActiveNavByPath() {
    if (!navLinks.length) return;
    const currentPath = normalizePath(window.location.pathname);
    const currentHash = normalizeHash(window.location.hash);

    if (shellActiveKey && !currentHash) {
      const serverMatched = navLinks.some(
        (link) => String(link.dataset.parentNavKey || "").trim() === shellActiveKey
      );

      if (serverMatched) {
        navLinks.forEach((link) => {
          const key = String(link.dataset.parentNavKey || "").trim();
          link.classList.toggle("active", key === shellActiveKey);
        });
        return;
      }
    }

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

      if (isMatch) {
        const score = linkPath.length + (linkHash ? 25 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = link;
        }
      }
    });

    if (!bestMatch) {
      const fallbackByPath = {
        "/profile": "account"
      };

      let fallbackKey = fallbackByPath[currentPath] || "";
      if (!fallbackKey && currentPath.startsWith("/parent/child/")) {
        fallbackKey = "children";
      }

      if (fallbackKey) {
        bestMatch = navLinks.find(
          (link) => String(link.dataset.parentNavKey || "").trim() === fallbackKey
        );
      }
    }

    navLinks.forEach((link) => {
      link.classList.toggle("active", link === bestMatch);
    });
  }

  toggleButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  logoButtons.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (!mobileQuery.matches) return;
      shell.classList.remove("parent-sidebar-open");
      setButtonsExpanded(false);
    });
  });

  scrim?.addEventListener("click", () => {
    shell.classList.remove("parent-sidebar-open");
    setButtonsExpanded(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("parent-sidebar-open")) {
      shell.classList.remove("parent-sidebar-open");
      setButtonsExpanded(false);
    }
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncForViewport);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncForViewport);
  }

  window.addEventListener("hashchange", syncActiveNavByPath);

  injectHeaderIdentity();
  syncActiveNavByPath();
  applyDesktopPreference();
  syncForViewport();
})();
