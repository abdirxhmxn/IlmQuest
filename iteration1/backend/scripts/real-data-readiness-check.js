/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "../config/.env") });

const School = require("../models/School");
const User = require("../models/User");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const Mission = require("../models/Missions");
const Announcement = require("../models/Announcement");

const VALID_RANKS = new Set(["F", "E", "D", "C", "B", "A", "S"]);

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function toName(userLike) {
  const first = String(userLike?.firstName || "").trim();
  const last = String(userLike?.lastName || "").trim();
  return `${first} ${last}`.trim() || String(userLike?.userName || "Unknown");
}

function parseArgs(argv = []) {
  const args = new Set(argv.slice(2));
  return {
    strict: args.has("--strict")
  };
}

function createCollector() {
  const issues = [];
  return {
    issues,
    add(level, code, message, context = {}) {
      issues.push({
        level,
        code,
        message,
        context
      });
    }
  };
}

function summarizeIssues(issues = []) {
  return issues.reduce(
    (acc, issue) => {
      if (issue.level === "error") acc.errors += 1;
      if (issue.level === "warning") acc.warnings += 1;
      if (issue.level === "info") acc.info += 1;
      return acc;
    },
    { errors: 0, warnings: 0, info: 0 }
  );
}

async function runSchoolAudit(schoolDoc) {
  const schoolId = schoolDoc?._id;
  const collector = createCollector();
  const scope = { schoolId, deletedAt: null };

  const [users, classes, grades, attendanceDocs, missions, announcements] = await Promise.all([
    User.find(scope)
      .select("_id schoolId role firstName lastName userName studentInfo parentInfo xp points rank")
      .lean(),
    Class.find(scope)
      .select("_id schoolId className classCode teachers students")
      .lean(),
    Grade.find({ schoolId })
      .select("_id schoolId classInfo students Assignment")
      .lean(),
    Attendance.find({ schoolId })
      .select("_id schoolId classId className date records.studentId records.status")
      .lean(),
    Mission.find({ schoolId })
      .select("_id schoolId title rank createdBy assignedTo active")
      .lean(),
    Announcement.find({ schoolId, isPublished: true, status: "active" })
      .select("_id title targetRoles publishedAt")
      .lean()
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const classById = new Map(classes.map((classDoc) => [String(classDoc._id), classDoc]));
  const students = users.filter((entry) => entry.role === "student");
  const teachers = users.filter((entry) => entry.role === "teacher");
  const parents = users.filter((entry) => entry.role === "parent");

  const classIdsByStudentId = new Map();
  classes.forEach((classDoc) => {
    const classId = String(classDoc._id);
    (classDoc.students || []).forEach((studentRef) => {
      const studentId = toIdString(studentRef?._id);
      if (!studentId) return;
      if (!classIdsByStudentId.has(studentId)) classIdsByStudentId.set(studentId, new Set());
      classIdsByStudentId.get(studentId).add(classId);
    });
  });

  classes.forEach((classDoc) => {
    const classId = String(classDoc._id);
    const classLabel = classDoc.className || classDoc.classCode || classId;
    const classTeachers = Array.isArray(classDoc.teachers) ? classDoc.teachers : [];
    const classStudents = Array.isArray(classDoc.students) ? classDoc.students : [];

    if (!classTeachers.length) {
      collector.add(
        "warning",
        "class_without_teacher",
        "Class has no assigned teacher.",
        { classId, className: classLabel }
      );
    }

    classTeachers.forEach((teacherRef) => {
      const teacherId = toIdString(teacherRef?._id);
      const teacher = userById.get(teacherId);
      if (!teacher) {
        collector.add(
          "error",
          "class_teacher_missing",
          "Class references a teacher that does not exist in this school.",
          { classId, className: classLabel, teacherId }
        );
        return;
      }
      if (teacher.role !== "teacher") {
        collector.add(
          "error",
          "class_teacher_wrong_role",
          "Class teacher reference points to a non-teacher account.",
          { classId, className: classLabel, teacherId, actualRole: teacher.role }
        );
      }
    });

    classStudents.forEach((studentRef) => {
      const studentId = toIdString(studentRef?._id);
      const student = userById.get(studentId);
      if (!student) {
        collector.add(
          "error",
          "class_student_missing",
          "Class references a student that does not exist in this school.",
          { classId, className: classLabel, studentId }
        );
        return;
      }
      if (student.role !== "student") {
        collector.add(
          "error",
          "class_student_wrong_role",
          "Class student reference points to a non-student account.",
          { classId, className: classLabel, studentId, actualRole: student.role }
        );
      }
    });
  });

  students.forEach((student) => {
    const studentId = String(student._id);
    const profileClassId = toIdString(student?.studentInfo?.classId);
    const classMembership = classIdsByStudentId.get(studentId) || new Set();

    if (profileClassId && !classById.has(profileClassId)) {
      collector.add(
        "error",
        "student_profile_class_missing",
        "Student profile references a class that does not exist in this school.",
        { studentId, studentName: toName(student), classId: profileClassId }
      );
    }

    if (profileClassId && classById.has(profileClassId) && !classMembership.has(profileClassId)) {
      collector.add(
        "warning",
        "student_class_membership_mismatch",
        "Student profile classId is set but the class roster does not include the student.",
        { studentId, studentName: toName(student), classId: profileClassId }
      );
    }

    if (!profileClassId && classMembership.size === 0) {
      collector.add(
        "warning",
        "student_unassigned",
        "Student is not assigned to any class (profile or roster).",
        { studentId, studentName: toName(student) }
      );
    }
  });

  parents.forEach((parent) => {
    const parentId = String(parent._id);
    const children = Array.isArray(parent?.parentInfo?.children) ? parent.parentInfo.children : [];
    if (!children.length) {
      collector.add(
        "warning",
        "parent_without_children",
        "Parent account has no linked child records.",
        { parentId, parentName: toName(parent) }
      );
    }

    children.forEach((childRef) => {
      const childId = toIdString(childRef?.childID);
      const childDoc = userById.get(childId);
      if (!childDoc) {
        collector.add(
          "error",
          "parent_child_missing",
          "Parent child reference points to a missing user.",
          { parentId, parentName: toName(parent), childId }
        );
        return;
      }
      if (childDoc.role !== "student") {
        collector.add(
          "error",
          "parent_child_not_student",
          "Parent child reference points to a non-student user.",
          { parentId, parentName: toName(parent), childId, actualRole: childDoc.role }
        );
      }
      const reverseLinked = Array.isArray(childDoc?.studentInfo?.parents)
        && childDoc.studentInfo.parents.some((entry) => toIdString(entry?.parentID) === parentId);
      if (!reverseLinked) {
        collector.add(
          "warning",
          "parent_child_reverse_link_missing",
          "Parent->child link exists but child->parent link is missing.",
          { parentId, parentName: toName(parent), childId, childName: toName(childDoc) }
        );
      }
    });
  });

  students.forEach((student) => {
    const studentId = String(student._id);
    const linkedParents = Array.isArray(student?.studentInfo?.parents) ? student.studentInfo.parents : [];
    linkedParents.forEach((parentRef) => {
      const parentId = toIdString(parentRef?.parentID);
      const parentDoc = userById.get(parentId);
      if (!parentDoc) {
        collector.add(
          "error",
          "student_parent_missing",
          "Student parent reference points to a missing user.",
          { studentId, studentName: toName(student), parentId }
        );
        return;
      }
      if (parentDoc.role !== "parent") {
        collector.add(
          "error",
          "student_parent_wrong_role",
          "Student parent reference points to a non-parent user.",
          { studentId, studentName: toName(student), parentId, actualRole: parentDoc.role }
        );
        return;
      }
      const forwardLinked = Array.isArray(parentDoc?.parentInfo?.children)
        && parentDoc.parentInfo.children.some((entry) => toIdString(entry?.childID) === studentId);
      if (!forwardLinked) {
        collector.add(
          "warning",
          "student_parent_forward_link_missing",
          "Student->parent link exists but parent->child link is missing.",
          { studentId, studentName: toName(student), parentId, parentName: toName(parentDoc) }
        );
      }
    });
  });

  grades.forEach((gradeDoc) => {
    const gradeId = String(gradeDoc._id);
    const classRefs = Array.isArray(gradeDoc.classInfo) ? gradeDoc.classInfo : [];
    const studentRefs = Array.isArray(gradeDoc.students) ? gradeDoc.students : [];

    if (!classRefs.length) {
      collector.add("error", "grade_missing_class", "Grade record has no class reference.", { gradeId });
    }
    if (!studentRefs.length) {
      collector.add("error", "grade_missing_student", "Grade record has no student reference.", { gradeId });
    }

    const gradeClassIds = classRefs.map((entry) => toIdString(entry?._id)).filter(Boolean);
    gradeClassIds.forEach((classId) => {
      if (!classById.has(classId)) {
        collector.add("error", "grade_class_missing", "Grade references a missing class.", { gradeId, classId });
      }
    });

    studentRefs.forEach((studentRef) => {
      const studentId = toIdString(studentRef?._id);
      const studentDoc = userById.get(studentId);
      if (!studentDoc) {
        collector.add("error", "grade_student_missing", "Grade references a missing student.", { gradeId, studentId });
        return;
      }
      if (studentDoc.role !== "student") {
        collector.add(
          "error",
          "grade_student_wrong_role",
          "Grade references a non-student user.",
          { gradeId, studentId, actualRole: studentDoc.role }
        );
      }
    });
  });

  attendanceDocs.forEach((attendanceDoc) => {
    const attendanceId = String(attendanceDoc._id);
    const classId = toIdString(attendanceDoc.classId);
    const classDoc = classById.get(classId);
    if (!classDoc) {
      collector.add(
        "error",
        "attendance_class_missing",
        "Attendance record references a missing class.",
        { attendanceId, classId }
      );
    }

    const classStudentSet = new Set(
      (classDoc?.students || []).map((entry) => toIdString(entry?._id)).filter(Boolean)
    );
    (attendanceDoc.records || []).forEach((record) => {
      const studentId = toIdString(record?.studentId);
      const studentDoc = userById.get(studentId);
      if (!studentDoc) {
        collector.add(
          "error",
          "attendance_student_missing",
          "Attendance record contains a missing student reference.",
          { attendanceId, studentId }
        );
        return;
      }
      if (studentDoc.role !== "student") {
        collector.add(
          "error",
          "attendance_student_wrong_role",
          "Attendance record contains a non-student user reference.",
          { attendanceId, studentId, actualRole: studentDoc.role }
        );
      }
      if (classDoc && !classStudentSet.has(studentId)) {
        collector.add(
          "warning",
          "attendance_student_not_in_class",
          "Attendance record includes a student not listed in the class roster.",
          { attendanceId, classId, studentId, studentName: toName(studentDoc) }
        );
      }
    });
  });

  missions.forEach((missionDoc) => {
    const missionId = String(missionDoc._id);
    const rankKey = String(missionDoc.rank || "").trim().toUpperCase();
    if (!VALID_RANKS.has(rankKey)) {
      collector.add("error", "mission_rank_invalid", "Mission has an invalid rank key.", {
        missionId,
        rank: missionDoc.rank
      });
    }

    const creatorId = toIdString(missionDoc?.createdBy?._id);
    const creatorDoc = userById.get(creatorId);
    if (!creatorDoc) {
      collector.add("error", "mission_creator_missing", "Mission creator does not exist in school users.", {
        missionId,
        creatorId
      });
    } else if (creatorDoc.role !== "teacher") {
      collector.add("error", "mission_creator_wrong_role", "Mission creator is not a teacher.", {
        missionId,
        creatorId,
        actualRole: creatorDoc.role
      });
    }

    const classAssignments = Array.isArray(missionDoc?.assignedTo?.classInfo)
      ? missionDoc.assignedTo.classInfo
      : [];
    classAssignments.forEach((classRef) => {
      const classId = toIdString(classRef);
      if (!classId) return;
      if (!classById.has(classId)) {
        collector.add("error", "mission_assigned_class_missing", "Mission references a missing assigned class.", {
          missionId,
          classId
        });
      }
    });

    const studentAssignments = Array.isArray(missionDoc?.assignedTo?.studentInfo)
      ? missionDoc.assignedTo.studentInfo
      : [];
    studentAssignments.forEach((studentRef) => {
      const studentId = toIdString(studentRef);
      if (!studentId) return;
      const studentDoc = userById.get(studentId);
      if (!studentDoc) {
        collector.add(
          "error",
          "mission_assigned_student_missing",
          "Mission assigned student reference points to missing user.",
          { missionId, studentId }
        );
        return;
      }
      if (studentDoc.role !== "student") {
        collector.add(
          "error",
          "mission_assigned_student_wrong_role",
          "Mission assigned student reference points to non-student user.",
          { missionId, studentId, actualRole: studentDoc.role }
        );
      }
    });

    const activeRows = Array.isArray(missionDoc?.active?.studentInfo) ? missionDoc.active.studentInfo : [];
    activeRows.forEach((entry) => {
      const studentId = toIdString(entry?._id);
      if (!studentId) return;
      const studentDoc = userById.get(studentId);
      if (!studentDoc) {
        collector.add(
          "error",
          "mission_active_student_missing",
          "Mission activity row references a missing student.",
          { missionId, studentId }
        );
        return;
      }
      if (studentDoc.role !== "student") {
        collector.add(
          "error",
          "mission_active_student_wrong_role",
          "Mission activity row references a non-student user.",
          { missionId, studentId, actualRole: studentDoc.role }
        );
      }
    });
  });

  if (!classes.length) {
    collector.add(
      "warning",
      "school_without_classes",
      "School has no classes yet. Student/teacher pages will stay mostly empty until classes are created.",
      { schoolId: String(schoolId), schoolName: schoolDoc?.schoolName || "School" }
    );
  }
  if (!announcements.length) {
    collector.add(
      "info",
      "school_without_announcements",
      "No published announcements detected. Student/parent update feeds may appear empty.",
      { schoolId: String(schoolId), schoolName: schoolDoc?.schoolName || "School" }
    );
  }

  return {
    school: {
      id: String(schoolId),
      name: schoolDoc?.schoolName || "School",
      email: schoolDoc?.schoolEmail || ""
    },
    totals: {
      users: users.length,
      students: students.length,
      teachers: teachers.length,
      parents: parents.length,
      classes: classes.length,
      grades: grades.length,
      attendance: attendanceDocs.length,
      missions: missions.length,
      announcements: announcements.length
    },
    issues: collector.issues
  };
}

async function run() {
  const options = parseArgs(process.argv);
  const dbString = process.env.DB_STRING || process.argv[2];
  if (!dbString) {
    throw new Error("DB_STRING is required. Set DB_STRING env var or pass it as argv[2].");
  }

  await mongoose.connect(dbString);

  try {
    const schools = await School.find({}).select("_id schoolName schoolEmail").lean();
    if (!schools.length) {
      console.log("No schools found. Real-data readiness check has nothing to validate.");
      return;
    }

    const schoolReports = [];
    for (const schoolDoc of schools) {
      const report = await runSchoolAudit(schoolDoc);
      schoolReports.push(report);
    }

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfo = 0;

    schoolReports.forEach((report) => {
      const issueCounts = summarizeIssues(report.issues);
      totalErrors += issueCounts.errors;
      totalWarnings += issueCounts.warnings;
      totalInfo += issueCounts.info;

      console.log(`\nSchool: ${report.school.name} (${report.school.id})`);
      console.log(
        `  Totals: users=${report.totals.users}, students=${report.totals.students}, teachers=${report.totals.teachers}, parents=${report.totals.parents}, classes=${report.totals.classes}, grades=${report.totals.grades}, attendance=${report.totals.attendance}, missions=${report.totals.missions}, announcements=${report.totals.announcements}`
      );
      console.log(`  Issues: errors=${issueCounts.errors}, warnings=${issueCounts.warnings}, info=${issueCounts.info}`);

      report.issues.slice(0, 30).forEach((issue) => {
        console.log(`    [${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}`);
      });
      if (report.issues.length > 30) {
        console.log(`    ... ${report.issues.length - 30} additional issue(s) truncated`);
      }
    });

    console.log("\nReadiness summary:");
    console.log(`  Errors: ${totalErrors}`);
    console.log(`  Warnings: ${totalWarnings}`);
    console.log(`  Info: ${totalInfo}`);
    console.log(`  Strict mode: ${options.strict ? "enabled" : "disabled"}`);

    if (totalErrors > 0 || (options.strict && totalWarnings > 0)) {
      process.exitCode = 1;
      return;
    }

    console.log("Real-data readiness check passed.");
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Real-data readiness check failed:", err.message);
  process.exit(1);
});
