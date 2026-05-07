/* eslint-disable no-console */
/**
 * Render smoke test — verifies that key EJS partials render without
 * crashing when optional variables (pageStyles, pageScripts, pageTitle)
 * are missing or misconfigured.
 *
 * Run: node backend/scripts/render-smoke-test.js
 */
const path = require("path");
const ejs = require("ejs");

const viewsDir = path.join(__dirname, "../../frontend/views");

// Minimal res.locals mock injected by server middleware
const BASE_LOCALS = {
  assetUrl: (p) => `${p}?v=smoketest`,
  assetVersion: "smoketest",
  csrfToken: "mock-csrf-token"
};

// Minimal user object for authenticated-shell partials
const MOCK_USER = {
  _id: "000000000000000000000001",
  firstName: "Test",
  lastName: "User",
  role: "teacher",
  accountType: "teacher"
};

let passed = 0;
let failed = 0;

async function renderPartial(label, file, extraLocals = {}) {
  const filePath = path.join(viewsDir, file);
  const locals = { ...BASE_LOCALS, ...extraLocals };
  try {
    await ejs.renderFile(filePath, locals, { filename: filePath });
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message.split("\n")[0]}`);
    failed++;
  }
}

async function main() {
  console.log("\n[render-smoke-test] Starting EJS partial render checks...\n");

  // ─── Public header — the root cause scenario ────────────────────────────
  await renderPartial("header — no vars (feed.ejs / todos.ejs pattern)", "partials/header.ejs", {});
  await renderPartial("header — pageTitle only (index.ejs pattern)", "partials/header.ejs", { pageTitle: "IlmQuest" });
  await renderPartial("header — with pageStyles array", "partials/header.ejs", {
    pageTitle: "Test",
    pageStyles: ["/css/pages/auth-shell.css"]
  });
  await renderPartial("header — malformed pageStyles (string, not array)", "partials/header.ejs", {
    pageTitle: "Test",
    pageStyles: "/css/bad.css"
  });

  // ─── Public footer ───────────────────────────────────────────────────────
  await renderPartial("footer — no pageScripts", "partials/footer.ejs", {});
  await renderPartial("footer — with pageScripts array", "partials/footer.ejs", {
    pageScripts: ["/js/scroll-animations.js"]
  });

  // ─── Teacher shell ───────────────────────────────────────────────────────
  await renderPartial("teacherHeader — no pageStyles", "partials/teacherHeader.ejs", {
    user: MOCK_USER
  });
  await renderPartial("teacherHeader — with pageStyles", "partials/teacherHeader.ejs", {
    user: MOCK_USER,
    teacherActivePage: "grades",
    teacherPageTitle: "Grades",
    pageStyles: ["/css/pages/teacher-gradebook-v1.css"]
  });
  await renderPartial("teacherFooter — no pageScripts", "partials/teacherFooter.ejs", {});
  await renderPartial("teacherFooter — with pageScripts", "partials/teacherFooter.ejs", {
    pageScripts: ["/js/teacher-gradebook-app.js"]
  });

  // ─── Admin shell ends ────────────────────────────────────────────────────
  await renderPartial("adminShellEnd — no pageScripts", "partials/adminShellEnd.ejs", {});
  await renderPartial("adminShellEnd — with pageScripts", "partials/adminShellEnd.ejs", {
    pageScripts: ["/js/admin-users.js"]
  });

  // ─── Student shell ends ──────────────────────────────────────────────────
  await renderPartial("studentShellEnd — no pageScripts", "partials/studentShellEnd.ejs", {});

  // ─── Parent shell ends ───────────────────────────────────────────────────
  await renderPartial("parentShellEnd — no pageScripts", "partials/parentShellEnd.ejs", {});

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n[render-smoke-test] Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error("[render-smoke-test] FAILED — fix EJS undefined variable crashes before deploying.\n");
    process.exitCode = 1;
  } else {
    console.log("[render-smoke-test] All checks passed.\n");
  }
}

main().catch((err) => {
  console.error("[render-smoke-test] Unexpected error:", err.message);
  process.exitCode = 1;
});
