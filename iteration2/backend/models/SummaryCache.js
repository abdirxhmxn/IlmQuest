const mongoose = require("mongoose");

const SummaryCacheSchema = new mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    gradingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradingPeriod",
      required: true,
      index: true
    },
    categoryTotals: { type: mongoose.Schema.Types.Mixed, default: {} },
    markCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    behaviorSubcategoryTotals: { type: mongoose.Schema.Types.Mixed, default: {} },
    assessmentTotals: { type: mongoose.Schema.Types.Mixed, default: {} },
    activeCategories: { type: [String], default: [] },
    normalizedWeights: { type: mongoose.Schema.Types.Mixed, default: {} },
    finalFraction: { type: Number, default: null },
    finalPercentage: { type: Number, default: null },
    sourceSequenceNumber: { type: Number, default: 0 },
    recomputedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

SummaryCacheSchema.index({ schoolId: 1, classId: 1, studentId: 1, gradingPeriodId: 1 }, { unique: true });
SummaryCacheSchema.index({ schoolId: 1, gradingPeriodId: 1, finalPercentage: -1 });

module.exports = mongoose.model("SummaryCache", SummaryCacheSchema, "summary_cache");
