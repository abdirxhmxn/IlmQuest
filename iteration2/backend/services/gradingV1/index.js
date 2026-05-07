const mongoose = require("mongoose");

const Assessment = require("../../models/Assessment");
const ClassModel = require("../../models/Class");
const TrackerColumn = require("../../models/TrackerColumn");
const Counter = require("../../models/Counter");
const GradeComment = require("../../models/GradeComment");
const GradeEvent = require("../../models/GradeEvent");
const GradingPeriod = require("../../models/GradingPeriod");
const KeySystem = require("../../models/KeySystem");
const PeriodRanking = require("../../models/PeriodRanking");
const RankCache = require("../../models/RankCache");
const SummaryCache = require("../../models/SummaryCache");
const User = require("../../models/User");
const { buildRankSummaryFromUser } = require("../../utils/ranks");
const { scopedQuery, scopedIdQuery, resolveSchoolId } = require("../../utils/tenant");
const {
  KEY_SYSTEM_VERSION,
  KEY_SYSTEMS_V1,
  CATEGORY_TO_KEY_SYSTEM_V1
} = require("../../src/shared/calculations/constants");
const {
  calculateStudentSummary,
  getLatestCellStates,
  rankStudents
} = require("../../src/shared/calculations");

const DAILY_COLUMN_DEFINITIONS = [
  {
    key: "q",
    category: "cashar",
    label: "Q",
    longLabel: "Cashar / Qur'an",
    headerTone: "cashar"
  },
  {
    key: "w",
    category: "writing",
    label: "W",
    longLabel: "Writing",
    headerTone: "cashar"
  },
  {
    key: "s",
    category: "subject",
    label: "S",
    longLabel: "Subject",
    headerTone: "cashar"
  },
  {
    key: "subac",
    category: "subac",
    label: "Sub",
    longLabel: "Subac",
    headerTone: "subac"
  },
  {
    key: "attendance",
    category: "attendance",
    label: "Att",
    longLabel: "Attendance",
    headerTone: "attendance"
  },
  {
    key: "behavior",
    category: "behavior",
    label: "Bhv",
    longLabel: "Behavior",
    headerTone: "behavior"
  }
];

const CATEGORY_DISPLAY_ORDER = [
  "cashar",
  "writing",
  "subject",
  "subac",
  "attendance",
  "behavior",
  "assessment"
];

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const DEFAULT_VISIBLE_TRACKER_DAYS = 5;

class GradebookError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.name = "GradebookError";
    this.status = status;
    this.details = details;
  }
}

function safeTrim(value, maxLength = 0) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (maxLength > 0) return cleaned.slice(0, maxLength);
  return cleaned;
}

function pickPayloadValue(payload = {}, keys = []) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return "";
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function parseObjectId(value) {
  const id = safeTrim(value);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new GradebookError("Invalid id supplied.", 400);
  }
  return new mongoose.Types.ObjectId(id);
}

function toDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "").trim())) return null;
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function formatDateShort(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  });
}

function formatDayShort(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
}

function formatDateTimeLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatGradeLabel(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function formatAverageLabel(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatDateLong(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function formatVisibleRangeLabel(dateColumns = []) {
  const firstDateKey = safeTrim(dateColumns?.[0]?.dateKey);
  const lastDateKey = safeTrim(dateColumns?.[dateColumns.length - 1]?.dateKey);
  if (!firstDateKey || !lastDateKey) return "Current Week";
  if (firstDateKey === lastDateKey) return formatDateLong(firstDateKey);
  return `${formatDateLong(firstDateKey)} - ${formatDateLong(lastDateKey)}`;
}

function shiftDateKey(dateKey, dayDelta = 0) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "";
  const nextDate = new Date(parsed);
  nextDate.setUTCDate(nextDate.getUTCDate() + Number(dayDelta || 0));
  return toDateKey(nextDate);
}

function getActorName(actor = {}) {
  return safeTrim(`${actor.firstName || ""} ${actor.lastName || ""}`) || safeTrim(actor.userName) || "Staff";
}

function ensureTeacherAssignedToClass(classDoc, teacherId) {
  return Array.isArray(classDoc?.teachers)
    && classDoc.teachers.some((teacher) => String(teacher?._id) === String(teacherId));
}

function ensureStudentInClass(classDoc, studentId) {
  return Array.isArray(classDoc?.students)
    && classDoc.students.some((student) => String(student?._id) === String(studentId));
}

function buildPeriodKey(classDoc = {}) {
  const year = safeTrim(classDoc?.academicYear?.year || "current");
  const semester = safeTrim(classDoc?.academicYear?.semester || "semester");
  const quarter = safeTrim(classDoc?.academicYear?.quarter || "Q1");
  return [year, semester.toLowerCase().replace(/\s+/g, "-"), quarter.toLowerCase()].join(":");
}

function getAssessmentColumnKey(assessmentId) {
  return `assessment:${String(assessmentId || "")}`;
}

function getTrackerColumnKey(trackerColumnId) {
  return `trackerCol:${String(trackerColumnId || "")}`;
}

function isTrackerColumnKey(columnKey) {
  return String(columnKey || "").startsWith("trackerCol:");
}

function extractTrackerColumnId(columnKey) {
  return String(columnKey || "").replace(/^trackerCol:/, "");
}

function buildCoordinateKey({
  classId,
  studentId,
  gradingPeriodId,
  category,
  dateKey = "",
  columnKey = "",
  assessmentId = ""
}) {
  return [
    String(classId || ""),
    String(studentId || ""),
    String(gradingPeriodId || ""),
    safeTrim(category).toLowerCase(),
    safeTrim(dateKey),
    safeTrim(columnKey),
    String(assessmentId || "")
  ].join("::");
}

function buildStableCellKey({
  studentId,
  category,
  subcategory = "",
  schoolDate = "",
  assessmentId = ""
}) {
  return [
    String(studentId || ""),
    safeTrim(category).toLowerCase(),
    safeTrim(subcategory),
    safeTrim(schoolDate),
    String(assessmentId || "")
  ].join("|");
}

function getEventStudentId(event = {}) {
  return toIdString(event.studentId || event.student_id);
}

function getEventCategory(event = {}) {
  return safeTrim(event.category || event.categoryKey || event.category_key || event.type).toLowerCase();
}

function getEventColumnKey(event = {}) {
  return safeTrim(event.columnKey || event.column_key || event.subcategory);
}

function getEventDateKey(event = {}) {
  return safeTrim(event.dateKey || event.date_key || event.schoolDate || event.school_date);
}

function getEventAssessmentId(event = {}) {
  return toIdString(event.assessmentId || event.assessment_id);
}

function buildStableCellKeyFromEvent(event = {}) {
  return buildStableCellKey({
    studentId: getEventStudentId(event),
    category: getEventCategory(event),
    subcategory: getEventColumnKey(event),
    schoolDate: getEventDateKey(event),
    assessmentId: getEventAssessmentId(event)
  });
}

function normalizeInboundGradebookPayload(payload = {}) {
  return {
    ...payload,
    classId: safeTrim(pickPayloadValue(payload, ["classId", "activeClassId"])),
    studentId: safeTrim(pickPayloadValue(payload, ["studentId"])),
    gradingPeriodId: safeTrim(pickPayloadValue(payload, ["gradingPeriodId"])),
    category: safeTrim(pickPayloadValue(payload, ["category"])),
    dateKey: safeTrim(pickPayloadValue(payload, ["dateKey", "schoolDate"])),
    columnKey: safeTrim(pickPayloadValue(payload, ["columnKey", "subcategory"])),
    assessmentId: safeTrim(pickPayloadValue(payload, ["assessmentId"])),
    markKey: safeTrim(pickPayloadValue(payload, ["markKey", "keyValue"])),
    behaviorSubcategory: safeTrim(pickPayloadValue(payload, ["behaviorSubcategory"])),
    reviewer: safeTrim(pickPayloadValue(payload, ["reviewer"])),
    revisionPortion: safeTrim(pickPayloadValue(payload, ["revisionPortion"])),
    postCloseReason: safeTrim(pickPayloadValue(payload, ["postCloseReason"])),
    clientEventId: safeTrim(pickPayloadValue(payload, ["clientEventId"]))
  };
}

function getDailyColumnDefinition(columnKey) {
  return DAILY_COLUMN_DEFINITIONS.find((column) => column.key === String(columnKey || "")) || null;
}

function getKeySystemKeyForCategory(category, assessmentDoc = null) {
  const normalized = safeTrim(category).toLowerCase();
  if (normalized === "assessment" && assessmentDoc?.keySystemKey) {
    return safeTrim(assessmentDoc.keySystemKey).toLowerCase();
  }
  return CATEGORY_TO_KEY_SYSTEM_V1[normalized] || "cashar";
}

function buildFallbackKeySystems() {
  return Object.entries(KEY_SYSTEMS_V1).reduce((acc, [systemKey, definition]) => {
    acc[systemKey] = {
      systemKey,
      label: definition.label,
      maxValue: Number(definition.maxValue || 1),
      marks: (Array.isArray(definition.marks) ? definition.marks : []).map((mark, index) => ({
        key: safeTrim(mark.key),
        symbol: safeTrim(mark.symbol),
        label: safeTrim(mark.label),
        description: safeTrim(mark.description),
        normalizedValue: Number.isFinite(Number(mark.normalizedValue)) ? Number(mark.normalizedValue) : null,
        countsTowardGrade: mark.countsTowardGrade !== false,
        sortOrder: Number.isFinite(Number(mark.sortOrder)) ? Number(mark.sortOrder) : index
      }))
    };
    return acc;
  }, {});
}

async function loadKeySystemsForSchool(schoolId) {
  const docs = await KeySystem.find({
    version: KEY_SYSTEM_VERSION,
    $or: [
      { schoolId: parseObjectId(schoolId) },
      { schoolId: null }
    ]
  }).lean();

  const fallback = buildFallbackKeySystems();
  const byKey = { ...fallback };

  docs.forEach((doc) => {
    const key = safeTrim(doc.systemKey).toLowerCase();
    if (!key) return;
    byKey[key] = {
      systemKey: key,
      label: safeTrim(doc.label),
      maxValue: Number(doc.maxValue || 1),
      marks: (Array.isArray(doc.marks) ? doc.marks : [])
        .map((mark, index) => ({
          key: safeTrim(mark.key),
          symbol: safeTrim(mark.symbol),
          label: safeTrim(mark.label),
          description: safeTrim(mark.description),
          normalizedValue: Number.isFinite(Number(mark.normalizedValue)) ? Number(mark.normalizedValue) : null,
          countsTowardGrade: mark.countsTowardGrade !== false,
          sortOrder: Number.isFinite(Number(mark.sortOrder)) ? Number(mark.sortOrder) : index
        }))
        .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    };
  });

  return byKey;
}

async function ensureGradingPeriodForClass({ schoolId, classDoc, actorId = null }) {
  const periodKey = buildPeriodKey(classDoc);
  const quarter = safeTrim(classDoc?.academicYear?.quarter || "Q1");
  const academicYear = safeTrim(classDoc?.academicYear?.year || "");
  const name = `${quarter} ${academicYear}`.trim();

  const period = await GradingPeriod.findOneAndUpdate(
    {
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      periodKey
    },
    {
      $setOnInsert: {
        name: name || quarter || "Current Period",
        academicYear,
        quarter,
        keySystemVersion: KEY_SYSTEM_VERSION,
        startsAt: null,
        endsAt: null,
        status: "open",
        postCloseEditEnabled: true,
        closedBy: actorId || null
      }
    },
    {
      new: true,
      upsert: true
    }
  );

  return period;
}

function buildRecentDateKeys(scheduleLabels = [], count = 10) {
  const targetWeekdays = Array.from(
    new Set(
      (Array.isArray(scheduleLabels) ? scheduleLabels : [])
        .map((label) => safeTrim(label))
        .filter((label) => Object.prototype.hasOwnProperty.call(WEEKDAY_TO_INDEX, label))
    )
  );
  const weekdayFilter = targetWeekdays.length ? targetWeekdays : ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const results = [];
  const seen = new Set();
  const cursor = new Date();
  cursor.setUTCHours(12, 0, 0, 0);

  for (let index = 0; index < 180 && results.length < count; index += 1) {
    const dateKey = toDateKey(cursor);
    const weekday = formatDayShort(dateKey);
    if (weekdayFilter.includes(weekday) && !seen.has(dateKey)) {
      results.push(dateKey);
      seen.add(dateKey);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return results.sort();
}

function buildCurrentWeekDateKeys(scheduleLabels = [], count = DEFAULT_VISIBLE_TRACKER_DAYS) {
  return buildWeekDateKeysForAnchor(toDateKey(new Date()), scheduleLabels, count);
}

function buildWeekDateKeysForAnchor(anchorDateKey, scheduleLabels = [], count = DEFAULT_VISIBLE_TRACKER_DAYS) {
  const targetWeekdays = Array.from(
    new Set(
      (Array.isArray(scheduleLabels) ? scheduleLabels : [])
        .map((label) => safeTrim(label))
        .filter((label) => Object.prototype.hasOwnProperty.call(WEEKDAY_TO_INDEX, label))
    )
  );
  const weekdayFilter = targetWeekdays.length ? targetWeekdays : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const today = parseDateKey(anchorDateKey) || parseDateKey(toDateKey(new Date())) || new Date();
  today.setUTCHours(12, 0, 0, 0);
  const dayIndex = today.getUTCDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + mondayOffset);

  const results = [];
  for (let index = 0; index < 14 && results.length < count; index += 1) {
    const cursor = new Date(monday);
    cursor.setUTCDate(monday.getUTCDate() + index);
    const dateKey = toDateKey(cursor);
    const weekday = formatDayShort(dateKey);
    if (weekdayFilter.includes(weekday)) {
      results.push(dateKey);
    }
  }

  return results.sort();
}

function buildDateColumns(existingDateKeys = [], scheduleLabels = [], maxColumns = 10, options = {}) {
  const focusDateKey = safeTrim(options?.focusDateKey);
  if (focusDateKey && parseDateKey(focusDateKey)) {
    return buildWeekDateKeysForAnchor(
      focusDateKey,
      scheduleLabels,
      Math.min(maxColumns, DEFAULT_VISIBLE_TRACKER_DAYS)
    ).map((dateKey) => ({
      dateKey,
      shortLabel: formatDateShort(dateKey),
      dayLabel: formatDayShort(dateKey)
    }));
  }

  const baseKeys = Array.isArray(existingDateKeys) ? existingDateKeys.filter(Boolean) : [];
  const fallbackKeys = baseKeys.length
    ? buildRecentDateKeys(scheduleLabels, maxColumns)
    : buildCurrentWeekDateKeys(scheduleLabels, Math.min(maxColumns, DEFAULT_VISIBLE_TRACKER_DAYS));
  const merged = Array.from(new Set([...baseKeys, ...fallbackKeys]))
    .filter(Boolean)
    .sort();
  const trimmed = merged.length > maxColumns ? merged.slice(merged.length - maxColumns) : merged;
  return trimmed.map((dateKey) => ({
    dateKey,
    shortLabel: formatDateShort(dateKey),
    dayLabel: formatDayShort(dateKey)
  }));
}

// getRawLiveCellStates replicates getLatestCellStates deduplication/filtering
// but keeps the raw MongoDB event shape so callers can read event.mark.key etc.
// getLatestCellStates returns normalized records (markKey at top level, no mark sub-object),
// which breaks buildCellView and buildClientEventSnapshot that expect event.mark.key.
function getRawLiveCellStates(events = []) {
  const sorted = (Array.isArray(events) ? events : [])
    .slice()
    .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
  const byCoordinate = new Map();
  sorted.forEach((event) => {
    const key = safeTrim(event.coordinateKey || event.coordinate_key);
    if (!key) return;
    byCoordinate.set(key, event);
  });
  return Array.from(byCoordinate.values()).filter(
    (event) => !event.supersededBy
      && !event.superseded_by
      && safeTrim(String(event.action || event.eventAction || "")).toLowerCase() !== "clear"
  );
}

function getLiveEventMap(events = []) {
  return new Map(
    getRawLiveCellStates(events).map((event) => [
      String(event.coordinateKey || ""),
      event
    ])
  );
}

function getLiveEventHydrationMap(events = []) {
  return new Map(
    getRawLiveCellStates(events).map((event) => [
      buildStableCellKeyFromEvent(event),
      event
    ])
  );
}

function getCommentMap(comments = []) {
  return new Map(
    (Array.isArray(comments) ? comments : []).map((comment) => [String(comment.coordinateKey || ""), comment])
  );
}

function buildAssessmentColumns(assessmentDocs = []) {
  return [...(Array.isArray(assessmentDocs) ? assessmentDocs : [])]
    .sort((left, right) => {
      const orderDelta = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      if (orderDelta !== 0) return orderDelta;
      const dateDelta = new Date(left.assessmentDate || 0).getTime() - new Date(right.assessmentDate || 0).getTime();
      if (dateDelta !== 0) return dateDelta;
      return safeTrim(left.title).localeCompare(safeTrim(right.title));
    })
    .map((assessment) => ({
      id: toIdString(assessment._id),
      title: safeTrim(assessment.title) || "Assessment",
      shortLabel: safeTrim(assessment.shortLabel) || safeTrim(assessment.title).slice(0, 12) || "Assessment",
      keySystemKey: getKeySystemKeyForCategory("assessment", assessment),
      assessmentDateLabel: assessment.assessmentDate ? formatDateShort(toDateKey(assessment.assessmentDate)) : ""
    }));
}

function buildTrackerColumns(dateColumns = [], dailyColumns = DAILY_COLUMN_DEFINITIONS, extraTrackerColumnDocs = []) {
  const extraByDate = new Map();
  (Array.isArray(extraTrackerColumnDocs) ? extraTrackerColumnDocs : []).forEach((col) => {
    const key = safeTrim(col.dateKey);
    if (!key) return;
    if (!extraByDate.has(key)) extraByDate.set(key, []);
    extraByDate.get(key).push(col);
  });

  return (Array.isArray(dateColumns) ? dateColumns : []).map((dateColumn) => {
    const baseColumns = (Array.isArray(dailyColumns) ? dailyColumns : []).map((dailyColumn) => ({
      dateKey: dateColumn.dateKey,
      dayLabel: dateColumn.dayLabel,
      shortLabel: dateColumn.shortLabel,
      category: dailyColumn.category,
      subcategory: dailyColumn.key,
      columnKey: dailyColumn.key,
      displayLabel: dailyColumn.label,
      longLabel: dailyColumn.longLabel,
      keySystemKey: getKeySystemKeyForCategory(dailyColumn.category),
      headerTone: dailyColumn.headerTone,
      isExtra: false,
      trackerColumnId: null
    }));

    const extras = (extraByDate.get(dateColumn.dateKey) || [])
      .slice()
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .map((col) => ({
        dateKey: dateColumn.dateKey,
        dayLabel: dateColumn.dayLabel,
        shortLabel: dateColumn.shortLabel,
        category: "subac",
        subcategory: getTrackerColumnKey(col._id),
        columnKey: getTrackerColumnKey(col._id),
        displayLabel: safeTrim(col.shortLabel) || "Sub",
        longLabel: col.portion ? `Subac: ${safeTrim(col.portion)}` : safeTrim(col.shortLabel) || "Extra Subac",
        portion: safeTrim(col.portion),
        reviewerNameSnapshot: safeTrim(col.reviewerNameSnapshot),
        notes: safeTrim(col.notes),
        keySystemKey: "subac",
        headerTone: "subac",
        isExtra: true,
        trackerColumnId: toIdString(col._id)
      }));

    return {
      dateKey: dateColumn.dateKey,
      shortLabel: dateColumn.shortLabel,
      dayLabel: dateColumn.dayLabel,
      columns: [...baseColumns, ...extras]
    };
  });
}

function buildCellTone(event = null) {
  const score = Number(event?.mark?.normalizedValue);
  if (!event || !Number.isFinite(score) || event?.mark?.countsTowardGrade === false) {
    return "empty";
  }
  if (score >= 0.85) return "excellent";
  if (score >= 0.65) return "strong";
  if (score >= 0.4) return "watch";
  return "critical";
}

function buildCellView({
  schoolId,
  classId,
  studentId,
  gradingPeriodId,
  category,
  dateKey = "",
  columnKey = "",
  assessmentId = "",
  keySystemsByKey = {},
  liveEvent = null,
  comment = null,
  assessmentColumn = null
}) {
  const keySystemKey = getKeySystemKeyForCategory(category, assessmentColumn ? { keySystemKey: assessmentColumn.keySystemKey } : null);
  const keySystem = keySystemsByKey[keySystemKey] || buildFallbackKeySystems()[keySystemKey];
  const coordinateKey = buildCoordinateKey({
    classId,
    studentId,
    gradingPeriodId,
    category,
    dateKey,
    columnKey,
    assessmentId
  });
  const stableCellKey = buildStableCellKey({
    studentId,
    category,
    subcategory: columnKey,
    schoolDate: dateKey,
    assessmentId
  });
  const mark = liveEvent?.mark || {};
  const markKey = safeTrim(mark.key);
  const isAssessment = safeTrim(category) === "assessment";
  const options = (Array.isArray(keySystem?.marks) ? keySystem.marks : []).map((entry) => ({
    key: safeTrim(entry.key),
    symbol: safeTrim(entry.symbol),
    label: safeTrim(entry.label),
    countsTowardGrade: entry.countsTowardGrade !== false,
    normalizedValue: Number.isFinite(Number(entry.normalizedValue)) ? Number(entry.normalizedValue) : null
  }));

  return {
    coordinateKey,
    stableCellKey,
    schoolId: String(schoolId || ""),
    classId: String(classId || ""),
    studentId: String(studentId || ""),
    gradingPeriodId: String(gradingPeriodId || ""),
    category: safeTrim(category).toLowerCase(),
    dateKey: safeTrim(dateKey),
    columnKey: safeTrim(columnKey),
    assessmentId: String(assessmentId || ""),
    keySystemKey,
    markKey,
    symbol: safeTrim(mark.symbol),
    label: safeTrim(mark.label),
    normalizedValue: Number.isFinite(Number(mark.normalizedValue)) ? Number(mark.normalizedValue) : null,
    countsTowardGrade: mark.countsTowardGrade !== false,
    reviewer: safeTrim(liveEvent?.metadata?.reviewer),
    revisionPortion: safeTrim(liveEvent?.metadata?.revisionPortion),
    behaviorSubcategory: safeTrim(liveEvent?.metadata?.behaviorSubcategory),
    postCloseEdit: Boolean(liveEvent?.metadata?.postCloseEdit),
    postCloseReason: safeTrim(liveEvent?.metadata?.postCloseReason),
    updatedAtLabel: liveEvent?.createdAt ? formatDateTimeLabel(liveEvent.createdAt) : "",
    historyCount: 0,
    tone: buildCellTone(liveEvent),
    hasInternalComment: Boolean(safeTrim(comment?.internalComment)),
    hasParentComment: Boolean(safeTrim(comment?.parentComment)),
    detailLabel: isAssessment
      ? (assessmentColumn?.title || "Assessment")
      : (getDailyColumnDefinition(columnKey)?.longLabel || safeTrim(category)),
    headerLabel: isAssessment
      ? (assessmentColumn?.shortLabel || "Assessment")
      : (getDailyColumnDefinition(columnKey)?.label || safeTrim(category)),
    options
  };
}

function buildSummaryView(summary = {}) {
  const categoryTotals = summary.categoryTotals || {};
  const cells = {};

  CATEGORY_DISPLAY_ORDER.forEach((category) => {
    cells[category] = {
      category,
      average: categoryTotals?.[category]?.average ?? null,
      value: categoryTotals?.[category]?.average ?? null,
      display: formatAverageLabel(categoryTotals?.[category]?.average),
      includedCount: Number(categoryTotals?.[category]?.includedCount || 0),
      count: Number(categoryTotals?.[category]?.count || 0)
    };
  });

  cells.final = {
    category: "final",
    average: summary.finalFraction ?? null,
    value: summary.finalPercentage ?? null,
    display: formatGradeLabel(summary.finalPercentage),
    includedCount: summary.activeCategories?.length || 0,
    count: summary.activeCategories?.length || 0
  };

  return cells;
}

function createDefaultSummaryCell(category) {
  return {
    category,
    display: "—",
    value: null,
    average: null,
    includedCount: 0,
    count: 0
  };
}

function buildDefaultSummaryCells() {
  return {
    cashar: createDefaultSummaryCell("cashar"),
    writing: createDefaultSummaryCell("writing"),
    subject: createDefaultSummaryCell("subject"),
    subac: createDefaultSummaryCell("subac"),
    attendance: createDefaultSummaryCell("attendance"),
    behavior: createDefaultSummaryCell("behavior"),
    assessment: createDefaultSummaryCell("assessment"),
    final: createDefaultSummaryCell("final")
  };
}

function normalizeSummaryCell(category, cell = {}) {
  const fallback = createDefaultSummaryCell(category);
  const hasValue = Number.isFinite(Number(cell?.value))
    || Number.isFinite(Number(cell?.average));
  const resolvedValue = Number.isFinite(Number(cell?.value))
    ? Number(cell.value)
    : Number.isFinite(Number(cell?.average))
      ? Number(cell.average)
      : null;

  return {
    ...fallback,
    ...cell,
    value: resolvedValue,
    average: Number.isFinite(Number(cell?.average))
      ? Number(cell.average)
      : (category === "final" ? fallback.average : resolvedValue),
    display: hasValue
      ? String(cell?.display || fallback.display)
      : fallback.display,
    includedCount: Number(cell?.includedCount || 0),
    count: Number(cell?.count || 0)
  };
}

function normalizeSummaryCells(summaryCells = {}, context = {}) {
  const defaults = buildDefaultSummaryCells();
  const normalized = {};
  const missingKeys = [];

  Object.keys(defaults).forEach((category) => {
    if (!summaryCells || typeof summaryCells !== "object" || !(category in summaryCells)) {
      missingKeys.push(category);
    }
    normalized[category] = normalizeSummaryCell(category, summaryCells?.[category] || {});
  });

  if (missingKeys.length) {
    console.warn(
      `[grading-v1] Missing summaryCells for student ${context.studentId || "unknown"} in class ${context.classId || "unknown"}: ${missingKeys.join(", ")}`
    );
  }

  return normalized;
}

function buildClientEventSnapshot(events = []) {
  return getRawLiveCellStates(events).map((event) => ({
    id: String(event._id || ""),
    coordinateKey: String(event.coordinateKey || ""),
    stableCellKey: buildStableCellKeyFromEvent(event),
    category: safeTrim(event.category).toLowerCase(),
    dateKey: safeTrim(event.dateKey),
    columnKey: safeTrim(event.columnKey),
    assessmentId: toIdString(event.assessmentId),
    action: safeTrim(event.action).toLowerCase() || "set",
    mark: {
      key: safeTrim(event?.mark?.key),
      symbol: safeTrim(event?.mark?.symbol),
      label: safeTrim(event?.mark?.label),
      normalizedValue: Number.isFinite(Number(event?.mark?.normalizedValue)) ? Number(event.mark.normalizedValue) : null,
      countsTowardGrade: event?.mark?.countsTowardGrade !== false
    },
    metadata: {
      reviewer: safeTrim(event?.metadata?.reviewer),
      revisionPortion: safeTrim(event?.metadata?.revisionPortion),
      behaviorSubcategory: safeTrim(event?.metadata?.behaviorSubcategory),
      postCloseEdit: Boolean(event?.metadata?.postCloseEdit),
      postCloseReason: safeTrim(event?.metadata?.postCloseReason)
    },
    sequenceNumber: Number(event.sequenceNumber || 0)
  }));
}

function buildStudentRow({
  schoolId,
  classDoc,
  periodDoc,
  studentDoc,
  trackerColumns,
  assessmentColumns,
  studentEvents = [],
  commentMap,
  keySystemsByKey,
  rankingLookup = {}
}) {
  const studentId = toIdString(studentDoc._id);
  const liveEventMap = getLiveEventMap(studentEvents);
  const liveEventHydrationMap = getLiveEventHydrationMap(studentEvents);
  const rankSummary = buildRankSummaryFromUser(studentDoc);
  const calculationSummary = calculateStudentSummary(studentEvents);
  let hydratedCellCount = 0;
  const renderedCellKeys = [];

  // Build daily groups from merged tracker columns (base + extra Subac columns per date)
  const dailyGroups = (Array.isArray(trackerColumns) ? trackerColumns : []).map((trackerGroup) => ({
    dateKey: trackerGroup.dateKey,
    shortLabel: trackerGroup.shortLabel,
    dayLabel: trackerGroup.dayLabel,
    cells: (trackerGroup.columns || []).map((columnDef) => {
      const stableCellKey = buildStableCellKey({
        studentId,
        category: columnDef.category,
        subcategory: columnDef.columnKey,
        schoolDate: trackerGroup.dateKey,
        assessmentId: ""
      });
      const coordinateKey = buildCoordinateKey({
        classId: classDoc._id,
        studentId,
        gradingPeriodId: periodDoc._id,
        category: columnDef.category,
        dateKey: trackerGroup.dateKey,
        columnKey: columnDef.columnKey
      });
      renderedCellKeys.push(stableCellKey);
      const liveEvent = liveEventHydrationMap.get(stableCellKey) || liveEventMap.get(coordinateKey) || null;
      if (liveEvent) hydratedCellCount += 1;
      return buildCellView({
        schoolId,
        classId: classDoc._id,
        studentId,
        gradingPeriodId: periodDoc._id,
        category: columnDef.category,
        dateKey: trackerGroup.dateKey,
        columnKey: columnDef.columnKey,
        keySystemsByKey,
        liveEvent,
        comment: commentMap.get(coordinateKey) || null
      });
    })
  }));

  const assessmentCells = assessmentColumns.map((assessmentColumn) => {
    const stableCellKey = buildStableCellKey({
      studentId,
      category: "assessment",
      subcategory: getAssessmentColumnKey(assessmentColumn.id),
      schoolDate: "",
      assessmentId: assessmentColumn.id
    });
    const coordinateKey = buildCoordinateKey({
      classId: classDoc._id,
      studentId,
      gradingPeriodId: periodDoc._id,
      category: "assessment",
      dateKey: "",
      columnKey: getAssessmentColumnKey(assessmentColumn.id),
      assessmentId: assessmentColumn.id
    });
    renderedCellKeys.push(stableCellKey);
    const liveEvent = liveEventHydrationMap.get(stableCellKey) || liveEventMap.get(coordinateKey) || null;
    if (liveEvent) hydratedCellCount += 1;
    return buildCellView({
      schoolId,
      classId: classDoc._id,
      studentId,
      gradingPeriodId: periodDoc._id,
      category: "assessment",
      dateKey: "",
      columnKey: getAssessmentColumnKey(assessmentColumn.id),
      assessmentId: assessmentColumn.id,
      keySystemsByKey,
      liveEvent,
      comment: commentMap.get(coordinateKey) || null,
      assessmentColumn
    });
  });

  return {
    id: studentId,
    name: getActorName(studentDoc),
    missionRankLabel: safeTrim(rankSummary.displayRankLabel) || "F Rank",
    missionXpLabel: Number(rankSummary.xp || 0).toLocaleString(),
    periodRank: Number(rankingLookup[studentId]?.rank || 0) || null,
    periodRankLabel: rankingLookup[studentId]?.rank ? `#${rankingLookup[studentId].rank}` : "—",
    dailyGroups,
    assessmentCells,
    summaryCells: normalizeSummaryCells(buildSummaryView(calculationSummary), {
      schoolId,
      classId: toIdString(classDoc?._id),
      studentId
    }),
    clientState: {
      studentId,
      liveEvents: buildClientEventSnapshot(studentEvents),
      summary: calculationSummary,
      rank: rankingLookup[studentId] || null
    },
    debug: {
      hydratedCellCount,
      renderedCellCount: renderedCellKeys.length,
      firstRenderedCellKeys: renderedCellKeys.slice(0, 5)
    }
  };
}

function buildRankingLookup(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    acc[String(row.studentId || "")] = row;
    return acc;
  }, {});
}

async function buildClassGradebookView(req, { classDoc, periodDoc = null, keySystemsByKey = null, focusDateKey = "" } = {}) {
  const schoolId = resolveSchoolId(req);
  const classId = toIdString(classDoc?._id);
  const workingPeriod = periodDoc || await ensureGradingPeriodForClass({
    schoolId,
    classDoc,
    actorId: req.user?._id || null
  });
  const resolvedKeySystems = keySystemsByKey || await loadKeySystemsForSchool(schoolId);

  const [studentDocs, assessmentDocs, activeEvents, comments, cachedRankings] = await Promise.all([
    User.find(scopedQuery(req, {
      role: "student",
      _id: { $in: (Array.isArray(classDoc?.students) ? classDoc.students : []).map((student) => student?._id).filter(Boolean) }
    }))
      .select("_id firstName lastName userName xp points rank manualRank rankOverrideEnabled rankOverrideReason")
      .lean(),
    Assessment.find(scopedQuery(req, {
      classId: classDoc._id,
      gradingPeriodId: workingPeriod._id,
      active: true
    })).lean(),
    GradeEvent.find({
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      gradingPeriodId: workingPeriod._id,
      supersededBy: null
    }).sort({ sequenceNumber: 1 }).lean(),
    GradeComment.find({
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      gradingPeriodId: workingPeriod._id
    }).lean(),
    RankCache.find({
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      gradingPeriodId: workingPeriod._id
    }).lean()
  ]);

  const commentMap = getCommentMap(comments);
  const assessmentColumns = buildAssessmentColumns(assessmentDocs);
  const existingDateKeys = Array.from(
    new Set((activeEvents || []).map((event) => safeTrim(event.dateKey)).filter(Boolean))
  );
  const requestedFocusDateKey = safeTrim(focusDateKey || req.query?.focusDate);
  const dateColumns = buildDateColumns(
    existingDateKeys,
    (Array.isArray(classDoc?.schedule) ? classDoc.schedule : []).map((entry) => safeTrim(entry.day)).filter(Boolean),
    10,
    { focusDateKey: requestedFocusDateKey }
  );

  // Load extra Subac tracker columns for the visible date range
  const visibleDateKeys = dateColumns.map((d) => d.dateKey);
  const trackerColumnDocs = visibleDateKeys.length
    ? await TrackerColumn.find({
        schoolId: parseObjectId(schoolId),
        classId: classDoc._id,
        gradingPeriodId: workingPeriod._id,
        dateKey: { $in: visibleDateKeys },
        archivedAt: null
      }).sort({ sortOrder: 1, createdAt: 1 }).lean()
    : [];

  const trackerColumns = buildTrackerColumns(dateColumns, DAILY_COLUMN_DEFINITIONS, trackerColumnDocs);
  const resolvedFocusDateKey = requestedFocusDateKey && parseDateKey(requestedFocusDateKey)
    ? requestedFocusDateKey
    : safeTrim(dateColumns?.[0]?.dateKey || toDateKey(new Date()));
  console.log(
    `[grading-v1] class ${classId} hydrating: ${activeEvents.length} active grade events, gradingPeriodId=${toIdString(workingPeriod._id)}, ` +
    `focusDateKey=${requestedFocusDateKey || "today"}, visibleRange=${dateColumns.map((d) => d.dateKey).join(" / ") || "none"}, ` +
    `extraTrackerCols=${trackerColumnDocs.length}`
  );

  const eventsByStudentId = new Map();
  activeEvents.forEach((event) => {
    const studentId = toIdString(event.studentId);
    if (!eventsByStudentId.has(studentId)) eventsByStudentId.set(studentId, []);
    eventsByStudentId.get(studentId).push(event);
  });

  let rankingLookup = buildRankingLookup(cachedRankings);
  if (!Object.keys(rankingLookup).length) {
    const generatedRankingRows = rankStudents(
      studentDocs.map((studentDoc) => ({
        studentId: toIdString(studentDoc._id),
        studentName: getActorName(studentDoc),
        events: eventsByStudentId.get(toIdString(studentDoc._id)) || []
      }))
    );
    rankingLookup = buildRankingLookup(generatedRankingRows);
  }

  const orderedStudents = [...studentDocs].sort((left, right) => {
    const rankDelta = Number(rankingLookup[toIdString(left._id)]?.rank || Number.MAX_SAFE_INTEGER)
      - Number(rankingLookup[toIdString(right._id)]?.rank || Number.MAX_SAFE_INTEGER);
    if (rankDelta !== 0) return rankDelta;
    return getActorName(left).localeCompare(getActorName(right));
  });

  const students = orderedStudents.map((studentDoc) =>
    buildStudentRow({
      schoolId,
      classDoc,
      periodDoc: workingPeriod,
      studentDoc,
      trackerColumns,
      assessmentColumns,
      studentEvents: eventsByStudentId.get(toIdString(studentDoc._id)) || [],
      commentMap,
      keySystemsByKey: resolvedKeySystems,
      rankingLookup
    })
  );

  console.log(
    `[grading-v1] class ${classId || "unknown"} rendered with ${students.length} student(s), ${trackerColumns.length} tracker date group(s), ${assessmentColumns.length} assessment column(s)`
  );
  console.log("[grading-v1] hydration snapshot:", {
    activeClassId: classId,
    gradingPeriodId: toIdString(workingPeriod._id),
    visibleDateRange: {
      start: safeTrim(dateColumns?.[0]?.dateKey || ""),
      end: safeTrim(dateColumns?.[dateColumns.length - 1]?.dateKey || "")
    },
    loadedActiveEventCount: activeEvents.length,
    hydratedCellCount: students.reduce((sum, student) => sum + Number(student?.debug?.hydratedCellCount || 0), 0),
    first5LoadedEventCellKeys: activeEvents.slice(0, 5).map((event) => buildStableCellKeyFromEvent(event)),
    first5RenderedCellKeys: students.flatMap((student) => student?.debug?.firstRenderedCellKeys || []).slice(0, 5)
  });

  return {
    id: classId,
    className: safeTrim(classDoc.className) || "Class",
    classCode: safeTrim(classDoc.classCode) || "—",
    roomNumber: safeTrim(classDoc.roomNumber) || "—",
    location: safeTrim(classDoc.location) || "—",
    studentCount: students.length,
    gradingPeriod: {
      id: toIdString(workingPeriod._id),
      name: safeTrim(workingPeriod.name) || "Current Period",
      periodKey: safeTrim(workingPeriod.periodKey),
      status: safeTrim(workingPeriod.status) || "open",
      quarter: safeTrim(workingPeriod.quarter),
      academicYear: safeTrim(workingPeriod.academicYear),
      postCloseEditEnabled: Boolean(workingPeriod.postCloseEditEnabled)
    },
    dailyColumns: DAILY_COLUMN_DEFINITIONS,
    dateColumns,
    trackerColumns,
    focusDateKey: resolvedFocusDateKey,
    visibleRangeLabel: formatVisibleRangeLabel(dateColumns),
    assessmentColumns,
    students,
    keySystemOptions: Object.keys(resolvedKeySystems).reduce((acc, systemKey) => {
      acc[systemKey] = (resolvedKeySystems[systemKey]?.marks || []).map((mark) => ({
        key: safeTrim(mark.key),
        symbol: safeTrim(mark.symbol),
        label: safeTrim(mark.label),
        countsTowardGrade: mark.countsTowardGrade !== false,
        normalizedValue: Number.isFinite(Number(mark.normalizedValue)) ? Number(mark.normalizedValue) : null
      }));
      return acc;
    }, {})
  };
}

async function buildTeacherGradebookPage(req) {
  const schoolId = resolveSchoolId(req);
  const keySystemsByKey = await loadKeySystemsForSchool(schoolId);
  const classes = await ClassModel.find(scopedQuery(req, {
    "teachers._id": req.user._id
  })).lean();
  const requestedActiveClassId = safeTrim(req.query?.activeClassId || req.query?.classId);
  const requestedFocusDateKey = safeTrim(req.query?.focusDate);
  const preset = safeTrim(req.query?.preset).toLowerCase();
  const weekShift = Number(req.query?.weekShift || 0);
  const baseFocusDateKey = preset === "today"
    ? toDateKey(new Date())
    : (parseDateKey(requestedFocusDateKey) ? requestedFocusDateKey : toDateKey(new Date()));
  const focusDateKey = weekShift ? shiftDateKey(baseFocusDateKey, weekShift) : baseFocusDateKey;

  console.log(`[grading-v1] rendering teacher gradebook with ${classes.length} class(es)`);
  console.log("[grading-v1] teacher gradebook request context:", {
    activeClassId: requestedActiveClassId || "",
    focusDateKey,
    schoolId
  });

  const classViews = [];
  for (const classDoc of classes) {
    const classView = await buildClassGradebookView(req, {
      classDoc,
      keySystemsByKey,
      focusDateKey
    });
    classViews.push(classView);
  }

  const activeClassId = classViews.some((classView) => String(classView.id) === requestedActiveClassId)
    ? requestedActiveClassId
    : String(classViews?.[0]?.id || "");

  return {
    classes: classViews,
    keySystemVersion: KEY_SYSTEM_VERSION,
    activeClassId,
    focusDateKey
  };
}

async function reserveSequenceNumber(schoolId, key = "grade_events") {
  // $inc and $setOnInsert must NOT target the same path — MongoDB rejects it.
  // Omitting nextValue from $setOnInsert lets MongoDB initialize it to 0 on first
  // insert, then $inc brings it to 1. Using new:true returns the post-increment value.
  const counter = await Counter.findOneAndUpdate(
    {
      schoolId: parseObjectId(schoolId),
      key
    },
    {
      $inc: { nextValue: 1 }
    },
    {
      upsert: true,
      new: true
    }
  );

  return Number(counter?.nextValue || 1);
}

async function resolveWriteContext(req, payload = {}) {
  const schoolId = resolveSchoolId(req);
  const inbound = normalizeInboundGradebookPayload(payload);
  const classId = safeTrim(inbound.classId);
  const studentId = safeTrim(inbound.studentId);
  const gradingPeriodId = safeTrim(inbound.gradingPeriodId);
  const assessmentId = safeTrim(inbound.assessmentId);

  if (!classId || !studentId) {
    throw new GradebookError("Missing class or student context.", 400, {
      classId,
      studentId
    });
  }

  const [classDoc, studentDoc] = await Promise.all([
    ClassModel.findOne(scopedIdQuery(req, classId)),
    User.findOne(scopedIdQuery(req, studentId, { role: "student" }))
  ]);

  if (!classDoc || !studentDoc) {
    throw new GradebookError("Student or class was not found.", 404);
  }
  if (!ensureTeacherAssignedToClass(classDoc, req.user._id)) {
    throw new GradebookError("You are not authorized for this class.", 403);
  }
  if (!ensureStudentInClass(classDoc, studentDoc._id)) {
    throw new GradebookError("Selected student is not enrolled in this class.", 403);
  }

  let periodDoc = null;
  if (gradingPeriodId) {
    periodDoc = await GradingPeriod.findOne({
      schoolId: parseObjectId(schoolId),
      _id: parseObjectId(gradingPeriodId),
      classId: classDoc._id
    });
  }
  if (!periodDoc) {
    periodDoc = await ensureGradingPeriodForClass({
      schoolId,
      classDoc,
      actorId: req.user?._id || null
    });
  }

  let assessmentDoc = null;
  if (assessmentId) {
    assessmentDoc = await Assessment.findOne({
      schoolId: parseObjectId(schoolId),
      _id: parseObjectId(assessmentId),
      classId: classDoc._id,
      gradingPeriodId: periodDoc._id
    });
    if (!assessmentDoc) {
      throw new GradebookError("Assessment was not found in this class and period.", 404);
    }
  }

  // Validate extra Subac tracker column if a trackerCol: key is used
  const rawColumnKey = safeTrim(inbound.columnKey);
  let trackerColumnDoc = null;
  if (isTrackerColumnKey(rawColumnKey)) {
    const trackerColumnId = extractTrackerColumnId(rawColumnKey);
    if (!trackerColumnId || !mongoose.Types.ObjectId.isValid(trackerColumnId)) {
      throw new GradebookError("Invalid tracker column identifier.", 400);
    }
    trackerColumnDoc = await TrackerColumn.findOne({
      schoolId: parseObjectId(schoolId),
      _id: new mongoose.Types.ObjectId(trackerColumnId),
      classId: classDoc._id,
      gradingPeriodId: periodDoc._id,
      archivedAt: null
    }).lean();
    if (!trackerColumnDoc) {
      throw new GradebookError("Extra Subac column not found in this class and period.", 404);
    }
  }

  return {
    schoolId,
    classDoc,
    studentDoc,
    periodDoc,
    assessmentDoc,
    trackerColumnDoc
  };
}

function normalizeCellPayload(payload = {}, context = {}) {
  const inbound = normalizeInboundGradebookPayload(payload);
  const category = safeTrim(inbound.category).toLowerCase();
  const dateKey = safeTrim(inbound.dateKey);
  const columnKey = safeTrim(inbound.columnKey);
  const assessmentId = safeTrim(inbound.assessmentId || context.assessmentDoc?._id);
  const behaviorSubcategory = safeTrim(inbound.behaviorSubcategory, 80);
  const reviewer = safeTrim(inbound.reviewer, 120);
  const revisionPortion = safeTrim(inbound.revisionPortion, 120);
  const postCloseReason = safeTrim(inbound.postCloseReason, 240);

  if (!category) {
    throw new GradebookError("Missing grade category.", 400);
  }
  if (category === "assessment") {
    if (!assessmentId) throw new GradebookError("Assessment cells require an assessment.", 400);
  } else {
    if (!dateKey || !parseDateKey(dateKey)) throw new GradebookError("Daily grade cells require a valid date.", 400, {
      dateKey
    });
    const isKnownDailyColumn = Boolean(getDailyColumnDefinition(columnKey));
    const isTrackerCol = isTrackerColumnKey(columnKey);
    if (!columnKey || (!isKnownDailyColumn && !isTrackerCol)) {
      throw new GradebookError("Invalid gradebook column.", 400, {
        columnKey
      });
    }
  }

  return {
    category,
    dateKey: category === "assessment" ? "" : dateKey,
    columnKey: category === "assessment" ? getAssessmentColumnKey(assessmentId) : columnKey,
    assessmentId,
    markKey: safeTrim(inbound.markKey),
    behaviorSubcategory,
    reviewer,
    revisionPortion,
    postCloseEdit: payload.postCloseEdit === true || payload.postCloseEdit === "true",
    postCloseReason,
    clientEventId: safeTrim(inbound.clientEventId, 120),
    action: safeTrim(payload.action).toLowerCase() || "set"
  };
}

function assertPeriodWritable(periodDoc, normalizedPayload) {
  if (safeTrim(periodDoc?.status).toLowerCase() !== "closed") return;
  if (normalizedPayload.postCloseEdit && periodDoc.postCloseEditEnabled) return;
  throw new GradebookError("This grading period is closed.", 423, {
    needsPostCloseReason: Boolean(periodDoc.postCloseEditEnabled)
  });
}

function getMarkDefinition(keySystem = {}, markKey = "") {
  return (Array.isArray(keySystem?.marks) ? keySystem.marks : []).find((mark) => safeTrim(mark.key) === safeTrim(markKey)) || null;
}

async function recomputeStudentSummaryCache({ schoolId, classId, studentId, gradingPeriodId }) {
  const events = await GradeEvent.find({
    schoolId: parseObjectId(schoolId),
    classId: parseObjectId(classId),
    studentId: parseObjectId(studentId),
    gradingPeriodId: parseObjectId(gradingPeriodId)
  }).sort({ sequenceNumber: 1 }).lean();

  const summary = calculateStudentSummary(events);
  const lastSequence = events.length ? Number(events[events.length - 1].sequenceNumber || 0) : 0;

  await SummaryCache.findOneAndUpdate(
    {
      schoolId: parseObjectId(schoolId),
      classId: parseObjectId(classId),
      studentId: parseObjectId(studentId),
      gradingPeriodId: parseObjectId(gradingPeriodId)
    },
    {
      $set: {
        categoryTotals: summary.categoryTotals,
        markCounts: summary.markCounts,
        behaviorSubcategoryTotals: summary.behaviorSubcategoryTotals,
        assessmentTotals: summary.assessmentTotals,
        activeCategories: summary.activeCategories,
        normalizedWeights: summary.normalizedWeights,
        finalFraction: summary.finalFraction,
        finalPercentage: summary.finalPercentage,
        sourceSequenceNumber: lastSequence,
        recomputedAt: new Date()
      }
    },
    { upsert: true }
  );

  return summary;
}

async function recomputePeriodRankings({ schoolId, classDoc, gradingPeriodId }) {
  const studentIds = (Array.isArray(classDoc?.students) ? classDoc.students : [])
    .map((student) => student?._id)
    .filter(Boolean);

  const [studentDocs, events] = await Promise.all([
    User.find({
      schoolId: parseObjectId(schoolId),
      role: "student",
      _id: { $in: studentIds }
    })
      .select("_id firstName lastName userName")
      .lean(),
    GradeEvent.find({
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      gradingPeriodId: parseObjectId(gradingPeriodId)
    }).sort({ sequenceNumber: 1 }).lean()
  ]);

  const eventsByStudentId = new Map();
  events.forEach((event) => {
    const studentId = toIdString(event.studentId);
    if (!eventsByStudentId.has(studentId)) eventsByStudentId.set(studentId, []);
    eventsByStudentId.get(studentId).push(event);
  });

  const rankingRows = rankStudents(
    studentDocs.map((studentDoc) => ({
      studentId: toIdString(studentDoc._id),
      studentName: getActorName(studentDoc),
      events: eventsByStudentId.get(toIdString(studentDoc._id)) || []
    }))
  );

  const cohortSize = rankingRows.length;

  await PeriodRanking.findOneAndUpdate(
    {
      schoolId: parseObjectId(schoolId),
      classId: classDoc._id,
      gradingPeriodId: parseObjectId(gradingPeriodId),
      leaderboardType: "academic"
    },
    {
      $set: {
        rows: rankingRows.map((row) => ({
          studentId: parseObjectId(row.studentId),
          studentName: row.studentName,
          rank: row.rank,
          finalPercentage: row.finalPercentage,
          casharAverage: row.casharAverage,
          subacAverage: row.subacAverage
        })),
        updatedAt: new Date()
      },
      $setOnInsert: {
        isFrozen: false,
        frozenAt: null
      }
    },
    { upsert: true }
  );

  await Promise.all(
    rankingRows.map((row) =>
      RankCache.findOneAndUpdate(
        {
          schoolId: parseObjectId(schoolId),
          classId: classDoc._id,
          gradingPeriodId: parseObjectId(gradingPeriodId),
          studentId: parseObjectId(row.studentId)
        },
        {
          $set: {
            finalPercentage: row.finalPercentage,
            casharAverage: row.casharAverage,
            subacAverage: row.subacAverage,
            rank: row.rank,
            cohortSize,
            visibleToStudent: true,
            recomputedAt: new Date()
          }
        },
        { upsert: true }
      )
    )
  );

  return rankingRows;
}

async function saveGradeCommentRecord({
  schoolId,
  classId,
  studentId,
  gradingPeriodId,
  category,
  dateKey,
  columnKey,
  assessmentId,
  coordinateKey,
  internalComment,
  parentComment,
  actor
}) {
  const nextInternal = safeTrim(internalComment, 1600);
  const nextParent = safeTrim(parentComment, 1600);

  if (!nextInternal && !nextParent) {
    await GradeComment.deleteOne({
      schoolId: parseObjectId(schoolId),
      coordinateKey
    });
    return null;
  }

  const updated = await GradeComment.findOneAndUpdate(
    {
      schoolId: parseObjectId(schoolId),
      coordinateKey
    },
    {
      $set: {
        classId: parseObjectId(classId),
        studentId: parseObjectId(studentId),
        gradingPeriodId: parseObjectId(gradingPeriodId),
        assessmentId: assessmentId ? parseObjectId(assessmentId) : null,
        category,
        dateKey,
        columnKey,
        coordinateKey,
        internalComment: nextInternal,
        parentComment: nextParent,
        lastEditedBy: {
          actorId: actor._id,
          role: actor.role,
          name: getActorName(actor)
        }
      }
    },
    {
      upsert: true,
      new: true
    }
  ).lean();

  return updated;
}

async function loadStudentEventsForSummary({ schoolId, classId, studentId, gradingPeriodId }) {
  return GradeEvent.find({
    schoolId: parseObjectId(schoolId),
    classId: parseObjectId(classId),
    studentId: parseObjectId(studentId),
    gradingPeriodId: parseObjectId(gradingPeriodId)
  }).sort({ sequenceNumber: 1 }).lean();
}

async function safelyRecomputeSupportingArtifacts({ schoolId, classDoc, studentDoc, gradingPeriodId, logLabel }) {
  let summary = null;

  try {
    summary = await recomputeStudentSummaryCache({
      schoolId,
      classId: classDoc._id,
      studentId: studentDoc._id,
      gradingPeriodId
    });
  } catch (error) {
    console.error(`[grading-v1] ${logLabel} summary cache recompute failed:`, error?.stack || error);
    const events = await loadStudentEventsForSummary({
      schoolId,
      classId: classDoc._id,
      studentId: studentDoc._id,
      gradingPeriodId
    });
    summary = calculateStudentSummary(events);
  }

  try {
    await recomputePeriodRankings({
      schoolId,
      classDoc,
      gradingPeriodId
    });
  } catch (error) {
    console.error(`[grading-v1] ${logLabel} ranking recompute failed:`, error?.stack || error);
  }

  return summary;
}

async function persistGradeEvent(req, payload = {}) {
  const context = await resolveWriteContext(req, payload);
  const normalized = normalizeCellPayload(payload, context);
  assertPeriodWritable(context.periodDoc, normalized);

  const keySystemsByKey = await loadKeySystemsForSchool(context.schoolId);
  const keySystemKey = getKeySystemKeyForCategory(normalized.category, context.assessmentDoc);
  const keySystem = keySystemsByKey[keySystemKey];
  if (!keySystem) {
    throw new GradebookError("The grading key system is not available.", 422);
  }

  const coordinateKey = buildCoordinateKey({
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    assessmentId: normalized.assessmentId
  });

  if (normalized.clientEventId) {
    const existing = await GradeEvent.findOne({
      schoolId: parseObjectId(context.schoolId),
      clientEventId: normalized.clientEventId
    });
    if (existing) {
      return {
        context,
        coordinateKey,
        event: existing,
        comment: await GradeComment.findOne({
          schoolId: parseObjectId(context.schoolId),
          coordinateKey
        }).lean()
      };
    }
  }

  const currentEvent = await GradeEvent.findOne({
    schoolId: parseObjectId(context.schoolId),
    coordinateKey,
    supersededBy: null
  }).sort({ sequenceNumber: -1 });

  const markDefinition = normalized.markKey ? getMarkDefinition(keySystem, normalized.markKey) : null;
  if (normalized.action !== "clear" && !markDefinition) {
    throw new GradebookError("Select a valid grade value.", 422);
  }

  const sequenceNumber = await reserveSequenceNumber(context.schoolId);
  const nextAction = normalized.action === "bulk"
    ? "bulk"
    : (!normalized.markKey || normalized.action === "clear")
      ? "clear"
      : "set";

  const event = await GradeEvent.create({
    schoolId: parseObjectId(context.schoolId),
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    assessmentId: normalized.assessmentId ? parseObjectId(normalized.assessmentId) : null,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    coordinateKey,
    action: nextAction,
    clientEventId: normalized.clientEventId,
    sequenceNumber,
    keySystemVersion: KEY_SYSTEM_VERSION,
    keySystemKey,
    mark: markDefinition
      ? {
          key: safeTrim(markDefinition.key),
          symbol: safeTrim(markDefinition.symbol),
          label: safeTrim(markDefinition.label),
          normalizedValue: Number.isFinite(Number(markDefinition.normalizedValue)) ? Number(markDefinition.normalizedValue) : null,
          countsTowardGrade: markDefinition.countsTowardGrade !== false
        }
      : {
          key: "",
          symbol: "",
          label: "",
          normalizedValue: null,
          countsTowardGrade: false
        },
    metadata: {
      reviewer: normalized.reviewer,
      revisionPortion: normalized.revisionPortion,
      behaviorSubcategory: normalized.behaviorSubcategory,
      postCloseEdit: normalized.postCloseEdit,
      postCloseReason: normalized.postCloseReason,
      displayLabel: markDefinition ? safeTrim(markDefinition.label) : "",
      legacySource: ""
    },
    previousEventId: currentEvent?._id || null,
    actorSnapshot: {
      actorId: req.user._id,
      role: req.user.role,
      name: getActorName(req.user)
    }
  });

  if (currentEvent) {
    await GradeEvent.updateOne(
      {
        _id: currentEvent._id,
        supersededBy: null
      },
      {
        $set: { supersededBy: event._id }
      }
    );
  }

  const comment = await saveGradeCommentRecord({
    schoolId: context.schoolId,
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    assessmentId: normalized.assessmentId,
    coordinateKey,
    internalComment: payload.internalComment,
    parentComment: payload.parentComment,
    actor: req.user
  });

  const summary = await safelyRecomputeSupportingArtifacts({
    schoolId: context.schoolId,
    classDoc: context.classDoc,
    studentDoc: context.studentDoc,
    gradingPeriodId: context.periodDoc._id,
    logLabel: "persistGradeEvent"
  });

  return {
    context,
    coordinateKey,
    event,
    comment,
    summary
  };
}

async function undoGradebookCell(req, payload = {}) {
  const context = await resolveWriteContext(req, payload);
  const normalized = normalizeCellPayload(payload, context);
  assertPeriodWritable(context.periodDoc, normalized);

  const coordinateKey = buildCoordinateKey({
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    assessmentId: normalized.assessmentId
  });

  const currentEvent = await GradeEvent.findOne({
    schoolId: parseObjectId(context.schoolId),
    coordinateKey,
    supersededBy: null
  }).sort({ sequenceNumber: -1 });

  if (!currentEvent) {
    throw new GradebookError("There is nothing to undo in this cell.", 404);
  }

  const previousEvent = currentEvent.previousEventId
    ? await GradeEvent.findById(currentEvent.previousEventId)
    : null;

  const sequenceNumber = await reserveSequenceNumber(context.schoolId);
  const restoredMark = previousEvent?.action !== "clear"
    ? previousEvent.mark
    : {
        key: "",
        symbol: "",
        label: "",
        normalizedValue: null,
        countsTowardGrade: false
      };
  const restoredMetadata = previousEvent?.action !== "clear"
    ? previousEvent.metadata
    : {
        reviewer: "",
        revisionPortion: "",
        behaviorSubcategory: "",
        postCloseEdit: false,
        postCloseReason: "",
        displayLabel: "",
        legacySource: ""
      };

  const undoEvent = await GradeEvent.create({
    schoolId: parseObjectId(context.schoolId),
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    assessmentId: normalized.assessmentId ? parseObjectId(normalized.assessmentId) : null,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    coordinateKey,
    action: "undo",
    clientEventId: safeTrim(payload.clientEventId, 120),
    sequenceNumber,
    keySystemVersion: KEY_SYSTEM_VERSION,
    keySystemKey: currentEvent.keySystemKey,
    mark: restoredMark,
    metadata: restoredMetadata,
    previousEventId: currentEvent._id,
    actorSnapshot: {
      actorId: req.user._id,
      role: req.user.role,
      name: getActorName(req.user)
    }
  });

  await GradeEvent.updateOne(
    {
      _id: currentEvent._id,
      supersededBy: null
    },
    {
      $set: { supersededBy: undoEvent._id }
    }
  );

  const summary = await safelyRecomputeSupportingArtifacts({
    schoolId: context.schoolId,
    classDoc: context.classDoc,
    studentDoc: context.studentDoc,
    gradingPeriodId: context.periodDoc._id,
    logLabel: "undoGradebookCell"
  });

  return {
    context,
    coordinateKey,
    event: undoEvent,
    summary
  };
}

async function bulkSaveGradebookCells(req, payload = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) {
    throw new GradebookError("Bulk entry payload is empty.", 422);
  }

  const results = [];
  for (const entry of entries) {
    results.push(
      await persistGradeEvent(req, {
        ...entry,
        action: "bulk"
      })
    );
  }
  return results;
}

