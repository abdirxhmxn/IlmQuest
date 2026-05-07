const MEMORIZATION_SYSTEM_KEY = "memorization";
const SUBAC_SYSTEM_KEY = "subac";
const MEMORIZATION_SCALE_MAX_VALUE = 4;
const SUBAC_SCALE_MAX_VALUE = 4;

const DEFAULT_MEMORIZATION_MARKS = [
  {
    key: "perfect",
    symbol: "✓",
    label: "Perfect",
    description: "Perfect / full credit",
    value: 4,
    active: true,
    sortOrder: 0,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "weak-perfect",
    symbol: "✓ W",
    label: "Correct With Minor Weakness",
    description: "Correct with a small weakness",
    value: 3.5,
    active: true,
    sortOrder: 1,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "level-one",
    symbol: "I ✓",
    label: "Level 1 Mistake",
    description: "One notable mistake",
    value: 3,
    active: true,
    sortOrder: 2,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "level-two",
    symbol: "II ✓",
    label: "Level 2 Mistake",
    description: "Two notable mistakes",
    value: 2,
    active: true,
    sortOrder: 3,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "level-three",
    symbol: "III ✓",
    label: "Level 3 Mistake",
    description: "Three notable mistakes",
    value: 1,
    active: true,
    sortOrder: 4,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "incorrect",
    symbol: "X",
    label: "Incorrect / Not Completed",
    description: "Incorrect or not completed",
    value: 0,
    active: true,
    sortOrder: 5,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "incorrect-weak",
    symbol: "X W",
    label: "Incorrect With Weakness",
    description: "Incorrect with weakness noted",
    value: 0.5,
    active: true,
    sortOrder: 6,
    countsTowardGrade: true,
    isDefault: true
  }
];

const DEFAULT_SUBAC_MARKS = [
  {
    key: "great",
    symbol: "✓",
    label: "Great",
    description: "Full credit revision performance",
    value: 4,
    active: true,
    sortOrder: 0,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "decent",
    symbol: "I",
    label: "Decent",
    description: "High partial credit",
    value: 3,
    active: true,
    sortOrder: 1,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "average",
    symbol: "II",
    label: "Average",
    description: "Medium partial credit",
    value: 2,
    active: true,
    sortOrder: 2,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "needs-work",
    symbol: "III",
    label: "Needs Work",
    description: "Low partial credit",
    value: 1,
    active: true,
    sortOrder: 3,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "failed",
    symbol: "IIII",
    label: "Failed",
    description: "Failed / no credit",
    value: 0,
    active: true,
    sortOrder: 4,
    countsTowardGrade: true,
    isDefault: true
  },
  {
    key: "excused",
    symbol: "E",
    label: "Excused",
    description: "Excused and excluded from grade by default",
    value: 0,
    active: true,
    sortOrder: 5,
    countsTowardGrade: false,
    isDefault: true
  },
  {
    key: "competition",
    symbol: "C",
    label: "Competition",
    description: "Tracked separately unless counted",
    value: 0,
    active: true,
    sortOrder: 6,
    countsTowardGrade: false,
    isDefault: true
  },
  {
    key: "pen-check",
    symbol: "PC",
    label: "Pen Check",
    description: "Tracked separately unless counted",
    value: 0,
    active: true,
    sortOrder: 7,
    countsTowardGrade: false,
    isDefault: true
  },
  {
    key: "blank",
    symbol: "Blank",
    label: "Empty",
    description: "No mark recorded yet; excluded by default",
    value: 0,
    active: true,
    sortOrder: 8,
    countsTowardGrade: false,
    isDefault: true
  }
];

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function normalizeText(value, maxLength = 180) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  const parsed = toFiniteNumber(value, min);
  return Math.min(Math.max(parsed, min), max);
}

function cloneMarks(marks = []) {
  return marks.map((mark) => ({
    key: String(mark.key || ""),
    symbol: String(mark.symbol || "").trim(),
    label: String(mark.label || "").trim(),
    description: String(mark.description || "").trim(),
    value: Number(mark.value || 0),
    active: Boolean(mark.active),
    sortOrder: Number(mark.sortOrder || 0),
    countsTowardGrade: Boolean(mark.countsTowardGrade),
    isDefault: Boolean(mark.isDefault)
  }));
}

