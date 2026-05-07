const mongoose = require("mongoose");

const CommentActorSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const GradeCommentSchema = new mongoose.Schema(
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
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      default: null,
      index: true
    },
    category: { type: String, trim: true, default: "" },
    dateKey: { type: String, trim: true, default: "" },
    columnKey: { type: String, trim: true, default: "" },
    coordinateKey: { type: String, required: true, trim: true },
    internalComment: { type: String, trim: true, default: "" },
    parentComment: { type: String, trim: true, default: "" },
    lastEditedBy: { type: CommentActorSchema, required: true }
  },
  { timestamps: true }
);

GradeCommentSchema.index({ schoolId: 1, coordinateKey: 1 }, { unique: true });
GradeCommentSchema.index({ schoolId: 1, classId: 1, studentId: 1, gradingPeriodId: 1 });

module.exports = mongoose.model("GradeComment", GradeCommentSchema, "comments");
