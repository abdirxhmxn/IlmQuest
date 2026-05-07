const CATEGORY_KEYS = Object.freeze([
  "cashar",
  "subac",
  "assessment",
  "behavior",
  "attendance",
  "subject",
  "writing"
]);

const CATEGORY_WEIGHTS_V1 = Object.freeze({
  cashar: 30,
  subac: 30,
  assessment: 15,
  behavior: 10,
  attendance: 5,
  subject: 5,
  writing: 5
});

const KEY_SYSTEM_VERSION = "albayaan.v1";

const KEY_SYSTEMS_V1 = Object.freeze({
  cashar: Object.freeze({
    key: "cashar",
    version: KEY_SYSTEM_VERSION,
    label: "Cashar",
    maxValue: 1,
    marks: Object.freeze([
      Object.freeze({ key: "great", symbol: "✓", label: "Great", normalizedValue: 1.0, countsTowardGrade: true }),
      Object.freeze({ key: "decent", symbol: "I ✓", label: "Decent", normalizedValue: 0.75, countsTowardGrade: true }),
      Object.freeze({ key: "average", symbol: "II ✓", label: "Average", normalizedValue: 0.6, countsTowardGrade: true }),
      Object.freeze({ key: "needs-work", symbol: "III ✓", label: "Needs Work", normalizedValue: 0.4, countsTowardGrade: true }),
      Object.freeze({ key: "failed", symbol: "X", label: "Failed", normalizedValue: 0, countsTowardGrade: true }),
    ])
  }),
  subac: Object.freeze({
    key: "subac",
    version: KEY_SYSTEM_VERSION,
    label: "Subac",
    maxValue: 1,
    marks: Object.freeze([
      Object.freeze({ key: "great", symbol: "✓", label: "Great", normalizedValue: 1.0, countsTowardGrade: true }),
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
      Object.freeze({ key: "present", symbol: "P", label: "Present", normalizedValue: 1.0, countsTowardGrade: true }),
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
      Object.freeze({ key: "excellent", symbol: "Excellent", label: "Excellent", normalizedValue: 1.0, countsTowardGrade: true }),
      Object.freeze({ key: "good", symbol: "Good", label: "Good", normalizedValue: 0.85, countsTowardGrade: true }),
      Object.freeze({ key: "needs-reminder", symbol: "Needs Reminder", label: "Needs Reminder", normalizedValue: 0.65, countsTowardGrade: true }),
      Object.freeze({ key: "warning", symbol: "Warning", label: "Warning", normalizedValue: 0.4, countsTowardGrade: true }),
      Object.freeze({ key: "serious-issue", symbol: "Serious Issue", label: "Serious Issue", normalizedValue: 0, countsTowardGrade: true })
    ])
  })
});

const CATEGORY_TO_KEY_SYSTEM_V1 = Object.freeze({
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
