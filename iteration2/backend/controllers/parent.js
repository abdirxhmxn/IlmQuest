const User = require("../models/User");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const Mission = require("../models/Missions");
const ReportActivity = require("../models/ReportActivity");
const { scopedIdQuery, scopedQuery } = require("../utils/tenant");
const { renderStudentReportLatex, compileLatexToPdf, normalizeJobName } = require("../utils/latexReports");
const { getLinkedStudentsForParent, buildDisplayName } = require("../utils/parentLinks");
const { buildStudentProgressViewModel } = require("../utils/studentProgress");
const { getVisibleAnnouncementsForUser, toAnnouncementViewModel } = require("../utils/announcements");

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function toPercentLabel(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return `${number.toFixed(digits)}%`;
}

function toPercentOrBlank(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${number.toFixed(digits)}%`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function inferSubjectSlot(rawSubjectName = "") {
  const name = String(rawSubjectName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return null;
  if (/(qur|quran|hifdh|memorization)/.test(name)) return "quran";
  if (/(tajweed|tajwid|subac)/.test(name)) return "subac";
  if (/(islamic|fiqh|seerah|aqidah|hadith)/.test(name)) return "islamicStudies";
  if (/(writing|composition|arabic writing)/.test(name)) return "writing";
  if (/(character|akhlaq|adab|behavior|behaviour|conduct)/.test(name)) return "character";
  return null;
}

function summarizeAttendanceForStudent(attendanceDocs, studentId) {
  const presentStatuses = new Set(["Present", "Late", "Excused"]);
  const ignoredStatuses = new Set(["Holiday", "Weather"]);

  let presentCount = 0;
  let totalCount = 0;
  let absences = 0;
  let excused = 0;
  let late = 0;
  const recentRows = [];

  attendanceDocs
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((doc) => {
      const record = (doc.records || []).find((entry) => toIdString(entry.studentId) === String(studentId));
      if (!record) return;
      const status = String(record.status || "");
      if (!status || ignoredStatuses.has(status)) return;

      totalCount += 1;
      if (presentStatuses.has(status)) presentCount += 1;
      if (status === "Absent") absences += 1;
      if (status === "Excused") excused += 1;
      if (status === "Late") late += 1;

      if (recentRows.length < 8) {
        recentRows.push({
          date: doc.date,
          dateLabel: formatDate(doc.date),
          className: doc.className || "Class",
          status
        });
      }
    });

  const attendanceRate = totalCount > 0 ? (presentCount / totalCount) * 100 : null;
  return {
    attendanceRate,
    absences,
    excused,
    late,
    totalCount,
    recentRows
  };
}

function summarizeGradesForStudent(grades, studentId) {
  let totalPercent = 0;
  let gradeCount = 0;
  const bySubject = new Map();
  const recent = [];

  grades
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((grade) => {
      const hasStudent = (grade.students || []).some((student) => toIdString(student._id) === String(studentId));
      if (!hasStudent) return;

      const score = Number(grade?.Assignment?.grade || 0);
      const maxScore = Number(grade?.Assignment?.maxScore || 100);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

      const percent = (score / maxScore) * 100;
      totalPercent += percent;
      gradeCount += 1;

      const subjectLabel = String(
        grade.subjectLabel || grade.subject || grade.gradingContext?.subject?.label || "Subject"
      ).trim() || "Subject";

      const agg = bySubject.get(subjectLabel) || {
        subject: subjectLabel,
        sum: 0,
        count: 0,
        latestComment: "",
        latestUpdatedAt: null
      };
      agg.sum += percent;
      agg.count += 1;

      const comment = String(grade?.feedback?.content || "").trim();
      const updatedAt = new Date(grade.updatedAt || grade.createdAt || Date.now());
      if (comment && (!agg.latestUpdatedAt || updatedAt > agg.latestUpdatedAt)) {
        agg.latestComment = comment;
        agg.latestUpdatedAt = updatedAt;
      }
      bySubject.set(subjectLabel, agg);

      if (recent.length < 10) {
        recent.push({
          assignment: grade?.Assignment?.name || "Assessment",
          subject: subjectLabel,
          score,
          maxScore,
          percent,
          comment,
          updatedAt: grade.updatedAt || grade.createdAt,
          updatedAtLabel: formatDate(grade.updatedAt || grade.createdAt)
        });
      }
    });

  const subjectRows = Array.from(bySubject.values())
    .map((entry) => ({
      subject: entry.subject,
      averagePercent: entry.count > 0 ? entry.sum / entry.count : null,
      averageLabel: toPercentLabel(entry.count > 0 ? entry.sum / entry.count : null),
      teacherComment: entry.latestComment || ""
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return {
    overallAverage: gradeCount > 0 ? totalPercent / gradeCount : null,
    overallLabel: toPercentLabel(gradeCount > 0 ? totalPercent / gradeCount : null),
    gradeCount,
    subjectRows,
    recent
  };
}

function summarizeSubjectsForClassReport(grades) {
  const slots = {
    quran: { sum: 0, count: 0, comments: [] },
    subac: { sum: 0, count: 0, comments: [] },
    islamicStudies: { sum: 0, count: 0, comments: [] },
    writing: { sum: 0, count: 0, comments: [] },
    character: { sum: 0, count: 0, comments: [] }
  };

  grades.forEach((grade) => {
    const score = Number(grade?.Assignment?.grade || 0);
    const maxScore = Number(grade?.Assignment?.maxScore || 100);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

    const subjectName = grade?.subjectLabel || grade?.subject || grade?.Assignment?.type || "";
    const slot = inferSubjectSlot(subjectName);
    if (!slot || !slots[slot]) return;

    const percent = (score / maxScore) * 100;
    slots[slot].sum += percent;
    slots[slot].count += 1;

    const comment = String(grade?.feedback?.content || "").trim();
    if (comment) slots[slot].comments.push(comment);
  });

  const summarized = {};
  Object.entries(slots).forEach(([slot, value]) => {
    const avg = value.count > 0 ? value.sum / value.count : null;
    summarized[slot] = {
      grade: toPercentOrBlank(avg),
      comment: value.comments.slice(0, 2).join(" | ")
    };
  });

  return summarized;
}

function normalizeMissionStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["complete", "completed", "done"].includes(normalized)) return "Completed";
  if (["started", "in_progress", "in progress"].includes(normalized)) return "Started";
  return "Assigned";
}

function summarizeMissionsForStudent(missionDocs = [], studentId = "") {
  const rows = [];
  let assigned = 0;
  let started = 0;
  let completed = 0;

  missionDocs
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .forEach((mission) => {
      const activity = (mission?.active?.studentInfo || []).find((entry) => toIdString(entry?._id) === String(studentId));
      const directlyAssigned = (mission?.assignedTo?.studentInfo || []).some(
        (entry) => toIdString(entry?._id || entry) === String(studentId)
      );
      if (!activity && !directlyAssigned) return;

      const status = normalizeMissionStatus(activity?.status);
      if (status === "Completed") completed += 1;
      else if (status === "Started") started += 1;
      else assigned += 1;

      if (rows.length < 12) {
        rows.push({
          title: mission?.title || "Mission",
          type: mission?.type || "General",
          category: mission?.category || "Solo",
          pointsXP: Number(mission?.pointsXP || 0),
          dueDateLabel: mission?.dueDate ? formatDate(mission.dueDate) : "No due date",
          status,
          updatedAtLabel: formatDate(mission?.updatedAt || mission?.createdAt || new Date())
        });
      }
    });

  const total = assigned + started + completed;
  const completionRate = total > 0 ? (completed / total) * 100 : null;
  return {
    total,
    assigned,
    started,
    completed,
    completionRate,
    completionRateLabel: toPercentLabel(completionRate),
    rows
  };
}

function computeChildStatusChip(summary) {
  const avg = Number.isFinite(summary?.overallAverage)
    ? Number(summary.overallAverage)
    : null;
  const attendance = Number.isFinite(summary?.attendanceRate)
    ? Number(summary.attendanceRate)
    : null;
  if (avg != null && avg < 70) return { label: "Needs Attention", tone: "danger" };
  if (attendance != null && attendance < 80) return { label: "Attendance Alert", tone: "warning" };
  if (Number.isFinite(avg) && avg >= 85 && Number.isFinite(attendance) && attendance >= 90) {
    return { label: "On Track", tone: "success" };
  }
  return { label: "In Progress", tone: "neutral" };
}

function buildReportErrorMessage(err) {
  if (err?.code === "LATEX_COMPILER_MISSING") {
    return "PDF compiler not available on this server. Install pdflatex (TeX Live).";
  }
  if (err?.code === "LATEX_CLASS_MISSING") {
    return "The report class file is missing on the server. Contact engineering support.";
  }
  return "Could not generate the report PDF.";
}

function pdfFileName(prefix, studentName) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${normalizeJobName(`${prefix}-${studentName}`)}-${stamp}.pdf`;
}

