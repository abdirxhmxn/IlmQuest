/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Attendance = require("../models/Attendance");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

function parseArgs(argv = process.argv.slice(2)) {
  const getValue = (flag) => {
    const index = argv.indexOf(flag);
    if (index === -1) return "";
    return String(argv[index + 1] || "").trim();
  };

  const limitRaw = getValue("--limit");
  const schoolId = getValue("--schoolId");
  const classId = getValue("--classId");
  const limit = Number.parseInt(limitRaw, 10);

  return {
    apply: argv.includes("--apply"),
    verbose: argv.includes("--verbose"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    schoolId: schoolId || "",
    classId: classId || ""
  };
}

function normalizeDayKeyToUtcDate(dayKey = "") {
  const [year, month, day] = String(dayKey)
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function summarizeMergeFromDocs(docs = []) {
  const recordsByStudent = new Map();
  let sourceRecordCount = 0;
  let droppedInvalidRecords = 0;
  let duplicateStudentOverwrites = 0;

  docs.forEach((doc) => {
    (doc.records || []).forEach((record) => {
      sourceRecordCount += 1;

      const studentId = record?.studentId ? String(record.studentId) : "";
      if (!studentId) {
        droppedInvalidRecords += 1;
        return;
      }

      if (recordsByStudent.has(studentId)) {
        duplicateStudentOverwrites += 1;
      }

      recordsByStudent.set(studentId, {
        studentId: record.studentId,
        studentName: record.studentName,
        status: record.status
      });
    });
  });

  return {
    mergedRecords: Array.from(recordsByStudent.values()),
    sourceRecordCount,
    droppedInvalidRecords,
    duplicateStudentOverwrites
  };
}

function buildDuplicateGroupPipeline({ schoolId = "", classId = "" } = {}) {
  const preMatch = {};
  if (schoolId && mongoose.Types.ObjectId.isValid(schoolId)) {
    preMatch.schoolId = new mongoose.Types.ObjectId(schoolId);
  }
  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    preMatch.classId = new mongoose.Types.ObjectId(classId);
  }

  const pipeline = [];
  if (Object.keys(preMatch).length) {
    pipeline.push({ $match: preMatch });
  }

  pipeline.push(
    {
      $project: {
        schoolId: 1,
        classId: 1,
        date: 1,
        dayKey: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$date",
            timezone: "UTC"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          schoolId: "$schoolId",
          classId: "$classId",
          dayKey: "$dayKey"
        },
        count: { $sum: 1 },
        ids: { $push: "$_id" }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { "_id.dayKey": 1 } }
  );

  return pipeline;
}

async function supportsTransactions() {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {});
    return true;
  } catch (_err) {
    return false;
  } finally {
    await session.endSession();
  }
}

