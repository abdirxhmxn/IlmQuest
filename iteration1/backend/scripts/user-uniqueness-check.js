/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const School = require("../models/School");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function keyEq(a, b) {
  const aEntries = Object.entries(a || {});
  const bEntries = Object.entries(b || {});
  if (aEntries.length !== bEntries.length) return false;
  return bEntries.every(([k, v]) => a[k] === v);
}

function hasLegacyUnique(indexes, keyPattern) {
  return indexes.some((idx) => idx.unique && keyEq(idx.key, keyPattern));
}

function hasCanonicalUnique(indexes, name, keyPattern, field) {
  return indexes.some((idx) => {
    if (!idx.unique) return false;
    if (idx.name !== name) return false;
    if (!keyEq(idx.key, keyPattern)) return false;
    const p = idx.partialFilterExpression || {};
    if (p.deletedAt !== null) return false;
    const fieldFilter = p[field] || {};
    const hasTypeString = fieldFilter.$type === "string";
    const hasNonEmptyConstraint = fieldFilter.$ne === "" || fieldFilter.$gt === "";
    return hasTypeString && hasNonEmptyConstraint;
  });
}

async function expectDuplicate(op, expectedField) {
  try {
    await op();
    throw new Error(`Expected duplicate error for ${expectedField}, but operation succeeded.`);
  } catch (err) {
    if (err.code !== 11000) throw err;
    const keys = Object.keys(err.keyPattern || {});
    assert(keys.includes(expectedField), `Expected duplicate field ${expectedField}, got [${keys.join(", ") || "unknown"}]`);
  }
}

