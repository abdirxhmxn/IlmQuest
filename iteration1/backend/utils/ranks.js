const RANK_THRESHOLDS = Object.freeze({
  F: 0,
  E: 10,
  D: 100,
  C: 1000,
  B: 10000,
  A: 100000,
  S: 1000000
});

const RANK_KEYS = Object.freeze(["F", "E", "D", "C", "B", "A", "S"]);

const RANK_LABELS = Object.freeze(
  RANK_KEYS.reduce((acc, key) => {
    acc[key] = `${key} Rank`;
    return acc;
  }, {})
);

const RANK_LADDER = Object.freeze(
  RANK_KEYS.map((key) =>
    Object.freeze({
      key,
      label: RANK_LABELS[key],
      minXp: Number(RANK_THRESHOLDS[key] || 0)
    })
  )
);

const RANK_LOOKUP = Object.freeze(
  RANK_LADDER.reduce((acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  }, {})
);

const RANK_INDEX_LOOKUP = Object.freeze(
  RANK_KEYS.reduce((acc, key, index) => {
    acc[key] = index;
    return acc;
  }, {})
);

function normalizeXpValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeRankKey(value) {
  const candidate = String(value || "").trim().toUpperCase();
  if (!candidate || !RANK_LOOKUP[candidate]) return "";
  return candidate;
}

function isValidRankKey(value) {
  return Boolean(normalizeRankKey(value));
}

function getRankByKey(rankKey) {
  const key = normalizeRankKey(rankKey) || "F";
  return RANK_LOOKUP[key] || RANK_LOOKUP.F;
}

function getRankOrderIndex(rankKey) {
  const key = normalizeRankKey(rankKey) || "F";
  return Number(RANK_INDEX_LOOKUP[key] ?? 0);
}

function canStudentAccessMissionRank(studentRankKey, missionRankKey, options = {}) {
  const accessMode = String(options.accessMode || "exact").trim().toLowerCase();
  const studentKey = normalizeRankKey(studentRankKey) || "F";
  const requiredKey = normalizeRankKey(missionRankKey) || "F";

  if (accessMode === "at_or_above") {
    return getRankOrderIndex(studentKey) >= getRankOrderIndex(requiredKey);
  }

  // Default: strict rank lock. Students can access only missions matching their rank tier.
  return studentKey === requiredKey;
}

function getAutoRankForXp(xpValue) {
  const xp = normalizeXpValue(xpValue);
  for (let index = RANK_LADDER.length - 1; index >= 0; index -= 1) {
    if (xp >= RANK_LADDER[index].minXp) {
      return RANK_LADDER[index];
    }
  }
  return RANK_LOOKUP.F;
}

function getNextRank(rankKey) {
  const normalized = normalizeRankKey(rankKey) || "F";
  const index = RANK_KEYS.indexOf(normalized);
  if (index < 0 || index >= RANK_KEYS.length - 1) return null;
  return RANK_LOOKUP[RANK_KEYS[index + 1]];
}

function resolveStudentXp(studentLike = {}) {
  const xpCandidate = normalizeXpValue(studentLike?.xp);
  if (xpCandidate > 0 || Number(studentLike?.xp) === 0) {
    return xpCandidate;
  }
  return normalizeXpValue(studentLike?.points);
}

function buildRankSummaryFromUser(studentLike = {}) {
  const xp = resolveStudentXp(studentLike);
  const autoRank = getAutoRankForXp(xp);
  const manualRankKey = normalizeRankKey(studentLike?.manualRank);
  const isManualOverride = Boolean(studentLike?.rankOverrideEnabled && manualRankKey);

  const displayRank = isManualOverride ? getRankByKey(manualRankKey) : autoRank;
  const progressionRank = displayRank;
  const nextRank = getNextRank(progressionRank.key);
  const currentTierMin = progressionRank.minXp;
  const nextTierMin = nextRank ? nextRank.minXp : currentTierMin;
  const tierTotalXp = nextRank ? Math.max(1, nextTierMin - currentTierMin) : 0;
  const tierProgressXp = nextRank
    ? Math.max(0, Math.min(xp - currentTierMin, tierTotalXp))
    : 0;
  const progressPercent = nextRank
    ? Math.round((tierProgressXp / tierTotalXp) * 100)
    : 100;

  return {
    xp,
    autoRankKey: autoRank.key,
    autoRankLabel: autoRank.label,
    displayRankKey: displayRank.key,
    displayRankLabel: displayRank.label,
    manualRankKey: manualRankKey || "",
    isManualOverride,
    nextRankKey: nextRank ? nextRank.key : "",
    nextRankLabel: nextRank ? nextRank.label : "Max Rank",
    xpForNextRank: nextRank ? nextRank.minXp : null,
    xpToNextRank: nextRank ? Math.max(0, nextRank.minXp - xp) : 0,
    progressPercent,
    progressCurrentXp: tierProgressXp,
    progressNeededXp: tierTotalXp,
    progressLabel: nextRank
      ? `${tierProgressXp.toLocaleString()} / ${tierTotalXp.toLocaleString()} XP`
      : "Maximum rank reached"
  };
}

module.exports = {
  RANK_THRESHOLDS,
  RANK_KEYS,
  RANK_LABELS,
  RANK_LADDER,
  normalizeXpValue,
  normalizeRankKey,
  isValidRankKey,
  getRankByKey,
  getRankOrderIndex,
  canStudentAccessMissionRank,
  getAutoRankForXp,
  getNextRank,
  resolveStudentXp,
  buildRankSummaryFromUser
};
