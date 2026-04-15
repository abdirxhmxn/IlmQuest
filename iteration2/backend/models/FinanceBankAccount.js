const mongoose = require("mongoose");

const FinanceBankAccountSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    providerAccountId: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: "" },
    officialName: { type: String, trim: true, default: "" },
    mask: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    subtype: { type: String, trim: true, default: "" },
    isoCurrencyCode: { type: String, trim: true, default: "USD" },
    currentBalance: { type: Number, default: 0 },
    availableBalance: { type: Number, default: null },
    active: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

FinanceBankAccountSchema.index({ schoolId: 1, connectionId: 1, providerAccountId: 1 }, { unique: true });
FinanceBankAccountSchema.index({ schoolId: 1, connectionId: 1, active: 1 });

module.exports = mongoose.model("FinanceBankAccount", FinanceBankAccountSchema);
