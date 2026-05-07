const mongoose = require("mongoose");

const LeaderboardSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    gradingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradingPeriod",
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: ["academic", "missions", "custom-academic"],
      required: true
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    visibleToStudents: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

LeaderboardSchema.index({ schoolId: 1, type: 1, active: 1 });

module.exports = mongoose.model("Leaderboard", LeaderboardSchema, "leaderboards");
