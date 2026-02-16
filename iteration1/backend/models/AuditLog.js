const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: {} },
    after: { type: mongoose.Schema.Types.Mixed, default: {} },
    diff: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

AuditLogSchema.index({ schoolId: 1, actorId: 1, createdAt: -1 });
AuditLogSchema.index({ schoolId: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
