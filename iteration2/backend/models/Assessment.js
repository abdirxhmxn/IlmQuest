const mongoose = require("mongoose");

const AssessmentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true
    },
    gradingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradingPeriod",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    shortLabel: { type: String, trim: true, default: "" },
    assessmentDate: { type: Date, default: null },
    keySystemKey: { type: String, trim: true, default: "cashar" },
    keySystemVersion: { type: String, trim: true, default: "albayaan.v1" },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

AssessmentSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, sortOrder: 1, assessmentDate: 1 });

module.exports = mongoose.model("Assessment", AssessmentSchema, "assessments");
