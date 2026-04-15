/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_DIRS = [
  path.join(ROOT_DIR, "controllers"),
  path.join(ROOT_DIR, "utils"),
  path.join(ROOT_DIR, "routes")
];
const EXCLUDED_FILES = new Set([
  path.join(ROOT_DIR, "controllers", "auth.js")
]);

const MODEL_NAMES = [
  "User",
  "Class",
  "Grade",
  "Attendance",
  "Mission",
  "ParentPayment",
  "ReportActivity",
  "Post",
  "Announcement",
  "FinanceCategory",
  "FinanceEntry",
  "FinanceBankConnection",
  "FinanceBankAccount",
  "FinanceBankTransaction",
  "FinanceSyncLog",
  "AuditLog"
];

const ALLOWED_GLOBAL_MODELS = new Set(["School", "Verses", "Reflection"]);
const OP_NAMES = ["find", "findOne", "findOneAndUpdate", "findById", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments", "aggregate"];
const CALL_PATTERN = new RegExp(`\\b(${MODEL_NAMES.join("|")})\\.(${OP_NAMES.join("|")})\\s*\\(`, "g");
const IGNORE_MARKER = "tenant-query-guard:ignore";

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      return;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  });

  return files;
}

function isTenantScoped(snippet) {
  const sample = String(snippet || "");
  return (
    sample.includes(IGNORE_MARKER) ||
    sample.includes("scopedQuery(") ||
    sample.includes("scopedIdQuery(") ||
    sample.includes("assertTenantContext(") ||
    sample.includes("schoolId: req.schoolId") ||
    sample.includes("schoolId:req.schoolId") ||
    sample.includes("schoolId: req?.schoolId") ||
    sample.includes("schoolId: req.user.schoolId") ||
    sample.includes("schoolId:req.user.schoolId") ||
    sample.includes("schoolId: req.user?.schoolId")
  );
}

function inspectFile(filePath) {
  if (EXCLUDED_FILES.has(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, lineIndex) => {
    CALL_PATTERN.lastIndex = 0;
    let match;
    while ((match = CALL_PATTERN.exec(line))) {
      const modelName = match[1];
      if (ALLOWED_GLOBAL_MODELS.has(modelName)) continue;

      // Include nearby lines to reduce false positives on multiline query objects.
      const contextStart = Math.max(0, lineIndex - 60);
      const contextEnd = Math.min(lines.length, lineIndex + 20);
      const contextSnippet = lines.slice(contextStart, contextEnd).join("\n");

      if (!isTenantScoped(contextSnippet)) {
        findings.push({
          file: filePath,
          line: lineIndex + 1,
          model: modelName,
          code: line.trim()
        });
      }
    }
  });

  return findings;
}

function main() {
  const files = TARGET_DIRS.flatMap((dir) => listJsFiles(dir));
  const findings = files.flatMap((filePath) => inspectFile(filePath));

  if (!findings.length) {
    console.log("Tenant query guard passed.");
    return;
  }

  console.error("Tenant query guard found potentially unscoped data access:");
  findings.forEach((issue) => {
    const relativePath = path.relative(path.resolve(__dirname, "..", ".."), issue.file);
    console.error(`- ${relativePath}:${issue.line} [${issue.model}] ${issue.code}`);
  });
  process.exit(1);
}

main();
