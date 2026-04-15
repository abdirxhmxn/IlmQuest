const fs = require("node:fs/promises");
const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const User = require("../models/User")
const Class = require("../models/Class")
const Mission = require("../models/Missions")
const Grade = require("../models/Grades")
const School = require("../models/School");
const Attendance = require("../models/Attendance");
const { isHtmlRequest } = require("../middleware/validate");
const { pickAllowedFields, validateUserPatchPayload, validateClassPatchPayload } = require("../middleware/adminMutations");
const { logAdminAction, simpleDiff } = require("../utils/audit");
const {
  isValidRankKey,
  getAutoRankForXp,
  resolveStudentXp,
  buildRankSummaryFromUser,
  canStudentAccessMissionRank
} = require("../utils/ranks");
const {
  normalizeEmail,
  normalizeUserName,
  deriveUserNameCandidate,
  normalizeIdentifier,
  normalizeStudentNumber,
  mapDuplicateKeyError
} = require("../utils/userIdentifiers");
const { applyFirstLoginPasswordFlags } = require("../utils/passwordSetup");
const { scopedQuery, scopedIdQuery } = require("../utils/tenant");
const {
  normalizeRelationship,
  buildDisplayName,
  uniqueObjectIdStrings,
  extractParentChildIds,
  syncParentChildrenAssignments
} = require("../utils/parentLinks");
const {
  DASHBOARD_LAYOUTS,
  DASHBOARD_SECTION_KEYS,
  buildDefaultTeacherSettings,
  resolveTeacherSettings,
  normalizeDashboardSections,
  normalizeSubjectConfig,
  normalizeGradingCategories,
  getActiveSubjects,
  getActiveGradingCategories,
  normalizeCategoryKey,
  normalizeSubjectKey,
  normalizeName,
  getDefaultSubjectConfig,
  buildGradingConfigVersion
} = require("../utils/teacherCustomization");

const CLASS_GRADE_LEVELS = ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
const MAX_SUBJECT_CONFIG_ITEMS = 20;
const MAX_GRADING_CATEGORY_ITEMS = 20;