function buildDefaultMemorizationScale() {
  return {
    key: MEMORIZATION_SYSTEM_KEY,
    name: "Al Bayaan Memorization Scale",
    description: "Default weekly memorization, writing, and subject grading scale.",
    maxValue: MEMORIZATION_SCALE_MAX_VALUE,
    marks: cloneMarks(DEFAULT_MEMORIZATION_MARKS)
  };
}

function buildDefaultSubacScale() {
  return {
    key: SUBAC_SYSTEM_KEY,
    name: "Subac Revision Scale",
    description: "Default revision / Subac grading scale.",
    maxValue: SUBAC_SCALE_MAX_VALUE,
    marks: cloneMarks(DEFAULT_SUBAC_MARKS)
  };
}

function buildDefaultGradingScaleSet() {
  return {
    memorization: buildDefaultMemorizationScale(),
    subac: buildDefaultSubacScale()
  };
}

function buildScaleMarkLookup(marks = []) {
  const byKey = new Map();
  const bySymbol = new Map();

  (Array.isArray(marks) ? marks : []).forEach((mark) => {
    const key = String(mark?.key || "").trim();
    const symbol = String(mark?.symbol || "").trim();
    if (key) byKey.set(key, mark);
    if (symbol) bySymbol.set(symbol, mark);
  });

  return { byKey, bySymbol };
}

function normalizeScaleMark(rawMark, fallbackMark, scaleMaxValue, index = 0) {
  const fallback = fallbackMark || {};
  const key = String(fallback.key || rawMark?.key || "").trim();
  const symbol = String(fallback.symbol || rawMark?.symbol || "").trim();
  const label = normalizeText(rawMark?.label || fallback.label || symbol, 90) || symbol || key;
  const description = normalizeText(rawMark?.description || fallback.description || "", 200);
  const value = clampNumber(
    rawMark?.value !== undefined ? rawMark.value : fallback.value,
    0,
    Number(scaleMaxValue || 4)
  );
  const active = toBoolean(rawMark?.active, toBoolean(fallback.active, true));
  const sortOrder = Number.isFinite(Number(rawMark?.sortOrder))
    ? Number(rawMark.sortOrder)
    : Number(fallback.sortOrder || index);
  const countsTowardGrade = toBoolean(
    rawMark?.countsTowardGrade,
    toBoolean(fallback.countsTowardGrade, true)
  );

  return {
    key,
    symbol,
    label,
    description,
    value,
    active,
    sortOrder,
    countsTowardGrade,
    isDefault: toBoolean(fallback.isDefault, false)
  };
}

function normalizeGradingScale(rawScale, defaultFactory) {
  const fallback = defaultFactory();
  const fallbackMarks = Array.isArray(fallback.marks) ? fallback.marks : [];
  const fallbackLookup = buildScaleMarkLookup(fallbackMarks);
  const sourceMarks = Array.isArray(rawScale?.marks) ? rawScale.marks : [];
  const sourceLookup = buildScaleMarkLookup(sourceMarks);

  const normalizedMarks = fallbackMarks.map((mark, index) => {
    const rawMark = sourceLookup.byKey.get(String(mark.key || ""))
      || sourceLookup.bySymbol.get(String(mark.symbol || ""))
      || null;
    return normalizeScaleMark(rawMark, mark, fallback.maxValue, index);
  });

  return {
    key: String(fallback.key),
    name: normalizeText(rawScale?.name || fallback.name, 120) || fallback.name,
    description: normalizeText(rawScale?.description || fallback.description, 220) || fallback.description,
    maxValue: Number(fallback.maxValue || 4),
    marks: normalizedMarks.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  };
}

function normalizeGradingScaleSet(rawScaleSet = {}) {
  return {
    memorization: normalizeGradingScale(rawScaleSet?.memorization, buildDefaultMemorizationScale),
    subac: normalizeGradingScale(rawScaleSet?.subac, buildDefaultSubacScale)
  };
}

