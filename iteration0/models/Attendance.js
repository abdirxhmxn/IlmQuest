const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  className: { type: String, required: true },
  date: { type: Date, required: true },
  records: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      studentName: { type: String, required: true },
      status: {
        type: String,
        enum: ["Present", "Absent", "Late", "Excused", "Holiday", "Weather"],
        default: "Present",
      },
    },
  ],
  recordedBy: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: String,
  },
}, { timestamps: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