async function buildParentPortalViewModel(req, options = {}) {
  const parent = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
  if (!parent) return null;

  const linkedStudents = await getLinkedStudentsForParent(req, parent);
  const childIds = linkedStudents.map((student) => student._id);
  const childIdSet = new Set(childIds.map((id) => String(id)));

  const selectedChildIdRaw = options.selectedChildId || req.query.childId;
  const invalidSelectedChildId = Boolean(selectedChildIdRaw) && !childIdSet.has(String(selectedChildIdRaw));
  let selectedChildId = selectedChildIdRaw && childIdSet.has(String(selectedChildIdRaw))
    ? String(selectedChildIdRaw)
    : childIds.length
      ? String(childIds[0])
      : null;

  const [classDocs, gradeDocs, attendanceDocs, missionDocs, reportDocs, parentAnnouncementsRaw] = await Promise.all([
    childIds.length
      ? Class.find(scopedQuery(req, { "students._id": { $in: childIds } })).lean()
      : [],
    childIds.length
      ? Grade.find(scopedQuery(req, { "students._id": { $in: childIds } })).sort({ createdAt: -1 }).lean()
      : [],
    childIds.length
      ? Attendance.find(scopedQuery(req, { "records.studentId": { $in: childIds } })).sort({ date: -1 }).lean()
      : [],
    childIds.length
      ? Mission.find(
        scopedQuery(req, {
          $or: [
            { "active.studentInfo._id": { $in: childIds } },
            { "assignedTo.studentInfo": { $in: childIds } }
          ]
        })
      )
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean()
      : [],
    childIds.length
      ? ReportActivity.find(
        scopedQuery(req, {
          reportType: "student",
          "target._id": { $in: childIds }
        })
      )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
      : [],
    getVisibleAnnouncementsForUser(req, parent, { limit: 10 })
  ]);

  const classById = new Map(
    classDocs.map((classDoc) => [String(classDoc?._id || ""), classDoc])
  );
  const classByStudentId = new Map();
  classDocs.forEach((classDoc) => {
    (classDoc.students || []).forEach((entry) => {
      classByStudentId.set(String(entry._id), classDoc);
    });
  });

  const gradesByStudentId = new Map();
  const attendanceByStudentId = new Map();
  const missionsByStudentId = new Map();

  linkedStudents.forEach((child) => {
    gradesByStudentId.set(String(child._id), []);
    attendanceByStudentId.set(String(child._id), []);
    missionsByStudentId.set(String(child._id), []);
  });

  gradeDocs.forEach((grade) => {
    (grade.students || []).forEach((studentRef) => {
      const id = String(studentRef._id);
      if (!gradesByStudentId.has(id)) return;
      gradesByStudentId.get(id).push(grade);
    });
  });

  attendanceDocs.forEach((doc) => {
    (doc.records || []).forEach((record) => {
      const id = String(record.studentId);
      if (!attendanceByStudentId.has(id)) return;
      attendanceByStudentId.get(id).push({
        ...doc,
        records: [record]
      });
    });
  });

  missionDocs.forEach((mission) => {
    const linkedMissionStudentIds = new Set();

    (mission?.active?.studentInfo || []).forEach((entry) => {
      const id = String(entry?._id || "");
      if (!missionsByStudentId.has(id)) return;
      linkedMissionStudentIds.add(id);
    });

    (mission?.assignedTo?.studentInfo || []).forEach((entry) => {
      const id = String((entry && entry._id) ? entry._id : entry || "");
      if (!missionsByStudentId.has(id)) return;
      linkedMissionStudentIds.add(id);
    });

    linkedMissionStudentIds.forEach((id) => {
      missionsByStudentId.get(id).push(mission);
    });
  });

  const childSummaries = linkedStudents.map((child) => {
    const childId = String(child._id);
    const childGrades = gradesByStudentId.get(childId) || [];
    const childAttendance = attendanceByStudentId.get(childId) || [];
    const childMissions = missionsByStudentId.get(childId) || [];
    const preferredClassId = String(child?.studentInfo?.classId || "").trim();
    const classDoc = (preferredClassId && classById.get(preferredClassId)) || classByStudentId.get(childId);

    const gradeSummary = summarizeGradesForStudent(childGrades, childId);
    const attendanceSummary = summarizeAttendanceForStudent(childAttendance, childId);
    const missionSummary = summarizeMissionsForStudent(childMissions, childId);
    const statusChip = computeChildStatusChip({
      overallAverage: gradeSummary.overallAverage,
      attendanceRate: attendanceSummary.attendanceRate
    });

    return {
      childId,
      fullName: buildDisplayName(child),
      gradeLevel: child?.studentInfo?.gradeLevel || "N/A",
      programType: child?.studentInfo?.programType || "N/A",
      className: classDoc?.className || "Unassigned",
      teacherNames: (classDoc?.teachers || []).map((teacher) => teacher.name).filter(Boolean).join(", ") || "N/A",
      overallAverage: gradeSummary.overallAverage,
      overallAverageLabel: gradeSummary.overallLabel,
      attendanceRate: attendanceSummary.attendanceRate,
      attendanceRateLabel: toPercentLabel(attendanceSummary.attendanceRate),
      gradeCount: gradeSummary.gradeCount,
      missionCount: missionSummary.total,
      missionCompleted: missionSummary.completed,
      missionCompletionLabel: missionSummary.completionRateLabel,
      statusChip
    };
  }).sort((a, b) => String(a?.fullName || "").localeCompare(String(b?.fullName || "")));

  if (!selectedChildIdRaw && childSummaries.length > 0) {
    selectedChildId = String(childSummaries[0].childId || selectedChildId || "");
  }

  const selectedChild = childSummaries.find((entry) => entry.childId === selectedChildId) || null;
  const selectedChildGrades = selectedChildId ? (gradesByStudentId.get(selectedChildId) || []) : [];
  const selectedChildAttendance = selectedChildId ? (attendanceByStudentId.get(selectedChildId) || []) : [];
  const selectedChildMissions = selectedChildId ? (missionsByStudentId.get(selectedChildId) || []) : [];

  const selectedGradesSummary = summarizeGradesForStudent(selectedChildGrades, selectedChildId);
  const selectedAttendanceSummary = summarizeAttendanceForStudent(selectedChildAttendance, selectedChildId);
  const selectedMissionsSummary = summarizeMissionsForStudent(selectedChildMissions, selectedChildId);

  const finiteGradeValues = childSummaries
    .map((entry) => Number(entry.overallAverage))
    .filter((value) => Number.isFinite(value));
  const finiteAttendanceValues = childSummaries
    .map((entry) => Number(entry.attendanceRate))
    .filter((value) => Number.isFinite(value));

  const totalMissionAssigned = childSummaries.reduce((sum, entry) => sum + Number(entry.missionCount || 0), 0);
  const totalMissionCompleted = childSummaries.reduce((sum, entry) => sum + Number(entry.missionCompleted || 0), 0);

  const familySnapshot = {
    averageGrade: finiteGradeValues.length
      ? finiteGradeValues.reduce((sum, value) => sum + value, 0) / finiteGradeValues.length
      : null,
    averageAttendance: finiteAttendanceValues.length
      ? finiteAttendanceValues.reduce((sum, value) => sum + value, 0) / finiteAttendanceValues.length
      : null,
    missionAssigned: totalMissionAssigned,
    missionCompleted: totalMissionCompleted
  };

  const recentReports = reportDocs.map((entry) => ({
    studentId: String(entry?.target?._id || ""),
    studentName: entry?.target?.name || "Student",
    generatedAt: entry.createdAt,
    generatedAtLabel: formatDateTime(entry.createdAt),
    fileName: entry.fileName || ""
  }));

  const selectedStudentDoc = linkedStudents.find((entry) => String(entry._id) === String(selectedChildId)) || null;
  const announcements = parentAnnouncementsRaw.map((announcement) =>
    toAnnouncementViewModel(announcement)
  );

  return {
    parent,
    linkedStudents,
    invalidSelectedChildId,
    selectedChildId,
    selectedStudentDoc,
    childSummaries,
    selectedChild,
    selectedGradesSummary,
    selectedAttendanceSummary,
    selectedMissionsSummary,
    familySnapshot,
    recentReports,
    announcements
  };
}

