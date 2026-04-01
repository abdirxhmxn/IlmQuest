const User = require("../models/User");
const Mission = require("../models/Missions");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const ReportActivity = require("../models/ReportActivity");
const Verses = require("../models/Verses");
const Reflection = require("../models/Reflections");
const { scopedQuery } = require("../utils/tenant");
const {
  renderStudentReportLatex,
  renderClassReportLatex,
  compileLatexToPdf,
  normalizeJobName
} = require("../utils/latexReports");
const {
  DASHBOARD_LAYOUTS,
  resolveTeacherSettings,
  getActiveSubjects,
  getActiveGradingCategories,
  getActiveDashboardSections,
  getWeightMapFromCategories,
  normalizeCategoryKey,
  buildCategoryLabelMap,
  normalizeSubjectKey,
  getConfigVersionLookup,
  getConfigVersionForGrade,
  getGradeSubjectKey,
  getGradeCategoryKey,
  resolveSubjectFromGrade,
  resolveCategoryFromGrade
} = require("../utils/teacherCustomization");
const {
  getVisibleAnnouncementsForUser,
  toAnnouncementViewModel
} = require("../utils/announcements");
const { buildDashboardPaymentMetrics } = require("../utils/finance");
const { resolveSchoolId } = require("../utils/tenant");

const ADMIN_ANALYTICS_CACHE_TTL_MS = Math.max(
  5000,
  Number(process.env.ADMIN_ANALYTICS_CACHE_TTL_MS || 30000)
);
const adminAnalyticsCache = new Map();

function getAdminAnalyticsCacheKey(req) {
  return String(resolveSchoolId(req) || "");
}

async function getCachedAdminAnalytics(req, options = {}) {
  const cacheKey = getAdminAnalyticsCacheKey(req);
  const shouldBypass = options.force === true || String(req.query?.refresh || "") === "1";

  if (!shouldBypass) {
    const cached = adminAnalyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const value = await buildAdminAnalytics(req);
  adminAnalyticsCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ADMIN_ANALYTICS_CACHE_TTL_MS
  });
  return value;
}

const DEFAULT_WEIGHT_MAP = {
  homework: 20,
  quiz: 15,
  test: 25,
  exam: 25,
  behavior: 7.5,
  participation: 7.5
};

function prepareClassWithConfig(classDoc, teacherId = null) {
  const teacherSettings = resolveTeacherSettings(classDoc, teacherId);
  const activeSubjects = getActiveSubjects(teacherSettings, classDoc.subjects);
  const activeGradingCategories = getActiveGradingCategories(teacherSettings);
  const activeDashboardSections = getActiveDashboardSections(teacherSettings);
  const categoryWeightMap = getWeightMapFromCategories(activeGradingCategories);

  return {
    ...classDoc,
    teacherSettings,
    activeSubjects,
    activeGradingCategories,
    activeDashboardSections,
    categoryWeightMap,
    categoryLabelMap: buildCategoryLabelMap(activeGradingCategories),
    currentConfigVersion: Number(teacherSettings.currentConfigVersion || 1)
  };
}

function getItemStatusRank(item) {
  if (item.active && !item.isArchived) return 0;
  if (!item.active && !item.isArchived) return 1;
  if (item.isArchived && !item.isHistorical) return 2;
  return 3;
}

function sortConfigItems(a, b) {
  const rankDiff = getItemStatusRank(a) - getItemStatusRank(b);
  if (rankDiff !== 0) return rankDiff;
  const orderDiff = Number(a.order || 0) - Number(b.order || 0);
  if (orderDiff !== 0) return orderDiff;
  return String(a.label || "").localeCompare(String(b.label || ""));
}

function buildDisplayCatalogForClass(classConfig, classGrades = []) {
  const subjectMap = new Map();
  const categoryMap = new Map();
  const subjectKeysWithGrades = new Set();
  const categoryKeysWithGrades = new Set();

  (classConfig.teacherSettings?.subjectConfig || []).forEach((subject, index) => {
    subjectMap.set(String(subject.key), {
      key: String(subject.key),
      label: subject.label || subject.name,
      order: Number.isFinite(Number(subject.order)) ? Number(subject.order) : index,
      active: Boolean(subject.active),
      isArchived: Boolean(subject.isArchived),
      isHistorical: false,
      source: "config"
    });
  });

  (classConfig.teacherSettings?.gradingCategories || []).forEach((category, index) => {
    categoryMap.set(String(category.key), {
      key: String(category.key),
      label: category.label || category.name,
      weight: Number(category.weight || 0),
      order: Number.isFinite(Number(category.order)) ? Number(category.order) : index,
      active: Boolean(category.active),
      isArchived: Boolean(category.isArchived),
      isHistorical: false,
      source: "config"
    });
  });

  classGrades.forEach((grade) => {
    const subjectMeta = resolveSubjectFromGrade(grade, classConfig.teacherSettings);
    subjectKeysWithGrades.add(subjectMeta.key);
    if (!subjectMap.has(subjectMeta.key)) {
      subjectMap.set(subjectMeta.key, {
        key: subjectMeta.key,
        label: subjectMeta.label,
        order: Number.MAX_SAFE_INTEGER,
        active: false,
        isArchived: true,
        isHistorical: true,
        source: "grade"
      });
    }

    const categoryMeta = resolveCategoryFromGrade(grade, classConfig.teacherSettings);
    categoryKeysWithGrades.add(categoryMeta.key);
    if (!categoryMap.has(categoryMeta.key)) {
      categoryMap.set(categoryMeta.key, {
        key: categoryMeta.key,
        label: categoryMeta.label,
        weight: Number(categoryMeta.weight || 0),
        order: Number.MAX_SAFE_INTEGER,
        active: false,
        isArchived: true,
        isHistorical: true,
        source: "grade"
      });
    }
  });

  return {
    subjects: Array.from(subjectMap.values())
      .filter((subject) => subject.active || subject.isHistorical || subjectKeysWithGrades.has(subject.key))
      .sort(sortConfigItems),
    categories: Array.from(categoryMap.values())
      .filter((category) => category.active || category.isHistorical || categoryKeysWithGrades.has(category.key))
      .sort(sortConfigItems)
  };
}

// Helper to calculate a student's weighted average for a subject without
// reinterpreting historical grades under the latest category weights.
const getSubjectAverage = (grades, studentID, subjectKeyOrName, options = {}) => {
  const classId = options.classId ? String(options.classId) : null;
  const classSettings = options.settings || null;
  const versionLookup = getConfigVersionLookup(classSettings);
  const subjectKey = normalizeSubjectKey(subjectKeyOrName);
  const fallbackWeightMap = options.weightMap && Object.keys(options.weightMap).length
    ? options.weightMap
    : DEFAULT_WEIGHT_MAP;

  const filtered = grades.filter(
    (g) =>
      getGradeSubjectKey(g) === subjectKey &&
      g.students.some((s) => s._id.toString() === studentID.toString()) &&
      (!classId || g.classInfo.some(c => c._id.toString() === classId))
  );

  if (!filtered.length) return "100.00";

  const groupedByVersion = new Map();
  filtered.forEach((grade) => {
    const version = getConfigVersionForGrade(grade, classSettings);
    if (!groupedByVersion.has(version)) groupedByVersion.set(version, []);
    groupedByVersion.get(version).push(grade);
  });

  let weightedVersionSum = 0;
  let weightedVersionDivisor = 0;

  groupedByVersion.forEach((versionGrades, version) => {
    const versionSnapshot = versionLookup.get(Number(version));

    let versionWeightMap = {};
    if (versionSnapshot?.gradingCategories?.length) {
      versionSnapshot.gradingCategories.forEach((category) => {
        if (!category.active || category.isArchived) return;
        versionWeightMap[String(category.key)] = Number(category.weight || 0);
      });
    }

    if (!Object.keys(versionWeightMap).length) {
      versionGrades.forEach((grade) => {
        const categoryMeta = resolveCategoryFromGrade(grade, classSettings);
        if (categoryMeta.weight > 0) {
          versionWeightMap[categoryMeta.key] = Number(categoryMeta.weight);
        }
      });
    }

    if (!Object.keys(versionWeightMap).length) {
      versionWeightMap = fallbackWeightMap;
    }

    const categoryScores = {};
    versionGrades.forEach((grade) => {
      const categoryKey = getGradeCategoryKey(grade);
      if (!versionWeightMap[categoryKey]) return;
      const maxScore = Number(grade.Assignment?.maxScore || 100);
      const score = Number(grade.Assignment?.grade || 0);
      if (!maxScore) return;
      const percent = (score / maxScore) * 100;
      if (!categoryScores[categoryKey]) categoryScores[categoryKey] = [];
      categoryScores[categoryKey].push(percent);
    });

    const weightEntries = Object.entries(versionWeightMap)
      .map(([categoryKey, weight]) => [String(categoryKey), Number(weight)])
      .filter(([, weight]) => Number.isFinite(weight) && weight > 0);

    const versionWeightTotal = weightEntries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!versionWeightTotal) return;

    let versionWeightedScore = 0;
    weightEntries.forEach(([categoryKey, weight]) => {
      const scores = categoryScores[categoryKey];
      const avg = scores && scores.length
        ? scores.reduce((acc, val) => acc + val, 0) / scores.length
        : 100;
      versionWeightedScore += (avg / 100) * weight;
    });

    const versionAveragePercent = (versionWeightedScore / versionWeightTotal) * 100;
    const multiplier = versionGrades.length || 1;
    weightedVersionSum += versionAveragePercent * multiplier;
    weightedVersionDivisor += multiplier;
  });

  if (!weightedVersionDivisor) return "100.00";
  return (weightedVersionSum / weightedVersionDivisor).toFixed(2);
};

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function toPercentLabel(value, fractionDigits = 1) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return `${Number(value).toFixed(fractionDigits)}%`;
}

