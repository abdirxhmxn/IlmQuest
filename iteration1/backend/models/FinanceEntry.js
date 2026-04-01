const mongoose = require("mongoose");

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const FinanceEntrySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    entryType: {
      type: String,
      enum: ["income", "expense"],
      required: true
    },
    categoryKey: { type: String, required: true, trim: true },
    categoryLabel: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: "USD", maxlength: 8 },
    occurredAt: { type: Date, required: true, index: true },
    source: {
      type: String,
      enum: ["manual", "bank_sync", "payment_processor", "imported", "system"],
      default: "manual"
    },
    status: {
      type: String,
      enum: ["posted", "pending", "void"],
      default: "posted"
    },
    vendorOrPayer: { type: String, trim: true, default: "", maxlength: 160 },
    reference: { type: String, trim: true, default: "", maxlength: 160 },
    memo: { type: String, trim: true, default: "", maxlength: 500 },
    linkedParentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    linkedStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    linkedClassId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    linkedParentPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "ParentPayment", default: null },
    bankTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceBankTransaction", default: null },
    createdBy: { type: ActorSnapshotSchema, default: () => ({}) },
    updatedBy: { type: ActorSnapshotSchema, default: () => ({}) },
    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

FinanceEntrySchema.index({ schoolId: 1, entryType: 1, occurredAt: -1 });
FinanceEntrySchema.index({ schoolId: 1, categoryKey: 1, occurredAt: -1 });
FinanceEntrySchema.index({ schoolId: 1, bankTransactionId: 1 });

module.exports = mongoose.model("FinanceEntry", FinanceEntrySchema);