async function buildStudentReportPayloadForParent(req, parentDoc, studentDoc) {
  const [classDocs, gradeDocs, attendanceDocs] = await Promise.all([
    Class.find(scopedQuery(req, { "students._id": studentDoc._id })).lean(),
    Grade.find(scopedQuery(req, { "students._id": studentDoc._id })).sort({ createdAt: -1 }).lean(),
    Attendance.find(scopedQuery(req, { "records.studentId": studentDoc._id })).sort({ date: -1 }).lean()
  ]);

  const primaryClass = classDocs[0] || null;
  const teacherName = (primaryClass?.teachers || []).map((entry) => entry.name).filter(Boolean).join(", ");
  const gradeSummary = summarizeGradesForStudent(gradeDocs, studentDoc._id);
  const attendanceSummary = summarizeAttendanceForStudent(attendanceDocs, studentDoc._id);
  const subjectSummary = summarizeSubjectsForClassReport(gradeDocs);
  const parentName = buildDisplayName(parentDoc);

  return {
    studentName: buildDisplayName(studentDoc),
    institution: "Al Bayaan Institute",
    department: "",
    program: studentDoc?.studentInfo?.programType || primaryClass?.programType || "",
    semester: primaryClass?.academicYear?.semester || "",
    teacher: teacherName,
    rank: "",
    finalGrade: toPercentOrBlank(gradeSummary.overallAverage),
    reportDate: formatDate(new Date()),
    reportTitle: "Student Progress Report",
    gradeLevel: studentDoc?.studentInfo?.gradeLevel || "",
    studentId: studentDoc?.studentInfo?.studentNumber ? String(studentDoc.studentInfo.studentNumber) : "",
    parentName,
    attendancePct: toPercentOrBlank(attendanceSummary.attendanceRate),
    absences: String(attendanceSummary.absences || 0),
    excusedAbsences: String(attendanceSummary.excused || 0),
    late: String(attendanceSummary.late || 0),
    earlyPickup: "",
    quranLabel: "Qur'an Memorization",
    subacLabel: "Tajweed",
    islamicStudiesLabel: "Islamic Studies",
    writingLabel: "Writing",
    characterLabel: "Akhlaq / Character",
    quranGrade: subjectSummary.quran.grade,
    subacGrade: subjectSummary.subac.grade,
    islamicStudiesGrade: subjectSummary.islamicStudies.grade,
    writingGrade: subjectSummary.writing.grade,
    characterGrade: subjectSummary.character.grade,
    quranComment: subjectSummary.quran.comment,
    subacComment: subjectSummary.subac.comment,
    islamicStudiesComment: subjectSummary.islamicStudies.comment,
    writingComment: subjectSummary.writing.comment,
    characterComment: subjectSummary.character.comment,
    logoPath: "logo.jpg"
  };
}

