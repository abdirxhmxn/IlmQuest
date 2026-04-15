const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SchoolSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true },
    schoolNameNormalized: { type: String, default: undefined },

    schoolEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /.+@.+\..+/,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    adminUser: { type: String, required: true, trim: true },

    address: { type: String, trim: true },

    contactEmail: { type: String, lowercase: true, trim: true, match: /.+@.+\..+/ },

    contactPhone: { type: String, trim: true },

    establishedDate: { type: Date },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    provisionedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    provisionedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

SchoolSchema.pre("validate", function (next) {
  this.schoolName = String(this.schoolName || "").trim();
  this.schoolNameNormalized = String(this.schoolName || "").trim().toLowerCase() || undefined;
  this.schoolEmail = String(this.schoolEmail || "").trim().toLowerCase();
  if (this.contactEmail) {
    this.contactEmail = String(this.contactEmail || "").trim().toLowerCase();
  } else {
    this.contactEmail = undefined;
  }
  next();
});

SchoolSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

SchoolSchema.index(
  { schoolNameNormalized: 1 },
  {
    name: "school_name_unique",
    unique: true,
    partialFilterExpression: {
      schoolNameNormalized: { $type: "string", $gt: "" }
    }
  }
);

SchoolSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("School", SchoolSchema);
