const mongoose = require("mongoose");

const ClassSchema = new mongoose.Schema({
  className: { type: String, required: true, trim: true },

  classCode: { type: String, required: true, unique: true, trim: true },

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

}, { timestamps: true });

module.exports = mongoose.model("Class", ClassSchema);