async function writeGroupChanges({ canonicalId, duplicateIds, payload, useTransaction }) {
  if (!useTransaction) {
    await Attendance.updateOne(
      { _id: canonicalId },
      { $set: payload },
      { runValidators: true }
    );
    if (duplicateIds.length) {
      await Attendance.deleteMany({ _id: { $in: duplicateIds } });
    }
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Attendance.updateOne(
        { _id: canonicalId },
        { $set: payload },
        { runValidators: true, session }
      );
      if (duplicateIds.length) {
        await Attendance.deleteMany({ _id: { $in: duplicateIds } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
}

async function dedupeAttendance({ apply = false, verbose = false, limit = null, schoolId = "", classId = "" } = {}) {
  const duplicateGroups = await Attendance.aggregate(
    buildDuplicateGroupPipeline({ schoolId, classId })
  );

  const selectedGroups = Number.isFinite(limit) && limit > 0
    ? duplicateGroups.slice(0, limit)
    : duplicateGroups;

  const transactionSupported = apply ? await supportsTransactions() : false;
  const summary = {
    duplicateGroupsFound: duplicateGroups.length,
    duplicateGroupsSelected: selectedGroups.length,
    applyMode: apply,
    transactionMode: apply ? (transactionSupported ? "per-group-transaction" : "best-effort-no-transaction") : "dry-run",
    groupsProcessed: 0,
    groupsSkipped: 0,
    docsExamined: 0,
    docsDeleted: 0,
    sourceRecords: 0,
    mergedRecords: 0,
    droppedInvalidRecords: 0,
    duplicateStudentOverwrites: 0,
    normalizedDateAdjustments: 0,
    applyFailures: 0,
    failures: []
  };

  if (!selectedGroups.length) {
    return summary;
  }

  for (const group of selectedGroups) {
    const docs = await Attendance.find({ _id: { $in: group.ids } }).sort({ createdAt: 1 }).lean();
    if (docs.length < 2) {
      summary.groupsSkipped += 1;
      continue;
    }

    const canonical = docs[0];
    const newest = docs[docs.length - 1];
    const duplicateIds = docs.slice(1).map((entry) => entry._id);
    const normalizedDate = normalizeDayKeyToUtcDate(group?._id?.dayKey);
    const mergeStats = summarizeMergeFromDocs(docs);

    summary.groupsProcessed += 1;
    summary.docsExamined += docs.length;
    summary.sourceRecords += mergeStats.sourceRecordCount;
    summary.mergedRecords += mergeStats.mergedRecords.length;
    summary.droppedInvalidRecords += mergeStats.droppedInvalidRecords;
    summary.duplicateStudentOverwrites += mergeStats.duplicateStudentOverwrites;

    if (
      normalizedDate
      && String(new Date(canonical.date).toISOString()) !== String(normalizedDate.toISOString())
    ) {
      summary.normalizedDateAdjustments += 1;
    }

    if (verbose) {
      console.log(
        `[attendance-dedupe] ${group._id.schoolId}:${group._id.classId}:${group._id.dayKey} docs=${docs.length} sourceRecords=${mergeStats.sourceRecordCount} merged=${mergeStats.mergedRecords.length} droppedInvalid=${mergeStats.droppedInvalidRecords}`
      );
    }

    if (!apply) continue;

    const payload = {
      className: canonical.className || newest.className || "",
      date: normalizedDate || canonical.date,
      records: mergeStats.mergedRecords,
      recordedBy: newest.recordedBy || canonical.recordedBy
    };

    try {
      await writeGroupChanges({
        canonicalId: canonical._id,
        duplicateIds,
        payload,
        useTransaction: transactionSupported
      });
      summary.docsDeleted += duplicateIds.length;
    } catch (err) {
      summary.applyFailures += 1;
      summary.failures.push({
        schoolId: String(group?._id?.schoolId || ""),
        classId: String(group?._id?.classId || ""),
        dayKey: String(group?._id?.dayKey || ""),
        error: err.message
      });
      console.error("[attendance-dedupe] group apply failure", {
        schoolId: String(group?._id?.schoolId || ""),
        classId: String(group?._id?.classId || ""),
        dayKey: String(group?._id?.dayKey || ""),
        error: err.message
      });
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs();
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) throw new Error("DB_STRING is required.");

  await mongoose.connect(dbString);
  console.log(`Connected: ${mongoose.connection.db.databaseName}`);
  console.log(`Mode: ${args.apply ? "APPLY" : "DRY-RUN"}`);
  if (args.limit) console.log(`Limit: ${args.limit} groups`);
  if (args.schoolId) console.log(`Scope schoolId: ${args.schoolId}`);
  if (args.classId) console.log(`Scope classId: ${args.classId}`);

  try {
    const summary = await dedupeAttendance(args);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.applyFailures > 0) {
      throw new Error(`Attendance dedupe completed with ${summary.applyFailures} failed group(s).`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Attendance dedupe failed:", err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  normalizeDayKeyToUtcDate,
  summarizeMergeFromDocs,
  buildDuplicateGroupPipeline,
  dedupeAttendance
};
