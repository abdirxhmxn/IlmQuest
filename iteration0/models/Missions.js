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
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },

  // Creator
  createdBy: {
    name: { type: String, required: true },
    employeeId: { type: String }
  },

  // Active Status
  active: { type: Boolean, default: true },

}, { timestamps: true });

module.exports = mongoose.model("Mission", MissionSchema);