async function getCellHistoryView(req, payload = {}) {
  const context = await resolveWriteContext(req, payload);
  const normalized = normalizeCellPayload(payload, context);
  const keySystemsByKey = await loadKeySystemsForSchool(context.schoolId);
  const coordinateKey = buildCoordinateKey({
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    assessmentId: normalized.assessmentId
  });
  const [events, comment] = await Promise.all([
    GradeEvent.find({
      schoolId: parseObjectId(context.schoolId),
      coordinateKey
    }).sort({ sequenceNumber: -1 }).lean(),
    GradeComment.findOne({
      schoolId: parseObjectId(context.schoolId),
      coordinateKey
    }).lean()
  ]);

  const liveEvent = events.find((event) => !event.supersededBy) || null;
  const assessmentColumn = context.assessmentDoc
    ? {
        id: toIdString(context.assessmentDoc._id),
        title: safeTrim(context.assessmentDoc.title),
        shortLabel: safeTrim(context.assessmentDoc.shortLabel) || safeTrim(context.assessmentDoc.title),
        keySystemKey: safeTrim(context.assessmentDoc.keySystemKey)
      }
    : null;

  const cell = buildCellView({
    schoolId: context.schoolId,
    classId: context.classDoc._id,
    studentId: context.studentDoc._id,
    gradingPeriodId: context.periodDoc._id,
    category: normalized.category,
    dateKey: normalized.dateKey,
    columnKey: normalized.columnKey,
    assessmentId: normalized.assessmentId,
    keySystemsByKey,
    liveEvent,
    comment,
    assessmentColumn
  });

  return {
    classId: toIdString(context.classDoc._id),
    className: safeTrim(context.classDoc.className),
    studentId: toIdString(context.studentDoc._id),
    studentName: getActorName(context.studentDoc),
    gradingPeriodId: toIdString(context.periodDoc._id),
    periodName: safeTrim(context.periodDoc.name),
    cell: {
      ...cell,
      internalComment: safeTrim(comment?.internalComment),
      parentComment: safeTrim(comment?.parentComment)
    },
    options: keySystemsByKey[cell.keySystemKey]?.marks || [],
    history: events.map((event) => ({
      id: toIdString(event._id),
      action: safeTrim(event.action) || "set",
      sequenceNumber: Number(event.sequenceNumber || 0),
      markSymbol: safeTrim(event?.mark?.symbol) || "—",
      markLabel: safeTrim(event?.mark?.label) || "Cleared",
      createdAtLabel: event.createdAt ? formatDateTimeLabel(event.createdAt) : "N/A",
      actorName: safeTrim(event?.actorSnapshot?.name) || "Staff",
      reviewer: safeTrim(event?.metadata?.reviewer),
      revisionPortion: safeTrim(event?.metadata?.revisionPortion),
      behaviorSubcategory: safeTrim(event?.metadata?.behaviorSubcategory),
      postCloseReason: safeTrim(event?.metadata?.postCloseReason),
      isCurrent: !event.supersededBy
    })),
    isClosed: safeTrim(context.periodDoc.status).toLowerCase() === "closed",
    postCloseEditEnabled: Boolean(context.periodDoc.postCloseEditEnabled)
  };
}

