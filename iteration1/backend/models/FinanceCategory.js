const mongoose = require("mongoose");

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const FinanceCategorySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    entryType: {
      type: String,
      enum: ["income", "expense", "payment"],
      required: true
    },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, default: "", maxlength: 240 },
    active: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: ActorSnapshotSchema, default: () => ({}) },
    updatedBy: { type: ActorSnapshotSchema, default: () => ({}) }
  },
  { timestamps: true }
);

FinanceCategorySchema.index({ schoolId: 1, entryType: 1, key: 1 }, { unique: true });
FinanceCategorySchema.index({ schoolId: 1, entryType: 1, active: 1, label: 1 });

module.exports = mongoose.model("FinanceCategory", FinanceCategorySchema);
