const { auditLog } = require("../utils/auditLogger");
const {
  FORCE_PASSWORD_CHANGE_ROUTE,
  hasPendingPasswordSetup
} = require("../utils/passwordSetup");

function isHtmlRequest(req) {
  return (req.get("accept") || "").toLowerCase().includes("text/html");
}

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (isHtmlRequest(req)) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
}

function requireTenant(req, res, next) {
  if (!req.isAuthenticated() || !req.user || !req.user.schoolId) {
    if (isHtmlRequest(req)) {
      req.flash("errors", [{ msg: "Unauthorized." }]);
      return res.redirect("/login");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.schoolId = req.user.schoolId;
  return next();
}

function requireRole(...allowedRoles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      auditLog(req, "authorization_denied", { allowedRoles, actualRole: req.user?.role || null });
      if (isHtmlRequest(req)) {
        req.flash("errors", [{ msg: "You are not authorized to access this area." }]);
        return res.redirect("/login");
      }
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

function getRoleHome(role) {
  const routes = {
    admin: "/admin/home",
    teacher: "/teacher/home",
    parent: "/parent/home",
    student: "/student/home"
  };

  return routes[role] || "/student/home";
}

function enforcePasswordChange(req, res, next) {
  if (!req.isAuthenticated?.() || !req.user) return next();
  if (!hasPendingPasswordSetup(req.user)) return next();

  const currentPath = String(req.path || "").trim();
  if (currentPath === FORCE_PASSWORD_CHANGE_ROUTE || currentPath === "/logout") {
    return next();
  }

  if (isHtmlRequest(req)) {
    req.flash("info", [{ msg: "You must update your password before continuing." }]);
    return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
  }

  return res.status(403).json({
    error: "PASSWORD_CHANGE_REQUIRED",
    redirectPath: FORCE_PASSWORD_CHANGE_ROUTE
  });
}

function requirePendingPasswordChange(req, res, next) {
  if (!req.isAuthenticated?.() || !req.user) {
    if (isHtmlRequest(req)) return res.redirect("/login");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!hasPendingPasswordSetup(req.user)) {
    const redirectPath = getRoleHome(req.user.role);
    if (isHtmlRequest(req)) return res.redirect(redirectPath);
    return res.status(403).json({ error: "PASSWORD_CHANGE_NOT_REQUIRED", redirectPath });
  }

  return next();
}

module.exports = {
  ensureAuth,
  requireTenant,
  requireRole,
  enforcePasswordChange,
  requirePendingPasswordChange
};
