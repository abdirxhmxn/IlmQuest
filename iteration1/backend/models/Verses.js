const mongoose = require("mongoose");

const VersesSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Quran"],
    required: true
  },
  arabic: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  translation: {
    type: String,
    required: true,
    trim: true
  },
  reference: {
    type: String,
    required: true,
    trim: true
  },
  surah: {
    type: String, // EX: "Al-Baqarah"
    required: true,
    trim: true
  },
  tags: [
    {
      type: String,
      lowercase: true,
      trim: true
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model("Verses", VersesSchema);