function safeJsonParse(value, fallback = []) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function normalizeClassSubjectsForSave(rawSubjects) {
  const source = Array.isArray(rawSubjects) ? rawSubjects : [];
  const seen = new Set();
  const cleaned = [];

  source.forEach((subject) => {
    const name = normalizeName(subject?.name);
    const gradeLevel = String(subject?.gradeLevel || "").trim();
    if (!name || !CLASS_GRADE_LEVELS.includes(gradeLevel)) return;

    const dedupeKey = `${name.toLowerCase()}|${gradeLevel.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    cleaned.push({ name, gradeLevel });
  });

  return cleaned;
}

function collectDuplicateNames(items, accessor) {
  const counts = new Map();
  const duplicates = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const name = normalizeName(accessor(item)).toLowerCase();
    if (!name) return;
    const next = (counts.get(name) || 0) + 1;
    counts.set(name, next);
    if (next > 1) duplicates.add(name);
  });

  return Array.from(duplicates);
}

function buildSettingsSignature(settings = {}) {
  const subjectConfig = (Array.isArray(settings.subjectConfig) ? settings.subjectConfig : [])
    .map((subject) => ({
      key: String(subject.key || ""),
      label: normalizeName(subject.label || subject.name),
      active: Boolean(subject.active),
      isArchived: Boolean(subject.isArchived),
      order: Number(subject.order || 0)
    }))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const gradingCategories = (Array.isArray(settings.gradingCategories) ? settings.gradingCategories : [])
    .map((category) => ({
      key: String(category.key || ""),
      label: normalizeName(category.label || category.name),
      weight: Math.round(Number(category.weight || 0) * 100) / 100,
      active: Boolean(category.active),
      isArchived: Boolean(category.isArchived),
      order: Number(category.order || 0),
      isDefault: Boolean(category.isDefault)
    }))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  return JSON.stringify({ subjectConfig, gradingCategories });
}

async function getClassGradeUsageSummary(req, classId) {
  const grades = await Grade.find(scopedQuery(req, { "classInfo._id": classId }))
    .select("subject subjectKey subjectLabel Assignment.type Assignment.categoryKey")
    .lean();

  const usedSubjectKeys = new Set();
  const usedCategoryKeys = new Set();

  grades.forEach((grade) => {
    const subjectKey = normalizeSubjectKey(
      grade?.subjectKey
      || grade?.subjectLabel
      || grade?.subject
    );
    if (subjectKey) usedSubjectKeys.add(subjectKey);

    const categoryKey = normalizeCategoryKey(
      grade?.Assignment?.categoryKey
      || grade?.Assignment?.type
    );
    if (categoryKey) usedCategoryKeys.add(categoryKey);
  });

  return {
    hasGrades: grades.length > 0,
    gradeCount: grades.length,
    usedSubjectKeys,
    usedCategoryKeys
  };
}

function mergeSubjectConfig({ existingSubjects, incomingSubjects, actorId, usageSummary }) {
  const timestamp = new Date();
  const existing = normalizeSubjectConfig(existingSubjects || []);
  const incoming = normalizeSubjectConfig(incomingSubjects || [], [], { actorId });

  const existingByKey = new Map(existing.map((subject) => [String(subject.key), subject]));
  const incomingByKey = new Map(incoming.map((subject) => [String(subject.key), subject]));
  const merged = [];

  incoming.forEach((subject, index) => {
    const key = String(subject.key);
    const found = existingByKey.get(key);
    const restored = Boolean(found?.isArchived) && Boolean(subject.active);

    merged.push({
      key: found?.key || key,
      label: subject.label,
      name: subject.label,
      active: Boolean(subject.active) && !Boolean(subject.isArchived),
      order: Number.isFinite(Number(subject.order)) ? Number(subject.order) : index,
      isArchived: Boolean(subject.isArchived) && !restored,
      archivedAt: Boolean(subject.isArchived) && !restored ? (subject.archivedAt || timestamp) : null,
      createdAt: found?.createdAt || subject.createdAt || timestamp,
      createdBy: found?.createdBy || subject.createdBy || actorId || null,
      updatedAt: timestamp,
      updatedBy: actorId || null
    });
  });

  existing.forEach((subject) => {
    if (incomingByKey.has(String(subject.key))) return;

    merged.push({
      ...subject,
      name: subject.label || subject.name,
      active: false,
      isArchived: true,
      archivedAt: subject.archivedAt || timestamp,
      updatedAt: timestamp,
      updatedBy: actorId || null
    });
  });

  return merged.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)));
}

function mergeGradingCategories({ existingCategories, incomingCategories, actorId, usageSummary }) {
  const timestamp = new Date();
  const existing = normalizeGradingCategories(existingCategories || []);
  const incoming = normalizeGradingCategories(incomingCategories || [], { actorId, allowEmpty: true });

  const existingByKey = new Map(existing.map((category) => [String(category.key), category]));
  const incomingByKey = new Map(incoming.map((category) => [String(category.key), category]));
  const merged = [];

  incoming.forEach((category, index) => {
    const key = String(category.key);
    const found = existingByKey.get(key);
    const restored = Boolean(found?.isArchived) && Boolean(category.active);

    merged.push({
      key: found?.key || key,
      label: category.label,
      name: category.label,
      weight: Math.round(Number(category.weight || 0) * 100) / 100,
      active: Boolean(category.active) && !Boolean(category.isArchived),
      order: Number.isFinite(Number(category.order)) ? Number(category.order) : index,
      isDefault: Boolean(found?.isDefault || category.isDefault),
      isArchived: Boolean(category.isArchived) && !restored,
      archivedAt: Boolean(category.isArchived) && !restored ? (category.archivedAt || timestamp) : null,
      createdAt: found?.createdAt || category.createdAt || timestamp,
      createdBy: found?.createdBy || category.createdBy || actorId || null,
      updatedAt: timestamp,
      updatedBy: actorId || null
    });
  });

  existing.forEach((category) => {
    if (incomingByKey.has(String(category.key))) return;

    merged.push({
      ...category,
      name: category.label || category.name,
      active: false,
      isArchived: true,
      archivedAt: category.archivedAt || timestamp,
      updatedAt: timestamp,
      updatedBy: actorId || null
    });
  });

  return merged.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)));
}

function validateTeacherSettingsPayload({
  classDoc,
  payload,
  baseSettings,
  usageSummary,
  actorId
}) {
  const errors = [];

  const displayTitle = normalizeName(payload.displayTitle || classDoc.className || "Class Dashboard").slice(0, 90);
  const welcomeMessage = normalizeName(payload.welcomeMessage || "").slice(0, 220);
  const customizationReason = normalizeName(payload.customizationReason || "").slice(0, 160);
  const dashboardLayout = String(payload.dashboardLayout || "comfortable");

  if (!DASHBOARD_LAYOUTS.includes(dashboardLayout)) {
    errors.push("Invalid dashboard layout selected.");
  }

  const sectionsRaw = safeJsonParse(payload.sectionsJson, []);
  if (sectionsRaw === null || !Array.isArray(sectionsRaw)) {
    errors.push("Invalid dashboard sections payload.");
  }

  const subjectsRaw = safeJsonParse(payload.subjectsJson, []);
  if (subjectsRaw === null || !Array.isArray(subjectsRaw)) {
    errors.push("Invalid subjects payload.");
  }

  const categoriesRaw = safeJsonParse(payload.gradingCategoriesJson, []);
  if (categoriesRaw === null || !Array.isArray(categoriesRaw)) {
    errors.push("Invalid grading categories payload.");
  }

  if (errors.length) {
    return { isValid: false, errors, clean: null };
  }

  const dashboardSections = normalizeDashboardSections(sectionsRaw);
  const sectionKeys = dashboardSections.map((section) => section.key);
  if (new Set(sectionKeys).size !== DASHBOARD_SECTION_KEYS.length) {
    errors.push("Dashboard section configuration is incomplete.");
  }
  if (!dashboardSections.some((section) => toBoolean(section.visible, true))) {
    errors.push("At least one dashboard section must be visible.");
  }

  const subjects = normalizeSubjectConfig(subjectsRaw, [], { actorId }).slice(0, MAX_SUBJECT_CONFIG_ITEMS);
  if (subjectsRaw.length > MAX_SUBJECT_CONFIG_ITEMS) {
    errors.push(`A maximum of ${MAX_SUBJECT_CONFIG_ITEMS} subjects is allowed.`);
  }
  const subjectDuplicates = collectDuplicateNames(
    subjects.filter((subject) => toBoolean(subject.active, true) && !subject.isArchived),
    (item) => item?.label || item?.name
  );
  if (subjectDuplicates.length > 0) {
    errors.push("Duplicate subject names are not allowed.");
  }

  const subjectConfig = mergeSubjectConfig({
    existingSubjects: baseSettings.subjectConfig || getDefaultSubjectConfig(classDoc.subjects),
    incomingSubjects: subjects,
    actorId,
    usageSummary
  });
  const activeSubjectCount = subjectConfig.filter((subject) => toBoolean(subject.active, true) && !subject.isArchived).length;
  if (!activeSubjectCount) {
    errors.push("At least one active subject is required.");
  }

  const gradingCategories = normalizeGradingCategories(categoriesRaw, { actorId, allowEmpty: true }).slice(0, MAX_GRADING_CATEGORY_ITEMS);
  if (categoriesRaw.length > MAX_GRADING_CATEGORY_ITEMS) {
    errors.push(`A maximum of ${MAX_GRADING_CATEGORY_ITEMS} grading categories is allowed.`);
  }
  const categoryDuplicates = collectDuplicateNames(
    gradingCategories.filter((category) => toBoolean(category.active, true) && !category.isArchived),
    (item) => item?.label || item?.name
  );
  if (categoryDuplicates.length > 0) {
    errors.push("Duplicate grading category names are not allowed.");
  }

  gradingCategories.forEach((category) => {
    if (!Number.isFinite(Number(category.weight)) || Number(category.weight) < 0) {
      errors.push(`Invalid weight for category "${category.label || category.name}".`);
    }
  });

  const mergedCategories = mergeGradingCategories({
    existingCategories: baseSettings.gradingCategories,
    incomingCategories: gradingCategories,
    actorId,
    usageSummary
  });

  const activeCategories = mergedCategories.filter((category) => toBoolean(category.active, true) && !category.isArchived);
  if (!activeCategories.length) {
    errors.push("At least one active grading category is required.");
  }

  const activeWeightTotal = activeCategories.reduce((sum, category) => sum + Number(category.weight || 0), 0);
  if (Math.abs(activeWeightTotal - 100) > 0.01) {
    errors.push("Active grading category weights must total 100%.");
  }

  if (errors.length) {
    return { isValid: false, errors, clean: null };
  }

  return {
    isValid: true,
    errors: [],
    clean: {
      displayTitle,
      welcomeMessage,
      customizationReason,
      dashboardLayout,
      dashboardSections,
      subjectConfig,
      gradingCategories: mergedCategories
    }
  };
}

function isTeacherAssignedToClass(classDoc, teacherId) {
  if (!classDoc || !Array.isArray(classDoc.teachers)) return false;
  return classDoc.teachers.some((teacher) => String(teacher._id) === String(teacherId));
}

function upsertTeacherSettingsForClass(classDoc, teacherId, cleanPayload, actor) {
  const baseSettings = resolveTeacherSettings(classDoc, teacherId);
  const beforeSignature = buildSettingsSignature(baseSettings);
  const timestamp = new Date();

  const nextSubjectConfig = cleanPayload.subjectConfig || baseSettings.subjectConfig;
  const nextGradingCategories = cleanPayload.gradingCategories || baseSettings.gradingCategories;

  const configVersions = Array.isArray(baseSettings.configVersions)
    ? [...baseSettings.configVersions]
    : [];

  let currentConfigVersion = Number(baseSettings.currentConfigVersion || 1);
  let versionBumped = false;

  const nextSignature = buildSettingsSignature({
    subjectConfig: nextSubjectConfig,
    gradingCategories: nextGradingCategories
  });

  if (beforeSignature !== nextSignature) {
    const lastVersion = configVersions.reduce((maxVersion, entry) => {
      const parsed = Number(entry?.version || 0);
      return parsed > maxVersion ? parsed : maxVersion;
    }, 0);
    const nextVersion = Math.max(lastVersion, currentConfigVersion, 0) + 1;

    configVersions.push(
      buildGradingConfigVersion({
        version: nextVersion,
        subjectConfig: nextSubjectConfig,
        gradingCategories: nextGradingCategories,
        createdAt: timestamp,
        createdBy: actor.actorId,
        createdByRole: actor.actorRole,
        reason: actor.reason,
        note: actor.note
      })
    );

    currentConfigVersion = nextVersion;
    versionBumped = true;
  }

  const nextSettings = {
    teacherId,
    displayTitle: cleanPayload.displayTitle || baseSettings.displayTitle,
    welcomeMessage: cleanPayload.welcomeMessage,
    dashboardLayout: cleanPayload.dashboardLayout || baseSettings.dashboardLayout,
    dashboardSections: cleanPayload.dashboardSections || baseSettings.dashboardSections,
    subjectConfig: nextSubjectConfig,
    gradingCategories: nextGradingCategories,
    currentConfigVersion,
    configVersions,
    lastCustomizedBy: actor.actorId || null,
    lastCustomizedByRole: actor.actorRole || "",
    lastCustomizedAt: timestamp,
    customizationNote: actor.note || "",
    updatedAt: timestamp
  };

  const existingIndex = classDoc.teacherSettings.findIndex(
    (settings) => String(settings.teacherId) === String(teacherId)
  );

  if (existingIndex >= 0) {
    classDoc.teacherSettings[existingIndex] = nextSettings;
  } else {
    classDoc.teacherSettings.push(nextSettings);
  }

  return {
    baseSettings,
    nextSettings,
    versionBumped,
    currentConfigVersion
  };
}

function respondMutation(req, res, statusCode, payload, redirectPath) {
  if (isHtmlRequest(req)) {
    if (statusCode >= 400) {
      req.flash("errors", [{ msg: payload.message || "Request failed." }]);
    }
    return res.status(statusCode).redirect(redirectPath);
  }
  return res.status(statusCode).json(payload);
}

function conflictResponse(req, res, redirectPath, err) {
  const conflict = mapDuplicateKeyError(err);
  if (!conflict) {
    return respondMutation(req, res, 500, { message: "Request failed." }, redirectPath);
  }
  return respondMutation(
    req,
    res,
    409,
    { error: "conflict", field: conflict.field, message: conflict.message },
    redirectPath
  );
}

function generateEmployeeIdCandidate() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const prefix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  const numbers = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${prefix}-${numbers}`;
}

async function generateUniqueTeacherEmployeeId(req, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = generateEmployeeIdCandidate();
    const normalized = normalizeIdentifier(candidate);
    const exists = await User.findOne(scopedQuery(req, { employeeIdNormalized: normalized })).lean();
    if (!exists) return candidate;
  }
  throw new Error("Unable to generate a unique employee ID.");
}

function toIdArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function resolveRequestedUserName(body = {}, normalizedEmail = "") {
  return deriveUserNameCandidate({
    preferred: body?.userName,
    firstName: body?.firstName,
    lastName: body?.lastName,
    email: normalizedEmail
  });
}

async function resolveUserNameForCreate(req, body = {}, normalizedEmail = "") {
  const explicitUserName = normalizeUserName(body?.userName || "");
  if (explicitUserName) {
    return {
      userName: explicitUserName,
      generated: false
    };
  }

  const baseUserName = resolveRequestedUserName(body, normalizedEmail) || "user";
  let candidate = baseUserName;
  let suffix = 2;

  // Generated usernames get deterministic suffixes when a collision exists
  // in the same school scope (user, user-2, user-3 ...).
  while (await User.findOne(scopedQuery(req, { userNameNormalized: candidate })).lean()) {
    candidate = `${baseUserName}-${suffix}`;
    suffix += 1;
  }

  return {
    userName: candidate,
    generated: true
  };
}

function parseChildrenFromPayload(value) {
  const raw = toIdArray(value).map((entry) => String(entry || "").trim());
  return uniqueObjectIdStrings(raw);
}

function buildRankAuditSnapshot(studentDocLike = {}, rankSummary = {}, extras = {}) {
  return {
    studentId: String(studentDocLike?._id || ""),
    totalXp: Number(rankSummary?.xp || 0),
    previousRank: extras.previousRank || "",
    newRank: extras.newRank || "",
    changeType: extras.changeType || "automatic",
    reason: extras.reason || "",
    changedBy: extras.changedBy || "",
    changedAt: extras.changedAt || new Date().toISOString(),
    displaySource: rankSummary?.isManualOverride ? "manual_override" : "xp_automatic",
    manualOverrideEnabled: Boolean(studentDocLike?.rankOverrideEnabled)
  };
}

function isCloudinaryConfigured() {
  if (typeof cloudinary.isConfigured === "function") {
    return cloudinary.isConfigured();
  }
  return Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME)
    && (process.env.CLOUDINARY_API_KEY || process.env.API_KEY)
    && (process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET)
  );
}

async function cleanupUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_err) {
    // Ignore temp upload cleanup errors.
  }
}

