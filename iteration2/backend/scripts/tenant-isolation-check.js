/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "../config/.env") });

const School = require("../models/School");
const User = require("../models/User");

async function run() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required. Set DB_STRING env var or pass as argv[2].");
  }

  await mongoose.connect(dbString);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const schoolAEmail = `tenant-a-${runId}@ilmquest.test`;
  const schoolBEmail = `tenant-b-${runId}@ilmquest.test`;

  let schoolA;
  let schoolB;
  let adminA;
  let adminB;
  let studentA;

  try {
    schoolA = await School.create({
      schoolName: `Tenant A ${runId}`,
      schoolEmail: schoolAEmail,
      password: "Password123!",
      adminUser: `tenantAAdmin${runId}`,
      contactEmail: schoolAEmail,
      contactPhone: "111-111-1111",
    });

    schoolB = await School.create({
      schoolName: `Tenant B ${runId}`,
      schoolEmail: schoolBEmail,
      password: "Password123!",
      adminUser: `tenantBAdmin${runId}`,
      contactEmail: schoolBEmail,
      contactPhone: "222-222-2222",
    });

    adminA = await User.create({
      schoolId: schoolA._id,
      userName: `tenantAAdmin${runId}`,
      email: schoolAEmail,
      password: "Password123!",
      role: "admin",
      firstName: "Admin",
      lastName: "A",
    });

    adminB = await User.create({
      schoolId: schoolB._id,
      userName: `tenantBAdmin${runId}`,
      email: schoolBEmail,
      password: "Password123!",
      role: "admin",
      firstName: "Admin",
      lastName: "B",
    });

    studentA = await User.create({
      schoolId: schoolA._id,
      userName: `tenantAStudent${runId}`,
      email: `tenant-a-student-${runId}@ilmquest.test`,
      password: "Password123!",
      role: "student",
      firstName: "Student",
      lastName: "A",
    });

    const schoolBRead = await User.findOne({
      _id: studentA._id,
      schoolId: adminB.schoolId,
    }).lean();

    const schoolBUpdate = await User.updateOne(
      { _id: studentA._id, schoolId: adminB.schoolId },
      { $set: { firstName: "Hacked" } }
    );

    const schoolBDelete = await User.deleteOne({
      _id: studentA._id,
      schoolId: adminB.schoolId,
    });

    const schoolARead = await User.findOne({
      _id: studentA._id,
      schoolId: adminA.schoolId,
    }).lean();

    const passed =
      schoolBRead === null &&
      schoolBUpdate.matchedCount === 0 &&
      schoolBDelete.deletedCount === 0 &&
      schoolARead !== null;

    if (!passed) {
      throw new Error(
        `Isolation check failed. read=${!!schoolBRead}, updateMatched=${schoolBUpdate.matchedCount}, deleteCount=${schoolBDelete.deletedCount}, ownerVisible=${!!schoolARead}`
      );
    }

    console.log("Tenant isolation check passed.");
    console.log(
      JSON.stringify(
        {
          schoolBRead: schoolBRead === null,
          schoolBUpdateMatchedCount: schoolBUpdate.matchedCount,
          schoolBDeleteCount: schoolBDelete.deletedCount,
          schoolARead: schoolARead !== null,
        },
        null,
        2
      )
    );
  } finally {
    await User.deleteMany({
      _id: { $in: [adminA?._id, adminB?._id, studentA?._id].filter(Boolean) },
    });
    await School.deleteMany({
      _id: { $in: [schoolA?._id, schoolB?._id].filter(Boolean) },
    });
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Tenant isolation check failed:", err.message);
  process.exit(1);
});
