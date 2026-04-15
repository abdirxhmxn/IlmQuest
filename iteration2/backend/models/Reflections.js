const mongoose = require("mongoose");

const ReflectionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Quran", "Hadith"], // Allow both Quran and Hadith
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
  narrator: {
    type: String, // For Hadith - e.g., "Bukhari", "Muslim"
    trim: true
  },
  hadithNumber: {
    type: String, // For Hadith number
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

// Compound unique index on type + reference (allows same reference if different type)
ReflectionSchema.index({ type: 1, reference: 1 }, { unique: true });
ReflectionSchema.index({ arabic: 1 }, { unique: true });

module.exports = mongoose.model("Reflection", ReflectionSchema);