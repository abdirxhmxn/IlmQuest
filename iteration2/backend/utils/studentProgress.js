const User = require("../models/User");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const Mission = require("../models/Missions");
const { scopedIdQuery, scopedQuery } = require("./tenant");
const { buildDisplayName } = require("./parentLinks");
const { buildRankSummaryFromUser } = require("./ranks");

const ATTENDANCE_COUNTED_STATUSES = new Set(["Present", "Absent", "Late", "Excused"]);
const ATTENDANCE_PRESENT_STATUSES = new Set(["Present", "Late", "Excused"]);

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function toDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateLabel(value) {
  const parsed = toDate(value);
  if (!parsed) return "N/A";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTimeLabel(value) {
  const parsed = toDate(value);
  if (!parsed) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toPercentLabel(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return `${number.toFixed(digits)}%`;
}

function resolvePrimaryClass(studentDoc, classDocs = [], preferredClassId = "") {
  const preferred = String(preferredClassId || "").trim();
  if (preferred) {
    const preferredMatch = classDocs.find((entry) => String(entry._id) === preferred);
    if (preferredMatch) return preferredMatch;
  }

  const fromStudentProfile = String(studentDoc?.studentInfo?.classId || "").trim();
  if (fromStudentProfile) {
    const profileMatch = classDocs.find((entry) => String(entry._id) === fromStudentProfile);
    if (profileMatch) return profileMatch;
  }

  return classDocs[0] || null;
}

function summarizeGradesForStudent(gradeDocs = [], studentId = "") {
  const studentIdString = String(studentId || "");
  const subjectMap = new Map();
  const categoryMap = new Map();
  const recentEntries = [];
  let totalPercent = 0;
  let totalCount = 0;

  [...gradeDocs]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .forEach((grade) => {
      const hasStudent = (grade.students || []).some((entry) => toIdString(entry?._id) === studentIdString);
      if (!hasStudent) return;

      const score = Number(grade?.Assignment?.grade);
      const maxScore = Number(grade?.Assignment?.maxScore || 100);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

      const percent = (score / maxScore) * 100;
      const subjectLabel = String(
        grade.subjectLabel
        || grade.gradingContext?.subject?.label
        || grade.subject
        || "Subject"
      ).trim() || "Subject";
      const categoryLabel = String(
        grade?.Assignment?.categoryLabel
        || grade?.gradingContext?.category?.label
        || grade?.Assignment?.type
        || "General"
      ).trim() || "General";

      totalPercent += percent;
      totalCount += 1;

      const subjectAgg = subjectMap.get(subjectLabel) || { subject: subjectLabel, sum: 0, count: 0 };
      subjectAgg.sum += percent;
      subjectAgg.count += 1;
      subjectMap.set(subjectLabel, subjectAgg);

      const categoryAgg = categoryMap.get(categoryLabel) || { category: categoryLabel, sum: 0, count: 0 };
      categoryAgg.sum += percent;
      categoryAgg.count += 1;
      categoryMap.set(categoryLabel, categoryAgg);

      if (recentEntries.length < 15) {
        const feedback = typeof grade?.feedback === "string"
          ? grade.feedback
          : String(grade?.feedback?.content || "").trim();
        const updatedAt = grade.updatedAt || grade.createdAt || new Date();
        recentEntries.push({
          assignment: String(grade?.Assignment?.name || "Assessment"),
          subject: subjectLabel,
          category: categoryLabel,
          quarter: String(grade?.quarter || "").trim() || "N/A",
          score,
          maxScore,
          percent,
          feedback,
          updatedAt,
          updatedAtLabel: formatDateLabel(updatedAt)
        });
      }
    });

  const bySubject = Array.from(subjectMap.values())
    .map((entry) => ({
      subject: entry.subject,
      count: entry.count,
      averagePercent: entry.count ? entry.sum / entry.count : null,
      averageLabel: toPercentLabel(entry.count ? entry.sum / entry.count : null)
    }))
    .sort((a, b) => String(a.subject || "").localeCompare(String(b.subject || "")));

  const byCategory = Array.from(categoryMap.values())
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      averagePercent: entry.count ? entry.sum / entry.count : null,
      averageLabel: toPercentLabel(entry.count ? entry.sum / entry.count : null)
    }))
    .sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")));

  const overallAverage = totalCount ? totalPercent / totalCount : null;

  return {
    overallAverage,
    overallAverageLabel: toPercentLabel(overallAverage),
    totalEntries: totalCount,
    bySubject,
    byCategory,
    recentEntries
  };
}

