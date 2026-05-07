const mongoose = require("mongoose");

const PointAdjustmentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    studentNameSnapshot: { type: String, trim: true, default: "" },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    teacherNameSnapshot: { type: String, trim: true, default: "" },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null
    },
    classNameSnapshot: { type: String, trim: true, default: "" },
    amount: { type: Number, required: true, min: 1 },
    direction: {
      type: String,
      enum: ["add", "subtract"],
      required: true
    },
    beforePoints: { type: Number, required: true, min: 0 },
    afterPoints: { type: Number, required: true, min: 0 },
    beforeXp: { type: Number, required: true, min: 0 },
    afterXp: { type: Number, required: true, min: 0 },
    beforeRank: { type: String, trim: true, default: "F" },
    afterRank: { type: String, trim: true, default: "F" },
    reason: { type: String, required: true, trim: true, maxlength: 300 }
  },
  { timestamps: true }
);

PointAdjustmentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
PointAdjustmentSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 });

module.exports = mongoose.model("PointAdjustment", PointAdjustmentSchema);
