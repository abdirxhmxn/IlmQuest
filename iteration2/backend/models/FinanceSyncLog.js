const mongoose = require("mongoose");

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const FinanceSyncLogSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceBankConnection",
      default: null
    },
    provider: { type: String, trim: true, default: "plaid" },
    trigger: {
      type: String,
      enum: ["manual", "scheduled", "webhook"],
      default: "manual"
    },
    triggeredBy: { type: ActorSnapshotSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      default: "success"
    },
    cursorBefore: { type: String, trim: true, default: "" },
    cursorAfter: { type: String, trim: true, default: "" },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    addedCount: { type: Number, default: 0, min: 0 },
    modifiedCount: { type: Number, default: 0, min: 0 },
    removedCount: { type: Number, default: 0, min: 0 },
    processedCount: { type: Number, default: 0, min: 0 },
    duplicateCount: { type: Number, default: 0, min: 0 },
    matchedCount: { type: Number, default: 0, min: 0 },
    unmatchedCount: { type: Number, default: 0, min: 0 },
    ignoredCount: { type: Number, default: 0, min: 0 },
    requestId: { type: String, trim: true, default: "" },
    errorMessage: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

FinanceSyncLogSchema.index({ schoolId: 1, createdAt: -1 });
FinanceSyncLogSchema.index({ schoolId: 1, connectionId: 1, createdAt: -1 });

module.exports = mongoose.model("FinanceSyncLog", FinanceSyncLogSchema);
