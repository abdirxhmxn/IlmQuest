const mongoose = require("mongoose");

const GradeEventMarkSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: "" },
    symbol: { type: String, trim: true, default: "" },
    label: { type: String, trim: true, default: "" },
    normalizedValue: { type: Number, default: null },
    countsTowardGrade: { type: Boolean, default: true }
  },
  { _id: false }
);

const GradeEventActorSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const GradeEventMetadataSchema = new mongoose.Schema(
  {
    reviewer: { type: String, trim: true, default: "" },
    revisionPortion: { type: String, trim: true, default: "" },
    behaviorSubcategory: { type: String, trim: true, default: "" },
    postCloseEdit: { type: Boolean, default: false },
    postCloseReason: { type: String, trim: true, default: "" },
    displayLabel: { type: String, trim: true, default: "" },
    legacySource: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const GradeEventSchema = new mongoose.Schema(
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
    category: { type: String, required: true, trim: true, index: true },
    dateKey: { type: String, trim: true, default: "", index: true },
    columnKey: { type: String, trim: true, default: "", index: true },
    coordinateKey: { type: String, required: true, trim: true, index: true },
    action: {
      type: String,
      enum: ["set", "clear", "undo", "redo", "bulk"],
      default: "set"
    },
    clientEventId: { type: String, trim: true, default: "" },
    sequenceNumber: { type: Number, required: true, min: 1 },
    keySystemVersion: { type: String, trim: true, default: "" },
    keySystemKey: { type: String, trim: true, default: "" },
    mark: { type: GradeEventMarkSchema, default: () => ({}) },
    metadata: { type: GradeEventMetadataSchema, default: () => ({}) },
    previousEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradeEvent",
      default: null
    },
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradeEvent",
      default: null,
      index: true
    },
    actorSnapshot: { type: GradeEventActorSchema, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

GradeEventSchema.index({ schoolId: 1, sequenceNumber: 1 }, { unique: true });
GradeEventSchema.index(
  { schoolId: 1, clientEventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientEventId: { $type: "string", $gt: "" }
    }
  }
);
GradeEventSchema.index({ schoolId: 1, classId: 1, gradingPeriodId: 1, sequenceNumber: -1 });
GradeEventSchema.index({ schoolId: 1, classId: 1, studentId: 1, gradingPeriodId: 1, sequenceNumber: -1 });
GradeEventSchema.index({ schoolId: 1, coordinateKey: 1, sequenceNumber: -1 });

module.exports = mongoose.model("GradeEvent", GradeEventSchema, "grade_events");
