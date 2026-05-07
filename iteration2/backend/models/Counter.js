const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    key: { type: String, required: true, trim: true },
    nextValue: { type: Number, required: true, default: 1, min: 1 }
  },
  { timestamps: true }
);

CounterSchema.index({ schoolId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("Counter", CounterSchema, "counters");
