const mongoose = require("mongoose");

const GradeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  Assignment: {
    name: { type: String, required: true },
    description: { type: String, required: true },
    grade: Number,
  },
  // What was graded
  subject: { type: String, required: true },
  type: { 
    type: String, 
    enum: ["Homework", "Test", "Quiz", "Exam", "Behavior", "Participation"],
    required: true
  },

  // Score
  score: { type: Number, required: true },
  maxScore: { type: Number, default: 100 },

  // Dates
  assignedDate: { type: Date, default: Date.now },
  dueDate: { type: Date },

  feedback: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Grade", GradeSchema);
