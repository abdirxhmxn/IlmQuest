const mongoose = require("mongoose");

const ReportSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: "" },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const ReportSchema = new mongoose.Schema(
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
    sections: { type: [ReportSectionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

ReportSchema.index({ schoolId: 1, studentId: 1, gradingPeriodId: 1 }, { unique: true });

module.exports = mongoose.model("Report", ReportSchema, "reports");
