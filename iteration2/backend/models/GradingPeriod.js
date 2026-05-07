const mongoose = require("mongoose");

const GradingPeriodSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
    periodKey: { type: String, required: true, trim: true },
    academicYear: { type: String, trim: true, default: "" },
    quarter: { type: String, trim: true, default: "" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open"
    },
    postCloseEditEnabled: { type: Boolean, default: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    frozenRankingsAt: { type: Date, default: null },
    keySystemVersion: { type: String, trim: true, default: "albayaan.v1" }
  },
  { timestamps: true }
);

GradingPeriodSchema.index({ schoolId: 1, classId: 1, periodKey: 1 }, { unique: true });
GradingPeriodSchema.index({ schoolId: 1, classId: 1, status: 1, startsAt: -1 });

module.exports = mongoose.model("GradingPeriod", GradingPeriodSchema, "grading_periods");
