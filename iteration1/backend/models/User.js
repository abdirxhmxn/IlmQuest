const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const {
  normalizeEmail,
  normalizeIdentifier,
  normalizeStudentNumber
} = require("../utils/userIdentifiers");

//
// Main User Schema
//
const UserSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true
  },

  // Login
  userName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  emailNormalized: { type: String, default: undefined },
  password: { type: String, required: true },

  // Role
  role: {
    type: String,
    enum: ["admin", "teacher", "parent", "student"],
    default: "student"
  },

  // Profile info
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  DOB: { type: Date },
  gender: {
    type: String,
    enum: ["male", "female", "other"], 
  },
  profileImage: { type: String },

  // STUDENT INFO
  studentInfo: {
    enrollmentDate: { type: Date, default: Date.now },
    gradeLevel: {
      type: String,
      enum: ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]
    },
    programType: {
      type: String,
      enum: ["Tahfiidth", "Khatm"],
      default: "Khatm"
    },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
    studentNumber: { type: Number }
  },
  studentNumberNormalized: { type: String, default: undefined },
  // TEACHER INFO
  teacherInfo: {
    employeeId: { type: String },
    hireDate: { type: Date },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    subjects: [{ type: String }]
  },
  employeeIdNormalized: { type: String, default: undefined },

  // GAMIFICATION
  points: { type: Number, default: 0 },
  rank: {
    type: String,
    enum: ["F", "E", "D", "C", "B", "A", "S"],
    default: "F"
  },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }

}, { timestamps: true });

UserSchema.index({ schoolId: 1, userName: 1 });
UserSchema.index({ emailNormalized: 1, deletedAt: 1 });
UserSchema.index(
  { schoolId: 1, emailNormalized: 1 },
  {
    name: "school_email_active_unique",
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      emailNormalized: { $type: "string", $gt: "" }
    }
  }
);
UserSchema.index(
  { schoolId: 1, employeeIdNormalized: 1 },
  {
    name: "school_employee_active_unique",
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      employeeIdNormalized: { $type: "string", $gt: "" }
    }
  }
);
UserSchema.index(
  { schoolId: 1, studentNumberNormalized: 1 },
  {
    name: "school_student_number_active_unique",
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      studentNumberNormalized: { $type: "string", $gt: "" }
    }
  }
);


//
// PASSWORD LOGIC
//
UserSchema.pre("validate", function (next) {
  this.email = normalizeEmail(this.email);
  this.emailNormalized = this.email || undefined;
  this.employeeIdNormalized = normalizeIdentifier(this.teacherInfo?.employeeId) || undefined;
  this.studentNumberNormalized = normalizeStudentNumber(this.studentInfo?.studentNumber) || undefined;
  next();
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
