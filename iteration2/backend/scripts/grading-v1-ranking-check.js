/* eslint-disable no-console */
const assert = require("assert");
const { rankStudents } = require("../src/shared/calculations");

function eventFor(category, coordinateKey, normalizedValue, sequenceNumber) {
  return {
    coordinateKey,
    category,
    sequenceNumber,
    action: "set",
    mark: {
      key: `${category}-${normalizedValue}`,
      normalizedValue,
      countsTowardGrade: true
    }
  };
}

function main() {
  const rankings = rankStudents([
    {
      studentId: "student-a",
      studentName: "Student A",
      events: [
        eventFor("cashar", "a-1", 0.9, 1),
        eventFor("subac", "a-2", 0.8, 2)
      ]
    },
    {
      studentId: "student-b",
      studentName: "Student B",
      events: [
        eventFor("cashar", "b-1", 0.9, 1),
        eventFor("subac", "b-2", 0.7, 2)
      ]
    }
  ]);

  assert.strictEqual(rankings.length, 2);
  assert.strictEqual(rankings[0].studentId, "student-a");
  assert.strictEqual(rankings[0].rank, 1);
  assert.strictEqual(rankings[1].studentId, "student-b");
  assert.strictEqual(rankings[1].rank, 2);

  console.log("Grading V1 ranking check passed.");
}

main();
