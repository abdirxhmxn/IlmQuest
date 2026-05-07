const mongoose = require("mongoose");

const InstitutionAssetActorSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const InstitutionAssetSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    assetType: {
      type: String,
      enum: ["logo"],
      required: true
    },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    byteSize: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    magicType: { type: String, trim: true, default: "" },
    checksum: { type: String, trim: true, default: "" },
    svgSafe: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    archivedAt: { type: Date, default: null },
    uploadedBy: { type: InstitutionAssetActorSchema, required: true }
  },
  { timestamps: true }
);

InstitutionAssetSchema.index({ schoolId: 1, assetType: 1, isActive: 1 });

module.exports = mongoose.model("InstitutionAsset", InstitutionAssetSchema, "institution_assets");