async function main() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) throw new Error("DB_STRING is required.");
  await mongoose.connect(dbString);
  const indexes = await User.collection.indexes();
  console.log(`Database: ${mongoose.connection.db.databaseName}`);
  console.log(`Collection: ${User.collection.collectionName}`);
  console.log("Current indexes:");
  indexes.forEach((idx) => {
    console.log(`- ${idx.name} :: key=${JSON.stringify(idx.key)} unique=${!!idx.unique}`);
  });

  assert(
    !hasLegacyUnique(indexes, { schoolId: 1, email: 1 }),
    "Legacy unique index {schoolId:1,email:1} must not exist."
  );
  assert(
    !hasLegacyUnique(indexes, { schoolId: 1, userName: 1 }),
    "Legacy unique index {schoolId:1,userName:1} must not exist."
  );
  assert(
    hasCanonicalUnique(indexes, "school_email_active_unique", { schoolId: 1, emailNormalized: 1 }, "emailNormalized"),
    "Canonical email normalized unique index is missing."
  );
  assert(
    hasCanonicalUnique(indexes, "school_employee_active_unique", { schoolId: 1, employeeIdNormalized: 1 }, "employeeIdNormalized"),
    "Canonical employeeId normalized unique index is missing."
  );
  assert(
    hasCanonicalUnique(indexes, "school_student_number_active_unique", { schoolId: 1, studentNumberNormalized: 1 }, "studentNumberNormalized"),
    "Canonical studentNumber normalized unique index is missing."
  );

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const schoolA = await School.create({
    schoolName: `UQ-A-${runId}`,
    schoolEmail: `uq-a-${runId}@test.local`,
    password: "Password123!",
    adminUser: `adminA-${runId}`
  });
  const schoolB = await School.create({
    schoolName: `UQ-B-${runId}`,
    schoolEmail: `uq-b-${runId}@test.local`,
    password: "Password123!",
    adminUser: `adminB-${runId}`
  });

  const cleanupUserIds = [];

  try {
    const u1 = await User.create({
      schoolId: schoolA._id,
      userName: "dupname",
      email: "Test@Email.com",
      password: "Password123!",
      role: "student",
      studentInfo: { studentNumber: 1001, gradeLevel: "Grade 1", programType: "Khatm" }
    });
    cleanupUserIds.push(u1._id);

    await expectDuplicate(
      () =>
        User.create({
          schoolId: schoolA._id,
          userName: "another",
          email: "test@email.com",
          password: "Password123!",
          role: "parent"
        }),
      "emailNormalized"
    );

    const u2 = await User.create({
      schoolId: schoolB._id,
      userName: "x",
      email: "test@email.com",
      password: "Password123!",
      role: "parent"
    });
    cleanupUserIds.push(u2._id);

    const dupUsername = await User.create({
      schoolId: schoolA._id,
      userName: "dupname",
      email: `dupname-${runId}@schoola.test`,
      password: "Password123!",
      role: "parent"
    });
    cleanupUserIds.push(dupUsername._id);

    const conflictTarget = await User.create({
      schoolId: schoolA._id,
      userName: "target",
      email: `target-${runId}@schoola.test`,
      password: "Password123!",
      role: "student",
      studentInfo: { studentNumber: 2002, gradeLevel: "Grade 2", programType: "Khatm" }
    });
    cleanupUserIds.push(conflictTarget._id);

    conflictTarget.email = "TEST@EMAIL.COM";
    await expectDuplicate(() => conflictTarget.save(), "emailNormalized");

    await expectDuplicate(
      () =>
        User.create({
          schoolId: schoolA._id,
          userName: "teacher-1",
          email: `teacher1-${runId}@schoola.test`,
          password: "Password123!",
          role: "teacher",
          teacherInfo: { employeeId: "EMP-001" }
        }).then((t1) =>
          User.create({
            schoolId: schoolA._id,
            userName: "teacher-2",
            email: `teacher2-${runId}@schoola.test`,
            password: "Password123!",
            role: "teacher",
            teacherInfo: { employeeId: "emp-001" }
          }).finally(() => cleanupUserIds.push(t1._id))
        ),
      "employeeIdNormalized"
    );

    await expectDuplicate(
      () =>
        User.create({
          schoolId: schoolA._id,
          userName: "student-sn-2",
          email: `st2-${runId}@schoola.test`,
          password: "Password123!",
          role: "student",
          studentInfo: { studentNumber: 1001, gradeLevel: "Grade 1", programType: "Khatm" }
        }),
      "studentNumberNormalized"
    );

    const softDeleted = await User.create({
      schoolId: schoolA._id,
      userName: "deleted-user",
      email: `reusable-${runId}@schoola.test`,
      password: "Password123!",
      role: "parent"
    });
    cleanupUserIds.push(softDeleted._id);
    softDeleted.deletedAt = new Date();
    await softDeleted.save();

    const reused = await User.create({
      schoolId: schoolA._id,
      userName: "new-user",
      email: `REUSABLE-${runId}@schoola.test`,
      password: "Password123!",
      role: "parent"
    });
    cleanupUserIds.push(reused._id);

    softDeleted.deletedAt = null;
    await expectDuplicate(() => softDeleted.save(), "emailNormalized");

    const createPayload = {
      schoolId: schoolA._id,
      userName: `parallel-${runId}`,
      email: `parallel-${runId}@schoola.test`,
      password: "Password123!",
      role: "parent"
    };
    const [c1, c2] = await Promise.allSettled([User.create(createPayload), User.create({ ...createPayload, userName: `parallel-2-${runId}` })]);
    const fulfilled = [c1, c2].filter((r) => r.status === "fulfilled").length;
    const rejected = [c1, c2].filter((r) => r.status === "rejected").length;
    assert(fulfilled === 1 && rejected === 1, "Expected one success and one duplicate failure for parallel create.");
    const rejectedReason = [c1, c2].find((r) => r.status === "rejected")?.reason;
    assert(rejectedReason?.code === 11000, "Parallel rejected case must be duplicate key.");
    if (c1.status === "fulfilled") cleanupUserIds.push(c1.value._id);
    if (c2.status === "fulfilled") cleanupUserIds.push(c2.value._id);

    console.log("User uniqueness check passed.");
  } finally {
    if (cleanupUserIds.length) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }
    await School.deleteMany({ _id: { $in: [schoolA._id, schoolB._id] } });
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("User uniqueness check failed:", err.message);
  process.exit(1);
});