function summarizeAttendanceForStudent(attendanceDocs = [], studentId = "") {
  const studentIdString = String(studentId || "");
  const recentRows = [];
  const monthlyTracker = new Map();

  let totalCount = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  [...attendanceDocs]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .forEach((attendanceDoc) => {
      const record = (attendanceDoc.records || []).find(
        (entry) => toIdString(entry?.studentId) === studentIdString
      );
      if (!record) return;

      const rawStatus = String(record.status || "").trim();
      const counted = ATTENDANCE_COUNTED_STATUSES.has(rawStatus);

      if (counted) {
        totalCount += 1;
        if (ATTENDANCE_PRESENT_STATUSES.has(rawStatus)) presentCount += 1;
        if (rawStatus === "Absent") absentCount += 1;
        if (rawStatus === "Late") lateCount += 1;
        if (rawStatus === "Excused") excusedCount += 1;

        const monthDate = toDate(attendanceDoc.date);
        if (monthDate) {
          const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
          const monthAgg = monthlyTracker.get(key) || {
            key,
            label: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
            present: 0,
            total: 0
          };
          monthAgg.total += 1;
          if (ATTENDANCE_PRESENT_STATUSES.has(rawStatus)) monthAgg.present += 1;
          monthlyTracker.set(key, monthAgg);
        }
      }

      if (recentRows.length < 16) {
        recentRows.push({
          date: attendanceDoc.date,
          dateLabel: formatDateLabel(attendanceDoc.date),
          className: attendanceDoc.className || "Class",
          status: rawStatus || "N/A",
          recordedBy: attendanceDoc?.recordedBy?.name || ""
        });
      }
    });

  const monthlyTrend = Array.from(monthlyTracker.values())
    .sort((a, b) => String(b.key).localeCompare(String(a.key)))
    .slice(0, 6)
    .map((entry) => ({
      label: entry.label,
      rate: entry.total ? (entry.present / entry.total) * 100 : null,
      rateLabel: toPercentLabel(entry.total ? (entry.present / entry.total) * 100 : null, 0),
      present: entry.present,
      total: entry.total
    }));

  const attendanceRate = totalCount ? (presentCount / totalCount) * 100 : null;
  return {
    totalCount,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendanceRate,
    attendanceRateLabel: toPercentLabel(attendanceRate),
    recentRows,
    monthlyTrend
  };
}

function normalizeMissionStatus(rawStatus = "", hasActivity = false) {
  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (/(complete|completed|done)/.test(normalized)) return { key: "completed", label: "Completed" };
  if (/(pending|review|approval|await)/.test(normalized)) return { key: "pending", label: "Pending Review" };
  if (/(reject|rejected|declined)/.test(normalized)) return { key: "rejected", label: "Rejected" };
  if (/(start|in_progress|in progress|active)/.test(normalized)) return { key: "active", label: "Active" };
  if (hasActivity) return { key: "active", label: "Active" };
  return { key: "assigned", label: "Assigned" };
}

