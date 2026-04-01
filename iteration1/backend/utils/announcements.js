const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const Class = require("../models/Class");
const User = require("../models/User");
const {
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_STATUSES
} = require("../models/Announcement");
const { getLinkedStudentsForParent } = require("./parentLinks");

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalizeText(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function uniqueRoles(values = []) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const role = String(value || "").trim().toLowerCase();
    if (!ANNOUNCEMENT_ROLES.includes(role)) return;
    if (seen.has(role)) return;
    seen.add(role);
    out.push(role);
  });
  return out;
}

function uniqueObjectIdStrings(values = []) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const id = String(value || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function buildActorSnapshot(user) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const name = `${first} ${last}`.trim() || user?.userName || "Unknown";
  return {
    _id: user?._id || null,
    name,
    role: String(user?.role || "").trim()
  };
}

function isAnnouncementExpired(announcement, now = new Date()) {
  if (!announcement?.expiresAt) return false;
  const expiresAt = new Date(announcement.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() < now.getTime();
}

function isAnnouncementWithinWindow(announcement, now = new Date()) {
  const publishAt = announcement?.publishAt ? new Date(announcement.publishAt) : null;
  if (publishAt && !Number.isNaN(publishAt.getTime()) && publishAt.getTime() > now.getTime()) {
    return false;
  }

  if (isAnnouncementExpired(announcement, now)) return false;
  return true;
}

function hasEntityScopes(announcement) {
  return (
    (announcement?.targetClassIds || []).length > 0
    || (announcement?.targetStudentIds || []).length > 0
    || (announcement?.targetParentIds || []).length > 0
    || (announcement?.targetTeacherIds || []).length > 0
  );
}

function hasAnyScopeRestrictions(announcement) {
  return ((announcement?.targetRoles || []).length > 0) || hasEntityScopes(announcement);
}

function intersects(left = [], right = []) {
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right.map(String));
  return left.some((value) => rightSet.has(String(value)));
}

function isAnnouncementVisibleToContext(announcement, context) {
  if (!announcement || !context) return false;
  if (String(announcement?.status || "") === "archived") return false;
  if (!announcement?.isPublished) return false;
  if (!isAnnouncementWithinWindow(announcement, context.now)) return false;

  if (context.role === "admin") {
    return true;
  }

  const targetRoles = (announcement.targetRoles || []).map(String);
  const roleMatch = targetRoles.length === 0 || targetRoles.includes(context.role);
  if (!roleMatch) return false;

  const classTargets = (announcement.targetClassIds || []).map(String);
  const studentTargets = (announcement.targetStudentIds || []).map(String);
  const parentTargets = (announcement.targetParentIds || []).map(String);
  const teacherTargets = (announcement.targetTeacherIds || []).map(String);

  const hasScopedEntities = classTargets.length || studentTargets.length || parentTargets.length || teacherTargets.length;
  if (!hasScopedEntities) return true;

  const classMatch = intersects(context.classIds, classTargets);
  const studentSelfMatch = context.role === "student" && studentTargets.includes(context.userId);
  const parentSelfMatch = context.role === "parent" && parentTargets.includes(context.userId);
  const teacherSelfMatch = context.role === "teacher" && teacherTargets.includes(context.userId);
  const parentChildMatch = context.role === "parent" && intersects(context.linkedStudentIds, studentTargets);

  return classMatch || studentSelfMatch || parentSelfMatch || teacherSelfMatch || parentChildMatch;
}

function sortAnnouncementsForDisplay(announcements = []) {
  return [...announcements].sort((a, b) => {
    const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pinDiff !== 0) return pinDiff;

    const aDate = new Date(a.publishAt || a.publishedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.publishAt || b.publishedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });
}

