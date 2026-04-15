function auditLog(req, event, extra = {}) {
  const payload = {
    event,
    userId: req.user?._id ? String(req.user._id) : null,
    schoolId: req.schoolId || (req.user?.schoolId ? String(req.user.schoolId) : null),
    ip: req.ip,
    timestamp: new Date().toISOString(),
    ...extra
  };

  // Intentionally structured and secret-free.
  console.info('[AUDIT]', JSON.stringify(payload));
}

module.exports = {
  auditLog
};
