const {
  CATEGORY_KEYS,
  CATEGORY_WEIGHTS_V1
} = require("./constants");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringValue(value) {
  return String(value || "").trim();
}

function normalizeEventRecord(record = {}) {
  const category = toStringValue(record.category || record.categoryKey || record.type).toLowerCase();
  const score = record.normalizedScore != null
    ? toNumber(record.normalizedScore, null)
    : record.score != null
      ? toNumber(record.score, null)
      : record.mark && record.mark.normalizedValue != null
        ? toNumber(record.mark.normalizedValue, null)
        : null;
  const countsTowardGrade = typeof record.countsTowardGrade === "boolean"
    ? record.countsTowardGrade
    : typeof record.counts_toward_grade === "boolean"
      ? record.counts_toward_grade
      : typeof record.mark?.countsTowardGrade === "boolean"
        ? record.mark.countsTowardGrade
        : true;

  const isClearAction = toStringValue(record.action).toLowerCase() === "clear";

  return {
    id: toStringValue(record._id || record.id),
    coordinateKey: toStringValue(record.coordinateKey || record.coordinate_key || record.cellKey),
    category,
    markKey: toStringValue(record.markKey || record.mark_key || record.mark?.key),
    symbol: toStringValue(record.symbol || record.mark?.symbol),
    score,
    countsTowardGrade,
    excluded: record.excluded === true || countsTowardGrade === false || score == null,
    sequenceNumber: toNumber(record.sequence_number || record.sequenceNumber || 0, 0),
    supersededBy: toStringValue(record.superseded_by || record.supersededBy || ""),
    action: isClearAction ? "clear" : "set",
    behaviorSubcategory: toStringValue(record.behaviorSubcategory || record.behavior_subcategory),
    assessmentId: toStringValue(record.assessmentId || record.assessment_id),
    studentId: toStringValue(record.studentId || record.student_id),
    studentName: toStringValue(record.studentName || record.student_name),
    meta: record.meta || {}
  };
}

function compareBySequence(left, right) {
  const seqDelta = toNumber(left.sequenceNumber, 0) - toNumber(right.sequenceNumber, 0);
  if (seqDelta !== 0) return seqDelta;
  return toStringValue(left.id).localeCompare(toStringValue(right.id));
}

function getLatestCellStates(events = []) {
  const normalized = (Array.isArray(events) ? events : []).map(normalizeEventRecord).sort(compareBySequence);
  const byCoordinate = new Map();

  normalized.forEach((event) => {
    const coordinateKey = event.coordinateKey;
    if (!coordinateKey) return;
    byCoordinate.set(coordinateKey, event);
  });

  return Array.from(byCoordinate.values())
    .filter((event) => !event.supersededBy)
    .filter((event) => event.action !== "clear");
}

function createEmptyCategorySummary(category) {
  return {
    category,
    count: 0,
    includedCount: 0,
    excludedCount: 0,
    total: 0,
    average: null
  };
}

function calculateCategoryTotals(events = []) {
  const liveStates = getLatestCellStates(events);
  const totals = CATEGORY_KEYS.reduce((acc, category) => {
    acc[category] = createEmptyCategorySummary(category);
    return acc;
  }, {});

  liveStates.forEach((event) => {
    if (!totals[event.category]) {
      totals[event.category] = createEmptyCategorySummary(event.category);
    }
    const bucket = totals[event.category];
    bucket.count += 1;

    if (event.excluded || event.score == null) {
      bucket.excludedCount += 1;
      return;
    }

    bucket.includedCount += 1;
    bucket.total += event.score;
  });

  Object.keys(totals).forEach((category) => {
    const bucket = totals[category];
    bucket.average = bucket.includedCount > 0 ? bucket.total / bucket.includedCount : null;
  });

  return totals;
}

function calculateMarkCounts(events = []) {
  const liveStates = getLatestCellStates(events);
  const counts = {};

  liveStates.forEach((event) => {
    if (!event.category || !event.markKey) return;
    if (!counts[event.category]) counts[event.category] = {};
    counts[event.category][event.markKey] = toNumber(counts[event.category][event.markKey] || 0, 0) + 1;
  });

  return counts;
}

function calculateBehaviorSubcategoryTotals(events = []) {
  const liveStates = getLatestCellStates(events).filter((event) => event.category === "behavior");
  const totals = {};

  liveStates.forEach((event) => {
    const subcategory = event.behaviorSubcategory || "general";
    if (!totals[subcategory]) {
      totals[subcategory] = {
        subcategory,
        count: 0,
        total: 0,
        average: null
      };
    }

    if (event.excluded || event.score == null) return;
    totals[subcategory].count += 1;
    totals[subcategory].total += event.score;
  });

  Object.keys(totals).forEach((subcategory) => {
    const bucket = totals[subcategory];
    bucket.average = bucket.count > 0 ? bucket.total / bucket.count : null;
  });

  return totals;
}