function formatDateLabel(dateValue) {
  if (!dateValue) return "N/A";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function summarizeScopeLabels(announcement, lookup = {}) {
  if (!hasAnyScopeRestrictions(announcement)) return "Global: all users in school";

  const parts = [];
  const targetRoles = (announcement.targetRoles || []).map(String);
  if (targetRoles.length) {
    parts.push(`Roles: ${targetRoles.join(", ")}`);
  }

  const classNameLookup = lookup.classById || {};
  const teacherNameLookup = lookup.teacherById || {};
  const studentNameLookup = lookup.studentById || {};
  const parentNameLookup = lookup.parentById || {};

  const classNames = (announcement.targetClassIds || [])
    .map((id) => classNameLookup[String(id)] || null)
    .filter(Boolean);
  if (classNames.length) parts.push(`Classes: ${classNames.join(", ")}`);

  const teacherNames = (announcement.targetTeacherIds || [])
    .map((id) => teacherNameLookup[String(id)] || null)
    .filter(Boolean);
  if (teacherNames.length) parts.push(`Teachers: ${teacherNames.join(", ")}`);

  const studentNames = (announcement.targetStudentIds || [])
    .map((id) => studentNameLookup[String(id)] || null)
    .filter(Boolean);
  if (studentNames.length) parts.push(`Students: ${studentNames.join(", ")}`);

  const parentNames = (announcement.targetParentIds || [])
    .map((id) => parentNameLookup[String(id)] || null)
    .filter(Boolean);
  if (parentNames.length) parts.push(`Parents: ${parentNames.join(", ")}`);

  return parts.join(" | ");
}

async function buildVisibilityContext(req, user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const userId = String(user?._id || "");
  const context = {
    role,
    userId,
    classIds: [],
    linkedStudentIds: [],
    now: new Date()
  };

  if (role === "teacher") {
    const classes = await Class.find({
      schoolId: req.schoolId,
      deletedAt: null,
      "teachers._id": user._id
    })
      .select("_id")
      .lean();
    context.classIds = classes.map((entry) => String(entry._id));
    return context;
  }

  if (role === "student") {
    const classes = await Class.find({
      schoolId: req.schoolId,
      deletedAt: null,
      "students._id": user._id
    })
      .select("_id")
      .lean();
    context.classIds = classes.map((entry) => String(entry._id));
    context.linkedStudentIds = [userId];
    return context;
  }

  if (role === "parent") {
    const parentDoc = await User.findOne({
      schoolId: req.schoolId,
      deletedAt: null,
      _id: user._id,
      role: "parent"
    }).lean();
    if (!parentDoc) return context;

    const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
    const linkedStudentIds = linkedStudents.map((student) => String(student._id));
    context.linkedStudentIds = linkedStudentIds;

    if (linkedStudentIds.length) {
      const classes = await Class.find({
        schoolId: req.schoolId,
        deletedAt: null,
        "students._id": { $in: linkedStudentIds }
      })
        .select("_id")
        .lean();
      context.classIds = classes.map((entry) => String(entry._id));
    }
    return context;
  }

  return context;
}

async function getVisibleAnnouncementsForUser(req, user, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 8), 100));
  const includeExpired = Boolean(options.includeExpired);

  const rawAnnouncements = await Announcement.find({
    schoolId: req.schoolId,
    status: { $ne: "archived" },
    isPublished: true
  })
    .sort({ isPinned: -1, publishAt: -1, createdAt: -1 })
    .limit(200)
    .lean();

  const context = await buildVisibilityContext(req, user);
  const visible = rawAnnouncements.filter((announcement) => {
    if (!isAnnouncementVisibleToContext(announcement, context)) return false;
    if (!includeExpired && isAnnouncementExpired(announcement, context.now)) return false;
    return true;
  });

  return sortAnnouncementsForDisplay(visible).slice(0, limit);
}

