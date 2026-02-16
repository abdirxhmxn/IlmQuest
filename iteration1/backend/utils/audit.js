const AuditLog = require("../models/AuditLog");

function simpleDiff(before = {}, after = {}) {
  const diff = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      diff[key] = { before: beforeValue, after: afterValue };
    }
  }
  return diff;
}

async function logAdminAction(req, payload) {
  try {
    await AuditLog.create({
      schoolId: req.schoolId,
      actorId: req.user?._id,
      action: payload.action,
      targetType: payload.targetType,
      targetId: payload.targetId,
      before: payload.before || {},
      after: payload.after || {},
      diff: payload.diff || simpleDiff(payload.before || {}, payload.after || {}),
      ip: req.ip || "",
      userAgent: req.get("user-agent") || ""
    });
  } catch (err) {
    console.error("Audit log failure:", err.message);
  }
}

module.exports = {
  simpleDiff,
  logAdminAction
};
