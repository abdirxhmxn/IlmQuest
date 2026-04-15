/* eslint-disable no-console */
const path = require("path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const School = require("../models/School");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

async function connectWithRetry(uri, attempts = 4, delayMs = 1200) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(uri);
      return;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function main() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required.");
  }

  const schemaPasswordPath = User.schema.path("password");
  assert.equal(schemaPasswordPath?.options?.select, false, "User.password must be select:false.");

  const passportSource = fs.readFileSync(path.join(__dirname, "../config/passport.js"), "utf8");
  const explicitSelectionCount = (passportSource.match(/\.select\("\+password"\)/g) || []).length;
  assert.ok(explicitSelectionCount >= 2, "Passport must explicitly select +password in login flow.");

  await connectWithRetry(dbString);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const school = await School.create({
    schoolName: `PwTest-${runId}`,
    schoolEmail: `pwtest-${runId}@ilmquest.test`,
    password: "Password123!",
    adminUser: `pwtest-admin-${runId}`
  });

  let user;
  try {
    user = await User.create({
      schoolId: school._id,
      userName: `pw-user-${runId}`,
      email: `pw-user-${runId}@ilmquest.test`,
      password: "Password123!",
      role: "student",
      firstName: "Pw",
      lastName: "Test",
      studentInfo: { gradeLevel: "Grade 1", programType: "Khatm" }
    });

    const defaultProjection = await User.findById(user._id).lean();
    assert.ok(defaultProjection, "User should load in default projection.");
    assert.ok(!Object.prototype.hasOwnProperty.call(defaultProjection, "password"), "Default user query must not include password.");

    const withPassword = await User.findById(user._id).select("+password").lean();
    assert.ok(withPassword?.password, "Explicit +password query must include password.");

    console.log("Password selection check passed.");
  } finally {
    if (user?._id) await User.deleteOne({ _id: user._id });
    await School.deleteOne({ _id: school._id });
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Password selection check failed:", err.message);
  process.exit(1);
});
