const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SchoolSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true },

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
  },
  { timestamps: true }
);

SchoolSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

SchoolSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("School", SchoolSchema);
