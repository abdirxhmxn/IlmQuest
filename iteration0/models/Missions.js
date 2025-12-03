const mongoose = require("mongoose");

const MissionSchema = new mongoose.Schema({
  // Mission Identity
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },

  // Classification
  type: {
    type: String,
    enum: ["Ilm", "Adab & Akhlaq", "Ihsaan", "Taqwa", "Amanah"],
    required: true,
  },
  category: {
    type: String,
    enum: ["Solo", "Team"],
    required: true,
  },

  // Difficulty & Rewards
  rank: {
    type: String,
    enum: ["F", "E", "D", "C", "B", "A", "S"],
    default: "F",
  },
  pointsXP: { type: Number, default: 10 },

  // Timing
  timeLimit: { type: String, enum: ["Daily", "Weekly", "Timed", "None"], default: "None" },
  dueDate: { type: Date },

  // Assignment to who?
  assignedTo: {
    classInfo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        name: String
      }
    ],
    studentInfo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", name: String }],
  },

  // Creator
  createdBy: {
    name: { type: String, required: true },
    employeeId: { type: String },
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },

  // Active Status
  active: {
    status: { type: Boolean, default: true },
    studentInfo: [{
      name: { type: String },
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      attempt: Number,
      status: { type: String, default: false },
      startedAt: Date,
      completedAt: Date
    }]
  }

}, { timestamps: true });

module.exports = mongoose.model("Mission", MissionSchema);
