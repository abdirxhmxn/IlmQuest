const mongoose = require("mongoose");

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const ReconciliationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["unmatched", "matched", "ignored"],
      default: "unmatched"
    },
    matchedType: {
      type: String,
      enum: ["financeEntry", "parentPayment", "none"],
      default: "none"
    },
    matchedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    method: {
      type: String,
      enum: ["manual", "auto", "none"],
      default: "none"
    },
    matchedAt: { type: Date, default: null },
    matchedBy: { type: ActorSnapshotSchema, default: () => ({}) },
    note: { type: String, trim: true, default: "", maxlength: 240 }
  },
  { _id: false }
);

const FinanceBankTransactionSchema = new mongoose.Schema(
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
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceBankAccount",
      default: null
    },
    accountName: { type: String, trim: true, default: "" },
    providerTransactionId: { type: String, required: true, trim: true },
    providerPendingTransactionId: { type: String, trim: true, default: "" },
    amount: { type: Number, required: true },
    isoCurrencyCode: { type: String, trim: true, default: "USD" },
    unofficialCurrencyCode: { type: String, trim: true, default: "" },
    direction: {
      type: String,
      enum: ["inflow", "outflow"],
      default: "outflow"
    },
    pending: { type: Boolean, default: false },
    sourceStatus: {
      type: String,
      enum: ["pending", "posted"],
      default: "posted"
    },
    authorizedDate: { type: Date, default: null },
    postedDate: { type: Date, default: null, index: true },
    name: { type: String, trim: true, default: "" },
    merchantName: { type: String, trim: true, default: "" },
    categoryPrimary: { type: String, trim: true, default: "" },
    categoryDetailed: { type: String, trim: true, default: "" },
    paymentChannel: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    reconciliation: { type: ReconciliationSchema, default: () => ({}) },
    importedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

FinanceBankTransactionSchema.index({ schoolId: 1, providerTransactionId: 1 }, { unique: true });
FinanceBankTransactionSchema.index({ schoolId: 1, connectionId: 1, postedDate: -1 });
FinanceBankTransactionSchema.index({ schoolId: 1, "reconciliation.status": 1, postedDate: -1 });
FinanceBankTransactionSchema.index({ schoolId: 1, bankAccountId: 1, postedDate: -1 });

module.exports = mongoose.model("FinanceBankTransaction", FinanceBankTransactionSchema);