function summarizeMissionsForStudent(missionDocs = [], studentId = "", classIds = []) {
  const studentIdString = String(studentId || "");
  const classIdSet = new Set((Array.isArray(classIds) ? classIds : []).map((entry) => String(entry)));
  const recentRows = [];
  const counts = {
    assigned: 0,
    active: 0,
    pending: 0,
    rejected: 0,
    completed: 0
  };

  [...missionDocs]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .forEach((mission) => {
      const activity = (mission?.active?.studentInfo || []).find(
        (entry) => toIdString(entry?._id) === studentIdString
      );
      const directAssignment = (mission?.assignedTo?.studentInfo || []).some(
        (entry) => toIdString(entry?._id || entry) === studentIdString
      );
      const classAssignment = (mission?.assignedTo?.classInfo || []).some(
        (entry) => classIdSet.has(toIdString(entry))
      );

      if (!activity && !directAssignment && !classAssignment) return;

      const statusInfo = normalizeMissionStatus(activity?.status, Boolean(activity));
      counts[statusInfo.key] = Number(counts[statusInfo.key] || 0) + 1;

      if (recentRows.length < 20) {
        const updatedAt = mission.updatedAt || mission.createdAt || new Date();
        recentRows.push({
          title: mission?.title || "Mission",
          type: mission?.type || "General",
          category: mission?.category || "Solo",
          rank: mission?.rank || "F",
          pointsXP: Number(mission?.pointsXP || 0),
          dueDate: mission?.dueDate || null,
          dueDateLabel: mission?.dueDate ? formatDateLabel(mission.dueDate) : "No due date",
          statusKey: statusInfo.key,
          statusLabel: statusInfo.label,
          updatedAt,
          updatedAtLabel: formatDateTimeLabel(updatedAt)
        });
      }
    });

  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const completionRate = total ? (Number(counts.completed || 0) / total) * 100 : null;

  return {
    total,
    completionRate,
    completionRateLabel: toPercentLabel(completionRate),
    counts,
    recentRows
  };
}

function buildRecentActivitySummary(gradeSummary, attendanceSummary, missionSummary) {
  const events = [];

  (gradeSummary?.recentEntries || []).slice(0, 6).forEach((entry) => {
    events.push({
      type: "Grade",
      title: entry.assignment || "Assessment",
      detail: `${entry.subject} · ${entry.score}/${entry.maxScore} (${entry.percent.toFixed(1)}%)`,
      at: entry.updatedAt,
      atLabel: formatDateTimeLabel(entry.updatedAt),
      tone: "academic"
    });
  });

  (attendanceSummary?.recentRows || []).slice(0, 6).forEach((entry) => {
    events.push({
      type: "Attendance",
      title: entry.status,
      detail: `${entry.className} · ${entry.dateLabel}`,
      at: entry.date,
      atLabel: formatDateTimeLabel(entry.date),
      tone: "attendance"
    });
  });

  (missionSummary?.recentRows || []).slice(0, 6).forEach((entry) => {
    events.push({
      type: "Mission",
      title: entry.title,
      detail: `${entry.statusLabel} · +${entry.pointsXP} XP`,
      at: entry.updatedAt,
      atLabel: formatDateTimeLabel(entry.updatedAt),
      tone: "mission"
    });
  });

  return events
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, 12);
}

function derivePerformanceStatus({ gradeAverage, attendanceRate }) {
  const grade = Number(gradeAverage);
  const attendance = Number(attendanceRate);

  if (Number.isFinite(grade) && Number.isFinite(attendance) && grade >= 85 && attendance >= 90) {
    return { label: "On Track", tone: "success" };
  }
  if ((Number.isFinite(grade) && grade < 70) || (Number.isFinite(attendance) && attendance < 80)) {
    return { label: "Needs Attention", tone: "danger" };
  }
  return { label: "In Progress", tone: "neutral" };
}

