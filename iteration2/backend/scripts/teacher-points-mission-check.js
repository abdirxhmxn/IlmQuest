/* eslint-disable no-console */
const path = require("path");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const School = require("../models/School");
const User = require("../models/User");
const Class = require("../models/Class");
const Mission = require("../models/Missions");
const PointAdjustment = require("../models/PointAdjustment");
const AuditLog = require("../models/AuditLog");
const postsController = require("../controllers/posts");
const homeController = require("../controllers/home");
const { buildStudentProgressViewModel } = require("../utils/studentProgress");
const { sweepExpiredMissionAttempts, MISSION_AUTO_FAIL_STATUS } = require("../utils/missionDeadlines");

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

function buildReq({
  method = "GET",
  accept = "application/json",
  schoolId,
  user,
  params = {},
  body = {},
  query = {}
} = {}) {
  return {
    method,
    schoolId,
    user,
    params,
    body,
    query,
    ip: "127.0.0.1",
    get(name) {
      const normalized = String(name || "").toLowerCase();
      if (normalized === "accept") return accept;
      if (normalized === "user-agent") return "teacher-points-mission-check";
      return "";
    },
    flashMessages: [],
    flash(type, message) {
      this.flashMessages.push({ type, message });
      return this.flashMessages;
    }
  };
}

function invokeController(controllerMethod, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      payload: null,
      redirectPath: null,
      rendered: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve({
          type: "json",
          statusCode: this.statusCode,
          payload,
          req
        });
      },
      redirect(redirectPath) {
        this.redirectPath = redirectPath;
        resolve({
          type: "redirect",
          statusCode: this.statusCode,
          redirectPath,
          req
        });
      },
      render(view, locals) {
        this.rendered = { view, locals };
        resolve({
          type: "render",
          statusCode: this.statusCode,
          view,
          locals,
          req
        });
      }
    };

    Promise.resolve(controllerMethod(req, res)).catch(reject);
  });
}

function teacherRef(userDoc) {
  return {
    _id: userDoc._id,
    name: `${userDoc.firstName} ${userDoc.lastName}`.trim()
  };
}

function studentRef(userDoc) {
  return {
    _id: userDoc._id,
    name: `${userDoc.firstName} ${userDoc.lastName}`.trim()
  };
}

