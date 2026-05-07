const {
  MEMORIZATION_SYSTEM_KEY,
  SUBAC_SYSTEM_KEY,
  buildDefaultGradingScaleSet,
  normalizeGradingScaleSet,
  getScaleBySystem,
  resolveSnapshotOrScaleMark
} = require("./gradingScales");

const REGULAR_COLUMN_DEFINITIONS = [
  {
    key: "q",
    label: "Q",
    longLabel: "Cashar / Qur'an Memorization",
    subjectKey: "quran-memorization",
    subjectLabel: "Qur'an Memorization"
  },
  {
    key: "w",
    label: "W",
    longLabel: "Writing",
    subjectKey: "writing",
    subjectLabel: "Writing"
  },
  {
    key: "s",
    label: "S",
    longLabel: "Subject",
    subjectKey: "islamic-studies-subject",
    subjectLabel: "Islamic Studies / Subject"
  }
];

const SUBAC_SUBJECT_DEFINITION = {
  key: "subac",
  label: "Subac",
  longLabel: "Subac Revision",
  subjectKey: "subac-revision",
  subjectLabel: "Subac Revision"
};

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
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

function formatDateLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function buildRecentDateKeys(scheduleLabels = [], count = 6) {
  const normalizedLabels = Array.from(
    new Set(
      (Array.isArray(scheduleLabels) ? scheduleLabels : [])
        .map((label) => String(label || "").trim())
        .filter((label) => Object.prototype.hasOwnProperty.call(WEEKDAY_TO_INDEX, label))
    )
  );
  const targetWeekdays = normalizedLabels.length ? normalizedLabels : ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const results = [];
  const seen = new Set();
  const cursor = new Date();
  cursor.setUTCHours(12, 0, 0, 0);

  for (let i = 0; i < 160 && results.length < count; i += 1) {
    const key = toDateKey(cursor);
    const weekdayLabel = formatDayShort(key);
    if (targetWeekdays.includes(weekdayLabel) && !seen.has(key)) {
      results.push(key);
      seen.add(key);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return results.sort();
}

function buildDateColumns(existingDateKeys = [], generatedDateKeys = [], maxColumns = 10) {
  const merged = Array.from(new Set([...(existingDateKeys || []), ...(generatedDateKeys || [])]))
    .filter(Boolean)
    .sort();
  const trimmed = merged.length > maxColumns ? merged.slice(merged.length - maxColumns) : merged;
  return trimmed.map((dateKey) => ({
    dateKey,
    shortLabel: formatDateShort(dateKey),
    dayLabel: formatDayShort(dateKey),
    inputValue: dateKey
  }));
}

function buildCellLookup(gradeDocs = []) {
  const map = new Map();

  (Array.isArray(gradeDocs) ? gradeDocs : []).forEach((grade) => {
    const studentId = toIdString(grade?.students?.[0]?._id);
    const mode = String(grade?.sheetContext?.mode || "").trim();
    const columnKey = String(grade?.sheetContext?.columnKey || "").trim();
    const dateKey = String(grade?.sheetContext?.dateKey || toDateKey(grade?.assignedDate)).trim();
    if (!studentId || !mode || !columnKey || !dateKey) return;
    map.set(`${studentId}|${mode}|${columnKey}|${dateKey}`, grade);
  });

  return map;
}

function resolveDisplayMark(record, scaleSet) {
  const snapshot = resolveSnapshotOrScaleMark(record, scaleSet);
  if (!snapshot) return null;
  return {
    ...snapshot,
    percent: snapshot.maxValue > 0 ? (Number(snapshot.value || 0) / Number(snapshot.maxValue || 1)) * 100 : null
  };
}

function buildGradebookCell({
  record = null,
  systemKey,
  columnDefinition,
  dateColumn,
  scaleSet
}) {
  const displayMark = record ? resolveDisplayMark(record, scaleSet) : null;
  const feedback = typeof record?.feedback === "object"
    ? String(record?.feedback?.content || "").trim()
    : String(record?.feedback || "").trim();

  return {
    gradeId: record ? String(record._id) : "",
    dateKey: dateColumn.dateKey,
    dateLabel: dateColumn.shortLabel,
    dayLabel: dateColumn.dayLabel,
    systemKey,
    columnKey: columnDefinition.key,
    columnLabel: columnDefinition.label,
    columnLongLabel: columnDefinition.longLabel,
    subjectKey: columnDefinition.subjectKey,
    subjectLabel: columnDefinition.subjectLabel,
    reviewer: String(record?.sheetContext?.reviewer || "").trim(),
    portion: String(record?.sheetContext?.portion || "").trim(),
    note: feedback,
    markKey: String(displayMark?.markKey || ""),
    symbol: String(displayMark?.symbol || ""),
    label: String(displayMark?.label || ""),
    countsTowardGrade: Boolean(displayMark?.countsTowardGrade),
    updatedAtLabel: record?.updatedAt ? formatDateTimeLabel(record.updatedAt) : "",
    isHistorical: record ? Boolean(record?.symbolicMark?.markKey && !(displayMark?.active)) : false
  };
}

function buildRegularSummary(records = [], scaleSet = {}) {
  const summary = {};

  REGULAR_COLUMN_DEFINITIONS.forEach((column) => {
    const matchingRecords = records.filter((record) => String(record?.sheetContext?.columnKey || "") === column.key);
    const totals = matchingRecords.reduce((acc, record) => {
      const mark = resolveDisplayMark(record, scaleSet);
      if (!mark || !mark.countsTowardGrade) return acc;
      acc.earned += Number(mark.value || 0);
      acc.possible += Number(mark.maxValue || 0);
      acc.count += 1;
      return acc;
    }, { earned: 0, possible: 0, count: 0 });

    const percent = totals.possible > 0 ? (totals.earned / totals.possible) * 100 : null;
    summary[column.key] = {
      columnKey: column.key,
      label: column.longLabel,
      shortLabel: column.label,
      percent,
      percentLabel: Number.isFinite(percent) ? `${percent.toFixed(1)}%` : "N/A",
      countedEntries: totals.count
    };
  });

  return summary;
}

function buildSubacSummary(records = [], scaleSet = {}) {
  const subacScale = getScaleBySystem(scaleSet, SUBAC_SYSTEM_KEY);
  const countOrder = (Array.isArray(subacScale.marks) ? subacScale.marks : []).map((mark) => ({
    key: String(mark.key || ""),
    symbol: String(mark.symbol || ""),
    label: String(mark.label || ""),
    active: Boolean(mark.active)
  }));
  const counts = {};
  countOrder.forEach((mark) => {
    counts[mark.key] = 0;
  });

  let pointsEarned = 0;
  let totalPoints = 0;

  records.forEach((record) => {
    const mark = resolveDisplayMark(record, scaleSet);
    if (!mark?.markKey) return;
    counts[mark.markKey] = Number(counts[mark.markKey] || 0) + 1;
    if (mark.countsTowardGrade) {
      pointsEarned += Number(mark.value || 0);
      totalPoints += Number(mark.maxValue || 0);
    }
  });

  const percent = totalPoints > 0 ? (pointsEarned / totalPoints) * 100 : null;

  return {
    countOrder,
    counts,
    pointsEarned,
    totalPoints,
    pointsEarnedLabel: Number(pointsEarned.toFixed(2)).toString(),
    totalPointsLabel: Number(totalPoints.toFixed(2)).toString(),
    gradePercent: percent,
    gradePercentLabel: Number.isFinite(percent) ? `${percent.toFixed(1)}%` : "N/A"
  };
}

function buildSubacDateMeta(dateKey, records = []) {
  const reviewers = Array.from(new Set(
    records.map((record) => String(record?.sheetContext?.reviewer || "").trim()).filter(Boolean)
  ));
  const portions = Array.from(new Set(
    records.map((record) => String(record?.sheetContext?.portion || "").trim()).filter(Boolean)
  ));

  return {
    reviewerSummary: reviewers.length === 0 ? "—" : (reviewers.length === 1 ? reviewers[0] : "Varies"),
    portionSummary: portions.length === 0 ? "—" : (portions.length === 1 ? portions[0] : "Varies")
  };
}

function buildLegacyRows(gradeDocs = []) {
  return [...(Array.isArray(gradeDocs) ? gradeDocs : [])]
    .filter((record) => !String(record?.sheetContext?.mode || "").trim())
    .sort((left, right) => new Date(right?.updatedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.createdAt || 0))
    .slice(0, 18)
    .map((record) => ({
      id: String(record?._id || ""),
      studentName: String(record?.students?.[0]?.name || "Student").trim() || "Student",
      subjectLabel: String(record?.subjectLabel || record?.subject || "Subject").trim() || "Subject",
      assignmentName: String(record?.Assignment?.name || "Assessment").trim() || "Assessment",
      assignmentDescription: String(record?.Assignment?.description || "").trim(),
      quarter: String(record?.quarter || "").trim(),
      categoryLabel: String(record?.Assignment?.categoryLabel || record?.Assignment?.type || "").trim(),
      gradeLabel: `${Number(record?.Assignment?.grade || 0)}/${Number(record?.Assignment?.maxScore || 100)}`,
      feedback: typeof record?.feedback === "object"
        ? String(record?.feedback?.content || "").trim()
        : String(record?.feedback || "").trim(),
      assignedDateLabel: record?.assignedDate ? formatDateLabel(record.assignedDate) : "N/A",
      updatedAtLabel: record?.updatedAt ? formatDateTimeLabel(record.updatedAt) : "N/A"
    }));
}

function buildTeacherGradebookClassView({ classDoc, gradeDocs = [], rankLookup = {} }) {
  const normalizedScaleSet = normalizeGradingScaleSet(
    classDoc?.teacherSettings?.gradingScales || buildDefaultGradingScaleSet()
  );
  const regularScale = getScaleBySystem(normalizedScaleSet, MEMORIZATION_SYSTEM_KEY);
  const subacScale = getScaleBySystem(normalizedScaleSet, SUBAC_SYSTEM_KEY);
  const allRecords = Array.isArray(gradeDocs) ? gradeDocs : [];

  const regularSheetRecords = allRecords.filter(
    (record) => String(record?.sheetContext?.mode || "") === MEMORIZATION_SYSTEM_KEY
  );
  const subacSheetRecords = allRecords.filter(
    (record) => String(record?.sheetContext?.mode || "") === SUBAC_SYSTEM_KEY
  );

  const regularScheduleDays = (classDoc?.schedule || []).map((entry) => String(entry?.day || "").trim()).filter(Boolean);
  const subacScheduleDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const regularDateColumns = buildDateColumns(
    Array.from(new Set(regularSheetRecords.map((record) => toDateKey(record?.sheetContext?.dateKey || record?.assignedDate)).filter(Boolean))),
    buildRecentDateKeys(regularScheduleDays, 6),
    12
  );
  const subacDateColumns = buildDateColumns(
    Array.from(new Set(subacSheetRecords.map((record) => toDateKey(record?.sheetContext?.dateKey || record?.assignedDate)).filter(Boolean))),
    buildRecentDateKeys(subacScheduleDays, 6),
    12
  );

  const allSheetRecords = [...regularSheetRecords, ...subacSheetRecords];
  const cellLookup = buildCellLookup(allSheetRecords);

  const subacRecordsByDate = new Map();
  subacSheetRecords.forEach((record) => {
    const dateKey = String(record?.sheetContext?.dateKey || toDateKey(record?.assignedDate)).trim();
    if (!dateKey) return;
    const current = subacRecordsByDate.get(dateKey) || [];
    current.push(record);
    subacRecordsByDate.set(dateKey, current);
  });

  const students = (Array.isArray(classDoc?.students) ? classDoc.students : []).map((student) => {
    const studentId = toIdString(student?._id);
    const studentRegularRecords = regularSheetRecords.filter(
      (record) => toIdString(record?.students?.[0]?._id) === studentId
    );
    const studentSubacRecords = subacSheetRecords.filter(
      (record) => toIdString(record?.students?.[0]?._id) === studentId
    );
    const rankInfo = rankLookup[String(studentId)] || {};

    return {
      id: studentId,
      name: String(student?.name || "Student").trim() || "Student",
      rankLabel: String(rankInfo.displayRankLabel || "F Rank"),
      xpLabel: Number(rankInfo.xp || 0).toLocaleString(),
      regularCells: regularDateColumns.map((dateColumn) => ({
        ...dateColumn,
        entries: REGULAR_COLUMN_DEFINITIONS.map((columnDefinition) =>
          buildGradebookCell({
            record: cellLookup.get(`${studentId}|${MEMORIZATION_SYSTEM_KEY}|${columnDefinition.key}|${dateColumn.dateKey}`) || null,
            systemKey: MEMORIZATION_SYSTEM_KEY,
            columnDefinition,
            dateColumn,
            scaleSet: normalizedScaleSet
          })
        )
      })),
      subacCells: subacDateColumns.map((dateColumn) =>
        buildGradebookCell({
          record: cellLookup.get(`${studentId}|${SUBAC_SYSTEM_KEY}|${SUBAC_SUBJECT_DEFINITION.key}|${dateColumn.dateKey}`) || null,
          systemKey: SUBAC_SYSTEM_KEY,
          columnDefinition: SUBAC_SUBJECT_DEFINITION,
          dateColumn,
          scaleSet: normalizedScaleSet
        })
      ),
      regularSummary: buildRegularSummary(studentRegularRecords, normalizedScaleSet),
      subacSummary: buildSubacSummary(studentSubacRecords, normalizedScaleSet)
    };
  });

  return {
    id: String(classDoc?._id || ""),
    className: classDoc?.className || "Class",
    classCode: classDoc?.classCode || "",
    roomNumber: classDoc?.roomNumber || "—",
    location: classDoc?.location || "—",
    studentCount: students.length,
    currentQuarter: classDoc?.academicYear?.quarter || "Q1",
    currentConfigVersion: Number(classDoc?.currentConfigVersion || classDoc?.teacherSettings?.currentConfigVersion || 1),
    regularScale,
    subacScale,
    regularColumnDefinitions: REGULAR_COLUMN_DEFINITIONS,
    regularDateColumns,
    subacDateColumns: subacDateColumns.map((column) => ({
      ...column,
      ...buildSubacDateMeta(column.dateKey, subacRecordsByDate.get(column.dateKey) || [])
    })),
    students,
    legacyRows: buildLegacyRows(allRecords),
    scaleCustomizationHref: `/teacher/customize?classId=${classDoc?._id || ""}`
  };
}

function buildTeacherGradebookPage(classes = [], gradesByClassId = new Map(), rankLookup = {}) {
  const classViews = (Array.isArray(classes) ? classes : []).map((classDoc) =>
    buildTeacherGradebookClassView({
      classDoc,
      gradeDocs: gradesByClassId.get(String(classDoc?._id || "")) || [],
      rankLookup
    })
  );

  return {
    classes: classViews,
    regularOptions: classViews[0]?.regularScale?.marks || buildDefaultGradingScaleSet().memorization.marks,
    subacOptions: classViews[0]?.subacScale?.marks || buildDefaultGradingScaleSet().subac.marks
  };
}

function buildGradebookCellResponse(record, scaleSet = {}) {
  if (!record) return null;
  const dateKey = String(record?.sheetContext?.dateKey || toDateKey(record?.assignedDate)).trim();
  const systemKey = String(record?.sheetContext?.mode || "").trim();
  const columnKey = String(record?.sheetContext?.columnKey || "").trim();
  const columnDefinition = systemKey === SUBAC_SYSTEM_KEY
    ? SUBAC_SUBJECT_DEFINITION
    : (REGULAR_COLUMN_DEFINITIONS.find((column) => column.key === columnKey) || REGULAR_COLUMN_DEFINITIONS[0]);
  const dateColumn = {
    dateKey,
    shortLabel: formatDateShort(dateKey),
    dayLabel: formatDayShort(dateKey)
  };

  return buildGradebookCell({
    record,
    systemKey,
    columnDefinition,
    dateColumn,
    scaleSet
  });
}

function buildRowUpdatePayload({
  classDoc,
  studentId,
  classGradeDocs = [],
  rankLookup = {}
}) {
  const classView = buildTeacherGradebookClassView({
    classDoc,
    gradeDocs: classGradeDocs,
    rankLookup
  });
  const row = classView.students.find((student) => String(student.id) === String(studentId)) || null;

  return {
    row,
    subacDateColumns: classView.subacDateColumns
  };
}

module.exports = {
  REGULAR_COLUMN_DEFINITIONS,
  SUBAC_SUBJECT_DEFINITION,
  MEMORIZATION_SYSTEM_KEY,
  SUBAC_SYSTEM_KEY,
  toDateKey,
  parseDateKey,
  formatDateShort,
  formatDayShort,
  buildTeacherGradebookPage,
  buildTeacherGradebookClassView,
  buildGradebookCellResponse,
  buildRowUpdatePayload
};
