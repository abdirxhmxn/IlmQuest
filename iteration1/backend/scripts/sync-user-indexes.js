/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const {
  normalizeEmail,
  normalizeUserName,
  deriveUserNameCandidate,
  normalizeIdentifier,
  normalizeStudentNumber
} = require("../utils/userIdentifiers");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

const mode = process.argv.includes("--apply") ? "apply" : "dry-run";

function formatId(value) {
  if (!value) return "";
  return String(value);
}

function isSameKeyPattern(indexKey, expectedKey) {
  const indexEntries = Object.entries(indexKey || {});
  const expectedEntries = Object.entries(expectedKey || {});
  if (indexEntries.length !== expectedEntries.length) return false;
  return expectedEntries.every(([k, v]) => indexKey[k] === v);
}

function hasCanonicalPartialExpression(indexDef, fieldName) {
  const partial = indexDef?.partialFilterExpression || {};
  if (partial.deletedAt !== null) return false;
  const fieldFilter = partial[fieldName] || {};
  const typeIsString = fieldFilter.$type === "string";
  const hasNonEmptyConstraint = fieldFilter.$ne === "" || fieldFilter.$gt === "";
  return typeIsString && hasNonEmptyConstraint;
}

function findLegacyUniqueIndexes(indexes) {
  const canonicalNames = new Set([
    "school_username_active_unique",
    "school_email_active_unique",
    "school_employee_active_unique",
    "school_student_number_active_unique"
  ]);
  const legacyNames = new Set([
    "schoolId_1_email_1",
    "schoolId_1_userName_1",
    "schoolId_1_userNameNormalized_1",
    "email_1",
    "userName_1",
    "studentInfo.studentNumber_1",
    "teacherInfo.employeeId_1"
  ]);

  const legacyKeyPatterns = [
    { schoolId: 1, email: 1 },
    { schoolId: 1, userName: 1 },
    { schoolId: 1, userNameNormalized: 1 },
    { email: 1 },
    { userName: 1 },
    { "studentInfo.studentNumber": 1 },
    { "teacherInfo.employeeId": 1 }
  ];

  return indexes.filter((idx) => {
    if (!idx.unique) return false;
    if (canonicalNames.has(idx.name)) return false;
    if (legacyNames.has(idx.name)) return true;
    if (isSameKeyPattern(idx.key, { schoolId: 1, userNameNormalized: 1 })) {
      return !hasCanonicalPartialExpression(idx, "userNameNormalized");
    }
    if (isSameKeyPattern(idx.key, { schoolId: 1, emailNormalized: 1 })) {
      return !hasCanonicalPartialExpression(idx, "emailNormalized");
    }
    if (isSameKeyPattern(idx.key, { schoolId: 1, employeeIdNormalized: 1 })) {
      return !hasCanonicalPartialExpression(idx, "employeeIdNormalized");
    }
    if (isSameKeyPattern(idx.key, { schoolId: 1, studentNumberNormalized: 1 })) {
      return !hasCanonicalPartialExpression(idx, "studentNumberNormalized");
    }
    return legacyKeyPatterns.some((pattern) => isSameKeyPattern(idx.key, pattern));
  });
}

