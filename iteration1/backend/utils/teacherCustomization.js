const DASHBOARD_LAYOUTS = ["comfortable", "compact", "focus"];

const DASHBOARD_SECTION_DEFINITIONS = [
  { key: "classOverview", label: "Class Overview" },
  { key: "attendanceSummary", label: "Attendance Summary" },
  { key: "gradeSummary", label: "Grade Summary" },
  { key: "assignmentsMissions", label: "Assignments & Missions" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "announcements", label: "Announcements" },
  { key: "quickLinks", label: "Quick Links" },
  { key: "performanceInsights", label: "Performance Insights" }
];

const DASHBOARD_SECTION_KEYS = DASHBOARD_SECTION_DEFINITIONS.map((section) => section.key);

const DEFAULT_GRADING_CATEGORIES = [
  { key: "homework", label: "Homework", weight: 20, active: true, order: 0, isDefault: true },
  { key: "quiz", label: "Quiz", weight: 15, active: true, order: 1, isDefault: true },
  { key: "test", label: "Test", weight: 25, active: true, order: 2, isDefault: true },
  { key: "exam", label: "Exam", weight: 25, active: true, order: 3, isDefault: true },
  { key: "behavior", label: "Behavior / Adab", weight: 7.5, active: true, order: 4, isDefault: true },
  { key: "participation", label: "Participation", weight: 7.5, active: true, order: 5, isDefault: true }
];

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCategoryKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "category";
}

function normalizeSubjectKey(value) {
  return normalizeCategoryKey(value || "subject");
}

function asDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ensureUniqueKey(baseKey, usedKeys) {
  const cleanedBase = normalizeCategoryKey(baseKey);
  let key = cleanedBase;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${cleanedBase}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function now() {
  return new Date();
}

function getDefaultDashboardSections() {
  return DASHBOARD_SECTION_DEFINITIONS.map((section, index) => ({
    key: section.key,
    label: section.label,
    visible: true,
    order: index
  }));
}

function getDefaultGradingCategories() {
  const timestamp = now();
  return DEFAULT_GRADING_CATEGORIES.map((category, index) => ({
    key: category.key,
    label: category.label,
    name: category.label,
    weight: category.weight,
    active: true,
    order: Number.isFinite(Number(category.order)) ? Number(category.order) : index,
    isDefault: true,
    isArchived: false,
    archivedAt: null,
    createdAt: timestamp,
    createdBy: null,
    updatedAt: timestamp,
    updatedBy: null
  }));
}

function getDefaultSubjectConfig(classSubjects = []) {
  const sourceSubjects = Array.isArray(classSubjects) ? classSubjects : [];
  const usedKeys = new Set();
  const seenLabels = new Set();
  const timestamp = now();
  const output = [];

  sourceSubjects.forEach((subject, index) => {
    const label = normalizeName(typeof subject === "string" ? subject : subject?.label || subject?.name);
    if (!label) return;

    const dedupeLabel = label.toLowerCase();
    if (seenLabels.has(dedupeLabel)) return;
    seenLabels.add(dedupeLabel);

    const key = ensureUniqueKey(normalizeSubjectKey(subject?.key || label), usedKeys);
    output.push({
      key,
      label,
      name: label,
      active: true,
      order: index,
      isArchived: false,
      archivedAt: null,
      createdAt: timestamp,
      createdBy: null,
      updatedAt: timestamp,
      updatedBy: null
    });
  });

  return output;
}

function normalizeDashboardSections(rawSections) {
  const source = Array.isArray(rawSections) ? rawSections : [];
  const sourceByKey = new Map();

  source.forEach((section, index) => {
    const key = String(section?.key || "").trim();
    if (!DASHBOARD_SECTION_KEYS.includes(key)) return;
    if (!sourceByKey.has(key)) {
      sourceByKey.set(key, { section, index });
    }
  });

  const merged = DASHBOARD_SECTION_DEFINITIONS.map((defaultSection, index) => {
    const found = sourceByKey.get(defaultSection.key)?.section;
    const parsedOrder = toNumber(found?.order, index);

    return {
      key: defaultSection.key,
      label: normalizeName(found?.label) || defaultSection.label,
      visible: toBoolean(found?.visible, true),
      order: Number.isFinite(parsedOrder) ? parsedOrder : index
    };
  });

  return merged.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function normalizeSubjectConfig(rawSubjects, fallbackSubjects = [], options = {}) {
  const source = Array.isArray(rawSubjects) && rawSubjects.length
    ? rawSubjects
    : fallbackSubjects;

  const usedKeys = new Set();
  const seenLabels = new Set();
  const actorId = options.actorId || null;
  const timestamp = now();
  const output = [];

  source.forEach((subject, index) => {
    const label = normalizeName(subject?.label || subject?.name || subject);
    if (!label) return;

    const dedupeLabel = label.toLowerCase();
    if (seenLabels.has(dedupeLabel)) return;
    seenLabels.add(dedupeLabel);

    const keySeed = subject?.key || label;
    const key = ensureUniqueKey(normalizeSubjectKey(keySeed), usedKeys);

    const archivedFlag = toBoolean(subject?.isArchived, false);
    const activeFlag = toBoolean(subject?.active, true) && !archivedFlag;

    output.push({
      key,
      label,
      name: label,
      active: activeFlag,
      order: toNumber(subject?.order, index),
      isArchived: archivedFlag,
      archivedAt: archivedFlag ? (asDateOrNull(subject?.archivedAt) || timestamp) : null,
      createdAt: asDateOrNull(subject?.createdAt) || timestamp,
      createdBy: subject?.createdBy || null,
      updatedAt: asDateOrNull(subject?.updatedAt) || timestamp,
      updatedBy: subject?.updatedBy || actorId
    });
  });

  return output.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function normalizeGradingCategories(rawCategories, options = {}) {
  const allowEmpty = toBoolean(options.allowEmpty, false);
  const source = Array.isArray(rawCategories)
    ? (rawCategories.length ? rawCategories : (allowEmpty ? [] : getDefaultGradingCategories()))
    : getDefaultGradingCategories();

  const usedKeys = new Set();
  const seenLabels = new Set();
  const actorId = options.actorId || null;
  const timestamp = now();
  const output = [];

  source.forEach((category, index) => {
    const label = normalizeName(category?.label || category?.name || category?.key);
    if (!label) return;

    const dedupeLabel = label.toLowerCase();
    if (seenLabels.has(dedupeLabel)) return;
    seenLabels.add(dedupeLabel);

    const keySeed = category?.key || label;
    const key = ensureUniqueKey(normalizeCategoryKey(keySeed), usedKeys);

    const weight = Math.round(toNumber(category?.weight, 0) * 100) / 100;
    const archivedFlag = toBoolean(category?.isArchived, false);
    const activeFlag = toBoolean(category?.active, true) && !archivedFlag;

    output.push({
      key,
      label,
      name: label,
      weight: weight < 0 ? 0 : weight,
      active: activeFlag,
      order: toNumber(category?.order, index),
      isDefault: toBoolean(category?.isDefault, false),
      isArchived: archivedFlag,
      archivedAt: archivedFlag ? (asDateOrNull(category?.archivedAt) || timestamp) : null,
      createdAt: asDateOrNull(category?.createdAt) || timestamp,
      createdBy: category?.createdBy || null,
      updatedAt: asDateOrNull(category?.updatedAt) || timestamp,
      updatedBy: category?.updatedBy || actorId
    });
  });

  const sorted = output.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  if (sorted.length) return sorted;
  return allowEmpty ? [] : getDefaultGradingCategories();
}

function buildGradingConfigVersion({
  version,
  subjectConfig,
  gradingCategories,
  createdAt = now(),
  createdBy = null,
  createdByRole = "",
  reason = "",
  note = ""
}) {
  return {
    version: Math.max(1, Number(version) || 1),
    createdAt,
    createdBy,
    createdByRole: String(createdByRole || "").trim(),
    reason: normalizeName(reason),
    note: normalizeName(note),
    subjectConfig: normalizeSubjectConfig(subjectConfig || []),
    gradingCategories: normalizeGradingCategories(gradingCategories || [])
  };
}

function normalizeConfigVersions(rawVersions, fallbackSubjects, fallbackCategories) {
  const source = Array.isArray(rawVersions) ? rawVersions : [];
  const versions = source
    .map((entry, index) => buildGradingConfigVersion({
      version: Number(entry?.version) || (index + 1),
      subjectConfig: entry?.subjectConfig || fallbackSubjects,
      gradingCategories: entry?.gradingCategories || fallbackCategories,
      createdAt: asDateOrNull(entry?.createdAt) || now(),
      createdBy: entry?.createdBy || null,
      createdByRole: entry?.createdByRole || "",
      reason: entry?.reason || "",
      note: entry?.note || ""
    }))
    .sort((a, b) => a.version - b.version);

  const deduped = [];
  const seenVersions = new Set();
  versions.forEach((entry) => {
    if (seenVersions.has(entry.version)) return;
    seenVersions.add(entry.version);
    deduped.push(entry);
  });

  if (deduped.length) return deduped;

  return [
    buildGradingConfigVersion({
      version: 1,
      subjectConfig: fallbackSubjects,
      gradingCategories: fallbackCategories,
      createdAt: now(),
      createdBy: null,
      createdByRole: "system",
      reason: "baseline"
    })
  ];
}

function buildDefaultTeacherSettings({ teacherId, className, classSubjects }) {
  const subjectConfig = getDefaultSubjectConfig(classSubjects);
  const gradingCategories = getDefaultGradingCategories();
  const baseVersion = buildGradingConfigVersion({
    version: 1,
    subjectConfig,
    gradingCategories,
    createdAt: now(),
    createdBy: teacherId || null,
    createdByRole: "teacher",
    reason: "baseline"
  });

  return {
    teacherId,
    displayTitle: normalizeName(className) || "Class Dashboard",
    welcomeMessage: "Let us make this class meaningful and consistent.",
    dashboardLayout: "comfortable",
    dashboardSections: getDefaultDashboardSections(),
    subjectConfig,
    gradingCategories,
    currentConfigVersion: 1,
    configVersions: [baseVersion],
    lastCustomizedBy: null,
    lastCustomizedByRole: "",
    lastCustomizedAt: null,
    customizationNote: "",
    updatedAt: now()
  };
}

function resolveTeacherSettings(classDoc, teacherId = null) {
  const teacherSettings = Array.isArray(classDoc?.teacherSettings) ? classDoc.teacherSettings : [];
  const teacherIdString = teacherId ? String(teacherId) : null;

  let selected = null;
  if (teacherIdString) {
    selected = teacherSettings.find((settings) => String(settings.teacherId) === teacherIdString) || null;
  } else if (teacherSettings.length > 0) {
    selected = teacherSettings[0];
  }

  const fallbackTeacherId = teacherId
    || selected?.teacherId
    || classDoc?.teachers?.[0]?._id
    || null;

  const fallback = buildDefaultTeacherSettings({
    teacherId: fallbackTeacherId,
    className: classDoc?.className,
    classSubjects: classDoc?.subjects
  });

  const resolvedSubjectConfig = normalizeSubjectConfig(selected?.subjectConfig, fallback.subjectConfig);
  const resolvedCategories = normalizeGradingCategories(selected?.gradingCategories || fallback.gradingCategories);
  const resolvedVersions = normalizeConfigVersions(
    selected?.configVersions,
    resolvedSubjectConfig,
    resolvedCategories
  );

  const selectedCurrentVersion = Number(selected?.currentConfigVersion || 0);
  const hasCurrentVersion = resolvedVersions.some((entry) => entry.version === selectedCurrentVersion);
  const currentConfigVersion = hasCurrentVersion
    ? selectedCurrentVersion
    : resolvedVersions[resolvedVersions.length - 1].version;

  return {
    teacherId: selected?.teacherId || fallback.teacherId,
    displayTitle: normalizeName(selected?.displayTitle) || fallback.displayTitle,
    welcomeMessage: normalizeName(selected?.welcomeMessage) || fallback.welcomeMessage,
    dashboardLayout: DASHBOARD_LAYOUTS.includes(selected?.dashboardLayout)
      ? selected.dashboardLayout
      : fallback.dashboardLayout,
    dashboardSections: normalizeDashboardSections(selected?.dashboardSections || fallback.dashboardSections),
    subjectConfig: resolvedSubjectConfig,
    gradingCategories: resolvedCategories,
    currentConfigVersion,
    configVersions: resolvedVersions,
    lastCustomizedBy: selected?.lastCustomizedBy || null,
    lastCustomizedByRole: String(selected?.lastCustomizedByRole || ""),
    lastCustomizedAt: asDateOrNull(selected?.lastCustomizedAt),
    customizationNote: normalizeName(selected?.customizationNote || ""),
    updatedAt: asDateOrNull(selected?.updatedAt) || fallback.updatedAt
  };
}

function getActiveDashboardSections(settings) {
  return normalizeDashboardSections(settings?.dashboardSections).filter((section) => section.visible);
}

function getActiveSubjects(settings, classSubjects = []) {
  const normalized = normalizeSubjectConfig(settings?.subjectConfig, getDefaultSubjectConfig(classSubjects));
  return normalized.filter((subject) => subject.active && !subject.isArchived);
}

function getActiveGradingCategories(settings) {
  const normalized = normalizeGradingCategories(settings?.gradingCategories);
  return normalized.filter((category) => category.active && !category.isArchived);
}

function getWeightMapFromCategories(categories) {
  const map = {};
  const source = Array.isArray(categories) ? categories : [];
  source.forEach((category) => {
    if (!category.active || category.isArchived) return;
    map[String(category.key)] = toNumber(category.weight, 0);
  });

  if (Object.keys(map).length) return map;

  DEFAULT_GRADING_CATEGORIES.forEach((category) => {
    map[category.key] = category.weight;
  });
  return map;
}

function buildCategoryLabelMap(categories) {
  const map = {};
  const source = Array.isArray(categories) ? categories : [];
  source.forEach((category) => {
    map[String(category.key)] = category.label || category.name;
  });
  return map;
}

function getConfigVersionLookup(settings) {
  const map = new Map();
  const versions = Array.isArray(settings?.configVersions) ? settings.configVersions : [];
  versions.forEach((entry) => {
    map.set(Number(entry.version), entry);
  });
  return map;
}

function getConfigVersionForGrade(grade, settings = null) {
  const raw = Number(
    grade?.gradingConfigVersion
    || grade?.gradingContext?.configVersion
    || 0
  );

  if (Number.isFinite(raw) && raw > 0) return raw;

  const fallback = Number(settings?.currentConfigVersion || 1);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

function getGradeSubjectKey(grade) {
  return normalizeSubjectKey(
    grade?.subjectKey
    || grade?.gradingContext?.subject?.key
    || grade?.subjectLabel
    || grade?.subject
  );
}

function getGradeCategoryKey(grade) {
  return normalizeCategoryKey(
    grade?.Assignment?.categoryKey
    || grade?.gradingContext?.category?.key
    || grade?.Assignment?.type
  );
}

function resolveSubjectFromGrade(grade, settings) {
  const key = getGradeSubjectKey(grade);
  const version = getConfigVersionForGrade(grade, settings);
  const versionLookup = getConfigVersionLookup(settings);
  const versionSnapshot = versionLookup.get(version) || null;

  const fromVersion = versionSnapshot?.subjectConfig?.find((subject) => subject.key === key) || null;
  const fromCurrent = (settings?.subjectConfig || []).find((subject) => subject.key === key) || null;

  const fallbackLabel = normalizeName(
    grade?.subjectLabel
    || grade?.gradingContext?.subject?.label
    || grade?.subject
  );

  const label = fromVersion?.label || fromCurrent?.label || fallbackLabel || key;

  return {
    key,
    label,
    active: Boolean(fromCurrent?.active),
    isArchived: Boolean(fromCurrent?.isArchived),
    version,
    source: fromVersion ? "version" : (fromCurrent ? "current" : "grade")
  };
}

function resolveCategoryFromGrade(grade, settings) {
  const key = getGradeCategoryKey(grade);
  const version = getConfigVersionForGrade(grade, settings);
  const versionLookup = getConfigVersionLookup(settings);
  const versionSnapshot = versionLookup.get(version) || null;

  const fromVersion = versionSnapshot?.gradingCategories?.find((category) => category.key === key) || null;
  const fromCurrent = (settings?.gradingCategories || []).find((category) => category.key === key) || null;

  const fallbackLabel = normalizeName(
    grade?.Assignment?.categoryLabel
    || grade?.gradingContext?.category?.label
    || grade?.Assignment?.type
  );

  const label = fromVersion?.label || fromCurrent?.label || fallbackLabel || key;

  const explicitWeight = Number(
    grade?.Assignment?.categoryWeight
    || grade?.gradingContext?.category?.weight
  );

  const fallbackWeight = Number(
    fromVersion?.weight
    || fromCurrent?.weight
    || 0
  );

  const weight = Number.isFinite(explicitWeight) && explicitWeight >= 0
    ? explicitWeight
    : (Number.isFinite(fallbackWeight) ? fallbackWeight : 0);

  return {
    key,
    label,
    weight,
    active: Boolean(fromCurrent?.active),
    isArchived: Boolean(fromCurrent?.isArchived),
    version,
    source: fromVersion ? "version" : (fromCurrent ? "current" : "grade")
  };
}

module.exports = {
  DASHBOARD_LAYOUTS,
  DASHBOARD_SECTION_DEFINITIONS,
  DASHBOARD_SECTION_KEYS,
  DEFAULT_GRADING_CATEGORIES,
  normalizeCategoryKey,
  normalizeSubjectKey,
  normalizeName,
  getDefaultDashboardSections,
  getDefaultGradingCategories,
  getDefaultSubjectConfig,
  normalizeDashboardSections,
  normalizeSubjectConfig,
  normalizeGradingCategories,
  buildGradingConfigVersion,
  buildDefaultTeacherSettings,
  resolveTeacherSettings,
  getActiveDashboardSections,
  getActiveSubjects,
  getActiveGradingCategories,
  getWeightMapFromCategories,
  buildCategoryLabelMap,
  getConfigVersionLookup,
  getConfigVersionForGrade,
  getGradeSubjectKey,
  getGradeCategoryKey,
  resolveSubjectFromGrade,
  resolveCategoryFromGrade
};