async function getAnnouncementAudienceOptions(req) {
  const [classes, students, parents, teachers] = await Promise.all([
    Class.find({ schoolId: req.schoolId, deletedAt: null })
      .select("_id className classCode")
      .sort({ className: 1 })
      .lean(),
    User.find({ schoolId: req.schoolId, deletedAt: null, role: "student" })
      .select("_id firstName lastName userName studentInfo.gradeLevel studentInfo.programType studentInfo.classId")
      .sort({ firstName: 1, lastName: 1, userName: 1 })
      .lean(),
    User.find({ schoolId: req.schoolId, deletedAt: null, role: "parent" })
      .select("_id firstName lastName userName")
      .sort({ firstName: 1, lastName: 1, userName: 1 })
      .lean(),
    User.find({ schoolId: req.schoolId, deletedAt: null, role: "teacher" })
      .select("_id firstName lastName userName")
      .sort({ firstName: 1, lastName: 1, userName: 1 })
      .lean()
  ]);

  const classById = {};
  classes.forEach((classDoc) => {
    classById[String(classDoc._id)] = classDoc.className || classDoc.classCode || "Class";
  });

  function displayName(entry) {
    const first = String(entry?.firstName || "").trim();
    const last = String(entry?.lastName || "").trim();
    const merged = `${first} ${last}`.trim();
    return merged || entry?.userName || "Unknown";
  }

  const studentById = {};
  const parentById = {};
  const teacherById = {};

  const studentOptions = students.map((student) => {
    const id = String(student._id);
    const name = displayName(student);
    studentById[id] = name;
    const className = classById[String(student?.studentInfo?.classId || "")] || "";
    return {
      _id: id,
      name,
      className,
      gradeLevel: student?.studentInfo?.gradeLevel || "",
      programType: student?.studentInfo?.programType || ""
    };
  });

  const parentOptions = parents.map((parent) => {
    const id = String(parent._id);
    const name = displayName(parent);
    parentById[id] = name;
    return { _id: id, name };
  });

  const teacherOptions = teachers.map((teacher) => {
    const id = String(teacher._id);
    const name = displayName(teacher);
    teacherById[id] = name;
    return { _id: id, name };
  });

  const classOptions = classes.map((classDoc) => ({
    _id: String(classDoc._id),
    className: classDoc.className || "Class",
    classCode: classDoc.classCode || ""
  }));

  return {
    classes: classOptions,
    students: studentOptions,
    parents: parentOptions,
    teachers: teacherOptions,
    lookup: {
      classById,
      studentById,
      parentById,
      teacherById
    }
  };
}

async function normalizeAndValidateAnnouncementInput(req, payload = {}, options = {}) {
  const now = new Date();
  const errors = [];

  const title = normalizeText(payload.title).slice(0, 160);
  const content = normalizeText(payload.content).slice(0, 4000);
  let summary = normalizeText(payload.summary).slice(0, 320);
  const priority = ANNOUNCEMENT_PRIORITIES.includes(String(payload.priority || ""))
    ? String(payload.priority)
    : "info";

  if (!title) errors.push("Announcement title is required.");
  if (!content) errors.push("Announcement content is required.");
  if (!summary) {
    summary = content.slice(0, 220);
  }

  let status = String(payload.status || "").trim().toLowerCase();
  if (!ANNOUNCEMENT_STATUSES.includes(status)) {
    status = payload.isPublished === "true" || payload.isPublished === true ? "published" : "draft";
  }

  const publishAtInput = parseDateInput(payload.publishAt);
  const expiresAt = parseDateInput(payload.expiresAt);
  let publishAt = publishAtInput;
  let publishedAt = null;
  let archivedAt = null;
  let isPublished = false;

  if (status === "published") {
    isPublished = true;
    publishAt = publishAtInput || now;
    publishedAt = publishAt;
  } else if (status === "archived") {
    archivedAt = now;
  }

  if (publishAt && expiresAt && expiresAt.getTime() <= publishAt.getTime()) {
    errors.push("Expiry date must be after the publish date.");
  }

  const targetRoles = uniqueRoles(toArray(payload.targetRoles));
  const targetClassIds = uniqueObjectIdStrings(toArray(payload.targetClassIds));
  const targetStudentIds = uniqueObjectIdStrings(toArray(payload.targetStudentIds));
  const targetParentIds = uniqueObjectIdStrings(toArray(payload.targetParentIds));
  const targetTeacherIds = uniqueObjectIdStrings(toArray(payload.targetTeacherIds));

  const hasRestrictions = (
    targetRoles.length > 0
    || targetClassIds.length > 0
    || targetStudentIds.length > 0
    || targetParentIds.length > 0
    || targetTeacherIds.length > 0
  );

  const requestedVisibilityMode = String(payload.visibilityMode || "global").trim().toLowerCase();
  let visibilityMode = requestedVisibilityMode === "scoped" || hasRestrictions ? "scoped" : "global";

  if (visibilityMode === "scoped" && !hasRestrictions) {
    errors.push("Scoped announcements require at least one target role or entity.");
  }

  const [classDocs, studentDocs, parentDocs, teacherDocs] = await Promise.all([
    targetClassIds.length
      ? Class.find({
        schoolId: req.schoolId,
        deletedAt: null,
        _id: { $in: targetClassIds }
      })
        .select("_id")
        .lean()
      : [],
    targetStudentIds.length
      ? User.find({
        schoolId: req.schoolId,
        deletedAt: null,
        role: "student",
        _id: { $in: targetStudentIds }
      })
        .select("_id")
        .lean()
      : [],
    targetParentIds.length
      ? User.find({
        schoolId: req.schoolId,
        deletedAt: null,
        role: "parent",
        _id: { $in: targetParentIds }
      })
        .select("_id")
        .lean()
      : [],
    targetTeacherIds.length
      ? User.find({
        schoolId: req.schoolId,
        deletedAt: null,
        role: "teacher",
        _id: { $in: targetTeacherIds }
      })
        .select("_id")
        .lean()
      : []
  ]);

  const validClassIds = classDocs.map((entry) => String(entry._id));
  const validStudentIds = studentDocs.map((entry) => String(entry._id));
  const validParentIds = parentDocs.map((entry) => String(entry._id));
  const validTeacherIds = teacherDocs.map((entry) => String(entry._id));

  if (validClassIds.length !== targetClassIds.length) {
    errors.push("One or more selected classes are invalid for this school.");
  }
  if (validStudentIds.length !== targetStudentIds.length) {
    errors.push("One or more selected students are invalid for this school.");
  }
  if (validParentIds.length !== targetParentIds.length) {
    errors.push("One or more selected parents are invalid for this school.");
  }
  if (validTeacherIds.length !== targetTeacherIds.length) {
    errors.push("One or more selected teachers are invalid for this school.");
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      clean: null
    };
  }

  if (!hasRestrictions) visibilityMode = "global";

  const actorSnapshot = buildActorSnapshot(req.user);
  const existingPublishedAt = options.existing?.publishedAt ? new Date(options.existing.publishedAt) : null;

  return {
    isValid: true,
    errors: [],
    clean: {
      title,
      content,
      summary,
      priority,
      isPinned: payload.isPinned === "true" || payload.isPinned === true || payload.isPinned === "on",
      visibilityMode,
      targetRoles,
      targetClassIds: validClassIds,
      targetStudentIds: validStudentIds,
      targetParentIds: validParentIds,
      targetTeacherIds: validTeacherIds,
      status,
      isPublished,
      publishAt,
      publishedAt: status === "published" ? (existingPublishedAt || publishedAt || now) : null,
      expiresAt,
      archivedAt,
      updatedBy: actorSnapshot
    }
  };
}