function ratioPercent(numerator, denominator) {
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) {
    return null;
  }
  return (Number(numerator) / Number(denominator)) * 100;
}

function formatDateLabel(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTimeLabel(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMonthDayLabel(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function buildTimeRemainingLabel(targetDate, now = new Date()) {
  const end = new Date(targetDate);
  if (Number.isNaN(end.getTime())) return "";
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return "";

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) return `${days}d ${hours}h remaining`;
  if (days > 0) return `${days}d remaining`;
  return `${Math.max(totalHours, 1)}h remaining`;
}

function parseOptionalPositiveInt(value, { min = 1, max = 500 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}

function parsePaginationParams(query = {}, { defaultLimit = 50, maxLimit = 250 } = {}) {
  const page = parseOptionalPositiveInt(query.page, { min: 1, max: 1000000 });
  const limit = parseOptionalPositiveInt(query.limit, { min: 1, max: maxLimit });
  const enabled = Number.isFinite(page) || Number.isFinite(limit);
  const normalizedPage = page || 1;
  const normalizedLimit = limit || defaultLimit;

  return {
    enabled,
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit
  };
}

function buildSafeRegexQuery(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function resolveAttendanceTone(attendanceRate) {
  if (!Number.isFinite(Number(attendanceRate))) return "neutral";
  if (attendanceRate < 80) return "critical";
  if (attendanceRate < 90) return "warning";
  return "success";
}

function buildAdminAttendancePage(attendanceDocs = []) {
  const presentStatuses = new Set(["Present", "Late", "Excused"]);
  const ignoredStatuses = new Set(["Holiday", "Weather"]);
  const now = new Date();

  const activeItems = [];
  const expiredItems = [];

  [...attendanceDocs]
    .sort((a, b) => new Date(b?.date) - new Date(a?.date))
    .forEach((doc) => {
      const attendanceDate = new Date(doc?.date);
      if (Number.isNaN(attendanceDate.getTime())) return;

      let present = 0;
      let total = 0;
      let absent = 0;
      let late = 0;
      let excused = 0;

      (doc?.records || []).forEach((record) => {
        const status = String(record?.status || "");
        if (!status || ignoredStatuses.has(status)) return;
        total += 1;
        if (presentStatuses.has(status)) present += 1;
        if (status === "Absent") absent += 1;
        if (status === "Late") late += 1;
        if (status === "Excused") excused += 1;
      });

      const attendanceRate = ratioPercent(present, total);
      const tone = resolveAttendanceTone(attendanceRate);
      const expiresAt = new Date(attendanceDate);
      expiresAt.setDate(expiresAt.getDate() + 14);
      const isExpired = expiresAt.getTime() < now.getTime();

      const detailParts = [];
      detailParts.push(
        Number.isFinite(attendanceRate)
          ? `${present}/${total || 0} present (${toPercentLabel(attendanceRate)})`
          : "Attendance rate not available"
      );
      if (absent > 0) detailParts.push(`${absent} absent`);
      if (late > 0) detailParts.push(`${late} late`);
      if (excused > 0) detailParts.push(`${excused} excused`);
      if (total > 0) detailParts.push(`${total} records`);

      const toneLabelMap = {
        success: "On Track",
        warning: "Needs Review",
        critical: "Urgent",
        neutral: "No Data"
      };

      const item = {
        id: toIdString(doc?._id),
        className: String(doc?.className || "Class").trim(),
        title: Number.isFinite(attendanceRate)
          ? `${String(doc?.className || "Class").trim()} attendance at ${toPercentLabel(attendanceRate)}`
          : `${String(doc?.className || "Class").trim()} attendance update`,
        detail: detailParts.join(" • "),
        tone,
        toneLabel: toneLabelMap[tone] || "",
        recordedLabel: formatMonthDayLabel(attendanceDate),
        statusLabel: isExpired
          ? `Expired ${formatMonthDayLabel(expiresAt)}`
          : buildTimeRemainingLabel(expiresAt, now)
      };

      if (isExpired) expiredItems.push(item);
      else activeItems.push(item);
    });

  return {
    activeItems,
    expiredItems,
    activeCount: activeItems.length,
    expiredCount: expiredItems.length,
    totalCount: activeItems.length + expiredItems.length,
    lastUpdatedLabel: formatDateTimeLabel(now)
  };
}

function toPercentOrBlank(value, fractionDigits = 1) {
  if (!Number.isFinite(Number(value))) return "";
  return `${Number(value).toFixed(fractionDigits)}%`;
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

function summarizeStudentAttendanceBreakdown(attendanceDocs = [], studentId) {
  const normalizedStudentId = String(studentId || "");
  const presentStatuses = new Set(["Present", "Late", "Excused"]);
  const ignoredStatuses = new Set(["Holiday", "Weather"]);

  let presentCount = 0;
  let totalCount = 0;
  let absences = 0;
  let excused = 0;
  let late = 0;

  attendanceDocs.forEach((doc) => {
    (doc?.records || []).forEach((record) => {
      if (toIdString(record?.studentId) !== normalizedStudentId) return;
      const status = String(record?.status || "");
      if (!status || ignoredStatuses.has(status)) return;

      totalCount += 1;
      if (presentStatuses.has(status)) presentCount += 1;
      if (status === "Absent") absences += 1;
      if (status === "Excused") excused += 1;
      if (status === "Late") late += 1;
    });
  });

  return {
    attendanceRate: ratioPercent(presentCount, totalCount),
    absences,
    excused,
    late
  };
}

function summarizeSubjectPerformanceForReport(gradeDocs = []) {
  const slots = {
    quran: { sum: 0, count: 0, comments: [] },
    subac: { sum: 0, count: 0, comments: [] },
    islamicStudies: { sum: 0, count: 0, comments: [] },
    writing: { sum: 0, count: 0, comments: [] },
    character: { sum: 0, count: 0, comments: [] }
  };

  gradeDocs.forEach((grade) => {
    const subjectName = grade?.subjectLabel || grade?.subject || grade?.Assignment?.type || "";
    const slot = inferSubjectSlot(subjectName);
    if (!slot || !slots[slot]) return;

    const maxScore = Number(grade?.Assignment?.maxScore || 100);
    const score = Number(grade?.Assignment?.grade || 0);
    if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) return;

    const percent = (score / maxScore) * 100;
    slots[slot].sum += percent;
    slots[slot].count += 1;

    const feedback = String(grade?.feedback?.content || "").trim();
    if (feedback) slots[slot].comments.push(feedback);
  });

  const summarized = {};
  Object.entries(slots).forEach(([slot, entry]) => {
    const avg = entry.count > 0 ? entry.sum / entry.count : null;
    summarized[slot] = {
      grade: toPercentOrBlank(avg),
      comment: entry.comments.slice(0, 2).join(" | ")
    };
  });

  return summarized;
}

async function buildReportGenerationStats(req) {
  const scope = scopedQuery(req, { includeDeleted: true });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalGenerated, generatedToday, recentActivityDocs] = await Promise.all([
    ReportActivity.countDocuments(scope),
    ReportActivity.countDocuments({ ...scope, createdAt: { $gte: todayStart } }),
    ReportActivity.find(scope).sort({ createdAt: -1 }).limit(8).lean()
  ]);

  const recentActivity = recentActivityDocs.map((entry) => ({
    reportType: entry.reportType,
    targetName: entry?.target?.name || "Unknown",
    generatedBy: entry?.generatedBy?.name || "Admin",
    generatedAt: entry.createdAt,
    generatedAtLabel: formatDateTimeLabel(entry.createdAt),
    fileName: entry.fileName || ""
  }));

  const lastGenerated = recentActivity[0] || null;

  return {
    totalGenerated,
    generatedToday,
    lastGenerated,
    lastGeneratedLabel: lastGenerated
      ? `${lastGenerated.targetName} (${lastGenerated.reportType}) - ${lastGenerated.generatedAtLabel}`
      : "No reports generated yet",
    recentActivity
  };
}

async function recordReportGeneration(req, { reportType, targetId, targetName, fileName }) {
  try {
    const generatorName = `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() || req.user?.userName || "Admin";
    await ReportActivity.create({
      schoolId: req.schoolId,
      reportType,
      generatedBy: {
        _id: req.user._id,
        name: generatorName
      },
      target: {
        _id: targetId,
        name: targetName
      },
      fileName: fileName || ""
    });
  } catch (err) {
    console.error("Report activity logging failed:", err);
  }
}

function resolveStudentFullName(student) {
  const first = String(student?.firstName || "").trim();
  const last = String(student?.lastName || "").trim();
  const merged = `${first} ${last}`.trim();
  return merged || student?.userName || "Unknown Student";
}

function summarizeAttendanceRecords(attendanceDocs = []) {
  const presentStatuses = new Set(["Present", "Late", "Excused"]);
  const ignoredStatuses = new Set(["Holiday", "Weather"]);

  const classAgg = new Map();
  const studentAgg = new Map();
  let presentCount = 0;
  let totalCount = 0;

  attendanceDocs.forEach((doc) => {
    const classId = toIdString(doc?.classId);
    (doc?.records || []).forEach((record) => {
      const status = String(record?.status || "");
      if (!status || ignoredStatuses.has(status)) return;

      totalCount += 1;
      const isPresent = presentStatuses.has(status);
      if (isPresent) presentCount += 1;

      if (classId) {
        const cls = classAgg.get(classId) || { present: 0, total: 0 };
        cls.total += 1;
        if (isPresent) cls.present += 1;
        classAgg.set(classId, cls);
      }

      const studentId = toIdString(record?.studentId);
      if (studentId) {
        const student = studentAgg.get(studentId) || { present: 0, total: 0 };
        student.total += 1;
        if (isPresent) student.present += 1;
        studentAgg.set(studentId, student);
      }
    });
  });

  return {
    presentCount,
    totalCount,
    overallRate: ratioPercent(presentCount, totalCount),
    classAgg,
    studentAgg
  };
}

function summarizeGradeRecords(gradeDocs = []) {
  const classAgg = new Map();
  const studentAgg = new Map();
  let totalPercent = 0;
  let gradeCount = 0;

  gradeDocs.forEach((grade) => {
    const maxScore = Number(grade?.Assignment?.maxScore || 100);
    const score = Number(grade?.Assignment?.grade || 0);
    if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) return;
    const percent = (score / maxScore) * 100;
    gradeCount += 1;
    totalPercent += percent;

    const classId = toIdString(grade?.classInfo?.[0]?._id);
    if (classId) {
      const cls = classAgg.get(classId) || { sum: 0, count: 0 };
      cls.sum += percent;
      cls.count += 1;
      classAgg.set(classId, cls);
    }

    (grade?.students || []).forEach((student) => {
      const studentId = toIdString(student?._id);
      if (!studentId) return;
      const agg = studentAgg.get(studentId) || { sum: 0, count: 0 };
      agg.sum += percent;
      agg.count += 1;
      studentAgg.set(studentId, agg);
    });
  });

  return {
    overallAverage: gradeCount > 0 ? totalPercent / gradeCount : null,
    gradeCount,
    classAgg,
    studentAgg
  };
}

function summarizeMissionRecords(missionDocs = []) {
  const studentAgg = new Map();

  missionDocs.forEach((mission) => {
    (mission?.active?.studentInfo || []).forEach((entry) => {
      const studentId = toIdString(entry?._id);
      if (!studentId) return;
      const status = String(entry?.status || "").toLowerCase();
      const agg = studentAgg.get(studentId) || { started: 0, completed: 0 };
      if (status === "completed") agg.completed += 1;
      if (status === "started") agg.started += 1;
      studentAgg.set(studentId, agg);
    });
  });

  return { studentAgg };
}

async function buildAdminAnalytics(req) {
  const [students, teachers, parents, classes, attendanceDocs, gradeDocs, missionDocs, reportStats, paymentMetrics] = await Promise.all([
    User.find(scopedQuery(req, { role: "student" }))
      .select("_id firstName lastName userName points studentInfo.programType")
      .lean(),
    User.find(scopedQuery(req, { role: "teacher" }))
      .select("_id firstName lastName userName")
      .lean(),
    User.find(scopedQuery(req, { role: "parent" }))
      .select("_id firstName lastName userName")
      .lean(),
    Class.find(scopedQuery(req))
      .select("_id className active students")
      .lean(),
    Attendance.find(scopedQuery(req))
      .select("classId records.studentId records.status date")
      .lean(),
    Grade.find(scopedQuery(req))
      .select("classInfo students Assignment.grade Assignment.maxScore createdAt")
      .lean(),
    Mission.find(scopedQuery(req))
      .select("createdAt updatedAt active.studentInfo")
      .lean(),
    buildReportGenerationStats(req),
    buildDashboardPaymentMetrics(req)
  ]);

  const activeClasses = classes.filter((cls) => cls?.active !== false);
  const pointsByStudentId = new Map(
    students.map((student) => [toIdString(student._id), Number(student?.points || 0)])
  );
  const classNameByStudentId = new Map();
  classes.forEach((cls) => {
    const className = cls?.className || "Unassigned";
    (cls?.students || []).forEach((entry) => {
      const studentId = toIdString(entry?._id);
      if (!studentId || classNameByStudentId.has(studentId)) return;
      classNameByStudentId.set(studentId, className);
    });
  });

  const programDistributionMap = new Map();
  students.forEach((student) => {
    const program = String(student?.studentInfo?.programType || "Unspecified");
    programDistributionMap.set(program, (programDistributionMap.get(program) || 0) + 1);
  });
  const programDistribution = Array.from(programDistributionMap.entries())
    .map(([program, count]) => ({ program, count }))
    .sort((a, b) => b.count - a.count || a.program.localeCompare(b.program));

  const attendanceSummary = summarizeAttendanceRecords(attendanceDocs);
  const gradeSummary = summarizeGradeRecords(gradeDocs);
  const missionSummary = summarizeMissionRecords(missionDocs);

  const studentPerformance = students.map((student) => {
    const studentId = toIdString(student._id);
    const gradeAgg = gradeSummary.studentAgg.get(studentId);
    const attendanceAgg = attendanceSummary.studentAgg.get(studentId);
    const missionAgg = missionSummary.studentAgg.get(studentId) || { started: 0, completed: 0 };

    const avgGrade = gradeAgg && gradeAgg.count > 0 ? (gradeAgg.sum / gradeAgg.count) : null;
    const attendanceRate = attendanceAgg && attendanceAgg.total > 0
      ? ratioPercent(attendanceAgg.present, attendanceAgg.total)
      : null;

    return {
      studentId,
      name: resolveStudentFullName(student),
      className: classNameByStudentId.get(studentId) || "Unassigned",
      avgGrade,
      attendanceRate,
      points: Number(student?.points || 0),
      missionsStarted: missionAgg.started,
      missionsCompleted: missionAgg.completed
    };
  });

  const rankedByGradeDesc = [...studentPerformance]
    .filter((entry) => Number.isFinite(entry.avgGrade))
    .sort((a, b) => b.avgGrade - a.avgGrade || b.points - a.points || a.name.localeCompare(b.name));

  const rankedByGradeAsc = [...rankedByGradeDesc].sort((a, b) => a.avgGrade - b.avgGrade || a.points - b.points || a.name.localeCompare(b.name));
  const topStudents = rankedByGradeDesc.slice(0, 5);
  const bottomStudents = rankedByGradeAsc.slice(0, 5);

  const classPerformance = activeClasses.map((cls) => {
    const classId = toIdString(cls._id);
    const gradeAgg = gradeSummary.classAgg.get(classId);
    const attendanceAgg = attendanceSummary.classAgg.get(classId);
    const avgGrade = gradeAgg && gradeAgg.count > 0 ? (gradeAgg.sum / gradeAgg.count) : null;
    const attendanceRate = attendanceAgg && attendanceAgg.total > 0
      ? ratioPercent(attendanceAgg.present, attendanceAgg.total)
      : null;
    const points = (cls.students || []).reduce((sum, studentRef) => {
      const points = pointsByStudentId.get(toIdString(studentRef._id)) || 0;
      return sum + points;
    }, 0);

    return {
      classId,
      className: cls.className || "Untitled Class",
      avgGrade,
      attendanceRate,
      points,
      studentCount: (cls.students || []).length
    };
  });

  const topClasses = [...classPerformance]
    .filter((entry) => Number.isFinite(entry.avgGrade))
    .sort((a, b) => b.avgGrade - a.avgGrade || b.points - a.points || a.className.localeCompare(b.className))
    .slice(0, 3);

  const bottomClasses = [...classPerformance]
    .filter((entry) => Number.isFinite(entry.avgGrade))
    .sort((a, b) => a.avgGrade - b.avgGrade || a.points - b.points || a.className.localeCompare(b.className))
    .slice(0, 3);

  const belowThresholdStudents = studentPerformance
    .filter((entry) => Number.isFinite(entry.avgGrade) && entry.avgGrade < 70)
    .sort((a, b) => a.avgGrade - b.avgGrade || a.name.localeCompare(b.name));

  const lowAttendanceClasses = classPerformance
    .filter((entry) => Number.isFinite(entry.attendanceRate) && entry.attendanceRate < 80)
    .sort((a, b) => a.attendanceRate - b.attendanceRate || a.className.localeCompare(b.className));

  const studentsWithoutCompletedMissions = studentPerformance
    .filter((entry) => Number(entry.missionsCompleted || 0) === 0)
    .sort((a, b) => (a.missionsStarted || 0) - (b.missionsStarted || 0))
    .slice(0, 5);

  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 30);
  const recentlyActiveStudentIds = new Set();

  gradeDocs.forEach((grade) => {
    const createdAt = new Date(grade.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt < recentThreshold) return;
    (grade.students || []).forEach((entry) => {
      const id = toIdString(entry._id);
      if (id) recentlyActiveStudentIds.add(id);
    });
  });

  attendanceDocs.forEach((doc) => {
    const date = new Date(doc.date);
    if (Number.isNaN(date.getTime()) || date < recentThreshold) return;
    (doc.records || []).forEach((entry) => {
      const id = toIdString(entry.studentId);
      if (id) recentlyActiveStudentIds.add(id);
    });
  });

  missionDocs.forEach((mission) => {
    (mission?.active?.studentInfo || []).forEach((entry) => {
      const activityDate = new Date(entry.completedAt || entry.startedAt || mission.updatedAt || mission.createdAt);
      if (Number.isNaN(activityDate.getTime()) || activityDate < recentThreshold) return;
      const id = toIdString(entry._id);
      if (id) recentlyActiveStudentIds.add(id);
    });
  });

  const activeStudentsRecent = recentlyActiveStudentIds.size;
  const inactiveStudentsRecent = Math.max(students.length - activeStudentsRecent, 0);

  const alerts = [];
  if (belowThresholdStudents.length > 0) {
    alerts.push({
      tone: "critical",
      title: `${belowThresholdStudents.length} students scoring below 70%`,
      detail: belowThresholdStudents.slice(0, 3).map((entry) => entry.name).join(", ")
    });
  }

  if (lowAttendanceClasses.length > 0) {
    const lowest = lowAttendanceClasses[0];
    alerts.push({
      tone: "warning",
      title: `${lowest.className} attendance at ${toPercentLabel(lowest.attendanceRate)}`,
      detail: `${lowAttendanceClasses.length} class(es) are below the 80% attendance threshold`
    });
  }

  if (studentsWithoutCompletedMissions.length > 0) {
    alerts.push({
      tone: "info",
      title: `${studentsWithoutCompletedMissions.length} students with no completed missions`,
      detail: studentsWithoutCompletedMissions.slice(0, 2).map((entry) => entry.name).join(" and ")
    });
  }

  const payments = paymentMetrics;

  return {
    students,
    teachers,
    parents,
    classes,
    gradeDocs,
    attendanceDocs,
    missionDocs,
    metrics: {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      totalParents: parents.length,
      totalClasses: classes.length,
      activeClasses: activeClasses.length,
      attendanceRate: attendanceSummary.overallRate,
      averageGrade: gradeSummary.overallAverage,
      activeStudentsRecent,
      inactiveStudentsRecent,
      gradeRecordsCount: gradeSummary.gradeCount,
      attendanceRecordsCount: attendanceSummary.totalCount,
      missionCount: missionDocs.length,
      payments,
      programDistribution,
      topStudents,
      bottomStudents,
      topClasses,
      bottomClasses,
      alerts,
      reportStats
    }
  };
}

async function buildStudentReportPayload(req, studentId) {
  const student = await User.findOne(scopedQuery(req, { _id: studentId, role: "student" })).lean();
  if (!student) return null;

  const [classes, gradeDocs, attendanceDocs, parentDocs] = await Promise.all([
    Class.find(scopedQuery(req, { "students._id": student._id })).lean(),
    Grade.find(scopedQuery(req, { "students._id": student._id })).sort({ createdAt: -1 }).lean(),
    Attendance.find(scopedQuery(req, { "records.studentId": student._id })).sort({ date: -1 }).lean(),
    User.find(scopedQuery(req, { role: "parent", "parentInfo.children.childID": student._id }))
      .select("firstName lastName userName")
      .lean()
  ]);

  const primaryClass = classes[0] || null;
  const classGradeDocs = primaryClass
    ? await Grade.find(scopedQuery(req, { "classInfo._id": primaryClass._id })).lean()
    : [];

  const attendanceBreakdown = summarizeStudentAttendanceBreakdown(attendanceDocs, student._id);
  const gradeSummary = summarizeGradeRecords(gradeDocs);
  const subjectSummary = summarizeSubjectPerformanceForReport(gradeDocs);

  const parentNameFromEmbedded = Array.isArray(student?.studentInfo?.parents)
    ? student.studentInfo.parents
      .map((entry) => String(entry?.parentName || "").trim())
      .filter(Boolean)
      .join(", ")
    : "";
  const parentNameFromUsers = parentDocs
    .map((parent) => resolveStudentFullName(parent))
    .filter(Boolean)
    .join(", ");
  const parentName = parentNameFromEmbedded || parentNameFromUsers || "";

  let classRank = "";
  if (classGradeDocs.length > 0 && primaryClass) {
    const gradeMap = new Map();
    classGradeDocs.forEach((grade) => {
      const maxScore = Number(grade?.Assignment?.maxScore || 100);
      const score = Number(grade?.Assignment?.grade || 0);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) return;
      const percent = (score / maxScore) * 100;

      (grade.students || []).forEach((entry) => {
        const id = toIdString(entry?._id);
        if (!id) return;
        const agg = gradeMap.get(id) || { sum: 0, count: 0 };
        agg.sum += percent;
        agg.count += 1;
        gradeMap.set(id, agg);
      });
    });

    const ranked = Array.from(gradeMap.entries())
      .filter(([, agg]) => agg.count > 0)
      .map(([id, agg]) => ({ id, avg: agg.sum / agg.count }))
      .sort((a, b) => b.avg - a.avg);
    const rankIndex = ranked.findIndex((entry) => entry.id === toIdString(student._id));
    if (rankIndex >= 0) classRank = `${rankIndex + 1}/${ranked.length}`;
  }

  const teacherName = (primaryClass?.teachers || [])
    .map((entry) => String(entry?.name || "").trim())
    .filter(Boolean)
    .join(", ");

  const reportDate = formatDateLabel(new Date());
  const overallGradeLabel = toPercentOrBlank(gradeSummary.overallAverage);

  return {
    studentObjectId: student._id,
    studentName: resolveStudentFullName(student),
    institution: "Al Bayaan Institute",
    department: "",
    program: student?.studentInfo?.programType || primaryClass?.programType || "",
    semester: primaryClass?.academicYear?.semester || "",
    teacher: teacherName,
    rank: classRank,
    finalGrade: overallGradeLabel,
    reportDate,
    reportTitle: "Student Progress Report",
    gradeLevel: student?.studentInfo?.gradeLevel || "",
    studentId: student?.studentInfo?.studentNumber ? String(student.studentInfo.studentNumber) : "",
    parentName,
    attendancePct: toPercentOrBlank(attendanceBreakdown.attendanceRate),
    absences: String(attendanceBreakdown.absences || 0),
    excusedAbsences: String(attendanceBreakdown.excused || 0),
    late: String(attendanceBreakdown.late || 0),
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
    // Uses logo copied to LaTeX temp workspace by compileLatexToPdf.
    logoPath: "logo.jpg"
  };
}

async function buildClassReportPayload(req, classId) {
  const classDoc = await Class.findOne(scopedQuery(req, { _id: classId })).lean();
  if (!classDoc) return null;

  const studentIds = (classDoc.students || []).map((entry) => entry._id);
  const [students, gradeDocs, attendanceDocs, missionDocs] = await Promise.all([
    User.find(scopedQuery(req, { _id: { $in: studentIds }, role: "student" })).lean(),
    Grade.find(scopedQuery(req, { "classInfo._id": classDoc._id })).lean(),
    Attendance.find(scopedQuery(req, { classId: classDoc._id })).lean(),
    Mission.find(
      scopedQuery(req, {
        $or: [
          { "assignedTo.classInfo": classDoc._id },
          { "assignedTo.classInfo.type": classDoc._id }
        ]
      })
    ).lean()
  ]);

  const studentById = new Map(students.map((student) => [toIdString(student._id), student]));
  const gradeSummary = summarizeGradeRecords(gradeDocs);
  const attendanceSummary = summarizeAttendanceRecords(attendanceDocs);
  const missionSummary = summarizeMissionRecords(missionDocs);

  const studentRows = (classDoc.students || []).map((studentRef) => {
    const studentId = toIdString(studentRef._id);
    const student = studentById.get(studentId);
    const gradeAgg = gradeSummary.studentAgg.get(studentId);
    const attendanceAgg = attendanceSummary.studentAgg.get(studentId);

    const avgGrade = gradeAgg && gradeAgg.count > 0 ? gradeAgg.sum / gradeAgg.count : null;
    const attendanceRate = attendanceAgg && attendanceAgg.total > 0
      ? ratioPercent(attendanceAgg.present, attendanceAgg.total)
      : null;

    return {
      student: resolveStudentFullName(student || { firstName: studentRef?.name || "", userName: studentRef?.name || "Unknown Student" }),
      grade: toPercentLabel(avgGrade),
      attendance: toPercentLabel(attendanceRate),
      points: Number(student?.points || 0)
    };
  });

  const classMissionParticipants = new Set();
  missionSummary.studentAgg.forEach((_value, studentId) => classMissionParticipants.add(studentId));

  return {
    className: classDoc.className || "Untitled Class",
    classCode: classDoc.classCode || "N/A",
    studentCountLabel: String((classDoc.students || []).length),
    averageGradeLabel: toPercentLabel(gradeSummary.overallAverage),
    attendanceRateLabel: toPercentLabel(attendanceSummary.overallRate),
    missionParticipationLabel: `${classMissionParticipants.size} student(s)`,
    generatedAtLabel: `Generated: ${formatDateLabel(new Date())}`,
    notes: "Class metrics are compiled from current grade, attendance, and mission records.",
    studentRows: studentRows.map((row) => ({
      student: row.student,
      grade: row.grade,
      attendance: row.attendance,
      points: String(row.points)
    }))
  };
}

function buildReportErrorMessage(err) {
  if (err?.code === "LATEX_COMPILER_MISSING") {
    return "PDF compiler not available on this server. Install pdflatex (TeX Live).";
  }
  if (err?.code === "LATEX_CLASS_MISSING") {
    return "The report class file is missing on the server. Contact engineering support.";
  }
  return "Failed to generate report PDF.";
}

function buildPdfDownloadFileName(prefix, targetName) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${normalizeJobName(`${prefix}-${targetName}`)}-${stamp}.pdf`;
}

async function generateStudentReportResult(req, studentId) {
  const payload = await buildStudentReportPayload(req, studentId);
  if (!payload) return null;

  const latexSource = renderStudentReportLatex(payload);
  const fileName = buildPdfDownloadFileName("student-report", payload.studentName);
  const pdfBuffer = await compileLatexToPdf({
    latexSource,
    jobName: normalizeJobName(`student-report-${payload.studentName}`)
  });

  await recordReportGeneration(req, {
    reportType: "student",
    targetId: payload.studentObjectId || studentId,
    targetName: payload.studentName,
    fileName
  });

  return { payload, pdfBuffer, fileName };
}

async function generateClassReportResult(req, classId) {
  const payload = await buildClassReportPayload(req, classId);
  if (!payload) return null;

  const latexSource = renderClassReportLatex(payload);
  const fileName = buildPdfDownloadFileName("class-report", payload.className);
  const pdfBuffer = await compileLatexToPdf({
    latexSource,
    jobName: normalizeJobName(`class-report-${payload.className}`)
  });

  await recordReportGeneration(req, {
    reportType: "class",
    targetId: classId,
    targetName: payload.className,
    fileName
  });

  return { payload, pdfBuffer, fileName };
}
module.exports = {
  getIndex: (req, res) => {
    res.render("index.ejs");
  },
  getMainPage: async (req, res) => {
    try {
      const [verses, reminders, studentAnnouncementsRaw] = await Promise.all([
        Verses.find().lean(),
        Reflection.find().lean(),
        getVisibleAnnouncementsForUser(req, req.user, { limit: 8 })
      ]);
      const randomVerses = verses[Math.floor(Math.random() * verses.length)];
      const randomReminders = reminders[Math.floor(Math.random() * reminders.length)]
      const studentAnnouncements = studentAnnouncementsRaw.map((announcement) =>
        toAnnouncementViewModel(announcement)
      );
      res.render("student/student.ejs", {
        user: req.user,
        verses: randomVerses,
        reflections: randomReminders,
        studentAnnouncements
      });

    } catch (err) {
      console.error(err);
      res.send("Error loading reflection");
    }
  },
  getAdmin: async (req, res) => {
    try {
      const [analytics, adminAnnouncementsRaw] = await Promise.all([
        getCachedAdminAnalytics(req),
        getVisibleAnnouncementsForUser(req, req.user, { limit: 8 })
      ]);
      const adminAnnouncements = adminAnnouncementsRaw.map((announcement) =>
        toAnnouncementViewModel(announcement)
      );
      res.render("admin/admin.ejs", {
        user: req.user,
        classes: analytics.classes,
        missions: analytics.missionDocs,
        teachers: analytics.teachers,
        students: analytics.students,
        parents: analytics.parents,
        adminMetrics: analytics.metrics,
        adminAnnouncements,
        activePage: "dashboard",
        messages: req.flash()
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getAdminAttendance: async (req, res) => {
    try {
      const requestedDays = Number.parseInt(req.query.days, 10);
      const daysBack = Number.isFinite(requestedDays)
        ? Math.min(Math.max(requestedDays, 7), 365)
        : 90;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);

      const attendanceDocs = await Attendance.find(
        scopedQuery(req, { date: { $gte: sinceDate } })
      )
        .sort({ date: -1 })
        .limit(3000)
        .lean();
      const activePage = String(req.path || "").includes("/announcements")
        ? "announcements"
        : "attendance";

      res.render("admin/attendance.ejs", {
        user: req.user,
        activePage,
        attendanceWindowDays: daysBack,
        attendancePage: buildAdminAttendancePage(attendanceDocs),
        messages: req.flash()
      });
    } catch (err) {
      console.error("Admin attendance page error:", err);
      res.status(500).send("Error loading attendance");
    }
  },
  getAdminReports: async (req, res) => {
    try {
      const [students, classes, analytics] = await Promise.all([
        User.find(scopedQuery(req, { role: "student" }))
          .select("_id firstName lastName userName studentInfo.studentNumber")
          .sort({ firstName: 1, lastName: 1 })
          .lean(),
        Class.find(scopedQuery(req))
          .select("_id className classCode students")
          .sort({ className: 1 })
          .lean(),
        getCachedAdminAnalytics(req)
      ]);

      res.render("admin/reports.ejs", {
        user: req.user,
        activePage: "reports",
        students,
        classes,
        adminMetrics: analytics.metrics,
        reportStats: analytics.metrics.reportStats || null,
        messages: req.flash()
      });
    } catch (err) {
      console.error("Admin reports page error:", err);
      res.status(500).send("Error loading admin reports");
    }
  },
  getAdminReportStats: async (req, res) => {
    try {
      const stats = await buildReportGenerationStats(req);
      return res.json({ success: true, stats });
    } catch (err) {
      console.error("Admin report stats error:", err);
      return res.status(500).json({
        success: false,
        error: "REPORT_STATS_FAILED",
        message: "Failed to load report stats."
      });
    }
  },
  downloadStudentReportPdf: async (req, res) => {
    try {
      const result = await generateStudentReportResult(req, req.params.id);
      if (!result) {
        req.flash("errors", [{ msg: "Student not found for this school." }]);
        return res.redirect("/admin/reports");
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("Student report generation failed:", err?.details || err);
      const message = buildReportErrorMessage(err);
      req.flash("errors", [{ msg: message }]);
      return res.redirect("/admin/reports");
    }
  },
  generateStudentReportPdfAsync: async (req, res) => {
    try {
      const result = await generateStudentReportResult(req, req.params.id);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: "REPORT_TARGET_NOT_FOUND",
          message: "Student not found for this school."
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("Async student report generation failed:", err?.details || err);
      const message = buildReportErrorMessage(err);
      const status = err?.code === "LATEX_COMPILER_MISSING" ? 503 : 500;
      return res.status(status).json({
        success: false,
        error: err?.code || "REPORT_GENERATION_FAILED",
        message
      });
    }
  },
  downloadClassReportPdf: async (req, res) => {
    try {
      const result = await generateClassReportResult(req, req.params.id);
      if (!result) {
        req.flash("errors", [{ msg: "Class not found for this school." }]);
        return res.redirect("/admin/reports");
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("Class report generation failed:", err?.details || err);
      const message = buildReportErrorMessage(err);
      req.flash("errors", [{ msg: message }]);
      return res.redirect("/admin/reports");
    }
  },
  generateClassReportPdfAsync: async (req, res) => {
    try {
      const result = await generateClassReportResult(req, req.params.id);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: "REPORT_TARGET_NOT_FOUND",
          message: "Class not found for this school."
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("Async class report generation failed:", err?.details || err);
      const message = buildReportErrorMessage(err);
      const status = err?.code === "LATEX_COMPILER_MISSING" ? 503 : 500;
      return res.status(status).json({
        success: false,
        error: err?.code || "REPORT_GENERATION_FAILED",
        message
      });
    }
  },
  getTeacher: async (req, res) => {
    try {
      const rawClasses = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const classes = rawClasses.map((cls) => prepareClassWithConfig(cls, req.user._id));
      const students = classes.flatMap(cls => cls.students || []);
      const classIds = classes.map(cls => cls._id);

      const [grades, missions, attendanceDocs, studentDocs, teacherAnnouncementsRaw] = await Promise.all([
        Grade.find(scopedQuery(req, { 'classInfo._id': { $in: classIds } })).lean(),
        Mission.find(scopedQuery(req, { "createdBy._id": req.user._id })).sort({ createdAt: -1 }).lean(),
        Attendance.find({
          schoolId: req.schoolId,
          classId: { $in: classIds },
          date: {
            $gte: (() => {
              const d = new Date();
              d.setDate(d.getDate() - 30);
              return d;
            })()
          }
        }).lean(),
        User.find(scopedQuery(req, { _id: { $in: students.map((student) => student._id) } }))
          .select("_id firstName lastName points")
          .lean(),
        getVisibleAnnouncementsForUser(req, req.user, { limit: 8 })
      ]);
      const teacherAnnouncements = teacherAnnouncementsRaw.map((announcement) =>
        toAnnouncementViewModel(announcement)
      );

      const studentLookup = new Map(
        studentDocs.map((student) => [String(student._id), student])
      );
      const gradesByClass = new Map();
      grades.forEach((grade) => {
        const gradeClassId = grade.classInfo?.[0]?._id ? String(grade.classInfo[0]._id) : null;
        if (!gradeClassId) return;
        if (!gradesByClass.has(gradeClassId)) gradesByClass.set(gradeClassId, []);
        gradesByClass.get(gradeClassId).push(grade);
      });

      const attendanceByClass = new Map();
      attendanceDocs.forEach((entry) => {
        const classId = String(entry.classId);
        if (!attendanceByClass.has(classId)) attendanceByClass.set(classId, []);
        attendanceByClass.get(classId).push(entry);
      });

      const classesWithMetrics = classes.map((cls) => {
        const clsId = String(cls._id);
        const classGrades = gradesByClass.get(clsId) || [];
        const classAttendance = attendanceByClass.get(clsId) || [];

        const totalGradePercent = classGrades.reduce((sum, grade) => {
          const maxScore = Number(grade.Assignment?.maxScore || 100);
          const score = Number(grade.Assignment?.grade || 0);
          if (!maxScore) return sum;
          return sum + ((score / maxScore) * 100);
        }, 0);
        const classAveragePercent = classGrades.length
          ? (totalGradePercent / classGrades.length).toFixed(1)
          : null;

        let attendanceCount = 0;
        let presentCount = 0;
        classAttendance.forEach((entry) => {
          (entry.records || []).forEach((record) => {
            attendanceCount += 1;
            if (record.status === "Present") presentCount += 1;
          });
        });

        const attendanceRate = attendanceCount
          ? ((presentCount / attendanceCount) * 100).toFixed(1)
          : null;

        const topStudents = (cls.students || [])
          .map((student) => {
            const matchedStudent = studentLookup.get(String(student._id));
            return {
              _id: student._id,
              name: student.name || `${matchedStudent?.firstName || ""} ${matchedStudent?.lastName || ""}`.trim(),
              points: Number(matchedStudent?.points || 0)
            };
          })
          .sort((a, b) => b.points - a.points)
          .slice(0, 5);

        const recentAnnouncements = [...classGrades]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 4)
          .map((grade) => ({
            id: grade._id,
            title: `${grade.subject}: ${grade.Assignment?.name || "Assessment"}`,
            detail: `${grade.Assignment?.grade || 0}/${grade.Assignment?.maxScore || 100}`,
            createdAt: grade.createdAt
          }));

        const activeSectionKeys = (cls.activeDashboardSections || []).map((section) => section.key);

        return {
          ...cls,
          activeSectionKeys,
          dashboardMetrics: {
            students: (cls.students || []).length,
            subjects: (cls.activeSubjects || []).length,
            categories: (cls.activeGradingCategories || []).length,
            gradesRecorded: classGrades.length,
            classAveragePercent,
            attendanceRate,
            missionsCreated: missions.length
          },
          topStudents,
          recentAnnouncements
        };
      });

      res.render("teacher/teacher.ejs", {
        user: req.user,
        classes: classesWithMetrics,
        missions,
        students,
        grades,
        teacherAnnouncements,
        getSubjectAverage,
        normalizeCategoryKey
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacherGrades: async (req, res) => {
    try {
      const missions = await Mission.find(scopedQuery(req)).lean();
      const rawClasses = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const classes = rawClasses.map((cls) => prepareClassWithConfig(cls, req.user._id));
      const students = classes.flatMap(cls => cls.students);
      const classIds = classes.map(cls => cls._id);
      const grades = await Grade.find(scopedQuery(req, { 'classInfo._id': { $in: classIds } })).lean();

      const gradesByClass = new Map();
      grades.forEach((grade) => {
        const classKey = grade?.classInfo?.[0]?._id ? String(grade.classInfo[0]._id) : null;
        if (!classKey) return;
        if (!gradesByClass.has(classKey)) gradesByClass.set(classKey, []);
        gradesByClass.get(classKey).push(grade);
      });

      const decoratedClasses = classes.map((cls) => {
        const classGrades = gradesByClass.get(String(cls._id)) || [];
        const catalog = buildDisplayCatalogForClass(cls, classGrades);
        return {
          ...cls,
          displaySubjects: catalog.subjects,
          displayCategories: catalog.categories
        };
      });

      res.render("teacher/teacherGrades.ejs", {
        user: req.user,
        classes: decoratedClasses,
        missions,
        students,
        grades,
        getSubjectAverage,
        normalizeCategoryKey,
        getGradeSubjectKey,
        getGradeCategoryKey
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacherCustomization: async (req, res) => {
    try {
      const rawClasses = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const classes = rawClasses.map((cls) => prepareClassWithConfig(cls, req.user._id));
      const classIds = classes.map((cls) => cls._id);

      const gradeDocs = await Grade.find(scopedQuery(req, { "classInfo._id": { $in: classIds } }))
        .select("classInfo")
        .lean();
      const gradeCountByClass = new Map();
      gradeDocs.forEach((grade) => {
        const classKey = grade?.classInfo?.[0]?._id ? String(grade.classInfo[0]._id) : null;
        if (!classKey) return;
        gradeCountByClass.set(classKey, (gradeCountByClass.get(classKey) || 0) + 1);
      });

      const decoratedClasses = classes.map((cls) => ({
        ...cls,
        gradeCount: gradeCountByClass.get(String(cls._id)) || 0
      }));

      if (!decoratedClasses.length) {
        return res.render("teacher/teacherCustomization.ejs", {
          user: req.user,
          classes: [],
          selectedClass: null,
          dashboardLayouts: DASHBOARD_LAYOUTS
        });
      }

      const selectedClassId = String(req.query.classId || decoratedClasses[0]._id);
      const selectedClass = decoratedClasses.find((cls) => String(cls._id) === selectedClassId) || decoratedClasses[0];

      return res.render("teacher/teacherCustomization.ejs", {
        user: req.user,
        classes: decoratedClasses,
        selectedClass,
        dashboardLayouts: DASHBOARD_LAYOUTS
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacherAttendance: async (req, res) => {
    try {
      // 1. Get teacher's classes (with students populated if needed)
      const classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id }))
        .select('className students classCode _id') // only what you need
        .lean();

      if (classes.length === 0) {
        return res.render('teacher/teacherAttendance', {
          user: req.user,
          classes: [],
          months: [],
          selectedYear: new Date().getFullYear(),
          attendance: []
        });
      }

      const classIds = classes.map(c => c._id);
      const selectedYear = parseInt(req.query.year, 10) || new Date().getFullYear();

      // 2. Only fetch attendance for THIS teacher's classes + selected year
      const startDate = new Date(`${selectedYear}-01-01`);
      const endDate = new Date(`${selectedYear}-12-31`);

      const attendance = await Attendance.find({
        schoolId: req.schoolId,
        classId: { $in: classIds },
        date: { $gte: startDate, $lte: endDate }
      }).lean();

      // 3. Pre-build a fast lookup map (BEST PRACTICE — makes EJS 100x faster)
      const attendanceMap = {};

      attendance.forEach(doc => {
        const dateKey = doc.date.toISOString().slice(0, 10); // "2025-12-15"
        doc.records.forEach(r => {
          const key = `${doc.classId}_${dateKey}_${r.studentId}`;
          attendanceMap[key] = r.status;
        });
      });

      // 4. Generate months
      const months = Array.from({ length: 12 }, (_, i) => {
        const days = new Date(selectedYear, i + 1, 0).getDate();
        return {
          name: new Date(selectedYear, i).toLocaleString('en-US', { month: 'long' }),
          index: i,
          days
        };
      });

      // 5. Render with clean, fast data
      res.render('teacher/teacherAttendance', {
        user: req.user,
        classes,
        months,
        selectedYear,
        attendanceMap,     // ← This is the magic
        // Remove: attendance, students (not needed anymore)
      });

    } catch (err) {
      console.error('Attendance load error:', err);
      res.status(500).render('error', { message: 'Failed to load attendance' });
    }
  },
  getParent: async (req, res) => {
    try {
      if (req.body.role === 'parent') return res.render("parent/parent.ejs")
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getTeacherMissions: async (req, res) => {
    try {
      const students = await User.find(scopedQuery(req, { role: "student" })).lean()
      const missions = await Mission.find(scopedQuery(req, { "createdBy._id": req.user._id })).lean();
      const classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const grades = await Grade.find(scopedQuery(req)).lean();
      res.render("teacher/teacherMissions.ejs", {
        user: req.user,
        classes: classes,
        missions: missions,
        students: students,
        grades: grades
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getParent: async (req, res) => {
    try {
      if (req.body.role === 'parent') return res.render("parent/parent.ejs")
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getDashboard: async (req, res) => {
    try {
      switch (req.user.role) {
        case 'admin':
          const [analytics, adminAnnouncementsRaw] = await Promise.all([
            buildAdminAnalytics(req),
            getVisibleAnnouncementsForUser(req, req.user, { limit: 8 })
          ]);
          const adminAnnouncements = adminAnnouncementsRaw.map((announcement) =>
            toAnnouncementViewModel(announcement)
          );
          res.render("admin/admin.ejs", {
            user: req.user,
            classes: analytics.classes,
            teachers: analytics.teachers,
            students: analytics.students,
            parents: analytics.parents,
            missions: analytics.missionDocs,
            adminMetrics: analytics.metrics,
            adminAnnouncements,
            activePage: "dashboard",
            messages: req.flash()
          })
          break;
        case 'teacher':
          res.render("teacher/teacher.ejs", {
            user: req.user,
          });
          break;
        case 'student':
          const [verses, reminders, studentAnnouncementsRaw] = await Promise.all([
            Verses.find().lean(),
            Reflection.find().lean(),
            getVisibleAnnouncementsForUser(req, req.user, { limit: 8 })
          ]);
          const randomVerses = verses[Math.floor(Math.random() * verses.length)];
          const randomReminders = reminders[Math.floor(Math.random() * reminders.length)]
          const studentAnnouncements = studentAnnouncementsRaw.map((announcement) =>
            toAnnouncementViewModel(announcement)
          );
          res.render("student/student.ejs", {
            user: req.user,
            verses: randomVerses,
            reflections: randomReminders,
            studentAnnouncements
          });
          break;
        case 'parent':
          res.render("parent/parent.ejs")
          break;
        default:
          res.render('/')
      }
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getGrades: async (req, res) => {
    //percentage to gpa calculation: (percentage/100)*4
    //get averge for all gpas and that is the final grade
    //get average for all subjects and that is the final grade
    const rawClasses = await Class.find(scopedQuery(req, { 'students._id': { $in: req.user._id } })).lean();
    const classes = rawClasses.map((cls) => prepareClassWithConfig(cls));
    // Get class IDs
    const classIds = classes.map(cls => cls._id);
    const grades = await Grade.find(scopedQuery(req, {
      'classInfo._id': { $in: classIds },
      'students._id': req.user._id
    })).lean();

    const attendance = await Attendance.find(scopedQuery(req, {
      'records.studentId': req.user._id
    })).lean();

    const selectedYear = parseInt(req.query.year, 10) || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
      const days = new Date(selectedYear, i + 1, 0).getDate();
      return {
        name: new Date(selectedYear, i).toLocaleString("en-US", { month: "long" }),
        index: i,
        days
      };
    });

    const gradesByClass = new Map();
    grades.forEach((grade) => {
      const classKey = grade?.classInfo?.[0]?._id ? String(grade.classInfo[0]._id) : null;
      if (!classKey) return;
      if (!gradesByClass.has(classKey)) gradesByClass.set(classKey, []);
      gradesByClass.get(classKey).push(grade);
    });

    const decoratedClasses = classes.map((cls) => {
      const classGrades = gradesByClass.get(String(cls._id)) || [];
      const catalog = buildDisplayCatalogForClass(cls, classGrades);
      return {
        ...cls,
        displaySubjects: catalog.subjects,
        displayCategories: catalog.categories
      };
    });

    try {
      res.render('student/grades.ejs', {
        user: req.user,
        grades: grades,
        getSubjectAverage,
        classes: decoratedClasses,
        attendance: attendance,
        selectedYear: selectedYear,
        months: months,
        normalizeCategoryKey,
        getGradeSubjectKey,
        getGradeCategoryKey
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getMissions: async (req, res) => {
    try {
      res.render('missions.ejs', {
        user: req.user,
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getLibrary: async (req, res) => {
    try {
      res.render('library.ejs', {
        user: req.user,
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getProfile: async (req, res) => {
    console.log(req.user.role)
    let classes;
    if (req.user.role === 'teacher') {
      classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
    } else if (req.user.role === 'student') {
      classes = await Class.find(scopedQuery(req, { 'students._id': req.user._id })).lean();
    } else {
      classes = await Class.find(scopedQuery(req)).lean();

    }
    console.log(classes)
    try {
      res.render('profile.ejs', {
        user: req.user,
        classes: classes
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getUsers: async (req, res) => {
    try {
      const roleFilterRaw = String(req.query.role || "all").trim().toLowerCase();
      const allowedRoleFilters = new Set(["all", "student", "teacher", "parent"]);
      const roleFilter = allowedRoleFilters.has(roleFilterRaw) ? roleFilterRaw : "all";
      const searchRegex = buildSafeRegexQuery(req.query.q);
      const pagination = parsePaginationParams(req.query, { defaultLimit: 80, maxLimit: 200 });

      const shouldLoadRole = (role) => roleFilter === "all" || roleFilter === role;
      const applyFilters = (base) => {
        if (!searchRegex) return base;
        return {
          ...base,
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { userName: searchRegex },
            { email: searchRegex }
          ]
        };
      };

      const studentsQuery = shouldLoadRole("student")
        ? User.find(scopedQuery(req, applyFilters({ role: "student" })))
          .select("firstName lastName userName email DOB studentInfo teacherInfo parentInfo points rank role deletedAt")
          .sort({ firstName: 1, lastName: 1, userName: 1 })
        : null;
      if (studentsQuery && pagination.enabled) {
        studentsQuery.skip(pagination.skip).limit(pagination.limit);
      }

      const teachersQuery = shouldLoadRole("teacher")
        ? User.find(scopedQuery(req, applyFilters({ role: "teacher" })))
          .select("firstName lastName userName email DOB teacherInfo role deletedAt")
          .sort({ firstName: 1, lastName: 1, userName: 1 })
        : null;
      if (teachersQuery && pagination.enabled) {
        teachersQuery.skip(pagination.skip).limit(pagination.limit);
      }

      const parentsQuery = shouldLoadRole("parent")
        ? User.find(scopedQuery(req, applyFilters({ role: "parent" })))
          .select("firstName lastName userName email DOB parentInfo role deletedAt")
          .populate({
            path: "parentInfo.children.childID",
            select: "firstName lastName userName",
            match: { schoolId: req.schoolId }
          })
          .sort({ firstName: 1, lastName: 1, userName: 1 })
        : null;
      if (parentsQuery && pagination.enabled) {
        parentsQuery.skip(pagination.skip).limit(pagination.limit);
      }

      const [students, teachers, parents, counts] = await Promise.all([
        studentsQuery ? studentsQuery.lean() : Promise.resolve([]),
        teachersQuery ? teachersQuery.lean() : Promise.resolve([]),
        parentsQuery ? parentsQuery.lean() : Promise.resolve([]),
        pagination.enabled
          ? Promise.all([
            shouldLoadRole("student")
              ? User.countDocuments(scopedQuery(req, applyFilters({ role: "student" })))
              : Promise.resolve(0),
            shouldLoadRole("teacher")
              ? User.countDocuments(scopedQuery(req, applyFilters({ role: "teacher" })))
              : Promise.resolve(0),
            shouldLoadRole("parent")
              ? User.countDocuments(scopedQuery(req, applyFilters({ role: "parent" })))
              : Promise.resolve(0)
          ])
          : Promise.resolve(null)
      ]);

      // normalize null fields
      students.forEach(s => {
        s.studentInfo = s.studentInfo || {};
        s.studentInfo.parents = s.studentInfo.parents || [];
      });

      parents.forEach(p => {
        p.parentInfo = p.parentInfo || {};
        p.parentInfo.children = p.parentInfo.children || [];
      });

      res.render("admin/users.ejs", {
        user: req.user,
        students,
        teachers,
        parents,
        activePage: "students",
        messages: req.flash(),
        userFilters: {
          role: roleFilter,
          query: String(req.query.q || "").trim()
        },
        pagination: pagination.enabled
          ? {
            enabled: true,
            page: pagination.page,
            limit: pagination.limit,
            studentTotal: counts?.[0] || 0,
            teacherTotal: counts?.[1] || 0,
            parentTotal: counts?.[2] || 0
          }
          : { enabled: false },

        getAge: function (dob) {
          if (!dob) return "N/A";
          let birth = new Date(dob);
          let diff = Date.now() - birth;
          return Math.abs(new Date(diff).getUTCFullYear() - 1970);
        }
      });

    } catch (err) {
      console.error(err);
      return res.status(500).send("Error loading users"); // only 1 response
    }
  },
  getResetPassword: async (req, res) => {
    try {
      if (!req.user) return res.redirect("/login");

      res.render("resetPassword.ejs", {
        user: req.user,
        messages: req.flash(),
      });
    } catch (err) {
      console.error("Error rendering reset password page:", err);
      res.status(500).send("Error loading reset password page.");
    }
  },
  getClasses: async (req, res) => {
    try {
      const students = await User.find(scopedQuery(req, { role: "student" }))
        .select("_id firstName lastName userName studentInfo.gradeLevel studentInfo.programType")
        .sort({ firstName: 1, lastName: 1, userName: 1 })
        .lean();
      const teachers = await User.find(scopedQuery(req, { role: "teacher" }))
        .select("_id firstName lastName userName teacherInfo.subjects")
        .sort({ firstName: 1, lastName: 1, userName: 1 })
        .lean();
      const classes = await Class.find(scopedQuery(req))
        .sort({ className: 1 })
        .lean();
      res.render("admin/class.ejs", {
        user: req.user,
        students,
        teachers,
        classes,
        activePage: "classes",
        messages: req.flash()
      })
    } catch (err) {
      console.log(err)
      res.redirect('/admin/classes')
    }
  },
  getStudentMissions: async (req, res) => {
    try {
      const classes = await Class.find(scopedQuery(req, { 'students._id': req.user._id })).lean();

      const allStudentIds = classes
        .flatMap(c => c.students.map(s => s._id.toString()));

      const uniqueStudentIds = [...new Set(allStudentIds)];

      const studentUsers = await User.find(scopedQuery(req, {
        _id: { $in: uniqueStudentIds }
      })).sort({ points: -1 });

      console.log('Students:', studentUsers.length)
      const fullName = `${req.user.firstName} ${req.user.lastName}`;

      let teacherNames = [];
      classes.forEach(cls => {
        if (cls.teachers && cls.teachers.length > 0) {
          cls.teachers.forEach(t => {
            teacherNames.push(t.name);
          });
        }
      });

      const missions = await Mission.find(scopedQuery(req, {
        'createdBy.name': { $in: teacherNames }
      })).lean();

      console.log("classes:", classes.length);
      console.log("missions found:", missions.length);

      const activeMissions = missions.filter(m =>
        m.active?.studentInfo?.some(s =>
          s.name === fullName && s.status === "started"
        )
      );

      console.log("activeMissions count:", activeMissions.length);

      // FIXED: Only log if there are active missions
      if (activeMissions.length > 0) {
        console.log("First active mission:", activeMissions[0].title);
      } else {
        console.log("No active missions found for this student");
      }

      res.render("student/missions.ejs", {
        user: req.user,
        missions: missions,
        classes: classes,
        activeMissions: activeMissions,
        students: studentUsers
      });

    } catch (err) {
      console.log(`Error: ${err}`);
      res.status(500).send("Error loading missions page");
    }
  }

};
