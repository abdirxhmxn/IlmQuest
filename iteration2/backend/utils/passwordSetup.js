const PASSWORD_SETUP_ROLES = new Set(["teacher", "parent", "student"]);
const FORCE_PASSWORD_CHANGE_ROUTE = "/force-password-change";

function hasPendingPasswordSetup(user) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  if (!PASSWORD_SETUP_ROLES.has(role)) return false;
  return Boolean(user.mustChangePassword || user.isFirstLogin || user.temporaryPasswordIssued);
}

function applyFirstLoginPasswordFlags(base = {}) {
  return {
    ...base,
    mustChangePassword: true,
    isFirstLogin: true,
    temporaryPasswordIssued: true
  };
}

function clearPasswordSetupFlags(userDoc) {
  if (!userDoc) return;
  userDoc.mustChangePassword = false;
  userDoc.isFirstLogin = false;
  userDoc.temporaryPasswordIssued = false;
  userDoc.passwordChangedAt = new Date();
}

module.exports = {
  PASSWORD_SETUP_ROLES,
  FORCE_PASSWORD_CHANGE_ROUTE,
  hasPendingPasswordSetup,
  applyFirstLoginPasswordFlags,
  clearPasswordSetupFlags
};
