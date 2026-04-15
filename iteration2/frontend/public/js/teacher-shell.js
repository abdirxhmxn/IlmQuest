(function initTeacherShell() {
  const shell = document.getElementById("teacherShell");
  if (!shell) return;

  const shellActiveKey = String(shell.dataset.shellActiveKey || "").trim();
  const sidebar = document.querySelector("[data-teacher-sidebar-toggle-surface]") || document.getElementById("teacherSidebar");
  const scrim = document.querySelector("[data-teacher-sidebar-scrim]");
  const navLinks = Array.from(document.querySelectorAll(".teacher-sidebar-link"));
  const mobileQuery = window.matchMedia("(max-width: 1024px)");
  const STORAGE_KEY = "ilmquest_teacher_sidebar_collapsed";

  function normalizePath(pathValue) {
    const path = String(pathValue || "").split(/[?#]/)[0].replace(/\/+$/, "");
    return path || "/";
  }

  function setExpanded(expanded) {
    if (!sidebar) return;
    sidebar.setAttribute("data-sidebar-expanded", expanded ? "true" : "false");
  }

  function applyDesktopPreference() {
    if (mobileQuery.matches) return;
    const collapsed = window.localStorage.getItem(STORAGE_KEY) === "1";
    shell.classList.toggle("teacher-sidebar-collapsed", collapsed);
    setExpanded(!collapsed);
  }

  function toggleSidebar() {
    if (mobileQuery.matches) {
      const willOpen = !shell.classList.contains("teacher-sidebar-open");
      shell.classList.toggle("teacher-sidebar-open", willOpen);
      setExpanded(willOpen);
      return;
    }

    const collapsed = shell.classList.toggle("teacher-sidebar-collapsed");
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    setExpanded(!collapsed);
  }

  function syncForViewport() {
    if (mobileQuery.matches) {
      shell.classList.remove("teacher-sidebar-collapsed");
      setExpanded(shell.classList.contains("teacher-sidebar-open"));
      return;
    }

    shell.classList.remove("teacher-sidebar-open");
    applyDesktopPreference();
  }

  function syncActiveNavByPath() {
    if (!navLinks.length) return;
    const currentPath = normalizePath(window.location.pathname);

    if (shellActiveKey) {
      const hasServerMatch = navLinks.some(
        (link) => String(link.dataset.teacherNavKey || "").trim() === shellActiveKey
      );
      if (hasServerMatch) {
        navLinks.forEach((link) => {
          link.classList.toggle(
            "active",
            String(link.dataset.teacherNavKey || "").trim() === shellActiveKey
          );
        });
        return;
      }
    }

    let bestMatchLink = null;
    let bestScore = -1;

    navLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const linkPath = normalizePath(href);

      const isMatch =
        currentPath === linkPath ||
        (linkPath !== "/" && currentPath.startsWith(linkPath + "/"));

      if (isMatch) {
        const score = linkPath.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatchLink = link;
        }
      }
    });

    navLinks.forEach((link) => {
      link.classList.toggle("active", link === bestMatchLink);
    });

    if (!bestMatchLink) {
      const attendanceLike = currentPath.includes("attendance");
      if (attendanceLike) {
        navLinks.forEach((link) => {
          if (normalizePath(link.getAttribute("href")) === "/teacher/manage-attendance") {
            link.classList.add("active");
          }
        });
      }
    }
  }

  sidebar?.addEventListener("click", (event) => {
    const clickedInteractive = event.target.closest("a, button, input, select, textarea, label");
    if (clickedInteractive) return;
    toggleSidebar();
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (!mobileQuery.matches) return;
      shell.classList.remove("teacher-sidebar-open");
      setExpanded(false);
    });
  });

  scrim?.addEventListener("click", () => {
    shell.classList.remove("teacher-sidebar-open");
    setExpanded(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("teacher-sidebar-open")) {
      shell.classList.remove("teacher-sidebar-open");
      setExpanded(false);
    }
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncForViewport);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncForViewport);
  }

  syncActiveNavByPath();
  applyDesktopPreference();
  syncForViewport();
})();
