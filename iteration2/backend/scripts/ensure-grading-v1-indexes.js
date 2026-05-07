/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

const Assessment = require("../models/Assessment");
const Counter = require("../models/Counter");
const GradeComment = require("../models/GradeComment");
const GradeEvent = require("../models/GradeEvent");
const GradingPeriod = require("../models/GradingPeriod");
const InstitutionAsset = require("../models/InstitutionAsset");
const KeySystem = require("../models/KeySystem");
const Leaderboard = require("../models/Leaderboard");
const PeriodRanking = require("../models/PeriodRanking");
const RankCache = require("../models/RankCache");
const Report = require("../models/Report");
const SummaryCache = require("../models/SummaryCache");

const MODEL_LIST = [
  Assessment,
  Counter,
  GradeComment,
  GradeEvent,
  GradingPeriod,
  InstitutionAsset,
  KeySystem,
  Leaderboard,
  PeriodRanking,
  RankCache,
  Report,
  SummaryCache
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DB_STRING) throw new Error("DB_STRING is required.");

  await mongoose.connect(process.env.DB_STRING);
  console.log(`[ensure-grading-v1-indexes] connected: ${mongoose.connection.db.databaseName}`);
  console.log(`[ensure-grading-v1-indexes] mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

  try {
    for (const model of MODEL_LIST) {
      console.log(`[ensure-grading-v1-indexes] ${dryRun ? "inspecting" : "ensuring"} ${model.modelName}`);
      if (dryRun) {
        const indexes = await model.collection.indexes();
        console.log(`  indexes=${indexes.length}`);
      } else {
        await model.createIndexes();
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[ensure-grading-v1-indexes] failed:", err.message);
  process.exit(1);
});
