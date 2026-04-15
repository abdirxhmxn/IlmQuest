const mongoose = require("mongoose");

const PaymentAttemptSchema = new mongoose.Schema(
  {
    requestedAmount: { type: Number, min: 0, default: 0 },
    requestedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["requested", "failed", "cancelled"],
      default: "requested"
    },
    channel: { type: String, trim: true, default: "portal" },
    note: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const ParentPaymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null
    },
    title: { type: String, trim: true, default: "Tuition Payment" },
    category: {
      type: String,
      enum: ["Tuition", "Registration", "Materials", "Meal", "Transport", "Other"],
      default: "Tuition"
    },
    expectedAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, trim: true, default: "USD" },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["Due", "Partial", "Paid", "Overdue", "PendingProcessor"],
      default: "Due"
    },
    method: { type: String, trim: true, default: "" },
    processor: { type: String, trim: true, default: "" },
    processorReference: { type: String, trim: true, default: "" },
    receiptReference: { type: String, trim: true, default: "" },
    bankTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceBankTransaction",
      default: null
    },
    notes: { type: String, trim: true, default: "" },
    attempts: { type: [PaymentAttemptSchema], default: [] },
    createdBy: { type: ActorSnapshotSchema, default: () => ({}) },
    updatedBy: { type: ActorSnapshotSchema, default: () => ({}) }
  },
  { timestamps: true }
);

ParentPaymentSchema.index({ schoolId: 1, parentId: 1, dueDate: 1 });
ParentPaymentSchema.index({ schoolId: 1, parentId: 1, status: 1, dueDate: 1 });
ParentPaymentSchema.index({ schoolId: 1, studentId: 1, dueDate: 1 });
ParentPaymentSchema.index({ schoolId: 1, status: 1, dueDate: 1 });
ParentPaymentSchema.index({ schoolId: 1, parentId: 1, createdAt: -1 });

module.exports = mongoose.model("ParentPayment", ParentPaymentSchema);