function buildTeacherInsights(viewModel) {
  const insights = {
    strengths: [],
    concerns: [],
    nextSteps: [],
    internalObservations: []
  };

  const gradeAverage = Number(viewModel?.grades?.overallAverage);
  const attendanceRate = Number(viewModel?.attendance?.attendanceRate);
  const missionCompletion = Number(viewModel?.missions?.completionRate);

  if (Number.isFinite(gradeAverage) && gradeAverage >= 90) {
    insights.strengths.push("Strong academic consistency across assessments.");
  }
  if (Number.isFinite(attendanceRate) && attendanceRate >= 95) {
    insights.strengths.push("Excellent attendance pattern with high classroom presence.");
  }
  if (Number.isFinite(missionCompletion) && missionCompletion >= 70) {
    insights.strengths.push("Mission completion momentum is above target.");
  }

  if (Number.isFinite(gradeAverage) && gradeAverage < 70) {
    insights.concerns.push("Academic average is below benchmark and may need intervention.");
  }
  if (Number.isFinite(attendanceRate) && attendanceRate < 80) {
    insights.concerns.push("Attendance rate is below expected threshold.");
  }
  if (Number.isFinite(missionCompletion) && missionCompletion < 40) {
    insights.concerns.push("Mission completion is low; follow-up support may be needed.");
  }
  if (viewModel?.rank?.isManualOverride) {
    insights.concerns.push("Manual rank override is active; monitor XP-to-rank alignment.");
  }

  insights.nextSteps.push("Review most recent assignments and mission activity during the next check-in.");
  insights.nextSteps.push("Coordinate with family if attendance or completion trends continue to decline.");
  if (viewModel?.missions?.counts?.pending > 0) {
    insights.nextSteps.push("Resolve pending mission reviews to keep progress signals current.");
  }

  (viewModel?.grades?.recentEntries || [])
    .filter((entry) => String(entry.feedback || "").trim())
    .slice(0, 3)
    .forEach((entry) => {
      insights.internalObservations.push({
        source: `${entry.subject} · ${entry.assignment}`,
        note: String(entry.feedback || "").trim(),
        atLabel: entry.updatedAtLabel || "Recent"
      });
    });

  return insights;
}

function sortTextValue(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase();
}