async function main() {
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required.");
  }

  await connectWithRetry(dbString);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanupIds = {
    schools: [],
    users: [],
    classes: [],
    missions: []
  };

  try {
    const school = await School.create({
      schoolName: `Teacher Points ${runId}`,
      schoolEmail: `teacher-points-${runId}@ilmquest.test`,
      password: "Password123!",
      adminUser: `admin-${runId}`
    });
    cleanupIds.schools.push(school._id);

    const otherSchool = await School.create({
      schoolName: `Teacher Points Other ${runId}`,
      schoolEmail: `teacher-points-other-${runId}@ilmquest.test`,
      password: "Password123!",
      adminUser: `other-admin-${runId}`
    });
    cleanupIds.schools.push(otherSchool._id);

    const [teacher, student, classmate, outsiderStudent, otherSchoolStudent] = await Promise.all([
      User.create({
        schoolId: school._id,
        userName: `teacher-${runId}`,
        email: `teacher-${runId}@ilmquest.test`,
        password: "Password123!",
        role: "teacher",
        firstName: "Tala",
        lastName: "Teacher",
        teacherInfo: { employeeId: `EMP-${runId}` }
      }),
      User.create({
        schoolId: school._id,
        userName: `student-${runId}`,
        email: `student-${runId}@ilmquest.test`,
        password: "Password123!",
        role: "student",
        firstName: "Sami",
        lastName: "Student",
        studentInfo: { gradeLevel: "Grade 1", programType: "Khatm" }
      }),
      User.create({
        schoolId: school._id,
        userName: `classmate-${runId}`,
        email: `classmate-${runId}@ilmquest.test`,
        password: "Password123!",
        role: "student",
        firstName: "Peer",
        lastName: "Student",
        points: 4,
        xp: 4,
        studentInfo: { gradeLevel: "Grade 1", programType: "Khatm" }
      }),
      User.create({
        schoolId: school._id,
        userName: `outsider-${runId}`,
        email: `outsider-${runId}@ilmquest.test`,
        password: "Password123!",
        role: "student",
        firstName: "Outside",
        lastName: "Student",
        studentInfo: { gradeLevel: "Grade 1", programType: "Khatm" }
      }),
      User.create({
        schoolId: otherSchool._id,
        userName: `other-student-${runId}`,
        email: `other-student-${runId}@ilmquest.test`,
        password: "Password123!",
        role: "student",
        firstName: "Remote",
        lastName: "Student",
        studentInfo: { gradeLevel: "Grade 1", programType: "Khatm" }
      })
    ]);
    cleanupIds.users.push(teacher._id, student._id, classmate._id, outsiderStudent._id, otherSchoolStudent._id);

    const classDoc = await Class.create({
      schoolId: school._id,
      className: `Class ${runId}`,
      classCode: `CL-${runId}`,
      teachers: [teacherRef(teacher)],
      students: [studentRef(student), studentRef(classmate)]
    });
    cleanupIds.classes.push(classDoc._id);

    await User.updateMany(
      { _id: { $in: [student._id, classmate._id] } },
      { $set: { "studentInfo.classId": classDoc._id } }
    );

    const teacherSession = {
      _id: teacher._id,
      schoolId: school._id,
      role: "teacher",
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      userName: teacher.userName,
      teacherInfo: teacher.teacherInfo
    };
    const studentSession = {
      _id: student._id,
      schoolId: school._id,
      role: "student",
      firstName: student.firstName,
      lastName: student.lastName,
      userName: student.userName
    };

    const addResponse = await invokeController(
      postsController.createStudentPointAdjustment,
      buildReq({
        method: "POST",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(student._id) },
        body: {
          classId: String(classDoc._id),
          amount: 10,
          direction: "add",
          reason: "Excellent participation"
        }
      })
    );
    assert.equal(addResponse.statusCode, 200, "Teacher should be able to add points to their student.");
    let refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 10, "Student XP should increase after add adjustment.");
    assert.equal(refreshedStudent.points, 10, "Student points should stay aligned with XP.");
    assert.equal(refreshedStudent.rank, "E", "Rank should auto-recalculate after XP increase.");

    const adjustmentRecordsAfterAdd = await PointAdjustment.find({ schoolId: school._id, studentId: student._id }).lean();
    assert.equal(adjustmentRecordsAfterAdd.length, 1, "Adjustment history record should be created.");
    assert.equal(adjustmentRecordsAfterAdd[0].reason, "Excellent participation");

    const missionsRender = await invokeController(
      homeController.getStudentMissions,
      buildReq({
        method: "GET",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession
      })
    );
    assert.equal(missionsRender.type, "render");
    const leaderboardRow = (missionsRender.locals.students || []).find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.ok(leaderboardRow, "Student should appear in leaderboard payload.");
    assert.equal(Number(leaderboardRow.points), 10, "Leaderboard payload should reflect adjusted XP immediately.");

    const subtractResponse = await invokeController(
      postsController.createStudentPointAdjustment,
      buildReq({
        method: "POST",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(student._id) },
        body: {
          classId: String(classDoc._id),
          amount: 5,
          direction: "subtract",
          reason: "Missed participation target"
        }
      })
    );
    assert.equal(subtractResponse.statusCode, 200, "Teacher should be able to subtract points from their student.");
    refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 5, "XP should decrease after subtract adjustment.");

    const belowZeroResponse = await invokeController(
      postsController.createStudentPointAdjustment,
      buildReq({
        method: "POST",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(student._id) },
        body: {
          classId: String(classDoc._id),
          amount: 10,
          direction: "subtract",
          reason: "Over-correction attempt"
        }
      })
    );
    assert.equal(belowZeroResponse.statusCode, 422, "Teacher cannot subtract below 0.");
    refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 5, "Rejected subtract should not change XP.");

    const missingReasonResponse = await invokeController(
      postsController.createStudentPointAdjustment,
      buildReq({
        method: "POST",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(student._id) },
        body: {
          classId: String(classDoc._id),
          amount: 3,
          direction: "add",
          reason: ""
        }
      })
    );
    assert.equal(missingReasonResponse.statusCode, 422, "Reason should be required for manual adjustments.");

    const outsideScopeResponse = await invokeController(
      postsController.createStudentPointAdjustment,
      buildReq({
        method: "POST",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(outsiderStudent._id) },
        body: {
          amount: 3,
          direction: "add",
          reason: "Unauthorized scope test"
        }
      })
    );
    assert.equal(outsideScopeResponse.statusCode, 403, "Teacher should not adjust a student outside their class scope.");

    const historyResponse = await invokeController(
      postsController.getStudentPointAdjustments,
      buildReq({
        method: "GET",
        accept: "application/json",
        schoolId: school._id,
        user: teacherSession,
        params: { studentId: String(student._id) },
        query: { classId: String(classDoc._id) }
      })
    );
    assert.equal(historyResponse.statusCode, 200, "Teacher should be able to fetch recent adjustment history.");
    assert.equal(historyResponse.payload.data.adjustments.length, 2, "History endpoint should return durable adjustments.");

    const now = new Date();
    const [futureMission, graceMission, overdueMission] = await Promise.all([
      Mission.create({
        schoolId: school._id,
        title: `Future Mission ${runId}`,
        description: "Submit before the deadline.",
        type: "Ilm",
        category: "Solo",
        rank: "F",
        pointsXP: 3,
        timeLimit: "Timed",
        dueDate: new Date(now.getTime() + 20 * 60 * 1000),
        assignedTo: { studentInfo: [student._id] },
        createdBy: { _id: teacher._id, name: `${teacher.firstName} ${teacher.lastName}`.trim() },
        active: {
          status: true,
          studentInfo: [{
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            status: "started",
            startedAt: now
          }]
        }
      }),
      Mission.create({
        schoolId: school._id,
        title: `Grace Mission ${runId}`,
        description: "Submit during the grace window.",
        type: "Ilm",
        category: "Solo",
        rank: "F",
        pointsXP: 4,
        timeLimit: "Timed",
        dueDate: new Date(now.getTime() - 10 * 60 * 1000),
        assignedTo: { studentInfo: [student._id] },
        createdBy: { _id: teacher._id, name: `${teacher.firstName} ${teacher.lastName}`.trim() },
        active: {
          status: true,
          studentInfo: [{
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            status: "started",
            startedAt: now
          }]
        }
      }),
      Mission.create({
        schoolId: school._id,
        title: `Overdue Mission ${runId}`,
        description: "Should auto-fail after grace.",
        type: "Ilm",
        category: "Solo",
        rank: "F",
        pointsXP: 7,
        timeLimit: "Timed",
        dueDate: new Date(now.getTime() - 31 * 60 * 1000),
        assignedTo: { studentInfo: [student._id] },
        createdBy: { _id: teacher._id, name: `${teacher.firstName} ${teacher.lastName}`.trim() },
        active: {
          status: true,
          studentInfo: [{
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            status: "started",
            startedAt: now
          }]
        }
      })
    ]);
    cleanupIds.missions.push(futureMission._id, graceMission._id, overdueMission._id);

    const firstSweep = await sweepExpiredMissionAttempts({ schoolId: school._id, now });
    assert.equal(firstSweep.failedAttempts, 1, "Only overdue attempts should auto-fail.");

    const overdueAfterSweep = await Mission.findById(overdueMission._id).lean();
    const overdueEntry = overdueAfterSweep.active.studentInfo.find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.equal(overdueEntry.status, MISSION_AUTO_FAIL_STATUS, "Overdue mission should be marked auto_failed.");
    assert.match(overdueEntry.failureReason, /30-minute grace period/i, "Auto-fail should store a clear deadline reason.");

    const graceAfterSweep = await Mission.findById(graceMission._id).lean();
    const graceEntry = graceAfterSweep.active.studentInfo.find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.equal(graceEntry.status, "started", "Grace-window attempt should remain active.");

    const futureAfterSweep = await Mission.findById(futureMission._id).lean();
    const futureEntry = futureAfterSweep.active.studentInfo.find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.equal(futureEntry.status, "started", "Before-deadline attempt should remain active.");

    refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 5, "Auto-fail should not award XP.");

    const secondSweep = await sweepExpiredMissionAttempts({ schoolId: school._id, now });
    assert.equal(secondSweep.failedAttempts, 0, "Sweep should be idempotent.");

    const teacherProgress = await buildStudentProgressViewModel(
      buildReq({
        method: "GET",
        accept: "text/html",
        schoolId: school._id,
        user: teacherSession
      }),
      student._id,
      {
        preferredClassId: classDoc._id,
        includeTeacherInsights: true
      }
    );
    const failedMissionRow = (teacherProgress?.missions?.recentRows || []).find(
      (entry) => String(entry.missionId) === String(overdueMission._id)
    );
    assert.equal(failedMissionRow?.statusKey, "failed", "Teacher progress view model should expose failed mission state.");
    assert.match(failedMissionRow?.failureReason || "", /30-minute grace period/i, "Teacher progress view model should expose failed reason.");

    const studentMissionRender = await invokeController(
      homeController.getStudentMissions,
      buildReq({
        method: "GET",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession
      })
    );
    const renderedOverdueMission = (studentMissionRender.locals.missions || []).find(
      (entry) => String(entry._id) === String(overdueMission._id)
    );
    const renderedOverdueEntry = (renderedOverdueMission?.active?.studentInfo || []).find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.match(renderedOverdueEntry?.failureReason || "", /30-minute grace period/i, "Student missions payload should include auto-fail reason.");

    const blockedComplete = await invokeController(
      postsController.completeStudentMission,
      buildReq({
        method: "PUT",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession,
        body: { missionId: String(overdueMission._id) }
      })
    );
    assert.equal(blockedComplete.type, "redirect", "Blocked auto-failed completion should redirect back to missions.");
    refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 5, "Blocked auto-failed completion should not change XP.");

    const reopenResult = await invokeController(
      postsController.reopenStudentMissionAttempt,
      buildReq({
        method: "POST",
        accept: "text/html",
        schoolId: school._id,
        user: teacherSession,
        params: {
          studentId: String(student._id),
          missionId: String(overdueMission._id)
        },
        body: {
          classId: String(classDoc._id),
          reason: "Approved make-up submission"
        }
      })
    );
    assert.equal(reopenResult.type, "redirect", "Teacher reopen flow should redirect back to student progress.");
    const reopenedMission = await Mission.findById(overdueMission._id).lean();
    const reopenedEntry = reopenedMission.active.studentInfo.find(
      (entry) => String(entry._id) === String(student._id)
    );
    assert.equal(reopenedEntry.status, "started", "Reopened mission should return to active status.");
    assert.equal(reopenedEntry.failureReason, "", "Reopened mission should clear failure reason.");
    assert.equal(String(reopenedEntry.reopenedBy), String(teacher._id), "Reopened mission should track teacher actor.");

    const graceComplete = await invokeController(
      postsController.completeStudentMission,
      buildReq({
        method: "PUT",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession,
        body: { missionId: String(graceMission._id) }
      })
    );
    assert.equal(graceComplete.type, "redirect", "Student should be able to complete during the grace window.");

    const futureComplete = await invokeController(
      postsController.completeStudentMission,
      buildReq({
        method: "PUT",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession,
        body: { missionId: String(futureMission._id) }
      })
    );
    assert.equal(futureComplete.type, "redirect", "Student should be able to complete before the deadline.");

    const reopenedComplete = await invokeController(
      postsController.completeStudentMission,
      buildReq({
        method: "PUT",
        accept: "text/html",
        schoolId: school._id,
        user: studentSession,
        body: { missionId: String(overdueMission._id) }
      })
    );
    assert.equal(reopenedComplete.type, "redirect", "Student should be able to complete after teacher reopen.");

    refreshedStudent = await User.findById(student._id).lean();
    assert.equal(refreshedStudent.xp, 19, "Mission completions should award XP only when allowed.");

    console.log("Teacher points and mission deadline check passed.");
  } finally {
    await AuditLog.deleteMany({ schoolId: { $in: cleanupIds.schools } });
    await PointAdjustment.deleteMany({ schoolId: { $in: cleanupIds.schools } });
    await Mission.deleteMany({ _id: { $in: cleanupIds.missions } });
    await Class.deleteMany({ _id: { $in: cleanupIds.classes } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    await School.deleteMany({ _id: { $in: cleanupIds.schools } });
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Teacher points and mission deadline check failed:", err.message);
  process.exit(1);
});