function serializeScaleForSignature(scale = {}) {
  const marks = (Array.isArray(scale.marks) ? scale.marks : [])
    .map((mark) => ({
      key: String(mark.key || ""),
      label: normalizeText(mark.label || "", 90),
      description: normalizeText(mark.description || "", 200),
      value: Math.round(Number(mark.value || 0) * 100) / 100,
      active: Boolean(mark.active),
      sortOrder: Number(mark.sortOrder || 0),
      countsTowardGrade: Boolean(mark.countsTowardGrade)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

  return {
    key: String(scale.key || ""),
    name: normalizeText(scale.name || "", 120),
    description: normalizeText(scale.description || "", 220),
    maxValue: Number(scale.maxValue || 0),
    marks
  };
}

function getScaleBySystem(scaleSet = {}, systemKey = MEMORIZATION_SYSTEM_KEY) {
  const normalized = normalizeGradingScaleSet(scaleSet);
  return systemKey === SUBAC_SYSTEM_KEY ? normalized.subac : normalized.memorization;
}

function resolveMarkDefinition(scale = {}, markKey = "") {
  const lookup = buildScaleMarkLookup(scale.marks || []);
  return lookup.byKey.get(String(markKey || "").trim()) || null;
}

function buildSymbolicMarkSnapshot(scale = {}, markKey = "") {
  const mark = resolveMarkDefinition(scale, markKey);
  if (!mark) return null;

  return {
    systemKey: String(scale.key || ""),
    scaleName: String(scale.name || ""),
    scaleDescription: String(scale.description || ""),
    markKey: String(mark.key || ""),
    symbol: String(mark.symbol || ""),
    label: String(mark.label || ""),
    description: String(mark.description || ""),
    value: Number(mark.value || 0),
    maxValue: Number(scale.maxValue || 0),
    countsTowardGrade: Boolean(mark.countsTowardGrade),
    sortOrder: Number(mark.sortOrder || 0)
  };
}

function getStoredScoreFromMarkSnapshot(snapshot = {}) {
  const countsTowardGrade = Boolean(snapshot.countsTowardGrade);
  return {
    grade: countsTowardGrade ? Number(snapshot.value || 0) : 0,
    maxScore: countsTowardGrade ? Number(snapshot.maxValue || 0) : 0
  };
}

function resolveSnapshotOrScaleMark(record = {}, scaleSet = {}) {
  if (record?.symbolicMark?.markKey) {
    return {
      systemKey: String(record.symbolicMark.systemKey || ""),
      scaleName: String(record.symbolicMark.scaleName || ""),
      scaleDescription: String(record.symbolicMark.scaleDescription || ""),
      markKey: String(record.symbolicMark.markKey || ""),
      symbol: String(record.symbolicMark.symbol || ""),
      label: String(record.symbolicMark.label || ""),
      description: String(record.symbolicMark.description || ""),
      value: Number(record.symbolicMark.value || 0),
      maxValue: Number(record.symbolicMark.maxValue || 0),
      countsTowardGrade: Boolean(record.symbolicMark.countsTowardGrade),
      sortOrder: Number(record.symbolicMark.sortOrder || 0)
    };
  }

  const systemKey = String(record?.sheetContext?.mode || MEMORIZATION_SYSTEM_KEY);
  const markKey = String(record?.sheetContext?.markKey || "");
  if (!markKey) return null;
  const scale = getScaleBySystem(scaleSet, systemKey);
  return buildSymbolicMarkSnapshot(scale, markKey);
}

module.exports = {
  MEMORIZATION_SYSTEM_KEY,
  SUBAC_SYSTEM_KEY,
  MEMORIZATION_SCALE_MAX_VALUE,
  SUBAC_SCALE_MAX_VALUE,
  DEFAULT_MEMORIZATION_MARKS,
  DEFAULT_SUBAC_MARKS,
  buildDefaultMemorizationScale,
  buildDefaultSubacScale,
  buildDefaultGradingScaleSet,
  normalizeGradingScale,
  normalizeGradingScaleSet,
  serializeScaleForSignature,
  getScaleBySystem,
  resolveMarkDefinition,
  buildSymbolicMarkSnapshot,
  getStoredScoreFromMarkSnapshot,
  resolveSnapshotOrScaleMark
};