async function createAssessment(req, payload = {}) {
  const schoolId = resolveSchoolId(req);
  const classId = safeTrim(payload.classId);
  if (!classId) throw new GradebookError("Class is required to create an assessment.", 422);
  const classDoc = await ClassModel.findOne(scopedIdQuery(req, classId));
  if (!classDoc) throw new GradebookError("Class not found.", 404);
  if (!ensureTeacherAssignedToClass(classDoc, req.user._id)) {
    throw new GradebookError("You are not authorized for this class.", 403);
  }
  const periodDoc = await ensureGradingPeriodForClass({
    schoolId,
    classDoc,
    actorId: req.user._id
  });
  const title = safeTrim(payload.title, 120);
  if (!title) throw new GradebookError("Assessment title is required.", 422);
  const shortLabel = safeTrim(payload.shortLabel, 24) || title.slice(0, 24);
  const keySystemKey = safeTrim(payload.keySystemKey).toLowerCase() || "cashar";

  const assessment = await Assessment.create({
    schoolId: parseObjectId(schoolId),
    classId: classDoc._id,
    gradingPeriodId: periodDoc._id,
    title,
    shortLabel,
    keySystemKey,
    keySystemVersion: KEY_SYSTEM_VERSION,
    assessmentDate: payload.assessmentDate ? parseDateKey(payload.assessmentDate) : null,
    sortOrder: Number(payload.sortOrder || 0),
    active: true,
    createdBy: req.user._id
  });

  return { assessment, periodDoc, classDoc };
}