function calculateAssessmentTotals(events = []) {
  const liveStates = getLatestCellStates(events).filter((event) => event.category === "assessment");
  const totals = {};

  liveStates.forEach((event) => {
    const assessmentId = event.assessmentId || "general";
    if (!totals[assessmentId]) {
      totals[assessmentId] = {
        assessmentId,
        count: 0,
        total: 0,
        average: null
      };
    }
    if (event.excluded || event.score == null) return;
    totals[assessmentId].count += 1;
    totals[assessmentId].total += event.score;
  });

  Object.keys(totals).forEach((assessmentId) => {
    const bucket = totals[assessmentId];
    bucket.average = bucket.count > 0 ? bucket.total / bucket.count : null;
  });

  return totals;
}

function normalizeAvailableWeights(categoryTotals = {}, weightMap = CATEGORY_WEIGHTS_V1) {
  const activeCategories = Object.keys(weightMap).filter((category) => {
    const average = categoryTotals?.[category]?.average;
    return Number.isFinite(average);
  });
  const totalWeight = activeCategories.reduce((sum, category) => sum + toNumber(weightMap[category], 0), 0);
  const normalizedWeights = {};

  activeCategories.forEach((category) => {
    normalizedWeights[category] = totalWeight > 0
      ? toNumber(weightMap[category], 0) / totalWeight
      : 0;
  });

  return {
    activeCategories,
    totalWeight,
    normalizedWeights
  };
}

function calculateFinalWeightedGrade(events = [], weightMap = CATEGORY_WEIGHTS_V1) {
  const categoryTotals = calculateCategoryTotals(events);
  const normalized = normalizeAvailableWeights(categoryTotals, weightMap);
  let weightedFraction = 0;

  normalized.activeCategories.forEach((category) => {
    weightedFraction += categoryTotals[category].average * normalized.normalizedWeights[category];
  });

  return {
    categoryTotals,
    activeCategories: normalized.activeCategories,
    normalizedWeights: normalized.normalizedWeights,
    finalFraction: normalized.activeCategories.length ? weightedFraction : null,
    finalPercentage: normalized.activeCategories.length ? weightedFraction * 100 : null
  };
}

function calculateStudentSummary(events = [], weightMap = CATEGORY_WEIGHTS_V1) {
  const finalGrade = calculateFinalWeightedGrade(events, weightMap);
  return {
    liveStates: getLatestCellStates(events),
    categoryTotals: finalGrade.categoryTotals,
    markCounts: calculateMarkCounts(events),
    behaviorSubcategoryTotals: calculateBehaviorSubcategoryTotals(events),
    assessmentTotals: calculateAssessmentTotals(events),
    activeCategories: finalGrade.activeCategories,
    normalizedWeights: finalGrade.normalizedWeights,
    finalFraction: finalGrade.finalFraction,
    finalPercentage: finalGrade.finalPercentage
  };
}

function rankStudents(studentRecords = [], options = {}) {
  const weightMap = options.weightMap || CATEGORY_WEIGHTS_V1;
  const rows = (Array.isArray(studentRecords) ? studentRecords : []).map((student) => {
    const summary = calculateStudentSummary(student.events || [], weightMap);
    return {
      studentId: toStringValue(student.studentId || student.id),
      studentName: toStringValue(student.studentName || student.name),
      finalPercentage: summary.finalPercentage,
      casharAverage: summary.categoryTotals.cashar.average,
      subacAverage: summary.categoryTotals.subac.average,
      summary
    };
  });

  rows.sort((left, right) => {
    const finalDelta = toNumber(right.finalPercentage, -1) - toNumber(left.finalPercentage, -1);
    if (finalDelta !== 0) return finalDelta;

    const casharDelta = toNumber(right.casharAverage, -1) - toNumber(left.casharAverage, -1);
    if (casharDelta !== 0) return casharDelta;

    const subacDelta = toNumber(right.subacAverage, -1) - toNumber(left.subacAverage, -1);
    if (subacDelta !== 0) return subacDelta;

    return left.studentName.localeCompare(right.studentName);
  });

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    totalStudents: rows.length
  }));
}

function toDisplayPercentage(value, digits) {
  const decimals = Number.isInteger(digits) ? digits : 1;
  return Number.isFinite(value) ? `${value.toFixed(decimals)}%` : "N/A";
}

module.exports = {
  CATEGORY_KEYS,
  CATEGORY_WEIGHTS_V1,
  normalizeEventRecord,
  compareBySequence,
  getLatestCellStates,
  calculateCategoryTotals,
  calculateMarkCounts,
  calculateBehaviorSubcategoryTotals,
  calculateAssessmentTotals,
  normalizeAvailableWeights,
  calculateFinalWeightedGrade,
  calculateStudentSummary,
  rankStudents,
  toDisplayPercentage
};
