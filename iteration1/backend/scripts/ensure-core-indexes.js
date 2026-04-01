/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

const Attendance = require("../models/Attendance");
const AuditLog = require("../models/AuditLog");
const ClassModel = require("../models/Class");
const FinanceBankAccount = require("../models/FinanceBankAccount");
const FinanceBankConnection = require("../models/FinanceBankConnection");
const FinanceBankTransaction = require("../models/FinanceBankTransaction");
const FinanceCategory = require("../models/FinanceCategory");
const FinanceEntry = require("../models/FinanceEntry");
const FinanceSyncLog = require("../models/FinanceSyncLog");
const Grade = require("../models/Grades");
const Mission = require("../models/Missions");
const ParentPayment = require("../models/ParentPayment");
const ReportActivity = require("../models/ReportActivity");

const MODEL_LIST = [
  Attendance,
  AuditLog,
  ClassModel,
  FinanceBankAccount,
  FinanceBankConnection,
  FinanceBankTransaction,
  FinanceCategory,
  FinanceEntry,
  FinanceSyncLog,
  Grade,
  Mission,
  ParentPayment,
  ReportActivity
];

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes("--dry-run"),
    verbose: argv.includes("--verbose")
  };
}

function summarizeIndexes(indexes = []) {
  return indexes.map((index) => ({
    name: index.name || "",
    key: index.key || {},
    unique: Boolean(index.unique)
  }));
}

async function main() {
  const { dryRun, verbose } = parseArgs();
  const dbString = process.env.DB_STRING;
  if (!dbString) {
    throw new Error("DB_STRING is required.");
  }

  await mongoose.connect(dbString);
  console.log(`[ensure-core-indexes] connected: ${mongoose.connection.db.databaseName}`);
  console.log(`[ensure-core-indexes] mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

  try {
    const summary = {
      mode: dryRun ? "dry-run" : "apply",
      models: [],
      ensuredModels: 0,
      failedModels: 0
    };

    for (const model of MODEL_LIST) {
      const modelSummary = { model: model.modelName, status: "pending", schemaIndexes: 0, dbIndexes: 0, error: "" };
      summary.models.push(modelSummary);
      console.log(`[ensure-core-indexes] ${dryRun ? "inspecting" : "ensuring"} indexes for ${model.modelName}...`);

      const schemaIndexes = model.schema.indexes();
      modelSummary.schemaIndexes = schemaIndexes.length;

      if (dryRun) {
        const existingIndexes = await model.collection.indexes();
        modelSummary.dbIndexes = existingIndexes.length;
        modelSummary.status = "inspected";

        if (verbose) {
          console.log(`[ensure-core-indexes] ${model.modelName} schema indexes:`);
          schemaIndexes.forEach(([key, options]) => {
            console.log(`  - key=${JSON.stringify(key)} options=${JSON.stringify(options || {})}`);
          });
          console.log(`[ensure-core-indexes] ${model.modelName} db indexes:`);
          summarizeIndexes(existingIndexes).forEach((index) => {
            console.log(`  - ${index.name} key=${JSON.stringify(index.key)} unique=${index.unique}`);
          });
        }
        summary.ensuredModels += 1;
        continue;
      }

      await model.createIndexes();
      const refreshedIndexes = await model.collection.indexes();
      modelSummary.dbIndexes = refreshedIndexes.length;
      modelSummary.status = "ensured";
      summary.ensuredModels += 1;

      if (verbose) {
        summarizeIndexes(refreshedIndexes).forEach((index) => {
          console.log(`  - ${model.modelName}:${index.name} key=${JSON.stringify(index.key)} unique=${index.unique}`);
        });
      }
    }

    console.log("[ensure-core-indexes] completed successfully.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[ensure-core-indexes] failed:", err.message);
  process.exit(1);
});