async function backfillNormalizedFields() {
  const cursor = User.find({}, {
    _id: 1,
    schoolId: 1,
    firstName: 1,
    lastName: 1,
    userName: 1,
    userNameNormalized: 1,
    email: 1,
    emailNormalized: 1,
    deletedAt: 1,
    createdAt: 1,
    employeeIdNormalized: 1,
    studentNumberNormalized: 1,
    "teacherInfo.employeeId": 1,
    "studentInfo.studentNumber": 1
  }).sort({ schoolId: 1, createdAt: 1, _id: 1 }).cursor();

  const ops = [];
  let count = 0;
  const usedBySchool = new Map();

  for await (const user of cursor) {
    const schoolKey = formatId(user.schoolId);
    if (!usedBySchool.has(schoolKey)) usedBySchool.set(schoolKey, new Set());
    const usedSet = usedBySchool.get(schoolKey);

    const baseUserName = deriveUserNameCandidate({
      preferred: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    });

    let resolvedUserName = baseUserName || "user";
    const isActive = !user.deletedAt;
    if (isActive) {
      let suffix = 2;
      while (usedSet.has(resolvedUserName)) {
        resolvedUserName = `${baseUserName || "user"}-${suffix}`;
        suffix += 1;
      }
      usedSet.add(resolvedUserName);
    }

    const userNameNormalized = normalizeUserName(resolvedUserName) || "user";
    const emailNormalized = normalizeEmail(user.email);
    const employeeIdNormalized = normalizeIdentifier(user.teacherInfo?.employeeId);
    const studentNumberNormalized = normalizeStudentNumber(user.studentInfo?.studentNumber);

    ops.push({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            userName: resolvedUserName,
            userNameNormalized,
            emailNormalized,
            employeeIdNormalized,
            studentNumberNormalized
          }
        }
      }
    });

    if (ops.length >= 500) {
      await User.bulkWrite(ops, { ordered: false });
      count += ops.length;
      ops.length = 0;
    }
  }

  if (ops.length) {
    await User.bulkWrite(ops, { ordered: false });
    count += ops.length;
  }

  return count;
}

function normalizedExprFor(fieldName) {
  if (fieldName === "userNameNormalized") {
    return {
      $toLower: {
        $trim: {
          input: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$userNameNormalized", ""] } }, 0] },
              "$userNameNormalized",
              { $ifNull: ["$userName", ""] }
            ]
          }
        }
      }
    };
  }
  if (fieldName === "emailNormalized") {
    return {
      $toLower: {
        $trim: {
          input: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$emailNormalized", ""] } }, 0] },
              "$emailNormalized",
              { $ifNull: ["$email", ""] }
            ]
          }
        }
      }
    };
  }
  if (fieldName === "employeeIdNormalized") {
    return {
      $toLower: {
        $trim: {
          input: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$employeeIdNormalized", ""] } }, 0] },
              "$employeeIdNormalized",
              { $ifNull: ["$teacherInfo.employeeId", ""] }
            ]
          }
        }
      }
    };
  }
  if (fieldName === "studentNumberNormalized") {
    return {
      $trim: {
        input: {
          $toString: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$studentNumberNormalized", ""] } }, 0] },
              "$studentNumberNormalized",
              { $ifNull: ["$studentInfo.studentNumber", ""] }
            ]
          }
        }
      }
    };
  }
  return { $literal: "" };
}

