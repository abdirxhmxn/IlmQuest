/* eslint-disable no-console */
const assert = require("assert");
const path = require("path");
const ejs = require("ejs");

const {
  buildDefaultSummaryCells,
  normalizeSummaryCells
} = require("../services/gradingV1");

function renderRowPartial(locals) {
  const file = path.join(process.cwd(), "frontend/views/partials/gradebook/teacherGradebookRow.ejs");
  return new Promise((resolve, reject) => {
    ejs.renderFile(file, locals, { filename: file }, (err, html) => {
      if (err) return reject(err);
      return resolve(html);
    });
  });
}

async function main() {
  const defaults = buildDefaultSummaryCells();
  assert.strictEqual(defaults.cashar.display, "—");
  assert.strictEqual(defaults.cashar.value, null);
  assert.strictEqual(defaults.final.display, "—");
  assert.strictEqual(defaults.final.value, null);

  const emptySummary = normalizeSummaryCells({}, {
    classId: "class-empty",
    studentId: "student-empty"
  });
  assert.strictEqual(emptySummary.cashar.display, "—");
  assert.strictEqual(emptySummary.writing.display, "—");
  assert.strictEqual(emptySummary.subject.display, "—");
  assert.strictEqual(emptySummary.subac.display, "—");
  assert.strictEqual(emptySummary.attendance.display, "—");
  assert.strictEqual(emptySummary.final.display, "—");

  const mergedSummary = normalizeSummaryCells({
    cashar: { display: "94.0%", value: 0.94 },
    final: { display: "88.5%", value: 88.5 }
  }, {
    classId: "class-graded",
    studentId: "student-graded"
  });
  assert.strictEqual(mergedSummary.cashar.display, "94.0%");
  assert.strictEqual(mergedSummary.cashar.value, 0.94);
  assert.strictEqual(mergedSummary.final.display, "88.5%");
  assert.strictEqual(mergedSummary.final.value, 88.5);
  assert.strictEqual(mergedSummary.subject.display, "—");
  assert.strictEqual(mergedSummary.subject.value, null);

  const html = await renderRowPartial({
    classView: {
      id: "class-1"
    },
    student: {
      id: "student-1",
      name: "Student One",
      missionRankLabel: "F Rank",
      missionXpLabel: "0",
      periodRankLabel: "—",
      dailyGroups: [],
      assessmentCells: []
    },
    csrfToken: "token"
  });

  assert.ok(html.includes("—"), "row partial should render fallback dashes for missing summaries");

  console.log("Grading V1 summary shape check passed.");
}

main().catch((err) => {
  console.error("Grading V1 summary shape check failed:", err.message);
  process.exit(1);
});
