const mongoose = require("mongoose");

const KeySystemMarkSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    symbol: { type: String, trim: true, default: "" },
    label: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    normalizedValue: { type: Number, default: null },
    countsTowardGrade: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  { _id: false }
);

const KeySystemSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
      index: true
    },
    version: { type: String, required: true, trim: true },
    systemKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    maxValue: { type: Number, default: 1 },
    marks: { type: [KeySystemMarkSchema], default: [] },
    active: { type: Boolean, default: true },
    seededAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

KeySystemSchema.index({ schoolId: 1, version: 1, systemKey: 1 }, { unique: true });

module.exports = mongoose.model("KeySystem", KeySystemSchema, "key_systems");