async function detectConflictsFor(fieldName) {
  const normalizedExpr = normalizedExprFor(fieldName);
  const pipeline = [
    { $match: { deletedAt: null } },
    {
      $project: {
        schoolId: 1,
        value: normalizedExpr
      }
    },
    { $match: { value: { $type: "string", $ne: "" } } },
    {
      $group: {
        _id: { schoolId: "$schoolId", value: "$value" },
        ids: { $push: "$_id" },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { "_id.schoolId": 1, "_id.value": 1 } }
  ];

  return User.aggregate(pipeline);
}

async function printEnvironmentContext() {
  const db = mongoose.connection.db;
  const indexes = await User.collection.indexes();
  console.log(`Database: ${db.databaseName}`);
  console.log(`Collection: ${User.collection.collectionName}`);
  console.log("Indexes:");
  indexes.forEach((idx) => {
    console.log(`- ${idx.name} :: key=${JSON.stringify(idx.key)} unique=${!!idx.unique}`);
  });

  const legacy = findLegacyUniqueIndexes(indexes);
  if (legacy.length) {
    console.log("Legacy unique indexes detected:");
    legacy.forEach((idx) => {
      console.log(`- ${idx.name} :: key=${JSON.stringify(idx.key)}`);
    });
  } else {
    console.log("No legacy unique indexes detected.");
  }
}

function printConflictReport(conflictsByField) {
  const fields = Object.keys(conflictsByField);
  let total = 0;

  fields.forEach((field) => {
    const rows = conflictsByField[field];
    if (!rows.length) return;
    console.log(`\n[CONFLICTS] ${field}`);
    rows.forEach((row) => {
      total += 1;
      console.log(
        `- schoolId=${formatId(row._id.schoolId)} value=${row._id.value} users=[${row.ids.map(formatId).join(", ")}]`
      );
    });
  });

  if (total === 0) {
    console.log("\nNo active-user conflicts found for scoped unique identifiers.");
  }

  return total;
}

async function dropLegacyIndexesIfPresent() {
  const indexes = await User.collection.indexes();
  const legacyIndexes = findLegacyUniqueIndexes(indexes);
  for (const index of legacyIndexes) {
    console.log(`Dropping legacy index: ${index.name}`);
    try {
      await User.collection.dropIndex(index.name);
    } catch (err) {
      if (err?.codeName === "IndexNotFound") continue;
      throw err;
    }
  }
}

async function createCanonicalIndexWithFallback(indexSpec, name, fieldName) {
  const withNe = {
    name,
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      [fieldName]: { $type: "string", $ne: "" }
    }
  };

  try {
    await User.collection.createIndex(indexSpec, withNe);
    console.log(`Ensured canonical index: ${name} (using $ne).`);
    return;
  } catch (err) {
    const msg = String(err?.message || "");
    const unsupportedPartial = msg.includes("Expression not supported in partial index");
    if (!unsupportedPartial) throw err;
    const withGt = {
      name,
      unique: true,
      partialFilterExpression: {
        deletedAt: null,
        [fieldName]: { $type: "string", $gt: "" }
      }
    };
    await User.collection.createIndex(indexSpec, withGt);
    console.log(`Ensured canonical index: ${name} (fallback using $gt for server compatibility).`);
  }
}

async function createScopedIndexes() {
  await createCanonicalIndexWithFallback(
    { schoolId: 1, userNameNormalized: 1 },
    "school_username_active_unique",
    "userNameNormalized"
  );
  await createCanonicalIndexWithFallback(
    { schoolId: 1, emailNormalized: 1 },
    "school_email_active_unique",
    "emailNormalized"
  );
  await createCanonicalIndexWithFallback(
    { schoolId: 1, employeeIdNormalized: 1 },
    "school_employee_active_unique",
    "employeeIdNormalized"
  );
  await createCanonicalIndexWithFallback(
    { schoolId: 1, studentNumberNormalized: 1 },
    "school_student_number_active_unique",
    "studentNumberNormalized"
  );
}

async function main() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required. Set DB_STRING env var or pass DB connection string as argv[2].");
  }

  await mongoose.connect(dbString);
  console.log(`[sync-user-indexes] mode=${mode}`);

  try {
    await printEnvironmentContext();

    let backfilled = 0;
    if (mode === "apply") {
      backfilled = await backfillNormalizedFields();
      console.log(`Backfilled normalized fields for ${backfilled} user documents.`);
    }

    const [userNameConflicts, emailConflicts, employeeConflicts, studentNumberConflicts] = await Promise.all([
      detectConflictsFor("userNameNormalized"),
      detectConflictsFor("emailNormalized"),
      detectConflictsFor("employeeIdNormalized"),
      detectConflictsFor("studentNumberNormalized")
    ]);

    const totalConflicts = printConflictReport({
      userNameNormalized: userNameConflicts,
      emailNormalized: emailConflicts,
      employeeIdNormalized: employeeConflicts,
      studentNumberNormalized: studentNumberConflicts
    });

    if (totalConflicts > 0) {
      console.error(`\nAborting: found ${totalConflicts} conflict group(s). Resolve these before applying indexes.`);
      process.exitCode = 1;
      return;
    }

    if (mode === "dry-run") {
      console.log("\nDry-run complete. No index changes were applied.");
      return;
    }

    await dropLegacyIndexesIfPresent();
    await createScopedIndexes();
    console.log("\nIndex sync apply complete.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("sync-user-indexes failed:", err.message);
  process.exit(1);
});
