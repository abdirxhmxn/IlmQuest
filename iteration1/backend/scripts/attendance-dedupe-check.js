/* eslint-disable no-console */
const path = require("path");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const School = require("../models/School");
const Attendance = require("../models/Attendance");
const { dedupeAttendance } = require("./dedupe-attendance");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

function utcDate(iso) {
  return new Date(iso);
}

async function main() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required.");
  }

  await mongoose.connect(dbString);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const school = await School.create({
    schoolName: `AttendanceDedupe-${runId}`,
    schoolEmail: `attendance-dedupe-${runId}@ilmquest.test`,
    password: "Password123!",
    adminUser: `attendance-admin-${runId}`
  });

  const classId = new mongoose.Types.ObjectId();
  const studentA = new mongoose.Types.ObjectId();
  const studentB = new mongoose.Types.ObjectId();

  let docs = [];

  try {
    docs = await Attendance.create([
      {
        schoolId: school._id,
        classId,
        className: "Quran A",
        date: utcDate("2026-03-10T00:00:00.000Z"),
        records: [{ studentId: studentA, studentName: "Student A", status: "Present" }],
        recordedBy: { _id: new mongoose.Types.ObjectId(), name: "Teacher One" }
      },
      {
        schoolId: school._id,
        classId,
        className: "Quran A",
        date: utcDate("2026-03-10T08:30:00.000Z"),
        records: [{ studentId: studentB, studentName: "Student B", status: "Absent" }],
        recordedBy: { _id: new mongoose.Types.ObjectId(), name: "Teacher One" }
      },
      {
        schoolId: school._id,
        classId,
        className: "Quran A",
        date: utcDate("2026-03-10T16:45:00.000Z"),
        records: [{ studentId: studentA, studentName: "Student A", status: "Late" }],
        recordedBy: { _id: new mongoose.Types.ObjectId(), name: "Teacher Two" }
      }
    ]);

    const dryRunSummary = await dedupeAttendance({
      apply: false,
      schoolId: String(school._id),
      classId: String(classId)
    });
    assert.equal(dryRunSummary.duplicateGroupsFound, 1, "Dry run should detect one duplicate group.");
    assert.equal(dryRunSummary.docsDeleted, 0, "Dry run must not delete documents.");

    const applySummary = await dedupeAttendance({
      apply: true,
      schoolId: String(school._id),
      classId: String(classId)
    });
    assert.equal(applySummary.groupsProcessed, 1, "Apply mode should process one duplicate group.");
    assert.equal(applySummary.docsDeleted, 2, "Apply mode should delete duplicate documents.");

    const remaining = await Attendance.find({
      schoolId: school._id,
      classId,
      date: {
        $gte: utcDate("2026-03-10T00:00:00.000Z"),
        $lt: utcDate("2026-03-11T00:00:00.000Z")
      }
    }).lean();

    assert.equal(remaining.length, 1, "One canonical attendance document should remain.");
    const canonical = remaining[0];
    assert.equal(new Date(canonical.date).toISOString(), "2026-03-10T00:00:00.000Z", "Canonical date must be normalized to UTC midnight.");

    const byStudent = new Map(canonical.records.map((record) => [String(record.studentId), record]));
    assert.equal(byStudent.size, 2, "Canonical records should include both students.");
    assert.equal(byStudent.get(String(studentA))?.status, "Late", "Latest status should win for duplicate student records.");
    assert.equal(byStudent.get(String(studentB))?.status, "Absent", "Single student record should be preserved.");

    console.log("Attendance dedupe check passed.");
  } finally {
    if (docs.length) {
      await Attendance.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
    }
    await Attendance.deleteMany({ schoolId: school._id, classId });
    await School.deleteOne({ _id: school._id });
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Attendance dedupe check failed:", err.message);
  process.exit(1);
});

