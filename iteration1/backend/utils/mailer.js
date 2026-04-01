const nodemailer = require("nodemailer");

let transporterCache;

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getSmtpSettings() {
  const host = String(process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST || "").trim();
  const port = parsePort(process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT, 587);
  const service = String(process.env.SMTP_SERVICE || process.env.MAIL_SERVICE || process.env.EMAIL_SERVICE || "").trim();
  const user = String(process.env.SMTP_USER || process.env.MAIL_USER || process.env.EMAIL_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.EMAIL_PASS || "").trim();
  const secureRaw = process.env.SMTP_SECURE || process.env.MAIL_SECURE || process.env.EMAIL_SECURE;
  const secure = secureRaw === undefined || secureRaw === null || String(secureRaw).trim() === ""
    ? port === 465
    : parseBoolean(secureRaw);
  const auth = user && pass ? { user, pass } : undefined;

  const hasService = Boolean(service);
  const hasHost = Boolean(host);

  return {
    host,
    port,
    service,
    secure,
    auth,
    configured: hasService || hasHost
  };
}

function getTransporter() {
  if (transporterCache !== undefined) {
    return transporterCache;
  }

  const smtp = getSmtpSettings();
  if (!smtp.configured) {
    transporterCache = null;
    return transporterCache;
  }

  const transportConfig = smtp.service
    ? { service: smtp.service, secure: smtp.secure, auth: smtp.auth }
    : { host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth };

  transporterCache = nodemailer.createTransport(transportConfig);

  return transporterCache;
}

function isMailerConfigured() {
  return getSmtpSettings().configured;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUtc(date) {
  try {
    return new Date(date).toUTCString();
  } catch (err) {
    return "";
  }
}

function accountLabel(entry) {
  const role = entry.role ? `${entry.role} account` : "account";
  if (entry.schoolId) {
    return `${role}, school ${entry.schoolId}`;
  }
  return role;
}

async function sendPasswordResetEmail({ to, resetLinks, expiresAt }) {
  if (!Array.isArray(resetLinks) || resetLinks.length === 0) {
    return { sent: false, reason: "no_reset_links" };
  }

  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV !== "production") {
      resetLinks.forEach((entry) => {
        console.log("[DEV_PASSWORD_RESET_URL]", entry.resetUrl);
      });
    }
    return { sent: false, reason: "smtp_not_configured" };
  }

  const from = String(
    process.env.SMTP_FROM
      || process.env.MAIL_FROM
      || process.env.EMAIL_FROM
      || process.env.SMTP_USER
      || process.env.MAIL_USER
      || process.env.EMAIL_USER
      || ""
  ).trim() || "no-reply@ilmquest.local";
  const subject = "IlmQuest Password Reset";

  const textLines = [
    "A request was received to reset your IlmQuest password.",
    "Use one of the secure links below to set a new password:",
    ""
  ];

  resetLinks.forEach((entry, index) => {
    const label = accountLabel(entry);
    textLines.push(`${index + 1}. ${entry.resetUrl} (${label})`);
  });

  textLines.push("");
  textLines.push(`This link expires at: ${formatUtc(expiresAt)}`);
  textLines.push("If you did not request this, you can safely ignore this email.");

  const htmlLinks = resetLinks
    .map((entry, index) => {
      const label = escapeHtml(accountLabel(entry));
      return `<li><a href="${escapeHtml(entry.resetUrl)}">${escapeHtml(entry.resetUrl)}</a> <span>(${label})</span></li>`;
    })
    .join("");

  const html = `
    <p>A request was received to reset your IlmQuest password.</p>
    <p>Use one of the secure links below to set a new password:</p>
    <ol>${htmlLinks}</ol>
    <p>This link expires at: <strong>${escapeHtml(formatUtc(expiresAt))}</strong></p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: textLines.join("\n"),
    html
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = {
  sendPasswordResetEmail,
  isMailerConfigured
};