module.exports = {
  getDashboard: async (req, res) => {
    try {
      const portal = await buildParentPortalViewModel(req);
      if (!portal) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/login");
      }

      if (portal.invalidSelectedChildId) {
        req.flash("errors", [{ msg: "You are not authorized for the selected child profile." }]);
        return res.redirect("/parent/home");
      }

      return res.render("parent/dashboard.ejs", {
        user: req.user,
        activePage: "dashboard",
        portal,
        messages: req.flash()
      });
    } catch (err) {
      console.error("Parent dashboard error:", err);
      return res.status(500).send("Error loading parent dashboard.");
    }
  },

  getChildDashboard: async (req, res) => {
    try {
      const parentDoc = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
      if (!parentDoc) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/parent/home");
      }

      const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
      const isLinked = linkedStudents.some((student) => String(student._id) === String(req.params.id));
      if (!isLinked) {
        req.flash("errors", [{ msg: "You are not authorized for that child profile." }]);
        return res.redirect("/parent/home");
      }

      const progress = await buildStudentProgressViewModel(req, req.params.id, {
        includeTeacherInsights: false
      });
      if (!progress) {
        req.flash("errors", [{ msg: "Child progress profile could not be loaded." }]);
        return res.redirect("/parent/home");
      }

      const relationshipEntry = (parentDoc?.parentInfo?.children || []).find(
        (entry) => String(entry?.childID || "") === String(req.params.id)
      );

      return res.render("parent/childProgress.ejs", {
        user: req.user,
        activePage: "children",
        progress,
        relationshipLabel: String(relationshipEntry?.relationship || "Guardian"),
        messages: req.flash()
      });
    } catch (err) {
      console.error("Parent child route error:", err);
      req.flash("errors", [{ msg: "Unable to load child profile." }]);
      return res.redirect("/parent/home");
    }
  },

  downloadStudentReportPdf: async (req, res) => {
    try {
      const parentDoc = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
      if (!parentDoc) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/parent/home");
      }

      const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
      const student = linkedStudents.find((entry) => String(entry._id) === String(req.params.studentId));

      if (!student) {
        req.flash("errors", [{ msg: "You are not authorized to view that report." }]);
        return res.redirect("/parent/home");
      }

      const payload = await buildStudentReportPayloadForParent(req, parentDoc, student);
      const latexSource = renderStudentReportLatex(payload);
      const fileName = pdfFileName("parent-student-report", payload.studentName);
      const pdfBuffer = await compileLatexToPdf({
        latexSource,
        jobName: normalizeJobName(`parent-student-report-${payload.studentName}`)
      });

      await ReportActivity.create({
        schoolId: req.schoolId,
        reportType: "student",
        generatedBy: {
          _id: req.user._id,
          name: buildDisplayName(req.user)
        },
        target: {
          _id: student._id,
          name: buildDisplayName(student)
        },
        fileName
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(pdfBuffer);
    } catch (err) {
      console.error("Parent report generation failed:", err?.details || err);
      req.flash("errors", [{ msg: buildReportErrorMessage(err) }]);
      return res.redirect("/parent/home");
    }
  }
};
