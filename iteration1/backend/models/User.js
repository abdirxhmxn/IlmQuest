const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
  userName: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
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
    studentNumber: { type: Number, unique: true, sparse: true }
  },
  // TEACHER INFO
  teacherInfo: {
    employeeId: { type: String, unique: true, sparse: true },
    hireDate: { type: Date },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    subjects: [{ type: String }]
  },

  // GAMIFICATION
  points: { type: Number, default: 0 },
  rank: {
    type: String,
    enum: ["F", "E", "D", "C", "B", "A", "S"],
    default: "F"
  }

}, { timestamps: true });

UserSchema.index({ schoolId: 1, userName: 1 });
UserSchema.index({ schoolId: 1, email: 1 });


//
// PASSWORD LOGIC
//
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
