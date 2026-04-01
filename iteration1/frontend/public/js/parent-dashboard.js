(function initParentDashboard() {
  const rings = document.querySelectorAll("[data-payment-ring]");
  if (!rings.length) return;

  rings.forEach((ringEl) => {
    const progressCircle = ringEl.querySelector(".ring-progress");
    if (!progressCircle) return;

    const radius = Number(progressCircle.getAttribute("r") || 52);
    const circumference = 2 * Math.PI * radius;
    const rawPercent = Number(ringEl.dataset.percent || 0);
    const percent = Math.max(0, Math.min(100, rawPercent));
    const offset = circumference - (percent / 100) * circumference;

    progressCircle.style.strokeDasharray = `${circumference}`;
    progressCircle.style.strokeDashoffset = `${offset}`;

    const state = String(ringEl.dataset.state || "none").toLowerCase();
    ringEl.classList.add(`state-${state}`);
  });
})();