function toAnnouncementViewModel(announcement, lookup = {}) {
  const now = new Date();
  const expired = isAnnouncementExpired(announcement, now);
  const publishLabel = formatDateLabel(announcement.publishAt || announcement.publishedAt || announcement.createdAt);
  const expiresLabel = announcement.expiresAt ? formatDateLabel(announcement.expiresAt) : "";
  const audienceSummary = summarizeScopeLabels(announcement, lookup);
  const priority = String(announcement.priority || "info");

  return {
    id: String(announcement._id),
    title: announcement.title,
    content: announcement.content,
    summary: announcement.summary || announcement.content?.slice(0, 220) || "",
    priority,
    tone: priority === "urgent" ? "critical" : priority === "warning" ? "warning" : "success",
    status: String(announcement.status || ""),
    isPublished: Boolean(announcement.isPublished),
    isPinned: Boolean(announcement.isPinned),
    expired,
    publishAt: announcement.publishAt || null,
    expiresAt: announcement.expiresAt || null,
    publishLabel,
    expiresLabel,
    createdAtLabel: formatDateLabel(announcement.createdAt),
    audienceSummary,
    visibilityMode: announcement.visibilityMode || "global",
    targetRoles: announcement.targetRoles || [],
    targetClassIds: (announcement.targetClassIds || []).map((id) => String(id)),
    targetStudentIds: (announcement.targetStudentIds || []).map((id) => String(id)),
    targetParentIds: (announcement.targetParentIds || []).map((id) => String(id)),
    targetTeacherIds: (announcement.targetTeacherIds || []).map((id) => String(id))
  };
}

module.exports = {
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_STATUSES,
  buildActorSnapshot,
  formatDateLabel,
  isAnnouncementExpired,
  isAnnouncementVisibleToContext,
  summarizeScopeLabels,
  toAnnouncementViewModel,
  sortAnnouncementsForDisplay,
  getVisibleAnnouncementsForUser,
  getAnnouncementAudienceOptions,
  normalizeAndValidateAnnouncementInput
};
