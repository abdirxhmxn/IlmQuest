const mongoose = require("mongoose");

const ClassSchema = new mongoose.Schema({
  className: { type: String, required: true, trim: true },

  classCode: { type: String, required: true, unique: true, trim: true },

  // Academic Level
  gradeLevel: {
    type: String,
    enum: ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
    required: true
  },

  programType: {
    type: String,
    enum: ["Tahfiidth", "Khatm"],
    required: true
  },

  // Teacher(s) assigned to teach
  teachers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }
  ],

  // Students enrolled
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
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
  academicYear: { type: String, default: "2025-2026" },
  active: { type: Boolean, default: true },

  // Room + building
  location: { type: String, default: "Main Center" },
  roomNumber: { type: String },

  capacity: { type: Number, default: 20 },

}, { timestamps: true });

module.exports = mongoose.model("Class", ClassSchema);
