const mongoose = require("mongoose");

const ROLES = ["admin", "teacher", "student", "parent"];
const PRIORITIES = ["info", "warning", "urgent"];
const STATUSES = ["draft", "published", "archived"];
const ANNOUNCEMENT_TYPES = ["announcement", "library_resource"];

const ActorSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const AnnouncementSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    summary: { type: String, trim: true, default: "", maxlength: 320 },
    announcementType: {
      type: String,
      enum: ANNOUNCEMENT_TYPES,
      default: "announcement",
      index: true
    },
    imageUrl: { type: String, trim: true, default: "" },
    imageCloudinaryId: { type: String, trim: true, default: "" },
    externalUrl: { type: String, trim: true, default: "" },
    visibilityMode: {
      type: String,
      enum: ["global", "scoped"],
      default: "global"
    },
    targetRoles: {
      type: [String],
      enum: ROLES,
      default: []
    },
    targetClassIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Class", default: [] },
    targetStudentIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    targetParentIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    targetTeacherIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    priority: {
      type: String,
      enum: PRIORITIES,
      default: "info"
    },
    isPinned: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    status: {
      type: String,
      enum: STATUSES,
      default: "draft"
    },
    publishAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: { type: ActorSnapshotSchema, default: () => ({}) },
    updatedBy: { type: ActorSnapshotSchema, default: () => ({}) }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ schoolId: 1, status: 1, isPublished: 1, publishAt: -1, expiresAt: 1 });
AnnouncementSchema.index({ schoolId: 1, isPinned: -1, publishedAt: -1, createdAt: -1 });
AnnouncementSchema.index({ schoolId: 1, announcementType: 1, createdAt: -1 });
AnnouncementSchema.index({ schoolId: 1, targetRoles: 1 });
AnnouncementSchema.index({ schoolId: 1, targetClassIds: 1 });
AnnouncementSchema.index({ schoolId: 1, targetStudentIds: 1 });
AnnouncementSchema.index({ schoolId: 1, targetParentIds: 1 });
AnnouncementSchema.index({ schoolId: 1, targetTeacherIds: 1 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);
module.exports.ANNOUNCEMENT_ROLES = ROLES;
module.exports.ANNOUNCEMENT_PRIORITIES = PRIORITIES;
module.exports.ANNOUNCEMENT_STATUSES = STATUSES;
module.exports.ANNOUNCEMENT_TYPES = ANNOUNCEMENT_TYPES;