async function syncParentNameIntoStudents(req, parentDoc) {
  const parentName = buildDisplayName(parentDoc);
  await User.updateMany(
    scopedQuery(req, {
      role: "student",
      "studentInfo.parents.parentID": parentDoc._id
    }),
    {
      $set: {
        "studentInfo.parents.$[link].parentName": parentName
      }
    },
    {
      arrayFilters: [{ "link.parentID": parentDoc._id }]
    }
  );
}

async function syncStudentNameIntoParents(req, studentDoc) {
  const childName = buildDisplayName(studentDoc);
  await User.updateMany(
    scopedQuery(req, {
      role: "parent",
      "parentInfo.children.childID": studentDoc._id
    }),
    {
      $set: {
        "parentInfo.children.$[child].childName": childName
      }
    },
    {
      arrayFilters: [{ "child.childID": studentDoc._id }]
    }
  );
}

module.exports = {
  getProfile: async (req, res) => {
    try {
      const posts = await Post.find(scopedQuery(req, { user: req.user.id }));
      res.render("profile.ejs", { posts: posts, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  getFeed: async (req, res) => {
    try {
      const posts = await Post.find(scopedQuery(req)).sort({ createdAt: "desc" }).lean();
      res.render("feed.ejs", { posts: posts });
    } catch (err) {
      console.log(err);
    }
  },
  getPost: async (req, res) => {
    try {
      const post = await Post.findOne(scopedIdQuery(req, req.params.id));
      if (!post) return res.status(404).send("Post not found");
      res.render("post.ejs", { post: post, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  createPost: async (req, res) => {
    try {
      // Upload image to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path);

      await Post.create({
        schoolId: req.schoolId,
        title: req.body.title,
        image: result.secure_url,
        cloudinaryId: result.public_id,
        caption: req.body.caption,
        likes: 0,
        user: req.user.id,
      });
      console.log("Post has been added!");
      res.redirect("/profile");
    } catch (err) {
      console.log(err);
    }
  },
  createSchool: async (req, res) => {
    try {
      if (String(process.env.ALLOW_TENANT_ADMIN_SCHOOL_CREATION || "").toLowerCase() !== "true") {
        return respondMutation(
          req,
          res,
          403,
          { message: "School creation is disabled for tenant admins." },
          "/admin/home"
        );
      }

      await School.create({
        schoolName: req.body.schoolName,
        schoolEmail: req.body.schoolEmail,
        password: req.body.password,
        adminUser: req.body.adminUser,
        address: req.body.address,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        establishedDate: req.body.establishedDate
      });

      console.log('School created successfully');
      res.redirect('/admin/home');

    } catch (err) {
      console.error('Error creating school:', err);

      if (err.code === 11000) {
        return res.status(400).send('Error: School name or email already exists.');
      }

      res.status(500).send('Error: Could not create school.');
    }
  },
  createStudent: async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body.email);
      const { userName: normalizedUserName, generated: userNameGenerated } = await resolveUserNameForCreate(
        req,
        req.body,
        normalizedEmail
      );
      const [emailConflict, userNameConflict] = await Promise.all([
        User.findOne(scopedQuery(req, { emailNormalized: normalizedEmail })).lean(),
        userNameGenerated
          ? Promise.resolve(null)
          : User.findOne(scopedQuery(req, { userNameNormalized: normalizedUserName })).lean()
      ]);
      if (emailConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "email", message: "Email already exists for this school." },
          "/admin/users"
        );
      }
      if (userNameConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "userName", message: "Username already exists for this school." },
          "/admin/users"
        );
      }
      const student = new User({
        schoolId: req.schoolId,
        // Login credentials
        userName: normalizedUserName,
        email: normalizedEmail,
        password: req.body.password,

        // Role
        role: 'student',

        // Profile info
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,

        // Student-specific info
        studentInfo: {
          gradeLevel: req.body.gradeLevel,
          programType: req.body.programType,
          enrollmentDate: req.body.enrollmentDate || Date.now(),
          studentNumber: Math.floor(Math.random() * 1000000),
          parents: []
        },
        xp: 0,
        points: 0,
        rank: "F",
        ...applyFirstLoginPasswordFlags()
      });
      await student.save();

      console.log('Student created successfully');
      res.redirect('/admin/users');

    } catch (err) {
      console.error('Error creating student:', err);

      if (err.code === 11000) return conflictResponse(req, res, "/admin/users", err);

      res.status(500).send('Error: Could not create student.');
    }
  },

  createTeacher: async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body.email);
      const { userName: normalizedUserName, generated: userNameGenerated } = await resolveUserNameForCreate(
        req,
        req.body,
        normalizedEmail
      );
      const [emailConflict, userNameConflict] = await Promise.all([
        User.findOne(scopedQuery(req, { emailNormalized: normalizedEmail })).lean(),
        userNameGenerated
          ? Promise.resolve(null)
          : User.findOne(scopedQuery(req, { userNameNormalized: normalizedUserName })).lean()
      ]);

      if (emailConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "email", message: "Email already exists for this school." },
          "/admin/users"
        );
      }
      if (userNameConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "userName", message: "Username already exists for this school." },
          "/admin/users"
        );
      }

      const generatedEmployeeId = await generateUniqueTeacherEmployeeId(req);

      const teacher = new User({
        schoolId: req.schoolId,
        userName: normalizedUserName,
        email: normalizedEmail,
        password: req.body.password,
        role: 'teacher',
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,
        gender: req.body.gender || null,
        teacherInfo: {
          employeeId: generatedEmployeeId,
          hireDate: req.body.hireDate || Date.now(),
          subjects: req.body.subjects ? req.body.subjects.split(',').map(s => s.trim()) : []
        },
        ...applyFirstLoginPasswordFlags()
      });
      await teacher.save();

      console.log('Teacher created successfully');
      res.redirect('/admin/users');

    } catch (err) {
      console.error('Error creating teacher:', err);

      if (err.code === 11000) return conflictResponse(req, res, "/admin/users", err);

      res.status(500).send('Error: Could not create teacher.');
    }
  },

  createParent: async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body.email);
      const { userName: normalizedUserName, generated: userNameGenerated } = await resolveUserNameForCreate(
        req,
        req.body,
        normalizedEmail
      );
      const [emailConflict, userNameConflict] = await Promise.all([
        User.findOne(scopedQuery(req, { emailNormalized: normalizedEmail })).lean(),
        userNameGenerated
          ? Promise.resolve(null)
          : User.findOne(scopedQuery(req, { userNameNormalized: normalizedUserName })).lean()
      ]);
      if (emailConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "email", message: "Email already exists for this school." },
          "/admin/users"
        );
      }
      if (userNameConflict) {
        return respondMutation(
          req,
          res,
          409,
          { error: "conflict", field: "userName", message: "Username already exists for this school." },
          "/admin/users"
        );
      }

      const selectedChildIds = parseChildrenFromPayload(req.body.children);
      if (selectedChildIds.length > 0) {
        const validChildren = await User.countDocuments(
          scopedQuery(req, { _id: { $in: selectedChildIds }, role: "student" })
        );
        if (validChildren !== selectedChildIds.length) {
          return respondMutation(
            req,
            res,
            422,
            { message: "One or more selected children are invalid for this school." },
            "/admin/users"
          );
        }
      }

      const parent = new User({
        schoolId: req.schoolId,
        userName: normalizedUserName,
        email: normalizedEmail,
        password: req.body.password,
        role: 'parent',
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,

        parentInfo: {
          children: []
        },
        ...applyFirstLoginPasswordFlags()
      });
      await parent.save();

      if (selectedChildIds.length > 0) {
        await syncParentChildrenAssignments(req, parent, selectedChildIds, {
          defaultRelationship: normalizeRelationship(req.body.relationship || "Guardian")
        });
      }

      console.log(' Parent created successfully');
      req.flash("success", "Parent account created.");
      res.redirect('/admin/users');

    } catch (err) {
      console.error(' Error creating parent:', err);

      if (err.code === 11000) return conflictResponse(req, res, "/admin/users", err);
      if (err?.code === "INVALID_CHILD_SELECTION") {
        return respondMutation(
          req,
          res,
          422,
          { message: "One or more selected children are invalid for this school." },
          "/admin/users"
        );
      }

      res.status(500).send('Error: Could not create parent.');
    }
  },
  assignParentToStudent: async (req, res) => {
    try {
      const { parentID, studentID, relationship } = req.body;

      const student = await User.findOne(scopedIdQuery(req, studentID, { role: "student" }));
      const parent = await User.findOne(scopedIdQuery(req, parentID, { role: "parent" }));

      if (!student) {
        return res.status(404).send("Student not found");
      }

      if (!parent) {
        return res.status(404).send("Parent not found");
      }

      if (String(student.schoolId) !== String(parent.schoolId)) {
        return res.status(403).send("Cross-tenant assignment is not allowed");
      }

      const currentChildren = extractParentChildIds(parent);
      const nextChildren = uniqueObjectIdStrings([...currentChildren, String(studentID)]);

      await syncParentChildrenAssignments(req, parent, nextChildren, {
        defaultRelationship: normalizeRelationship(relationship || "Guardian")
      });

      req.flash("success", "Parent/child assignment updated.");
      res.redirect("/admin/users");

    } catch (err) {
      console.error(err);
      res.status(500).send("Error assigning parent.");
    }
  },
  updateParentChildrenAssignments: async (req, res) => {
    try {
      const parentId = req.params.id;
      const parent = await User.findOne(scopedIdQuery(req, parentId, { role: "parent" }));
      if (!parent) {
        return respondMutation(req, res, 404, { message: "Parent not found." }, "/admin/users");
      }

      const beforeChildIds = extractParentChildIds(parent);
      const selectedChildIds = parseChildrenFromPayload(req.body.children);
      const defaultRelationship = normalizeRelationship(req.body.relationship || "Guardian");

      const updateResult = await syncParentChildrenAssignments(req, parent, selectedChildIds, {
        defaultRelationship
      });

      const childLabels = updateResult.assignedChildren.map((entry) => ({
        childID: String(entry.childID),
        childName: entry.childName || "Unknown Student",
        relationship: entry.relationship || "Guardian"
      }));

      await logAdminAction(req, {
        action: "admin.parent.children.update",
        targetType: "user",
        targetId: parent._id,
        before: { childIds: beforeChildIds },
        after: { childIds: updateResult.assignedChildIds, relationship: defaultRelationship }
      });

      return respondMutation(
        req,
        res,
        200,
        {
          message: "Parent/child assignments saved.",
          data: {
            parentId: String(parent._id),
            children: childLabels
          }
        },
        "/admin/users"
      );
    } catch (err) {
      console.error("Error updating parent/child assignments:", err);
      if (err?.code === "INVALID_CHILD_SELECTION") {
        return respondMutation(
          req,
          res,
          422,
          { message: "One or more selected children are invalid for this school." },
          "/admin/users"
        );
      }
      return respondMutation(
        req,
        res,
        500,
        { message: "Could not update parent/child assignments." },
        "/admin/users"
      );
    }
  },
  createClass: async (req, res) => {
    try {
      // Normalize arrays
      const teacherIDs = Array.isArray(req.body.teachers)
        ? req.body.teachers
        : req.body.teachers ? [req.body.teachers] : [];

      const studentIDs = Array.isArray(req.body.students)
        ? req.body.students
        : req.body.students ? [req.body.students] : [];
      // Fetch users to attach names
      const teachers = await User.find(scopedQuery(req, { _id: { $in: teacherIDs }, role: 'teacher' }));
      const students = await User.find(scopedQuery(req, { _id: { $in: studentIDs }, role: 'student' }));

      // Format schedule
      const scheduleData = safeJsonParse(req.body.schedule, {});
      const subjectData = safeJsonParse(req.body.subjects, []);

      if (subjectData === null) {
        return respondMutation(req, res, 422, { message: "Invalid subjects payload." }, "/admin/classes");
      }

      if (scheduleData === null || typeof scheduleData !== "object" || Array.isArray(scheduleData)) {
        return respondMutation(req, res, 422, { message: "Invalid schedule payload." }, "/admin/classes");
      }

      const formattedSchedule = Object.entries(scheduleData).map(([day, t]) => ({
        day,
        startTime: t.startTime,
        endTime: t.endTime
      }));
      const formattedSubjects = normalizeClassSubjectsForSave(subjectData);
      const teacherSettings = teachers.map((teacher) => buildDefaultTeacherSettings({
        teacherId: teacher._id,
        className: req.body.className,
        classSubjects: formattedSubjects
      }));
      const parsedCapacity = Number(req.body.capacity);

      // Create class document
      const newClass = await Class.create({
        schoolId: req.schoolId,
        className: req.body.className,
        classCode: `CL-${Math.floor(Math.random() * 1000000)}`,

        teachers: teachers.map(teacher => ({
          _id: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`
        })),

        students: students.map(student => ({
          _id: student._id,
          name: `${student.firstName} ${student.lastName}`
        })),

        schedule: formattedSchedule,
        academicYear: {
          semester: req.body.semester,
          quarter: req.body.quarter
        },
        subjects: formattedSubjects,
        teacherSettings,
        location: req.body.location,
        roomNumber: req.body.roomNumber,
        capacity: Number.isFinite(parsedCapacity) ? parsedCapacity : undefined,
        active: true
      });

      console.log("Class created:", newClass);
      res.redirect("/admin/classes");

    } catch (err) {
      console.error("Error creating class:", err);
      res.status(500).send("Error: Could not create class");
    }
  },
  assignStudentToClass: async (req, res) => {
    try {
      const { classID, studentID } = req.body;

      const student = await User.findOne(scopedIdQuery(req, studentID, { role: "student" }));
      const classObj = await Class.findOne(scopedIdQuery(req, classID));

      if (!student) {
        return res.status(404).send("Student not found");
      }

      if (!classObj) {
        return res.status(404).send("Class not found");
      }

      if (String(student.schoolId) !== String(classObj.schoolId)) {
        return res.status(403).send("Cross-tenant assignment is not allowed");
      }

      const studentName = `${student.firstName} ${student.lastName}`;
      const className = classObj.className;
      // Prevent duplicate enrollment
      const alreadyInClass = classObj.students.some(
        s => s._id?.toString() === studentID
      );

      if (!alreadyInClass) {
        classObj.students.push({ _id: student._id, name: studentName });
        await classObj.save();
      }

      // Save class data to student
      student.studentInfo.classId = classID;
      student.studentInfo.className = className;

      classObj.teachers

      await student.save();

      console.log("Successfully assigned student to class");
      res.redirect("/admin/classes");

    } catch (err) {
      console.error(err);
      res.status(500).send("Error assigning student to class");
    }
  },
  likePost: async (req, res) => {
    try {
      await Post.findOneAndUpdate(
        scopedIdQuery(req, req.params.id),
        {
          $inc: { likes: 1 },
        }
      );
      console.log("Likes +1");
      res.redirect(`/post/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
  createMission: async (req, res) => {
    try {
      await Mission.create({
        schoolId: req.schoolId,
        // Mission name
        title: req.body.missionTitle,
        description: req.body.missionDescription,

        //classification
        type: req.body.type,
        category: req.body.category,

        // difficulty
        rank: req.body.rank,
        pointsXP: req.body.missionPoints,

        // Time Limit
        timeLimit: req.body.timeLimit,
        dueDate: req.body.dueDate,

        //Assigned to ?
        assignedTo: {},

        //creator
        createdBy: {
          name: `${req.user.firstName} ${req.user.lastName}`,
          employeeId: req.user.teacherInfo.employeeId,
          _id: req.user._id
        },

        //activity
        active: {
          status: true,
          studentInfo: []
        }
      });

      console.log('Mission created successfully');
      res.redirect('/teacher/manage-missions');

    } catch (err) {
      console.error('Error creating mission:', err)
      res.status(500).send('Error: Could not create mission.');
    }
  },
  createAttendance: async (req, res) => {
    try {
      const { classId, studentId, date, status } = req.body;

      // Fetch class and student documents
      const classDoc = await Class.findOne(scopedIdQuery(req, classId));
      const studentDoc = await User.findOne(scopedIdQuery(req, studentId));
      if (!classDoc || !studentDoc) {
        return res.status(404).send("Class or student not found");
      }

      if (!isTeacherAssignedToClass(classDoc, req.user._id)) {
        req.flash("error", "You are not authorized to record attendance for this class.");
        return res.redirect("back");
      }

      const isStudentInClass = classDoc.students?.some(s => String(s._id) === String(studentDoc._id));
      if (!isStudentInClass) {
        req.flash("error", "Selected student is not enrolled in this class.");
        return res.redirect("back");
      }

      let targetDate = new Date(date + 'T00:00:00Z');

      const studentName = `${studentDoc.firstName} ${studentDoc.lastName}`;
      const teacherName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.userName;

      // Load all matching docs for this class/day to prevent duplicate daily sheets.
      const attendanceDocs = await Attendance.find({
        schoolId: req.schoolId,
        classId: classDoc._id,
        date: targetDate
      }).sort({ createdAt: 1 });

      let attendanceDoc = attendanceDocs[0] || null;
      const studentIdString = String(studentDoc._id);

      if (!attendanceDoc) {
        attendanceDoc = await Attendance.create({
          schoolId: req.schoolId,
          classId: classDoc._id,
          className: classDoc.className,
          date: targetDate,
          records: [
            {
              studentId: studentDoc._id,
              studentName,
              status
            }
          ],
          recordedBy: {
            _id: req.user._id,
            name: teacherName
          }
        });
        console.log(`Attendance created for ${studentName} in ${classDoc.className}`);
      } else {
        // Consolidate legacy duplicates into a single canonical daily attendance doc.
        const mergedRecordsByStudent = new Map();
        attendanceDocs.forEach((doc) => {
          (doc.records || []).forEach((record) => {
            const recordStudentId = String(record.studentId);
            mergedRecordsByStudent.set(recordStudentId, {
              studentId: record.studentId,
              studentName: record.studentName,
              status: record.status
            });
          });
        });

        mergedRecordsByStudent.set(studentIdString, {
          studentId: studentDoc._id,
          studentName,
          status
        });

        attendanceDoc.records = Array.from(mergedRecordsByStudent.values());
        attendanceDoc.recordedBy = {
          _id: req.user._id,
          name: teacherName
        };
        await attendanceDoc.save();

        const duplicateDocIds = attendanceDocs
          .slice(1)
          .map((doc) => doc._id);
        if (duplicateDocIds.length) {
          await Attendance.deleteMany({
            schoolId: req.schoolId,
            _id: { $in: duplicateDocIds }
          });
        }

        console.log(`Attendance upserted for ${studentName} in ${classDoc.className}`);
      }

      res.redirect("/teacher/manage-attendance");

    } catch (err) {
      console.error("Error creating/updating attendance:", err);
      res.redirect("back");
    }
  },
  updateStudentRankOverride: async (req, res) => {
    try {
      const studentId = req.params.id;
      const classId = String(req.body.classId || "").trim();
      const manualRank = String(req.body.manualRank || "").trim().toUpperCase();
      const reason = String(req.body.rankOverrideReason || "").trim().slice(0, 180);
      const requestedReturnTo = String(req.body.returnTo || "").trim();
      const redirectPath = /^\/teacher\/students\/[a-fA-F0-9]{24}\/progress(?:\?.*)?$/.test(requestedReturnTo)
        ? requestedReturnTo
        : "/teacher/manage-grades";

      const classScope = classId
        ? { _id: classId, "teachers._id": req.user._id, "students._id": studentId }
        : { "teachers._id": req.user._id, "students._id": studentId };
      const assignedClass = await Class.findOne(scopedQuery(req, classScope))
        .select("_id className")
        .lean();

      if (!assignedClass) {
        req.flash("error", "You are not authorized to change rank for this student.");
        return res.redirect(redirectPath);
      }

      const studentDoc = await User.findOne(scopedIdQuery(req, studentId, { role: "student" }))
        .select("_id firstName lastName points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt")
        .lean();

      if (!studentDoc) {
        req.flash("error", "Student record not found.");
        return res.redirect(redirectPath);
      }

      if (manualRank && !isValidRankKey(manualRank)) {
        req.flash("error", "Invalid rank selection.");
        return res.redirect(redirectPath);
      }

      const beforeSummary = buildRankSummaryFromUser(studentDoc);
      const now = new Date();
      const updateSet = {};
      const updateUnset = {};
      let actionReason = "";

      if (manualRank) {
        updateSet.rankOverrideEnabled = true;
        updateSet.manualRank = manualRank;
        updateSet.rank = manualRank;
        updateSet.rankOverrideReason = reason;
        updateSet.rankOverrideSetBy = req.user._id;
        updateSet.rankOverrideSetAt = now;
        actionReason = reason || "Manual rank override by teacher";
      } else {
        const fallbackAutoRank = getAutoRankForXp(resolveStudentXp(studentDoc)).key;
        updateSet.rankOverrideEnabled = false;
        updateSet.rankOverrideReason = "";
        updateSet.rankOverrideSetBy = null;
        updateSet.rankOverrideSetAt = null;
        updateSet.rank = fallbackAutoRank;
        updateUnset.manualRank = 1;
        actionReason = reason || "Manual override removed; reverted to XP progression";
      }

      const updateOperation = { $set: updateSet };
      if (Object.keys(updateUnset).length > 0) {
        updateOperation.$unset = updateUnset;
      }

      const updatedStudent = await User.findOneAndUpdate(
        scopedIdQuery(req, studentId, { role: "student" }),
        updateOperation,
        { new: true }
      )
        .select("_id firstName lastName points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt")
        .lean();

      if (!updatedStudent) {
        req.flash("error", "Could not update student rank.");
        return res.redirect(redirectPath);
      }

      const afterSummary = buildRankSummaryFromUser(updatedStudent);
      const changedAt = now.toISOString();

      await logAdminAction(req, {
        action: manualRank ? "teacher.student.rank.override.set" : "teacher.student.rank.override.clear",
        targetType: "user",
        targetId: updatedStudent._id,
        before: buildRankAuditSnapshot(studentDoc, beforeSummary, {
          previousRank: beforeSummary.displayRankLabel,
          newRank: beforeSummary.displayRankLabel,
          changeType: "manual",
          reason: actionReason,
          changedBy: String(req.user?._id || ""),
          changedAt
        }),
        after: buildRankAuditSnapshot(updatedStudent, afterSummary, {
          previousRank: beforeSummary.displayRankLabel,
          newRank: afterSummary.displayRankLabel,
          changeType: "manual",
          reason: actionReason,
          changedBy: String(req.user?._id || ""),
          changedAt
        })
      });

      const studentName = `${updatedStudent.firstName || ""} ${updatedStudent.lastName || ""}`.trim() || "Student";
      if (manualRank) {
        req.flash("success", `${studentName} is now set to ${afterSummary.displayRankLabel} (manual override).`);
      } else {
        req.flash("success", `${studentName} rank override removed. XP progression is active again.`);
      }

      return res.redirect(redirectPath);
    } catch (err) {
      console.error("Error updating student rank override:", err);
      req.flash("error", "Could not update student rank.");
      return res.redirect("/teacher/manage-grades");
    }
  },
  createGrade: async (req, res) => {
    try {
      const {
        student,
        classId,
        subject,
        quarter,
        Assignment,
        feedback,
        assignedDate,
        dueDate
      } = req.body;

      const normalizedSubject = String(subject || "").trim();
      const assignmentName = String(Assignment?.name || "").trim();
      const assignmentType = String(Assignment?.type || "").trim();
      const assignmentTypeKey = normalizeCategoryKey(assignmentType);
      const assignmentDescription = String(Assignment?.description || "").trim();
      const gradeValueRaw = Assignment?.grade;
      const maxScoreRaw = Assignment?.maxScore;
      const gradeValue = Number(gradeValueRaw);
      const maxScoreValue =
        maxScoreRaw === undefined || maxScoreRaw === null || String(maxScoreRaw).trim() === ""
          ? 100
          : Number(maxScoreRaw);

      // Validate required fields
      if (
        !student ||
        !classId ||
        !normalizedSubject ||
        !quarter ||
        !assignmentName ||
        !assignmentType ||
        gradeValueRaw === undefined ||
        gradeValueRaw === null ||
        String(gradeValueRaw).trim() === ""
      ) {
        req.flash("error", "Missing required fields.");
        return res.redirect("back");
      }

      // Validate quarter
      if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        req.flash("error", "Invalid quarter selected.");
        return res.redirect("back");
      }

      if (!Number.isFinite(gradeValue) || gradeValue < 0) {
        req.flash("error", "Grade must be a valid number greater than or equal to 0.");
        return res.redirect("back");
      }

      if (!Number.isFinite(maxScoreValue) || maxScoreValue <= 0) {
        req.flash("error", "Max score must be greater than 0.");
        return res.redirect("back");
      }

      if (gradeValue > maxScoreValue) {
        req.flash("error", "Grade cannot be greater than max score.");
        return res.redirect("back");
      }

      const parsedAssignedDate = assignedDate ? new Date(assignedDate) : null;
      const parsedDueDate = dueDate ? new Date(dueDate) : null;

      if (parsedAssignedDate && Number.isNaN(parsedAssignedDate.getTime())) {
        req.flash("error", "Assigned date is invalid.");
        return res.redirect("back");
      }

      if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
        req.flash("error", "Due date is invalid.");
        return res.redirect("back");
      }

      if (parsedAssignedDate && parsedDueDate && parsedDueDate < parsedAssignedDate) {
        req.flash("error", "Due date cannot be earlier than assigned date.");
        return res.redirect("back");
      }

      // Fetch student + class docs to store names
      const [studentDoc, classDoc] = await Promise.all([
        User.findOne(scopedIdQuery(req, student)),
        Class.findOne(scopedIdQuery(req, classId))
      ]);

      if (!studentDoc || !classDoc) {
        req.flash("error", "Student or class not found.");
        return res.redirect("back");
      }

      if (!isTeacherAssignedToClass(classDoc, req.user._id)) {
        req.flash("error", "You are not authorized to add grades for this class.");
        return res.redirect("back");
      }

      const teacherSettings = resolveTeacherSettings(classDoc, req.user._id);
      const activeSubjects = getActiveSubjects(teacherSettings, classDoc.subjects);
      const activeCategories = getActiveGradingCategories(teacherSettings);
      const currentConfigVersion = Number(teacherSettings.currentConfigVersion || 1);

      const selectedSubject = activeSubjects.find(
        (entry) => normalizeName(entry.label || entry.name).toLowerCase() === normalizedSubject.toLowerCase()
      );
      if (!selectedSubject) {
        req.flash("error", "Selected subject is not active for this class.");
        return res.redirect("back");
      }

      const selectedCategory = activeCategories.find(
        (category) => String(category.key) === assignmentTypeKey
      );
      if (!selectedCategory) {
        req.flash("error", "Selected grading category is not active for this class.");
        return res.redirect("back");
      }

      const isStudentInClass = classDoc.students?.some(s => s._id.toString() === studentDoc._id.toString());
      if (!isStudentInClass) {
        req.flash("error", "Selected student is not enrolled in this class.");
        return res.redirect("back");
      }

      // Create grade following schema
      const newGrade = new Grade({
        schoolId: req.schoolId,
        students: [
          {
            _id: studentDoc._id,
            name: `${studentDoc.firstName} ${studentDoc.lastName}`
          }
        ],
        classInfo: [
          {
            _id: classDoc._id,
            name: classDoc.className
          }
        ],
        subject: selectedSubject.label || selectedSubject.name,
        subjectKey: selectedSubject.key,
        subjectLabel: selectedSubject.label || selectedSubject.name,
        gradingConfigVersion: currentConfigVersion,
        quarter,
        Assignment: {
          name: assignmentName,
          description: assignmentDescription || "No description provided",
          grade: gradeValue,
          maxScore: maxScoreValue,
          categoryKey: selectedCategory.key,
          categoryLabel: selectedCategory.label || selectedCategory.name,
          categoryWeight: Number(selectedCategory.weight || 0),
          type: selectedCategory.key
        },
        feedback: {
          content: feedback?.trim() || "",
          teacher: {
            _id: req.user._id,
            name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.userName
          }
        },
        gradingContext: {
          teacherId: req.user._id,
          teacherName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.userName,
          configVersion: currentConfigVersion,
          configCapturedAt: new Date(),
          subject: {
            key: selectedSubject.key,
            label: selectedSubject.label || selectedSubject.name
          },
          category: {
            key: selectedCategory.key,
            label: selectedCategory.label || selectedCategory.name,
            weight: Number(selectedCategory.weight || 0)
          }
        },
        assignedDate: parsedAssignedDate || undefined,
        dueDate: parsedDueDate || undefined,
        active: true
      });

      await newGrade.save();

      req.flash("success", "Grade saved successfully.");
      res.redirect("/teacher/manage-grades");

    } catch (err) {
      console.error("Error saving grade:", err);
      req.flash("error", "Could not save grade.");
      res.redirect("back");
    }
  },
  updateTeacherClassCustomization: async (req, res) => {
    const classId = req.params.id;
    const redirectPath = `/teacher/customize?classId=${classId}`;

    try {
      const classDoc = await Class.findOne(scopedIdQuery(req, classId));
      if (!classDoc) {
        req.flash("error", "Class not found.");
        return res.redirect("/teacher/customize");
      }

      if (!isTeacherAssignedToClass(classDoc, req.user._id)) {
        req.flash("error", "You are not authorized to customize this class.");
        return res.redirect("/teacher/customize");
      }

      const [baseSettings, usageSummary] = await Promise.all([
        Promise.resolve(resolveTeacherSettings(classDoc, req.user._id)),
        getClassGradeUsageSummary(req, classDoc._id)
      ]);

      const { isValid, errors, clean } = validateTeacherSettingsPayload({
        classDoc,
        payload: req.body || {},
        baseSettings,
        usageSummary,
        actorId: req.user._id
      });

      if (!isValid) {
        req.flash("error", errors.join(" "));
        return res.redirect(redirectPath);
      }

      const updateResult = upsertTeacherSettingsForClass(classDoc, req.user._id, clean, {
        actorId: req.user._id,
        actorRole: req.user.role,
        reason: usageSummary.hasGrades ? "teacher_grading_schema_update" : "teacher_initial_customization",
        note: clean.customizationReason || ""
      });
      await classDoc.save();

      let successMessage = "Class customization saved.";
      if (updateResult.versionBumped) {
        successMessage += ` Grading schema version updated to v${updateResult.currentConfigVersion}.`;
      }
      if (usageSummary.hasGrades && updateResult.versionBumped) {
        successMessage += " Existing grade history remains linked to previous schema versions.";
      }

      req.flash("success", successMessage);
      return res.redirect(redirectPath);
    } catch (err) {
      console.error("Error saving teacher class customization:", err);
      req.flash("error", "Could not save class customization.");
      return res.redirect(redirectPath);
    }
  },
  updateTeacherClassCustomizationByAdmin: async (req, res) => {
    const classId = req.params.id;
    const teacherId = req.body?.teacherId;

    try {
      if (!teacherId) {
        return respondMutation(
          req,
          res,
          422,
          { message: "teacherId is required." },
          "/admin/classes"
        );
      }

      const [classDoc, teacherDoc] = await Promise.all([
        Class.findOne(scopedIdQuery(req, classId)),
        User.findOne(scopedIdQuery(req, teacherId, { role: "teacher" }))
      ]);

      if (!classDoc) {
        return respondMutation(req, res, 404, { message: "Class not found." }, "/admin/classes");
      }

      if (!teacherDoc) {
        return respondMutation(req, res, 404, { message: "Teacher not found." }, "/admin/classes");
      }

      if (!isTeacherAssignedToClass(classDoc, teacherId)) {
        return respondMutation(
          req,
          res,
          422,
          { message: "The selected teacher is not assigned to this class." },
          "/admin/classes"
        );
      }

      const [baseSettings, usageSummary] = await Promise.all([
        Promise.resolve(resolveTeacherSettings(classDoc, teacherId)),
        getClassGradeUsageSummary(req, classDoc._id)
      ]);

      const { isValid, errors, clean } = validateTeacherSettingsPayload({
        classDoc,
        payload: req.body || {},
        baseSettings,
        usageSummary,
        actorId: req.user._id
      });

      if (!isValid) {
        return respondMutation(
          req,
          res,
          422,
          { message: "Validation failed.", errors },
          "/admin/classes"
        );
      }

      const updateResult = upsertTeacherSettingsForClass(classDoc, teacherId, clean, {
        actorId: req.user._id,
        actorRole: req.user.role,
        reason: "admin_override_customization",
        note: clean.customizationReason || "Admin override"
      });
      await classDoc.save();

      await logAdminAction(req, {
        action: "admin_override_teacher_class_customization",
        targetType: "class",
        targetId: classDoc._id,
        before: {
          teacherId: String(teacherId),
          currentConfigVersion: Number(baseSettings.currentConfigVersion || 1),
          updatedAt: baseSettings.updatedAt || null
        },
        after: {
          teacherId: String(teacherId),
          currentConfigVersion: Number(updateResult.currentConfigVersion || 1),
          versionBumped: Boolean(updateResult.versionBumped),
          customizationNote: clean.customizationReason || ""
        }
      });

      return respondMutation(
        req,
        res,
        200,
        {
          message: "Class customization saved.",
          data: {
            classId: String(classDoc._id),
            teacherId: String(teacherId),
            currentConfigVersion: updateResult.currentConfigVersion,
            versionBumped: updateResult.versionBumped,
            historicalGradesPresent: usageSummary.hasGrades
          }
        },
        "/admin/classes"
      );
    } catch (err) {
      console.error("Error saving class customization as admin:", err);
      return respondMutation(
        req,
        res,
        500,
        { message: "Could not save class customization." },
        "/admin/classes"
      );
    }
  },
  updateStudentMission: async (req, res) => {
    try {
      const { missionId } = req.body;
      console.log("Received missionId:", missionId);

      if (!missionId) {
        console.log("No missionId provided");
        return res.redirect('/student/missions');
      }

      const [studentDoc, missionDoc] = await Promise.all([
        User.findOne(scopedIdQuery(req, req.user._id, { role: "student" }))
          .select("_id points xp rank manualRank rankOverrideEnabled")
          .lean(),
        Mission.findOne(scopedIdQuery(req, missionId))
          .select("_id title rank")
          .lean()
      ]);

      if (!studentDoc || !missionDoc) {
        console.log("Student or mission not found for mission start");
        return res.redirect('/student/missions');
      }

      const studentRankSummary = buildRankSummaryFromUser(studentDoc);
      const canAccessMission = canStudentAccessMissionRank(
        studentRankSummary.displayRankKey,
        missionDoc.rank,
        { accessMode: "exact" }
      );

      if (!canAccessMission) {
        console.log(
          `Mission start blocked due to rank lock. Student rank: ${studentRankSummary.displayRankKey}, mission rank: ${missionDoc.rank}`
        );
        return res.redirect('/student/missions');
      }

      await Mission.findOneAndUpdate(
        scopedIdQuery(req, missionId),
        {
          $addToSet: {
            "active.studentInfo": {
              _id: req.user._id,
              name: `${req.user.firstName} ${req.user.lastName}`,
              status: "started",
              startedAt: new Date()
            }
          }
        }
      );

      console.log("Student mission status updated to 'started'");
      return res.redirect('/student/missions');

    } catch (err) {
      console.log(err);
      res.redirect('/student/missions');
    }
  },

  completeStudentMission: async (req, res) => {
    try {
      const { missionId } = req.body;

      console.log("missionId from form:", missionId);

      // Make sure missionId exists
      if (!missionId || missionId.trim() === "") {
        console.log("missionId is missing or empty");
        return res.redirect("/student/missions");
      }

      // Grab mission info
      const mission = await Mission.findOne(scopedIdQuery(req, missionId)).lean();
      console.log("mission from DB:", mission);

      if (!mission) {
        console.log("mission not found in database");
        return res.redirect("/student/missions");
      }

      const missionXpRaw = Number(mission.pointsXP);
      const awardedXp = Number.isFinite(missionXpRaw)
        ? Math.max(0, Math.floor(missionXpRaw))
        : 0;

      // Update mission status
      const updatedMission = await Mission.findOneAndUpdate(
        {
          _id: missionId,
          schoolId: req.schoolId,
          "active.studentInfo._id": req.user._id,
          "active.studentInfo.status": "started"
        },
        {
          $set: { "active.studentInfo.$.status": "complete" }
        },
        { new: true }
      );

      if (!updatedMission) {
        console.log("failed to update mission status");
        return res.redirect("/student/missions");
      }

      // Add XP and preserve backwards compatibility with legacy points consumers.
      const studentBefore = await User.findOne(scopedIdQuery(req, req.user._id, { role: "student" }))
        .select("_id points xp rank manualRank rankOverrideEnabled rankOverrideReason")
        .lean();

      if (!studentBefore) {
        console.log("student not found for xp award");
        return res.redirect("/student/missions");
      }

      const beforeSummary = buildRankSummaryFromUser(studentBefore);

      // Backfill/sync legacy points-only records before incrementing to prevent XP drift.
      const baselineXp = resolveStudentXp(studentBefore);
      const needsXpSync = Number(studentBefore?.xp) !== baselineXp || Number(studentBefore?.points) !== baselineXp;
      if (needsXpSync) {
        await User.updateOne(
          scopedIdQuery(req, req.user._id, { role: "student" }),
          { $set: { xp: baselineXp, points: baselineXp } }
        );
      }

      const studentAfterIncrement = await User.findOneAndUpdate(
        scopedIdQuery(req, req.user._id, { role: "student" }),
        {
          $inc: { points: awardedXp, xp: awardedXp }
        },
        { new: true }
      )
        .select("_id points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt")
        .lean();

      if (!studentAfterIncrement) {
        console.log("failed to update student xp");
        return res.redirect("/student/missions");
      }

      const afterIncrementSummary = buildRankSummaryFromUser(studentAfterIncrement);
      let finalStudentSnapshot = studentAfterIncrement;

      // Automatic progression applies only when manual override is not active.
      const shouldApplyAutoProgression = !afterIncrementSummary.isManualOverride;
      const expectedAutoRank = getAutoRankForXp(resolveStudentXp(studentAfterIncrement)).key;
      if (shouldApplyAutoProgression && String(studentAfterIncrement.rank || "F") !== expectedAutoRank) {
        finalStudentSnapshot = await User.findOneAndUpdate(
          scopedIdQuery(req, req.user._id, { role: "student" }),
          { $set: { rank: expectedAutoRank } },
          { new: true }
        )
          .select("_id points xp rank manualRank rankOverrideEnabled rankOverrideReason rankOverrideSetBy rankOverrideSetAt")
          .lean();
      }

      const afterSummary = buildRankSummaryFromUser(finalStudentSnapshot || studentAfterIncrement);
      const nowIso = new Date().toISOString();

      await logAdminAction(req, {
        action: "student.mission.xp_award",
        targetType: "user",
        targetId: studentBefore._id,
        before: buildRankAuditSnapshot(studentBefore, beforeSummary, {
          previousRank: beforeSummary.displayRankLabel,
          newRank: beforeSummary.displayRankLabel,
          changeType: "automatic",
          reason: `Mission completed: ${mission.title}`,
          changedBy: String(req.user?._id || ""),
          changedAt: nowIso
        }),
        after: buildRankAuditSnapshot(finalStudentSnapshot || studentAfterIncrement, afterSummary, {
          previousRank: beforeSummary.displayRankLabel,
          newRank: afterSummary.displayRankLabel,
          changeType: "automatic",
          reason: `Mission completed: ${mission.title}`,
          changedBy: String(req.user?._id || ""),
          changedAt: nowIso
        })
      });

      if (!afterSummary.isManualOverride && beforeSummary.autoRankKey !== afterSummary.autoRankKey) {
        await logAdminAction(req, {
          action: "student.rank.auto_progression",
          targetType: "user",
          targetId: studentBefore._id,
          before: buildRankAuditSnapshot(studentBefore, beforeSummary, {
            previousRank: beforeSummary.autoRankLabel,
            newRank: beforeSummary.autoRankLabel,
            changeType: "automatic",
            reason: `Auto progression after mission completion: ${mission.title}`,
            changedBy: String(req.user?._id || ""),
            changedAt: nowIso
          }),
          after: buildRankAuditSnapshot(finalStudentSnapshot || studentAfterIncrement, afterSummary, {
            previousRank: beforeSummary.autoRankLabel,
            newRank: afterSummary.autoRankLabel,
            changeType: "automatic",
            reason: `Auto progression after mission completion: ${mission.title}`,
            changedBy: String(req.user?._id || ""),
            changedAt: nowIso
          })
        });
      }

      console.log(`Mission completed: ${mission.title}`);
      console.log(`XP awarded: ${awardedXp}`);

      return res.redirect("/student/missions");

    } catch (err) {
      console.log("Error in completeStudentMission:", err);
      return res.redirect("/student/missions");
    }
  },

  patchUser: async (req, res) => {
    try {
      const userId = req.params.id;

      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/users");
      }

      const targetUser = await User.findOne(scopedIdQuery(req, userId));
      if (!targetUser) {
        return respondMutation(req, res, 404, { message: "User not found." }, "/admin/users");
      }

      const allowedBase = ["firstName", "lastName", "userName", "email"];
      const allowedStudent = ["age", "programType", "gradeLevel", "enrollmentDate"];
      const allowedTeacher = ["subjects", "hireDate"];
      const allowedFields =
        targetUser.role === "student"
          ? [...allowedBase, ...allowedStudent]
          : targetUser.role === "teacher"
            ? [...allowedBase, ...allowedTeacher]
            : targetUser.role === "parent"
              ? [...allowedBase]
              : allowedBase;
      const filteredPayload = pickAllowedFields(req.body || {}, allowedFields);

      const { isValid, errors, clean } = validateUserPatchPayload(filteredPayload, targetUser.role);
      if (!isValid) {
        return respondMutation(
          req,
          res,
          422,
          { message: "Validation failed.", errors },
          "/admin/users"
        );
      }

      const before = {
        firstName: targetUser.firstName || "",
        lastName: targetUser.lastName || "",
        userName: targetUser.userName || "",
        email: targetUser.email || "",
        age: targetUser.DOB ? Math.max(1, new Date().getUTCFullYear() - new Date(targetUser.DOB).getUTCFullYear()) : null,
        programType: targetUser.studentInfo?.programType || "",
        gradeLevel: targetUser.studentInfo?.gradeLevel || "",
        enrollmentDate: targetUser.studentInfo?.enrollmentDate || null,
        subjects: targetUser.teacherInfo?.subjects || [],
        hireDate: targetUser.teacherInfo?.hireDate || null
      };

      if (clean.firstName !== undefined) targetUser.firstName = clean.firstName;
      if (clean.lastName !== undefined) targetUser.lastName = clean.lastName;
      if (clean.email !== undefined) targetUser.email = clean.email;

      if (targetUser.role === "student") {
        targetUser.studentInfo = targetUser.studentInfo || {};
        if (clean.programType !== undefined) targetUser.studentInfo.programType = clean.programType;
        if (clean.gradeLevel !== undefined) targetUser.studentInfo.gradeLevel = clean.gradeLevel;
        if (clean.enrollmentDate !== undefined) targetUser.studentInfo.enrollmentDate = clean.enrollmentDate;
        if (clean.age !== undefined) {
          const today = new Date();
          const dobYear = today.getUTCFullYear() - clean.age;
          targetUser.DOB = new Date(Date.UTC(dobYear, today.getUTCMonth(), today.getUTCDate()));
        }
      }

      if (targetUser.role === "teacher") {
        targetUser.teacherInfo = targetUser.teacherInfo || {};
        if (clean.subjects !== undefined) targetUser.teacherInfo.subjects = clean.subjects;
        if (clean.hireDate !== undefined) targetUser.teacherInfo.hireDate = clean.hireDate;
      }

      if (clean.email !== undefined) {
        const existingEmail = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: targetUser._id },
            emailNormalized: normalizeEmail(clean.email)
          })
        ).lean();
        if (existingEmail) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "email", message: "Email already exists for this school." },
            "/admin/users"
          );
        }
      }

      if (clean.userName !== undefined) {
        const normalizedUserName = normalizeUserName(clean.userName);
        const existingUserName = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: targetUser._id },
            userNameNormalized: normalizedUserName
          })
        ).lean();
        if (existingUserName) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "userName", message: "Username already exists for this school." },
            "/admin/users"
          );
        }
        targetUser.userName = normalizedUserName;
      }

      await targetUser.save();

      if (targetUser.role === "parent" && (clean.firstName !== undefined || clean.lastName !== undefined)) {
        await syncParentNameIntoStudents(req, targetUser);
      }
      if (targetUser.role === "student" && (clean.firstName !== undefined || clean.lastName !== undefined)) {
        await syncStudentNameIntoParents(req, targetUser);
      }

      const after = {
        id: targetUser._id.toString(),
        firstName: targetUser.firstName || "",
        lastName: targetUser.lastName || "",
        userName: targetUser.userName || "",
        email: targetUser.email || "",
        age: targetUser.DOB ? Math.max(1, new Date().getUTCFullYear() - new Date(targetUser.DOB).getUTCFullYear()) : null,
        programType: targetUser.studentInfo?.programType || "",
        gradeLevel: targetUser.studentInfo?.gradeLevel || "",
        enrollmentDate: targetUser.studentInfo?.enrollmentDate || null,
        subjects: targetUser.teacherInfo?.subjects || [],
        hireDate: targetUser.teacherInfo?.hireDate || null
      };

      await logAdminAction(req, {
        action: "admin.user.patch",
        targetType: "user",
        targetId: targetUser._id,
        before,
        after,
        diff: simpleDiff(before, after)
      });

      return respondMutation(req, res, 200, { message: "User updated.", data: after }, "/admin/users");
    } catch (err) {
      console.error("Error updating user:", err);
      if (err.code === 11000) return conflictResponse(req, res, "/admin/users", err);
      return respondMutation(req, res, 500, { message: "Error updating user." }, "/admin/users");
    }
  },

  updateUserAvatar: async (req, res) => {
    const uploadedPath = req.file?.path;

    try {
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/users");
      }

      if (req.fileValidationError) {
        return respondMutation(req, res, 422, { message: req.fileValidationError }, "/admin/users");
      }

      if (!req.file) {
        return respondMutation(
          req,
          res,
          422,
          { message: "Please choose a .jpg, .jpeg, or .png file." },
          "/admin/users"
        );
      }

      if (!isCloudinaryConfigured()) {
        return respondMutation(
          req,
          res,
          503,
          { message: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET." },
          "/admin/users"
        );
      }

      const targetUser = await User.findOne(scopedIdQuery(req, req.params.id));
      if (!targetUser) {
        return respondMutation(req, res, 404, { message: "User not found." }, "/admin/users");
      }

      const before = {
        profileImage: targetUser.profileImage || "",
        profileImageCloudinaryId: targetUser.profileImageCloudinaryId || ""
      };

      const uploadResult = await cloudinary.uploader.upload(uploadedPath, {
        folder: "ilmquest/profile-images",
        resource_type: "image",
        overwrite: true
      });

      if (targetUser.profileImageCloudinaryId) {
        await cloudinary.uploader.destroy(targetUser.profileImageCloudinaryId).catch(() => null);
      }

      targetUser.profileImage = uploadResult.secure_url;
      targetUser.profileImageCloudinaryId = uploadResult.public_id;
      await targetUser.save();

      const after = {
        profileImage: targetUser.profileImage || "",
        profileImageCloudinaryId: targetUser.profileImageCloudinaryId || ""
      };

      await logAdminAction(req, {
        action: "admin.user.avatar.update",
        targetType: "user",
        targetId: targetUser._id,
        before,
        after,
        diff: simpleDiff(before, after)
      });

      if (isHtmlRequest(req)) {
        req.flash("success", [`Avatar updated for ${targetUser.firstName || targetUser.userName || "user"}.`]);
        return res.redirect("/admin/users");
      }

      return res.status(200).json({
        message: "User avatar updated.",
        data: {
          id: targetUser._id.toString(),
          profileImage: targetUser.profileImage || ""
        }
      });
    } catch (err) {
      console.error("Error updating user avatar:", err);
      return respondMutation(
        req,
        res,
        500,
        { message: "Unable to update user avatar right now." },
        "/admin/users"
      );
    } finally {
      await cleanupUploadedFile(uploadedPath);
    }
  },

  removeUserAvatar: async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/users");
      }

      const targetUser = await User.findOne(scopedIdQuery(req, req.params.id));
      if (!targetUser) {
        return respondMutation(req, res, 404, { message: "User not found." }, "/admin/users");
      }

      const before = {
        profileImage: targetUser.profileImage || "",
        profileImageCloudinaryId: targetUser.profileImageCloudinaryId || ""
      };

      if (targetUser.profileImageCloudinaryId) {
        await cloudinary.uploader.destroy(targetUser.profileImageCloudinaryId).catch(() => null);
      }

      targetUser.profileImage = "";
      targetUser.profileImageCloudinaryId = "";
      await targetUser.save();

      const after = {
        profileImage: targetUser.profileImage || "",
        profileImageCloudinaryId: targetUser.profileImageCloudinaryId || ""
      };

      await logAdminAction(req, {
        action: "admin.user.avatar.remove",
        targetType: "user",
        targetId: targetUser._id,
        before,
        after,
        diff: simpleDiff(before, after)
      });

      if (isHtmlRequest(req)) {
        req.flash("success", [`Avatar removed for ${targetUser.firstName || targetUser.userName || "user"}.`]);
        return res.redirect("/admin/users");
      }

      return res.status(200).json({
        message: "User avatar removed.",
        data: {
          id: targetUser._id.toString(),
          profileImage: ""
        }
      });
    } catch (err) {
      console.error("Error removing user avatar:", err);
      return respondMutation(
        req,
        res,
        500,
        { message: "Unable to remove user avatar right now." },
        "/admin/users"
      );
    }
  },

  patchClass: async (req, res) => {
    try {
      const classId = req.params.id;
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/classes");
      }

      const classDoc = await Class.findOne(scopedIdQuery(req, classId));
      if (!classDoc) {
        return respondMutation(req, res, 404, { message: "Class not found." }, "/admin/classes");
      }

      const allowedFields = ["className", "roomNumber", "capacity", "active"];
      const filteredPayload = pickAllowedFields(req.body || {}, allowedFields);
      const { isValid, errors, clean } = validateClassPatchPayload(filteredPayload);

      if (!isValid) {
        return respondMutation(req, res, 422, { message: "Validation failed.", errors }, "/admin/classes");
      }

      const before = {
        className: classDoc.className || "",
        roomNumber: classDoc.roomNumber || "",
        capacity: classDoc.capacity,
        active: !!classDoc.active
      };

      if (clean.className !== undefined) classDoc.className = clean.className;
      if (clean.roomNumber !== undefined) classDoc.roomNumber = clean.roomNumber;
      if (clean.capacity !== undefined) classDoc.capacity = clean.capacity;
      if (clean.active !== undefined) classDoc.active = clean.active;

      await classDoc.save();

      const after = {
        id: classDoc._id.toString(),
        className: classDoc.className || "",
        roomNumber: classDoc.roomNumber || "",
        capacity: classDoc.capacity,
        active: !!classDoc.active
      };

      await logAdminAction(req, {
        action: "admin.class.patch",
        targetType: "class",
        targetId: classDoc._id,
        before,
        after,
        diff: simpleDiff(before, after)
      });

      return respondMutation(req, res, 200, { message: "Class updated.", data: after }, "/admin/classes");
    } catch (err) {
      console.error("Error updating class:", err);
      return respondMutation(req, res, 500, { message: "Error updating class." }, "/admin/classes");
    }
  },



  deletePost: async (req, res) => {
    try {
      // Find post by id
      let post = await Post.findOne(scopedIdQuery(req, req.params.id));
      if (!post) return res.status(404).send("Post not found");
      // Delete image from cloudinary
      await cloudinary.uploader.destroy(post.cloudinaryId);
      // Delete post from db
      await Post.deleteOne(scopedIdQuery(req, req.params.id));
      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      res.redirect("/profile");
    }
  },
  deleteUser: async (req, res) => {
    try {
      const userID = req.params.id;
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/users");
      }

      const user = await User.findOne(scopedIdQuery(req, userID));
      if (!user) return respondMutation(req, res, 404, { message: "User not found." }, "/admin/users");

      const before = {
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        userName: user.userName || "",
        email: user.email || "",
        role: user.role
      };

      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
      await user.save();

      await logAdminAction(req, {
        action: "admin.user.soft_delete",
        targetType: "user",
        targetId: user._id,
        before,
        after: { ...before, deletedAt: user.deletedAt }
      });

      return respondMutation(req, res, 200, { message: "User deleted." }, "/admin/users");

    } catch (err) {
      console.error(err);
      return respondMutation(req, res, 500, { message: err.message || "Error deleting user." }, "/admin/users");
    }
  },
  deleteClass: async (req, res) => {
    try {
      const classID = req.params.id;
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/classes");
      }

      const classDelete = await Class.findOne(scopedIdQuery(req, classID));
      if (!classDelete) return respondMutation(req, res, 404, { message: "Class not found." }, "/admin/classes");

      const before = {
        className: classDelete.className || "",
        classCode: classDelete.classCode || "",
        active: !!classDelete.active
      };

      classDelete.deletedAt = new Date();
      classDelete.deletedBy = req.user._id;
      await classDelete.save();

      await logAdminAction(req, {
        action: "admin.class.soft_delete",
        targetType: "class",
        targetId: classDelete._id,
        before,
        after: { ...before, deletedAt: classDelete.deletedAt }
      });

      return respondMutation(req, res, 200, { message: "Class deleted." }, "/admin/classes");

    } catch (err) {
      console.error(err);
      return respondMutation(req, res, 500, { message: err.message || "Error deleting class." }, "/admin/classes");
    }
  },
  restoreUser: async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/users");
      }
      const user = await User.findOne(scopedIdQuery(req, req.params.id, { includeDeleted: true }));
      if (!user) return respondMutation(req, res, 404, { message: "User not found." }, "/admin/users");

      const emailNormalized = user.emailNormalized || normalizeEmail(user.email);
      if (emailNormalized) {
        const emailConflict = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: user._id },
            emailNormalized
          })
        ).lean();
        if (emailConflict) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "email", message: "Email already exists for this school." },
            "/admin/users"
          );
        }
      }

      const userNameNormalized = user.userNameNormalized || normalizeUserName(user.userName);
      if (userNameNormalized) {
        const userNameConflict = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: user._id },
            userNameNormalized
          })
        ).lean();
        if (userNameConflict) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "userName", message: "Username already exists for this school." },
            "/admin/users"
          );
        }
      }

      const employeeIdNormalized = user.employeeIdNormalized || normalizeIdentifier(user.teacherInfo?.employeeId);
      if (employeeIdNormalized) {
        const employeeConflict = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: user._id },
            employeeIdNormalized
          })
        ).lean();
        if (employeeConflict) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "employeeId", message: "Employee ID already exists for this school." },
            "/admin/users"
          );
        }
      }

      const studentNumberNormalized = user.studentNumberNormalized || normalizeStudentNumber(user.studentInfo?.studentNumber);
      if (studentNumberNormalized) {
        const studentNumberConflict = await User.findOne(
          scopedQuery(req, {
            _id: { $ne: user._id },
            studentNumberNormalized
          })
        ).lean();
        if (studentNumberConflict) {
          return respondMutation(
            req,
            res,
            409,
            { error: "conflict", field: "studentNumber", message: "Student number already exists for this school." },
            "/admin/users"
          );
        }
      }

      user.deletedAt = null;
      user.deletedBy = null;
      await user.save();
      await logAdminAction(req, {
        action: "admin.user.restore",
        targetType: "user",
        targetId: user._id,
        before: { deletedAt: new Date() },
        after: { deletedAt: null }
      });
      return respondMutation(req, res, 200, { message: "User restored." }, "/admin/users");
    } catch (err) {
      console.error(err);
      if (err.code === 11000) return conflictResponse(req, res, "/admin/users", err);
      return respondMutation(req, res, 500, { message: err.message || "Error restoring user." }, "/admin/users");
    }
  },
  restoreClass: async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return respondMutation(req, res, 403, { message: "Not authorized." }, "/admin/classes");
      }
      const classDoc = await Class.findOne(scopedIdQuery(req, req.params.id, { includeDeleted: true }));
      if (!classDoc) return respondMutation(req, res, 404, { message: "Class not found." }, "/admin/classes");
      classDoc.deletedAt = null;
      classDoc.deletedBy = null;
      await classDoc.save();
      await logAdminAction(req, {
        action: "admin.class.restore",
        targetType: "class",
        targetId: classDoc._id,
        before: { deletedAt: new Date() },
        after: { deletedAt: null }
      });
      return respondMutation(req, res, 200, { message: "Class restored." }, "/admin/classes");
    } catch (err) {
      console.error(err);
      return respondMutation(req, res, 500, { message: err.message || "Error restoring class." }, "/admin/classes");
    }
  }
};
