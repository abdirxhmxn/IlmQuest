/* eslint-disable no-console */
const assert = require("assert");
const {
  calculateStudentSummary,
  getLatestCellStates
} = require("../src/shared/calculations");

function main() {
  const events = [
    {
      id: "1",
      coordinateKey: "cashar-1",
      category: "cashar",
      sequenceNumber: 1,
      action: "set",
      mark: { key: "great", normalizedValue: 1, countsTowardGrade: true }
    },
    {
      id: "2",
      coordinateKey: "subac-1",
      category: "subac",
      sequenceNumber: 2,
      action: "set",
      mark: { key: "decent", normalizedValue: 0.85, countsTowardGrade: true }
    },
    {
      id: "3",
      coordinateKey: "attendance-1",
      category: "attendance",
      sequenceNumber: 3,
      action: "set",
      mark: { key: "late", normalizedValue: 0.75, countsTowardGrade: true }
    },
    {
      id: "4",
      coordinateKey: "behavior-1",
      category: "behavior",
      sequenceNumber: 4,
      action: "set",
      mark: { key: "good", normalizedValue: 0.85, countsTowardGrade: true }
    },
    {
      id: "5",
      coordinateKey: "attendance-1",
      category: "attendance",
      sequenceNumber: 5,
      action: "clear",
      mark: { key: "", normalizedValue: null, countsTowardGrade: false }
    }
  ];

  const live = getLatestCellStates(events);
  assert.strictEqual(live.length, 3, "clear events should remove attendance from live state");

  const summary = calculateStudentSummary(events);
  assert.strictEqual(summary.categoryTotals.cashar.average, 1);
  assert.strictEqual(summary.categoryTotals.subac.average, 0.85);
  assert.strictEqual(summary.categoryTotals.attendance.average, null);
  assert.strictEqual(summary.categoryTotals.behavior.average, 0.85);
  assert.ok(Math.abs(summary.finalPercentage - 91.42857142857143) < 0.000001);

  console.log("Grading V1 calculation check passed.");
}

main();
