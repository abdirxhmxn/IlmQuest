/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../config/.env") });

const KeySystem = require("../models/KeySystem");
const {
  KEY_SYSTEM_VERSION,
  KEY_SYSTEMS_V1
} = require("../src/shared/calculations/constants");

async function main() {
  if (!process.env.DB_STRING) throw new Error("DB_STRING is required.");
  await mongoose.connect(process.env.DB_STRING);
  console.log(`[seed-albayaan-key-systems] connected: ${mongoose.connection.db.databaseName}`);

  try {
    for (const [systemKey, definition] of Object.entries(KEY_SYSTEMS_V1)) {
      await KeySystem.findOneAndUpdate(
        {
          schoolId: null,
          version: KEY_SYSTEM_VERSION,
          systemKey
        },
        {
          $set: {
            label: definition.label,
            maxValue: Number(definition.maxValue || 1),
            active: true,
            seededAt: new Date(),
            marks: (Array.isArray(definition.marks) ? definition.marks : []).map((mark, index) => ({
              key: String(mark.key || ""),
              symbol: String(mark.symbol || ""),
              label: String(mark.label || ""),
              description: String(mark.description || ""),
              normalizedValue: Number.isFinite(Number(mark.normalizedValue)) ? Number(mark.normalizedValue) : null,
              countsTowardGrade: mark.countsTowardGrade !== false,
              sortOrder: Number.isFinite(Number(mark.sortOrder)) ? Number(mark.sortOrder) : index
            }))
          }
        },
        {
          upsert: true
        }
      );
      console.log(`[seed-albayaan-key-systems] upserted ${systemKey}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-albayaan-key-systems] failed:", err.message);
  process.exit(1);
});
