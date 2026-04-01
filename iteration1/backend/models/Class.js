const mongoose = require("mongoose");
const {
  DASHBOARD_LAYOUTS,
  DASHBOARD_SECTION_KEYS,
  getDefaultDashboardSections,
  getDefaultGradingCategories
} = require("../utils/teacherCustomization");

const TeacherDashboardSectionSchema = new mongoose.Schema(
  {
    key: { type: String, enum: DASHBOARD_SECTION_KEYS, required: true },
    label: { type: String, required: true, trim: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { _id: false }
);

const TeacherSubjectConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    // Backward-compat display field for legacy reads.
    name: { type: String, trim: true, default: undefined },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const TeacherGradingCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    // Backward-compat display field for legacy reads.
    name: { type: String, trim: true, default: undefined },
    weight: { type: Number, required: true, min: 0, max: 100 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const GradingConfigVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, min: 1 },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdByRole: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    subjectConfig: { type: [TeacherSubjectConfigSchema], default: [] },
    gradingCategories: { type: [TeacherGradingCategorySchema], default: getDefaultGradingCategories }
  },
  { _id: false }
);

const TeacherClassSettingsSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    displayTitle: { type: String, trim: true, default: "" },
    welcomeMessage: { type: String, trim: true, default: "" },
    dashboardLayout: { type: String, enum: DASHBOARD_LAYOUTS, default: "comfortable" },
    dashboardSections: { type: [TeacherDashboardSectionSchema], default: getDefaultDashboardSections },
    subjectConfig: { type: [TeacherSubjectConfigSchema], default: [] },
    gradingCategories: { type: [TeacherGradingCategorySchema], default: getDefaultGradingCategories },
    currentConfigVersion: { type: Number, min: 1, default: 1 },
    configVersions: { type: [GradingConfigVersionSchema], default: [] },
    lastCustomizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastCustomizedByRole: { type: String, trim: true, default: "" },
    lastCustomizedAt: { type: Date, default: null },
    customizationNote: { type: String, trim: true, default: "" },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ClassSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true
  },
  className: { type: String, required: true, trim: true },

  classCode: { type: String, required: true, trim: true },

  // Teacher(s) assigned to teach
  teachers: [
    {
      _id: {type: mongoose.Schema.Types.ObjectId, ref: "User", required:true},
      name: String,
    }
  ],
  // subject(s) assigned to teach
  subjects: [
    {
      name: { type: String, required: true },

      // Academic Level
      gradeLevel: {
        type: String,
        enum: ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
        required: true
      },
    }
  ],
  // Students enrolled
  students: [
    {
      _id: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
      name: String,
    }
  ],

  // Schedule
  schedule: [
    {
      day: {
        type: String,
        enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      },
      startTime: { type: String },
      endTime: { type: String }
    }
  ],

  // Academic cycle
  academicYear: {
    year: { type: String, default: "2025-2026" },
    semester: {
      type: String,
      enum: ["Semester 1", "Semester 2"],
      default: "Semester 1"
    },
    quarter: {
      type: String,
      enum: ["Q1", "Q2", "Q3", "Q4"],
      default: "Q1"
    }
  },
  active: { type: Boolean, default: true },

  // Room + building
  location: { type: String, default: "Main Center" },
  roomNumber: { type: String },

  capacity: { type: Number, default: 20 },
  teacherSettings: { type: [TeacherClassSettingsSchema], default: [] },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

}, { timestamps: true });

ClassSchema.index({ schoolId: 1, classCode: 1 }, { unique: true });
ClassSchema.index({ schoolId: 1, "teacherSettings.teacherId": 1 });
ClassSchema.index({ schoolId: 1, "teachers._id": 1, active: 1 });
ClassSchema.index({ schoolId: 1, "students._id": 1, active: 1 });
ClassSchema.index({ schoolId: 1, active: 1, className: 1 });

module.exports = mongoose.model("Class", ClassSchema);