function compareByLabel(a, b) {
  const left = sortTextValue(a);
  const right = sortTextValue(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function extractStudentName(studentDoc, fallbackName = "") {
  const preferred = String(buildDisplayName(studentDoc) || "").trim();
  if (preferred) return preferred;
  const fallback = String(fallbackName || "").trim();
  if (fallback) return fallback;
  return "Student";
}

function buildDirectoryMissionLookup({
  missionDocs = [],
  allowedStudentIdSet,
  classStudentIdsByClassId
}) {
  const missionStatsByStudentId = new Map();

  function ensureStudentStats(studentId) {
    const key = String(studentId || "");
    if (!key || !allowedStudentIdSet.has(key)) return null;
    if (!missionStatsByStudentId.has(key)) {
      missionStatsByStudentId.set(key, {
        assigned: 0,
        active: 0,
        pending: 0,
        rejected: 0,
        completed: 0,
        total: 0,
        completionRate: null,
        completionRateLabel: "N/A",
        earnedXP: 0
      });
    }
    return missionStatsByStudentId.get(key);
  }

  missionDocs.forEach((mission) => {
    const activityEntries = Array.isArray(mission?.active?.studentInfo)
      ? mission.active.studentInfo
      : [];
    const activityByStudentId = new Map();
    activityEntries.forEach((entry) => {
      const id = toIdString(entry?._id);
      if (!id) return;
      activityByStudentId.set(id, entry);
    });

    const targetedStudentIds = new Set();

    activityByStudentId.forEach((_, id) => {
      if (allowedStudentIdSet.has(id)) targetedStudentIds.add(id);
    });

    const directStudentAssignments = Array.isArray(mission?.assignedTo?.studentInfo)
      ? mission.assignedTo.studentInfo
      : [];
    directStudentAssignments.forEach((entry) => {
      const id = toIdString(entry);
      if (allowedStudentIdSet.has(id)) targetedStudentIds.add(id);
    });

    const assignedClassIds = Array.isArray(mission?.assignedTo?.classInfo)
      ? mission.assignedTo.classInfo
      : [];
    assignedClassIds.forEach((entry) => {
      const classId = toIdString(entry);
      if (!classId) return;
      const classStudentIds = classStudentIdsByClassId.get(classId) || [];
      classStudentIds.forEach((studentId) => {
        if (allowedStudentIdSet.has(studentId)) targetedStudentIds.add(studentId);
      });
    });

    const missionXp = Number(mission?.pointsXP || 0);
    targetedStudentIds.forEach((studentId) => {
      const stats = ensureStudentStats(studentId);
      if (!stats) return;
      const activity = activityByStudentId.get(studentId);
      const normalizedStatus = normalizeMissionStatus(activity?.status, Boolean(activity));
      const statusKey = normalizedStatus.key;

      stats[statusKey] = Number(stats[statusKey] || 0) + 1;
      stats.total += 1;
      if (statusKey === "completed" && Number.isFinite(missionXp) && missionXp > 0) {
        stats.earnedXP += missionXp;
      }
    });
  });

  missionStatsByStudentId.forEach((stats) => {
    stats.completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : null;
    stats.completionRateLabel = toPercentLabel(stats.completionRate);
  });

  return missionStatsByStudentId;
}

async function buildTeacherStudentProgressDirectoryViewModel(req, teacherId) {
  const teacherIdString = String(teacherId || "");

  const classDocs = await Class.find(scopedQuery(req, { "teachers._id": teacherIdString }))
    .select("_id className classCode students teachers")
    .lean();

  const classStudentIdsByClassId = new Map();
  const allowedStudentIdSet = new Set();

  classDocs.forEach((classDoc) => {
    const classId = String(classDoc?._id || "");
    const classStudentIds = Array.isArray(classDoc?.students)
      ? classDoc.students.map((entry) => toIdString(entry?._id)).filter(Boolean)
      : [];

    classStudentIdsByClassId.set(classId, classStudentIds);
    classStudentIds.forEach((studentId) => {
      allowedStudentIdSet.add(studentId);
    });
  });

  const allowedStudentIds = Array.from(allowedStudentIdSet);
  const classIds = classDocs.map((entry) => entry._id);

  const [studentDocs, gradeDocs, attendanceDocs, missionDocs] = await Promise.all([
    allowedStudentIds.length
      ? User.find(scopedQuery(req, { role: "student", _id: { $in: allowedStudentIds } }))
        .select(
          "_id firstName lastName userName email profileImage studentInfo points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt"
        )
        .lean()
      : [],
    allowedStudentIds.length && classIds.length
      ? Grade.find(scopedQuery(req, {
        "classInfo._id": { $in: classIds },
        "students._id": { $in: allowedStudentIds }
      }))
        .select("students Assignment classInfo")
        .lean()
      : [],
    allowedStudentIds.length && classIds.length
      ? Attendance.find(scopedQuery(req, {
        classId: { $in: classIds },
        "records.studentId": { $in: allowedStudentIds }
      }))
        .select("classId className date records")
        .lean()
      : [],
    allowedStudentIds.length
      ? Mission.find(scopedQuery(req, {
        $or: [
          { "active.studentInfo._id": { $in: allowedStudentIds } },
          { "assignedTo.studentInfo": { $in: allowedStudentIds } },
          ...(classIds.length ? [{ "assignedTo.classInfo": { $in: classIds } }] : [])
        ]
      }))
        .select("title pointsXP assignedTo active updatedAt createdAt")
        .lean()
      : []
  ]);

  const studentDocById = new Map(
    studentDocs.map((studentDoc) => [String(studentDoc._id), studentDoc])
  );

  const gradeStatsByStudentId = new Map();
  function ensureGradeStats(studentId) {
    const key = String(studentId || "");
    if (!key || !allowedStudentIdSet.has(key)) return null;
    if (!gradeStatsByStudentId.has(key)) {
      gradeStatsByStudentId.set(key, { sumPercent: 0, count: 0, averagePercent: null, averageLabel: "N/A" });
    }
    return gradeStatsByStudentId.get(key);
  }

  gradeDocs.forEach((gradeDoc) => {
    const score = Number(gradeDoc?.Assignment?.grade);
    const maxScore = Number(gradeDoc?.Assignment?.maxScore || 100);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

    const percent = (score / maxScore) * 100;
    (gradeDoc?.students || []).forEach((studentRef) => {
      const studentId = toIdString(studentRef?._id);
      const stats = ensureGradeStats(studentId);
      if (!stats) return;
      stats.sumPercent += percent;
      stats.count += 1;
    });
  });

  gradeStatsByStudentId.forEach((stats) => {
    stats.averagePercent = stats.count > 0 ? stats.sumPercent / stats.count : null;
    stats.averageLabel = toPercentLabel(stats.averagePercent);
  });

  const attendanceStatsByStudentId = new Map();
  function ensureAttendanceStats(studentId) {
    const key = String(studentId || "");
    if (!key || !allowedStudentIdSet.has(key)) return null;
    if (!attendanceStatsByStudentId.has(key)) {
      attendanceStatsByStudentId.set(key, {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attendanceRate: null,
        attendanceRateLabel: "N/A"
      });
    }
    return attendanceStatsByStudentId.get(key);
  }

  attendanceDocs.forEach((attendanceDoc) => {
    (attendanceDoc?.records || []).forEach((record) => {
      const studentId = toIdString(record?.studentId);
      const stats = ensureAttendanceStats(studentId);
      if (!stats) return;

      const status = String(record?.status || "").trim();
      if (!ATTENDANCE_COUNTED_STATUSES.has(status)) return;

      stats.total += 1;
      if (ATTENDANCE_PRESENT_STATUSES.has(status)) stats.present += 1;
      if (status === "Absent") stats.absent += 1;
      if (status === "Late") stats.late += 1;
      if (status === "Excused") stats.excused += 1;
    });
  });

  attendanceStatsByStudentId.forEach((stats) => {
    stats.attendanceRate = stats.total > 0 ? (stats.present / stats.total) * 100 : null;
    stats.attendanceRateLabel = toPercentLabel(stats.attendanceRate);
  });

  const missionStatsByStudentId = buildDirectoryMissionLookup({
    missionDocs,
    allowedStudentIdSet,
    classStudentIdsByClassId
  });

  const assignedStudentIds = new Set();
  const classGroups = [];
  const unassignedStudents = [];

  const sortedClassDocs = [...classDocs].sort((a, b) => {
    const byName = compareByLabel(a?.className, b?.className);
    if (byName !== 0) return byName;
    return compareByLabel(String(a?._id || ""), String(b?._id || ""));
  });

  sortedClassDocs.forEach((classDoc) => {
    const classId = String(classDoc?._id || "");
    const classNameRaw = String(classDoc?.className || "").trim();
    const className = classNameRaw || "Unassigned";
    const classCode = String(classDoc?.classCode || "").trim();
    const classStudents = Array.isArray(classDoc?.students) ? classDoc.students : [];

    const studentRows = classStudents
      .map((classStudent) => {
        const studentId = toIdString(classStudent?._id);
        if (!studentId) return null;
        assignedStudentIds.add(studentId);

        const studentDoc = studentDocById.get(studentId);
        const rankSummary = buildRankSummaryFromUser(studentDoc || {});
        const gradeStats = gradeStatsByStudentId.get(studentId) || { averagePercent: null, averageLabel: "N/A", count: 0 };
        const attendanceStats = attendanceStatsByStudentId.get(studentId) || {
          attendanceRate: null,
          attendanceRateLabel: "N/A",
          total: 0
        };
        const missionStats = missionStatsByStudentId.get(studentId) || {
          assigned: 0,
          active: 0,
          pending: 0,
          rejected: 0,
          completed: 0,
          total: 0,
          completionRate: null,
          completionRateLabel: "N/A",
          earnedXP: 0
        };

        const fullName = extractStudentName(studentDoc, classStudent?.name);
        const statusChip = derivePerformanceStatus({
          gradeAverage: gradeStats.averagePercent,
          attendanceRate: attendanceStats.attendanceRate
        });

        return {
          id: studentId,
          fullName,
          firstName: studentDoc?.firstName || "",
          lastName: studentDoc?.lastName || "",
          profileImage: studentDoc?.profileImage || "",
          gradeLevel: studentDoc?.studentInfo?.gradeLevel || "N/A",
          programType: studentDoc?.studentInfo?.programType || "N/A",
          classId,
          className,
          classCode,
          rank: rankSummary,
          totalXP: Number(rankSummary?.xp || 0),
          rankLabel: rankSummary?.displayRankLabel || "F Rank",
          nextRankLabel: rankSummary?.nextRankLabel || "Max Rank",
          rankProgressPercent: Number(rankSummary?.progressPercent || 0),
          rankProgressLabel: rankSummary?.progressLabel || "0 / 0 XP",
          gradeAverage: gradeStats.averagePercent,
          gradeAverageLabel: gradeStats.averageLabel || "N/A",
          gradeEntryCount: Number(gradeStats.count || 0),
          attendanceRate: attendanceStats.attendanceRate,
          attendanceRateLabel: attendanceStats.attendanceRateLabel || "N/A",
          attendanceSessions: Number(attendanceStats.total || 0),
          missions: missionStats,
          statusChip,
          detailHref: `/teacher/students/${studentId}/progress?classId=${classId}`
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const byName = compareByLabel(a?.fullName, b?.fullName);
        if (byName !== 0) return byName;
        return compareByLabel(a?.id, b?.id);
      });

    if (!classNameRaw) {
      unassignedStudents.push(...studentRows);
      return;
    }

    classGroups.push({
      classId,
      className,
      classCode,
      studentCount: studentRows.length,
      students: studentRows
    });
  });

  const trulyUnassignedRows = studentDocs
    .filter((studentDoc) => !assignedStudentIds.has(String(studentDoc._id)))
    .map((studentDoc) => {
      const studentId = String(studentDoc._id);
      const rankSummary = buildRankSummaryFromUser(studentDoc || {});
      const gradeStats = gradeStatsByStudentId.get(studentId) || { averagePercent: null, averageLabel: "N/A", count: 0 };
      const attendanceStats = attendanceStatsByStudentId.get(studentId) || {
        attendanceRate: null,
        attendanceRateLabel: "N/A",
        total: 0
      };
      const missionStats = missionStatsByStudentId.get(studentId) || {
        assigned: 0,
        active: 0,
        pending: 0,
        rejected: 0,
        completed: 0,
        total: 0,
        completionRate: null,
        completionRateLabel: "N/A",
        earnedXP: 0
      };
      return {
        id: studentId,
        fullName: extractStudentName(studentDoc),
        firstName: studentDoc?.firstName || "",
        lastName: studentDoc?.lastName || "",
        profileImage: studentDoc?.profileImage || "",
        gradeLevel: studentDoc?.studentInfo?.gradeLevel || "N/A",
        programType: studentDoc?.studentInfo?.programType || "N/A",
        classId: "",
        className: "Unassigned",
        classCode: "",
        rank: rankSummary,
        totalXP: Number(rankSummary?.xp || 0),
        rankLabel: rankSummary?.displayRankLabel || "F Rank",
        nextRankLabel: rankSummary?.nextRankLabel || "Max Rank",
        rankProgressPercent: Number(rankSummary?.progressPercent || 0),
        rankProgressLabel: rankSummary?.progressLabel || "0 / 0 XP",
        gradeAverage: gradeStats.averagePercent,
        gradeAverageLabel: gradeStats.averageLabel || "N/A",
        gradeEntryCount: Number(gradeStats.count || 0),
        attendanceRate: attendanceStats.attendanceRate,
        attendanceRateLabel: attendanceStats.attendanceRateLabel || "N/A",
        attendanceSessions: Number(attendanceStats.total || 0),
        missions: missionStats,
        statusChip: derivePerformanceStatus({
          gradeAverage: gradeStats.averagePercent,
          attendanceRate: attendanceStats.attendanceRate
        }),
        detailHref: `/teacher/students/${studentId}/progress`
      };
    });

  if (trulyUnassignedRows.length) {
    unassignedStudents.push(...trulyUnassignedRows);
  }

  const normalizedUnassigned = unassignedStudents
    .filter(Boolean)
    .sort((a, b) => {
      const byName = compareByLabel(a?.fullName, b?.fullName);
      if (byName !== 0) return byName;
      return compareByLabel(a?.id, b?.id);
    });

  if (normalizedUnassigned.length) {
    classGroups.push({
      classId: "unassigned",
      className: "Unassigned",
      classCode: "",
      studentCount: normalizedUnassigned.length,
      students: normalizedUnassigned
    });
  }

  const uniqueStudentIds = new Set();
  classGroups.forEach((group) => {
    (group?.students || []).forEach((student) => {
      const id = String(student?.id || "");
      if (id) uniqueStudentIds.add(id);
    });
  });

  return {
    generatedAt: new Date(),
    classGroups,
    totalClasses: classGroups.length,
    totalStudents: uniqueStudentIds.size
  };
}

async function buildStudentProgressViewModel(req, studentId, options = {}) {
  const studentDoc = await User.findOne(scopedIdQuery(req, studentId, { role: "student" }))
    .select(
      "_id firstName lastName userName email profileImage studentInfo points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt"
    )
    .lean();
  if (!studentDoc) return null;

  const classDocs = await Class.find(scopedQuery(req, { "students._id": studentDoc._id }))
    .select("_id className classCode teachers schedule academicYear")
    .lean();
  const primaryClass = resolvePrimaryClass(studentDoc, classDocs, options.preferredClassId);
  const classIds = classDocs.map((entry) => entry._id);

  const gradeFilter = { "students._id": studentDoc._id };
  if (classIds.length) gradeFilter["classInfo._id"] = { $in: classIds };

  const attendanceFilter = { "records.studentId": studentDoc._id };
  if (classIds.length) attendanceFilter.classId = { $in: classIds };

  const missionOrFilters = [
    { "active.studentInfo._id": studentDoc._id },
    { "assignedTo.studentInfo": studentDoc._id }
  ];
  if (classIds.length) missionOrFilters.push({ "assignedTo.classInfo": { $in: classIds } });

  const [gradeDocs, attendanceDocs, missionDocs] = await Promise.all([
    Grade.find(scopedQuery(req, gradeFilter))
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean(),
    Attendance.find(scopedQuery(req, attendanceFilter))
      .sort({ date: -1 })
      .limit(500)
      .lean(),
    Mission.find(scopedQuery(req, { $or: missionOrFilters }))
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean()
  ]);

  const rankSummary = buildRankSummaryFromUser(studentDoc);
  const gradesSummary = summarizeGradesForStudent(gradeDocs, studentDoc._id);
  const attendanceSummary = summarizeAttendanceForStudent(attendanceDocs, studentDoc._id);
  const missionsSummary = summarizeMissionsForStudent(missionDocs, studentDoc._id, classIds);
  const recentActivity = buildRecentActivitySummary(gradesSummary, attendanceSummary, missionsSummary);

  const studentName = buildDisplayName(studentDoc);
  const teacherNames = (primaryClass?.teachers || [])
    .map((teacher) => String(teacher?.name || "").trim())
    .filter(Boolean);

  const statusChip = derivePerformanceStatus({
    gradeAverage: gradesSummary.overallAverage,
    attendanceRate: attendanceSummary.attendanceRate
  });

  const viewModel = {
    generatedAt: new Date(),
    studentId: String(studentDoc._id),
    identity: {
      id: String(studentDoc._id),
      fullName: studentName,
      firstName: studentDoc.firstName || "",
      lastName: studentDoc.lastName || "",
      userName: studentDoc.userName || "",
      email: studentDoc.email || "",
      profileImage: studentDoc.profileImage || "",
      gradeLevel: studentDoc?.studentInfo?.gradeLevel || "N/A",
      programType: studentDoc?.studentInfo?.programType || "N/A",
      studentNumber: studentDoc?.studentInfo?.studentNumber || null,
      classId: primaryClass ? String(primaryClass._id) : "",
      className: primaryClass?.className || "Unassigned",
      classCode: primaryClass?.classCode || "",
      teacherNames,
      schedule: Array.isArray(primaryClass?.schedule) ? primaryClass.schedule : [],
      academicYear: primaryClass?.academicYear || null
    },
    rank: rankSummary,
    grades: gradesSummary,
    attendance: attendanceSummary,
    missions: missionsSummary,
    recentActivity,
    metrics: {
      statusChip,
      gradeAverageLabel: gradesSummary.overallAverageLabel,
      attendanceRateLabel: attendanceSummary.attendanceRateLabel,
      missionCompletionLabel: missionsSummary.completionRateLabel
    },
    teacherInsights: null
  };

  if (options.includeTeacherInsights) {
    viewModel.teacherInsights = buildTeacherInsights(viewModel);
  }

  return viewModel;
}

module.exports = {
  buildTeacherStudentProgressDirectoryViewModel,
  buildStudentProgressViewModel,
  toIdString,
  formatDateLabel,
  formatDateTimeLabel,
  toPercentLabel
};
