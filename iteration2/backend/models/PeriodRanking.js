const mongoose = require("mongoose");

const PeriodRankingRowSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, trim: true, default: "" },
    rank: { type: Number, default: 0 },
    finalPercentage: { type: Number, default: null },
    casharAverage: { type: Number, default: null },
    subacAverage: { type: Number, default: null }
  },
  { _id: false }
);

const PeriodRankingSchema = new mongoose.Schema(
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
    leaderboardType: {
      type: String,
      enum: ["academic", "missions", "custom-academic"],
      required: true
    },
    rows: { type: [PeriodRankingRowSchema], default: [] },
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PeriodRankingSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, leaderboardType: 1 }, { unique: true });

module.exports = mongoose.model("PeriodRanking", PeriodRankingSchema, "period_rankings");
