const mongoose = require("mongoose");

const GradeContextSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    teacherName: { type: String, trim: true, default: "" },
    configVersion: { type: Number, min: 1, default: 1 },
    configCapturedAt: { type: Date, default: Date.now },
    subject: {
      key: { type: String, trim: true, default: "" },
      label: { type: String, trim: true, default: "" }
    },
    category: {
      key: { type: String, trim: true, default: "" },
      label: { type: String, trim: true, default: "" },
      weight: { type: Number, default: 0 }
    }
  },
  { _id: false }
);

const GradeSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true
  },
  students: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      name: String,
    }
  ],
  classInfo: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
      name: String,
    }
  ],
  quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },
  subject: { type: String, required: true },
  subjectKey: { type: String, trim: true, default: "" },
  subjectLabel: { type: String, trim: true, default: "" },
  gradingConfigVersion: { type: Number, min: 1, default: 1 },
  Assignment: {
    name: { type: String, required: true },
    description: { type: String, default: "" }, // description is optional
    grade: { type: Number, required: true },
    maxScore: { type: Number, default: 100 },
    categoryKey: { type: String, trim: true, default: "" },
    categoryLabel: { type: String, trim: true, default: "" },
    categoryWeight: { type: Number, default: 0 },
    type: {
      type: String,
      trim: true,
      required: true
    },
  },
  // Dates
  assignedDate: { type: Date, default: Date.now },
  dueDate: { type: Date },

  feedback: {
    content: { type: String },
    teacher:
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      name: String,
    }
  },
  gradingContext: { type: GradeContextSchema, default: () => ({}) },
  active: { type: Boolean, default: true }
}, { timestamps: true });

GradeSchema.index({ schoolId: 1, "students._id": 1 });
GradeSchema.index({ schoolId: 1, "classInfo._id": 1 });
GradeSchema.index({ schoolId: 1, "classInfo._id": 1, gradingConfigVersion: 1 });
GradeSchema.index({ schoolId: 1, "classInfo._id": 1, subjectKey: 1, quarter: 1 });
GradeSchema.index({ schoolId: 1, createdAt: -1 });
GradeSchema.index({ schoolId: 1, "students._id": 1, createdAt: -1 });
GradeSchema.index({ schoolId: 1, "classInfo._id": 1, quarter: 1, createdAt: -1 });

module.exports = mongoose.model("Grade", GradeSchema);
