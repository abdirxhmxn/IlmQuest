(function () {
  const DESKTOP_QUERY = "(min-width: 901px)";

  function setExpanded(toggle, menu, expanded) {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    menu.classList.toggle("is-open", expanded);
  }

  function initToggle(toggle) {
    const menuId = toggle.getAttribute("aria-controls");
    const menu = menuId ? document.getElementById(menuId) : null;
    if (!menu) return;

    setExpanded(toggle, menu, false);

    toggle.addEventListener("click", () => {
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      setExpanded(toggle, menu, !isExpanded);
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (!window.matchMedia(DESKTOP_QUERY).matches) {
          setExpanded(toggle, menu, false);
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (!menu.classList.contains("is-open")) return;
      if (menu.contains(event.target) || toggle.contains(event.target)) return;
      setExpanded(toggle, menu, false);
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia(DESKTOP_QUERY).matches) {
        setExpanded(toggle, menu, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-nav-toggle]").forEach(initToggle);
  });
})();
