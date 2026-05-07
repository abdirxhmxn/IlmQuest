const mongoose = require("mongoose");

const RankCacheSchema = new mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    finalPercentage: { type: Number, default: null },
    casharAverage: { type: Number, default: null },
    subacAverage: { type: Number, default: null },
    rank: { type: Number, default: null },
    cohortSize: { type: Number, default: 0 },
    visibleToStudent: { type: Boolean, default: true },
    frozenAt: { type: Date, default: null },
    recomputedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

RankCacheSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, studentId: 1 }, { unique: true });
RankCacheSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, rank: 1 });

module.exports = mongoose.model("RankCache", RankCacheSchema, "rank_cache");
