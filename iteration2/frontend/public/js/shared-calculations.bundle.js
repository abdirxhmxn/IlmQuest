(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // backend/src/shared/calculations/constants.js
  var require_constants = __commonJS({
    "backend/src/shared/calculations/constants.js"(exports, module) {
      var CATEGORY_KEYS = Object.freeze([
        "cashar",
        "subac",
        "assessment",
        "behavior",
        "attendance",
        "subject",
        "writing"
      ]);
      var CATEGORY_WEIGHTS_V1 = Object.freeze({
        cashar: 30,
        subac: 30,
        assessment: 15,
        behavior: 10,
        attendance: 5,
        subject: 5,
        writing: 5
      });
      var KEY_SYSTEM_VERSION = "albayaan.v1";
      var KEY_SYSTEMS_V1 = Object.freeze({
        cashar: Object.freeze({
          key: "cashar",
          version: KEY_SYSTEM_VERSION,
          label: "Cashar",
          maxValue: 1,
          marks: Object.freeze([
            Object.freeze({ key: "great", symbol: "\u2713", label: "Great", normalizedValue: 1, countsTowardGrade: true }),
            Object.freeze({ key: "decent", symbol: "I \u2713", label: "Decent", normalizedValue: 0.75, countsTowardGrade: true }),
            Object.freeze({ key: "average", symbol: "II \u2713", label: "Average", normalizedValue: 0.6, countsTowardGrade: true }),
            Object.freeze({ key: "needs-work", symbol: "III \u2713", label: "Needs Work", normalizedValue: 0.4, countsTowardGrade: true }),
            Object.freeze({ key: "failed", symbol: "X", label: "Failed", normalizedValue: 0, countsTowardGrade: true })
          ])
        }),
        subac: Object.freeze({
          key: "subac",
          version: KEY_SYSTEM_VERSION,
          label: "Subac",
          maxValue: 1,
          marks: Object.freeze([
            Object.freeze({ key: "great", symbol: "\u2713", label: "Great", normalizedValue: 1, countsTowardGrade: true }),
            Object.freeze({ key: "decent", symbol: "I", label: "Decent", normalizedValue: 0.85, countsTowardGrade: true }),
            Object.freeze({ key: "average", symbol: "II", label: "Average", normalizedValue: 0.7, countsTowardGrade: true }),
            Object.freeze({ key: "needs-work", symbol: "III", label: "Needs Work", normalizedValue: 0.5, countsTowardGrade: true }),
            Object.freeze({ key: "failed", symbol: "IIII", label: "Failed", normalizedValue: 0, countsTowardGrade: true }),
            Object.freeze({ key: "excused", symbol: "E", label: "Excused", normalizedValue: null, countsTowardGrade: false }),
            Object.freeze({ key: "competition", symbol: "C", label: "Competition", normalizedValue: null, countsTowardGrade: false }),
            Object.freeze({ key: "pen-check", symbol: "PC", label: "Pen Check", normalizedValue: null, countsTowardGrade: false }),
            Object.freeze({ key: "blank", symbol: "", label: "Blank", normalizedValue: null, countsTowardGrade: false })
          ])
        }),
        attendance: Object.freeze({
          key: "attendance",
          version: KEY_SYSTEM_VERSION,
          label: "Attendance",
          maxValue: 1,
          marks: Object.freeze([
            Object.freeze({ key: "present", symbol: "P", label: "Present", normalizedValue: 1, countsTowardGrade: true }),
            Object.freeze({ key: "late", symbol: "L", label: "Late", normalizedValue: 0.75, countsTowardGrade: true }),
            Object.freeze({ key: "excused", symbol: "E", label: "Excused Absence", normalizedValue: null, countsTowardGrade: false }),
            Object.freeze({ key: "absent", symbol: "AB", label: "Unexcused Absence", normalizedValue: 0, countsTowardGrade: true }),
            Object.freeze({ key: "no-class", symbol: "NC", label: "No Class", normalizedValue: null, countsTowardGrade: false }),
            Object.freeze({ key: "holiday", symbol: "H", label: "Holiday", normalizedValue: null, countsTowardGrade: false })
          ])
        }),
        behavior: Object.freeze({
          key: "behavior",
          version: KEY_SYSTEM_VERSION,
          label: "Behavior",
          maxValue: 1,
          marks: Object.freeze([
            Object.freeze({ key: "excellent", symbol: "Excellent", label: "Excellent", normalizedValue: 1, countsTowardGrade: true }),
            Object.freeze({ key: "good", symbol: "Good", label: "Good", normalizedValue: 0.85, countsTowardGrade: true }),
            Object.freeze({ key: "needs-reminder", symbol: "Needs Reminder", label: "Needs Reminder", normalizedValue: 0.65, countsTowardGrade: true }),
            Object.freeze({ key: "warning", symbol: "Warning", label: "Warning", normalizedValue: 0.4, countsTowardGrade: true }),
            Object.freeze({ key: "serious-issue", symbol: "Serious Issue", label: "Serious Issue", normalizedValue: 0, countsTowardGrade: true })
          ])
        })
      });
      var CATEGORY_TO_KEY_SYSTEM_V1 = Object.freeze({
        cashar: "cashar",
        writing: "cashar",
        subject: "cashar",
        assessment: "cashar",
        subac: "subac",
        attendance: "attendance",
        behavior: "behavior"
      });
      module.exports = {
        CATEGORY_KEYS,
        CATEGORY_WEIGHTS_V1,
        KEY_SYSTEM_VERSION,
        KEY_SYSTEMS_V1,
        CATEGORY_TO_KEY_SYSTEM_V1
      };
    }
  });

  // backend/src/shared/calculations/index.js
  var require_index = __commonJS({
    "backend/src/shared/calculations/index.js"(exports, module) {
      var {
        CATEGORY_KEYS,
        CATEGORY_WEIGHTS_V1
      } = require_constants();
      function toNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      function toStringValue(value) {
        return String(value || "").trim();
      }
      function normalizeEventRecord(record = {}) {
        var _a, _b, _c;
        const category = toStringValue(record.category || record.categoryKey || record.type).toLowerCase();
        const score = record.normalizedScore != null ? toNumber(record.normalizedScore, null) : record.score != null ? toNumber(record.score, null) : record.mark && record.mark.normalizedValue != null ? toNumber(record.mark.normalizedValue, null) : null;
        const countsTowardGrade = typeof record.countsTowardGrade === "boolean" ? record.countsTowardGrade : typeof record.counts_toward_grade === "boolean" ? record.counts_toward_grade : typeof ((_a = record.mark) == null ? void 0 : _a.countsTowardGrade) === "boolean" ? record.mark.countsTowardGrade : true;
        const isClearAction = toStringValue(record.action).toLowerCase() === "clear";
        return {
          id: toStringValue(record._id || record.id),
          coordinateKey: toStringValue(record.coordinateKey || record.coordinate_key || record.cellKey),
          category,
          markKey: toStringValue(record.markKey || record.mark_key || ((_b = record.mark) == null ? void 0 : _b.key)),
          symbol: toStringValue(record.symbol || ((_c = record.mark) == null ? void 0 : _c.symbol)),
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
        const byCoordinate = /* @__PURE__ */ new Map();
        normalized.forEach((event) => {
          const coordinateKey = event.coordinateKey;
          if (!coordinateKey) return;
          byCoordinate.set(coordinateKey, event);
        });
        return Array.from(byCoordinate.values()).filter((event) => !event.supersededBy).filter((event) => event.action !== "clear");
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
          var _a;
          const average = (_a = categoryTotals == null ? void 0 : categoryTotals[category]) == null ? void 0 : _a.average;
          return Number.isFinite(average);
        });
        const totalWeight = activeCategories.reduce((sum, category) => sum + toNumber(weightMap[category], 0), 0);
        const normalizedWeights = {};
        activeCategories.forEach((category) => {
          normalizedWeights[category] = totalWeight > 0 ? toNumber(weightMap[category], 0) / totalWeight : 0;
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
    }
  });

  // backend/src/shared/calculations/browser-entry.js
  window.IlmQuestCalculations = require_index();
})();
