const { auditLog } = require("../utils/auditLogger");

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

module.exports = {
  ensureAuth,
  requireTenant,
  requireRole
};