async function createTrackerColumn(req, payload = {}) {
  const schoolId = resolveSchoolId(req);
  const classId = safeTrim(payload.classId);
  if (!classId) throw new GradebookError("Class is required.", 422);
  const classDoc = await ClassModel.findOne(scopedIdQuery(req, classId));
  if (!classDoc) throw new GradebookError("Class not found.", 404);
  if (!ensureTeacherAssignedToClass(classDoc, req.user._id)) {
    throw new GradebookError("You are not authorized for this class.", 403);
  }

  const dateKey = safeTrim(payload.dateKey);
  if (!dateKey || !parseDateKey(dateKey)) {
    throw new GradebookError("A valid date is required for the extra Subac column.", 422, { dateKey });
  }

  const shortLabel = safeTrim(payload.shortLabel, 24);
  if (!shortLabel) throw new GradebookError("A short label is required.", 422);

  const portion = safeTrim(payload.portion, 120);
  const notes = safeTrim(payload.notes, 500);
  const reviewerNameSnapshot = safeTrim(payload.reviewerNameSnapshot || payload.reviewerName, 120);

  // Resolve reviewer by ID if provided
  let reviewerId = null;
  if (safeTrim(payload.reviewerId) && mongoose.Types.ObjectId.isValid(safeTrim(payload.reviewerId))) {
    const reviewerDoc = await User.findOne({
      schoolId: parseObjectId(schoolId),
      _id: new mongoose.Types.ObjectId(safeTrim(payload.reviewerId))
    }).select("_id firstName lastName userName").lean();
    if (reviewerDoc) {
      reviewerId = reviewerDoc._id;
    }
  }

  const gradingPeriodId = safeTrim(payload.gradingPeriodId);
  let periodDoc = null;
  if (gradingPeriodId && mongoose.Types.ObjectId.isValid(gradingPeriodId)) {
    periodDoc = await GradingPeriod.findOne({
      schoolId: parseObjectId(schoolId),
      _id: new mongoose.Types.ObjectId(gradingPeriodId),
      classId: classDoc._id
    });
  }
  if (!periodDoc) {
    periodDoc = await ensureGradingPeriodForClass({ schoolId, classDoc, actorId: req.user._id });
  }

  // sortOrder = count of existing tracker columns for this date + 1
  const existingCount = await TrackerColumn.countDocuments({
    schoolId: parseObjectId(schoolId),
    classId: classDoc._id,
    gradingPeriodId: periodDoc._id,
    dateKey,
    archivedAt: null
  });

  const trackerColumn = await TrackerColumn.create({
    schoolId: parseObjectId(schoolId),
    classId: classDoc._id,
    gradingPeriodId: periodDoc._id,
    type: "subac",
    category: "subac",
    dateKey,
    shortLabel,
    portion,
    reviewerId,
    reviewerNameSnapshot,
    notes,
    sortOrder: existingCount,
    createdBy: req.user._id
  });

  return { trackerColumn, periodDoc, classDoc, dateKey };
}

