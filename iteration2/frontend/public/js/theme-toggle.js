/**
 * theme-toggle.js
 * IlmQuest — Persistent dark/light mode toggle.
 *
 * Reads preference from localStorage ("ilmquest_theme": "dark" | "light").
 * Falls back to OS-level prefers-color-scheme.
 * Sets [data-theme="dark"] on <html> so CSS can scope all overrides.
 *
 * Run inline (not deferred) to avoid flash of wrong theme.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "ilmquest_theme";
  var html = document.documentElement;

  function getSystemPref() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    html.setAttribute("data-theme", theme);
    /* Update all toggle buttons that may already be in the DOM */
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      var icon = btn.querySelector(".theme-toggle-icon");
      if (icon) icon.textContent = theme === "dark" ? "☀" : "☽";
    });
  }

  function toggleTheme() {
    var current = html.getAttribute("data-theme") || "light";
    var next = current === "dark" ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    applyTheme(next);
  }

  /* Apply saved or system preference immediately */
  var saved;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyTheme(saved === "dark" || saved === "light" ? saved : getSystemPref());

  /* Expose toggle so inline onclick can reach it */
  window.__ilmThemeToggle = toggleTheme;

  /* Wire up any buttons added after this script runs */
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });
    /* Re-apply to sync button icons */
    applyTheme(html.getAttribute("data-theme") || "light");
  });
})();
