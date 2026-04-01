const mongoose = require("mongoose");

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const FinanceBankConnectionSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    provider: {
      type: String,
      enum: ["plaid"],
      default: "plaid",
      required: true
    },
    providerItemId: { type: String, required: true, trim: true },
    institutionId: { type: String, trim: true, default: "" },
    institutionName: { type: String, trim: true, default: "" },
    accessTokenEncrypted: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["connected", "error", "disconnected"],
      default: "connected"
    },
    lastCursor: { type: String, trim: true, default: "" },
    lastSyncAt: { type: Date, default: null },
    lastSyncStatus: {
      type: String,
      enum: ["never", "success", "partial", "failed"],
      default: "never"
    },
    lastSyncMessage: { type: String, trim: true, default: "" },
    disconnectedAt: { type: Date, default: null },
    createdBy: { type: ActorSnapshotSchema, default: () => ({}) },
    updatedBy: { type: ActorSnapshotSchema, default: () => ({}) }
  },
  { timestamps: true }
);

FinanceBankConnectionSchema.index({ schoolId: 1, provider: 1, providerItemId: 1 }, { unique: true });
FinanceBankConnectionSchema.index({ schoolId: 1, provider: 1, status: 1 });

module.exports = mongoose.model("FinanceBankConnection", FinanceBankConnectionSchema);
