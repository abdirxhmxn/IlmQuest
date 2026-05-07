/* eslint-disable no-console */
const assert = require("assert");

const {
  DAILY_COLUMN_DEFINITIONS,
  buildTrackerColumns,
  buildStudentRow,
  buildStableCellKey,
  buildCoordinateKey,
  getAssessmentColumnKey
} = require("../services/gradingV1");

function createMark({ key, symbol, label, normalizedValue, countsTowardGrade = true }) {
  return {
    key,
    symbol,
    label,
    normalizedValue,
    countsTowardGrade
  };
}

function createEvent({
  id,
  classId,
  studentId,
  gradingPeriodId,
  category,
  dateKey = "",
  columnKey = "",
  assessmentId = "",
  sequenceNumber,
  mark,
  action = "set",
  supersededBy = null
}) {
  return {
    _id: id,
    schoolId: "school-1",
    classId,
    studentId,
    gradingPeriodId,
    assessmentId,
    category,
    dateKey,
    columnKey,
    coordinateKey: buildCoordinateKey({
      classId,
      studentId,
      gradingPeriodId,
      category,
      dateKey,
      columnKey,
      assessmentId
    }),
    action,
    sequenceNumber,
    supersededBy,
    mark,
    metadata: {},
    createdAt: new Date("2026-05-07T15:00:00.000Z")
  };
}

function main() {
  const classId = "class-1";
  const gradingPeriodId = "period-1";
  const studentId = "student-1";
  const assessmentId = "assessment-1";
  const dateKey = "2026-05-11";

  const trackerColumns = buildTrackerColumns([
    {
      dateKey,
      shortLabel: "05/11",
      dayLabel: "Mon"
    }
  ], DAILY_COLUMN_DEFINITIONS);

  const row = buildStudentRow({
    schoolId: "school-1",
    classDoc: {
      _id: classId
    },
    periodDoc: {
      _id: gradingPeriodId
    },
    studentDoc: {
      _id: studentId,
      firstName: "Ruweyda",
      lastName: "Amin",
      xp: 0
    },
    trackerColumns,
    assessmentColumns: [
      {
        id: assessmentId,
        title: "Reading Check",
        shortLabel: "Read",
        keySystemKey: "cashar"
      }
    ],
    studentEvents: [
      createEvent({
        id: "event-old",
        classId,
        studentId,
        gradingPeriodId,
        category: "cashar",
        dateKey,
        columnKey: "q",
        sequenceNumber: 1,
        supersededBy: "event-new",
        mark: createMark({
          key: "failed",
          symbol: "X",
          label: "Failed",
          normalizedValue: 0
        })
      }),
      createEvent({
        id: "event-new",
        classId,
        studentId,
        gradingPeriodId,
        category: "cashar",
        dateKey,
        columnKey: "q",
        sequenceNumber: 2,
        mark: createMark({
          key: "great",
          symbol: "✓",
          label: "Great",
          normalizedValue: 1
        })
      }),
      createEvent({
        id: "event-clear",
        classId,
        studentId,
        gradingPeriodId,
        category: "writing",
        dateKey,
        columnKey: "w",
        sequenceNumber: 3,
        action: "clear",
        mark: createMark({
          key: "",
          symbol: "",
          label: "",
          normalizedValue: null,
          countsTowardGrade: false
        })
      }),
      createEvent({
        id: "event-assessment",
        classId,
        studentId,
        gradingPeriodId,
        category: "assessment",
        assessmentId,
        columnKey: getAssessmentColumnKey(assessmentId),
        sequenceNumber: 4,
        mark: createMark({
          key: "great",
          symbol: "✓",
          label: "Great",
          normalizedValue: 1
        })
      })
    ],
    commentMap: new Map(),
    keySystemsByKey: {},
    rankingLookup: {}
  });

  const qCell = row.dailyGroups[0].cells.find((cell) => cell.category === "cashar" && cell.columnKey === "q");
  const wCell = row.dailyGroups[0].cells.find((cell) => cell.category === "writing" && cell.columnKey === "w");
  const assessmentCell = row.assessmentCells[0];

  assert.ok(qCell, "cashar q cell should exist");
  assert.strictEqual(qCell.markKey, "great", "saved cashar event should hydrate back into the same cell");
  assert.strictEqual(
    qCell.stableCellKey,
    buildStableCellKey({
      studentId,
      category: "cashar",
      subcategory: "q",
      schoolDate: dateKey,
      assessmentId: ""
    }),
    "cashar cell should keep a stable hydration key"
  );
  assert.strictEqual(qCell.symbol, "✓", "hydrated cell should resolve the saved display symbol");
  assert.strictEqual(qCell.tone, "excellent", "hydrated cell should keep its saved tone");

  assert.ok(wCell, "writing cell should exist");
  assert.strictEqual(wCell.markKey, "", "cleared cells should stay empty after rebuild");
  assert.strictEqual(wCell.symbol, "", "cleared cells should not render stale symbols");

  assert.ok(assessmentCell, "assessment cell should exist");
  assert.strictEqual(assessmentCell.markKey, "great", "assessment event should hydrate after refresh");
  assert.strictEqual(
    assessmentCell.stableCellKey,
    buildStableCellKey({
      studentId,
      category: "assessment",
      subcategory: getAssessmentColumnKey(assessmentId),
      schoolDate: "",
      assessmentId
    }),
    "assessment cells should use the shared stable key format"
  );

  assert.strictEqual(row.summaryCells.cashar.display, "100.0%", "hydrated rows should recompute summary values");
  assert.strictEqual(row.summaryCells.assessment.display, "100.0%", "assessment summary should persist after refresh");
  assert.strictEqual(row.summaryCells.final.display, "100.0%", "final summary should reflect hydrated events");
  assert.ok(
    row.clientState.liveEvents.some((event) => event.stableCellKey === qCell.stableCellKey),
    "client state should expose the same stable cell key used by the server render"
  );

  console.log("Grading V1 hydration check passed.");
}

try {
  main();
} catch (error) {
  console.error("Grading V1 hydration check failed:", error.message);
  process.exit(1);
}
