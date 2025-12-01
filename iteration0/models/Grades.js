const mongoose = require("mongoose");

const GradeSchema = new mongoose.Schema({
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
  Assignment: {
    name: { type: String, required: true },
    description: { type: String, default: "" }, // description is optional
    grade: { type: Number, required: true },
    maxScore: { type: Number, default: 100 },
    type: {
      type: String,
      enum: ["Homework", "Test", "Quiz", "Exam", "Behavior", "Participation"],
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
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Grade", GradeSchema);
