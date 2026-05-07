/**
 * scroll-animations.js
 * IlmQuest - Scroll-Based Reveal Animation Engine
 *
 * Watches .reveal elements via IntersectionObserver and adds
 * .is-revealed when they enter the viewport. Staggered timing
 * is handled purely by CSS on .reveal-stagger children.
 *
 * Safety guarantees:
 *   - Sets [data-animations-ready] on <html> FIRST so CSS only
 *     hides elements once JS is confirmed active (no invisible
 *     content if JS fails to load).
 *   - Immediately reveals all in-viewport elements on init so
 *     above-fold content is never stuck hidden.
 *   - Honors prefers-reduced-motion: all elements revealed
 *     instantly without transitions.
 *   - Falls back gracefully when IntersectionObserver is absent
 *     (old browsers).
 */
(function initScrollAnimations() {
  "use strict";

  /* Signal that JS animation engine is active.
     CSS hides .reveal only when this attribute is present,
     which means elements are always visible if this script
     never runs (network failure, JS disabled, etc.). */
  document.documentElement.setAttribute("data-animations-ready", "");

  var prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var targets = Array.prototype.slice.call(
    document.querySelectorAll(".reveal")
  );

  /* If reduced motion is preferred or IntersectionObserver is
     unavailable, skip animation and reveal everything at once. */
  if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
    targets.forEach(function (el) {
      el.classList.add("is-revealed");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target); /* one-shot: stop watching */
      });
    },
    {
      /* Small negative bottom margin so elements start revealing
         just before they fully enter the viewport — feels natural. */
      rootMargin: "0px 0px -36px 0px",
      threshold: 0.06
    }
  );

  targets.forEach(function (el) {
    observer.observe(el);
  });
})();
