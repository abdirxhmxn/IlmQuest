/* eslint-disable no-console */
const assert = require("assert");
const path = require("path");
const ejs = require("ejs");

const {
  DAILY_COLUMN_DEFINITIONS,
  buildDateColumns,
  buildTrackerColumns,
  buildDefaultSummaryCells
} = require("../services/gradingV1");

function renderClassPanel(locals) {
  const file = path.join(process.cwd(), "frontend/views/partials/gradebook/teacherGradebookClassPanel.ejs");
  return new Promise((resolve, reject) => {
    ejs.renderFile(file, locals, { filename: file }, (err, html) => {
      if (err) return reject(err);
      return resolve(html);
    });
  });
}

async function main() {
  const dateColumns = buildDateColumns([], [], 5);
  assert.ok(dateColumns.length > 0, "date columns should be generated even with no saved grades");

  const focusedWeekColumns = buildDateColumns([], ["Mon", "Tue", "Wed", "Thu", "Fri"], 5, {
    focusDateKey: "2026-05-13"
  });
  assert.strictEqual(focusedWeekColumns[0]?.dateKey, "2026-05-11", "focused week should open on the requested week");
  assert.ok(
    focusedWeekColumns.some((entry) => entry.dateKey === "2026-05-13"),
    "focused week should include the requested day"
  );

  const trackerColumns = buildTrackerColumns(dateColumns, DAILY_COLUMN_DEFINITIONS);
  assert.strictEqual(trackerColumns.length, dateColumns.length, "tracker columns should align to generated dates");
  assert.ok((trackerColumns[0]?.columns || []).length >= 6, "each tracker date should expose editable grading columns");

  const html = await renderClassPanel({
    classView: {
      id: "class-1",
      className: "Grade 2",
      classCode: "G2-A",
      studentCount: 1,
      location: "Main",
      roomNumber: "10",
      gradingPeriod: { id: "period-1", name: "Q1 2025-2026" },
      dailyColumns: DAILY_COLUMN_DEFINITIONS,
      dateColumns,
      trackerColumns,
      assessmentColumns: [
        { id: "assessment-1", title: "Quiz 1", shortLabel: "Quiz 1" }
      ],
      students: [
        {
          id: "student-1",
          name: "Student One",
          missionRankLabel: "F Rank",
          missionXpLabel: "0",
          periodRankLabel: "—",
          dailyGroups: trackerColumns.map((trackerColumn) => ({
            dateKey: trackerColumn.dateKey,
            shortLabel: trackerColumn.shortLabel,
            dayLabel: trackerColumn.dayLabel,
            cells: trackerColumn.columns.map((column) => ({
              coordinateKey: `${trackerColumn.dateKey}:${column.columnKey}`,
              classId: "class-1",
              studentId: "student-1",
              category: column.category,
              dateKey: trackerColumn.dateKey,
              columnKey: column.columnKey,
              assessmentId: "",
              tone: "empty",
              detailLabel: column.longLabel,
              markKey: "",
              symbol: "",
              options: [
                { key: "great", symbol: "✓", label: "Great" }
              ],
              hasInternalComment: false,
              hasParentComment: false
            }))
          })),
          assessmentCells: [
            {
              coordinateKey: "assessment-1",
              classId: "class-1",
              studentId: "student-1",
              category: "assessment",
              dateKey: "",
              columnKey: "assessment:assessment-1",
              assessmentId: "assessment-1",
              tone: "empty",
              detailLabel: "Quiz 1",
              markKey: "",
              symbol: "",
              options: [
                { key: "great", symbol: "✓", label: "Great" }
              ],
              hasInternalComment: false,
              hasParentComment: false
            }
          ],
          summaryCells: buildDefaultSummaryCells()
        }
      ]
    },
    classIndex: 0,
    csrfToken: "token"
  });

  assert.ok(html.includes("data-gradebook-select"), "class panel should render editable dropdown cells");
  assert.ok(html.includes("Quiz 1"), "assessment columns should render");

  console.log("Grading V1 grid shape check passed.");
}

main().catch((err) => {
  console.error("Grading V1 grid shape check failed:", err.message);
  process.exit(1);
});