async function buildGradebookCsv(req, { classId }) {
  const classDoc = await ClassModel.findOne(scopedIdQuery(req, classId)).lean();
  if (!classDoc) throw new GradebookError("Class not found.", 404);
  const classView = await buildClassGradebookView(req, { classDoc });

  const header = [
    "Student",
    // trackerColumns already includes extra Subac columns in the correct date-grouped position
    ...classView.trackerColumns.flatMap((trackerGroup) =>
      trackerGroup.columns.map((col) => `${trackerGroup.shortLabel} ${col.displayLabel}`)
    ),
    ...classView.assessmentColumns.map((assessment) => `Assessment ${assessment.shortLabel}`),
    "Cashar",
    "Writing",
    "Subject",
    "Subac",
    "Attendance",
    "Behavior",
    "Assessment",
    "Final Grade"
  ];

  const rows = classView.students.map((student) => [
    `"${student.name.replace(/"/g, "\"\"")}"`,
    ...student.dailyGroups.flatMap((group) =>
      group.cells.map((cell) => `"${safeTrim(cell.symbol || cell.markKey || "").replace(/"/g, "\"\"")}"`)
    ),
    ...student.assessmentCells.map((cell) => `"${safeTrim(cell.symbol || cell.markKey || "").replace(/"/g, "\"\"")}"`),
    `"${student.summaryCells.cashar.display}"`,
    `"${student.summaryCells.writing.display}"`,
    `"${student.summaryCells.subject.display}"`,
    `"${student.summaryCells.subac.display}"`,
    `"${student.summaryCells.attendance.display}"`,
    `"${student.summaryCells.behavior.display}"`,
    `"${student.summaryCells.assessment.display}"`,
    `"${student.summaryCells.final.display}"`
  ]);

  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

async function buildStudentSummaryExport(req, { classId, studentId }) {
  const classDoc = await ClassModel.findOne(scopedIdQuery(req, classId)).lean();
  if (!classDoc) throw new GradebookError("Class not found.", 404);
  const classView = await buildClassGradebookView(req, { classDoc });
  const row = classView.students.find((student) => String(student.id) === String(studentId));
  if (!row) throw new GradebookError("Student not found in this class.", 404);

  return {
    generatedAt: new Date().toISOString(),
    class: {
      id: classView.id,
      name: classView.className,
      code: classView.classCode
    },
    gradingPeriod: classView.gradingPeriod,
    student: {
      id: row.id,
      name: row.name,
      missionRankLabel: row.missionRankLabel,
      periodRankLabel: row.periodRankLabel
    },
    summaryCells: row.summaryCells,
    liveEvents: row.clientState.liveEvents
  };
}

module.exports = {
  DAILY_COLUMN_DEFINITIONS,
  CATEGORY_DISPLAY_ORDER,
  KEY_SYSTEM_VERSION,
  GradebookError,
  buildDefaultSummaryCells,
  normalizeSummaryCells,
  buildCurrentWeekDateKeys,
  buildWeekDateKeysForAnchor,
  buildDateColumns,
  buildTrackerColumns,
  buildTeacherGradebookPage,
  buildClassGradebookView,
  buildCoordinateKey,
  buildStableCellKey,
  buildStudentRow,
  getAssessmentColumnKey,
  getTrackerColumnKey,
  persistGradeEvent,
  undoGradebookCell,
  bulkSaveGradebookCells,
  getCellHistoryView,
  createAssessment,
  createTrackerColumn,
  buildGradebookCsv,
  buildStudentSummaryExport
};
