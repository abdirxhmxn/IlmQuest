(function initAdminReportsPage() {
  const forms = document.querySelectorAll('.reports-form');
  if (!forms.length) return;

  const statusEl = document.getElementById('reportActionStatus');
  const todayCountEl = document.getElementById('reportGeneratedTodayCount');
  const totalCountEl = document.getElementById('reportGeneratedTotalCount');
  const lastGeneratedEl = document.getElementById('reportLastGeneratedText');
  const recentListEl = document.getElementById('reportRecentActivityList');

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.remove('is-success', 'is-error', 'is-info');
    if (!message) return;
    statusEl.classList.add(tone === 'error' ? 'is-error' : tone === 'success' ? 'is-success' : 'is-info');
  }

  function getFileNameFromDisposition(dispositionHeader, fallbackName) {
    const disposition = String(dispositionHeader || '');
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) return match[1];
    return fallbackName;
  }

  function triggerFileDownload(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function refreshStats() {
    const response = await fetch('/admin/reports/stats', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error('Failed to refresh report stats.');
    const payload = await response.json();
    const stats = payload?.stats || {};

    if (todayCountEl) todayCountEl.textContent = Number(stats.generatedToday || 0).toLocaleString('en-US');
    if (totalCountEl) totalCountEl.textContent = Number(stats.totalGenerated || 0).toLocaleString('en-US');
    if (lastGeneratedEl) lastGeneratedEl.textContent = stats.lastGeneratedLabel || 'No reports generated yet';

    if (recentListEl) {
      recentListEl.innerHTML = '';
      const recent = Array.isArray(stats.recentActivity) ? stats.recentActivity : [];
      if (recent.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'report-activity-empty';
        empty.textContent = 'No report activity recorded yet.';
        recentListEl.appendChild(empty);
      } else {
        recent.slice(0, 8).forEach((entry) => {
          const item = document.createElement('li');
          item.className = 'report-activity-item';
          const left = document.createElement('span');
          const nameStrong = document.createElement('strong');
          nameStrong.textContent = entry.targetName || 'Unknown';
          left.appendChild(nameStrong);
          left.appendChild(document.createTextNode(` (${entry.reportType || 'report'})`));

          const right = document.createElement('span');
          right.className = 'report-activity-time';
          right.textContent = entry.generatedAtLabel || '';

          item.appendChild(left);
          item.appendChild(right);
          recentListEl.appendChild(item);
        });
      }
    }
  }

  async function generateReport(form) {
    const select = form.querySelector('select');
    const submitButton = form.querySelector('button[type="submit"]');
    const baseUrl = form.getAttribute('data-base-url') || '';
    const csrfToken = form.getAttribute('data-csrf-token') || form.querySelector('input[name="_csrf"]')?.value || '';
    const mode = form.getAttribute('data-mode') || 'report';
    const selectedId = select?.value;

    if (!selectedId || !baseUrl) {
      select?.focus();
      return;
    }

    submitButton?.setAttribute('disabled', 'disabled');
    const originalLabel = submitButton ? submitButton.textContent : '';
    if (submitButton) submitButton.textContent = 'Generating...';

    setStatus(`Generating ${mode} report...`, 'info');

    try {
      const body = new URLSearchParams();
      body.set('_csrf', csrfToken);

      const response = await fetch(`${baseUrl}/${selectedId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/pdf,application/json'
        },
        body: body.toString()
      });

      const contentType = String(response.headers.get('content-type') || '');
      if (!response.ok || !contentType.includes('application/pdf')) {
        let message = 'Report generation failed.';
        try {
          const errorPayload = await response.json();
          message = errorPayload?.message || message;
        } catch (_ignore) {
          message = response.status === 503
            ? 'LaTeX compiler missing on server. Install pdflatex (TeX Live).'
            : message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const fileName = getFileNameFromDisposition(
        response.headers.get('content-disposition'),
        `${mode}-report.pdf`
      );
      triggerFileDownload(blob, fileName);

      await refreshStats();
      setStatus(`${mode.charAt(0).toUpperCase()}${mode.slice(1)} report generated successfully.`, 'success');
    } catch (err) {
      setStatus(err.message || 'Failed to generate report.', 'error');
    } finally {
      if (submitButton) {
        submitButton.textContent = originalLabel || 'Generate + Download PDF';
        submitButton.removeAttribute('disabled');
      }
    }
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      generateReport(form);
    });
  });
})();
