const mongoose = require("mongoose");

const ReportActivitySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    reportType: {
      type: String,
      enum: ["student", "class"],
      required: true
    },
    generatedBy: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      name: { type: String, trim: true, default: "" }
    },
    target: {
      _id: { type: mongoose.Schema.Types.ObjectId, required: true },
      name: { type: String, trim: true, default: "" }
    },
    fileName: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

ReportActivitySchema.index({ schoolId: 1, createdAt: -1 });
ReportActivitySchema.index({ schoolId: 1, reportType: 1, createdAt: -1 });
ReportActivitySchema.index({ schoolId: 1, "target._id": 1, createdAt: -1 });
ReportActivitySchema.index({ schoolId: 1, "generatedBy._id": 1, createdAt: -1 });

module.exports = mongoose.model("ReportActivity", ReportActivitySchema);
