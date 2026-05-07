const mongoose = require("mongoose");

const TrackerColumnSchema = new mongoose.Schema(
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
    type: {
      type: String,
      trim: true,
      default: "subac",
      enum: ["subac"]
    },
    category: {
      type: String,
      trim: true,
      default: "subac"
    },
    dateKey: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    shortLabel: {
      type: String,
      required: true,
      trim: true
    },
    portion: {
      type: String,
      trim: true,
      default: ""
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewerNameSnapshot: {
      type: String,
      trim: true,
      default: ""
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    archivedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

TrackerColumnSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, dateKey: 1, sortOrder: 1, createdAt: 1 });

module.exports = mongoose.model("TrackerColumn", TrackerColumnSchema, "tracker_columns");
