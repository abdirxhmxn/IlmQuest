const Mission = require("../models/Missions");

const MISSION_GRACE_WINDOW_MINUTES = 30;
const MISSION_AUTO_FAIL_STATUS = "auto_failed";
const MISSION_DEADLINE_FAILURE_TYPE = "deadline_missed";
const MISSION_AUTO_FAIL_REASON = `Auto-failed: submission not received within ${MISSION_GRACE_WINDOW_MINUTES}-minute grace period.`;
const ACTIVE_STATUS_KEYS = new Set(["active"]);
const SUBMITTED_STATUS_KEYS = new Set(["completed", "pending", "rejected"]);
const TERMINAL_STATUS_KEYS = new Set(["completed", "pending", "rejected", "failed", "auto_failed"]);

let activeSweepPromise = null;
let sweepIntervalHandle = null;

function normalizeMissionAttemptStatusKey(rawStatus = "", hasActivity = false) {
  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (/(auto[_ -]?failed)/.test(normalized)) return "auto_failed";
  if (/(failed|failure)/.test(normalized)) return "failed";
  if (/(complete|completed|approved|done)/.test(normalized)) return "completed";
  if (/(pending|review|approval|await|submitted)/.test(normalized)) return "pending";
  if (/(reject|rejected|declined|revision)/.test(normalized)) return "rejected";
  if (/(start|in_progress|in progress|active|reopen)/.test(normalized)) return "active";
  if (hasActivity) return "active";
  return "assigned";
}

function isMissionAttemptActive(rawStatus = "", hasActivity = false) {
  return ACTIVE_STATUS_KEYS.has(normalizeMissionAttemptStatusKey(rawStatus, hasActivity));
}

function hasMissionAttemptSubmission(rawStatus = "", hasActivity = false) {
  return SUBMITTED_STATUS_KEYS.has(normalizeMissionAttemptStatusKey(rawStatus, hasActivity));
}

function isMissionAttemptTerminal(rawStatus = "", hasActivity = false) {
  return TERMINAL_STATUS_KEYS.has(normalizeMissionAttemptStatusKey(rawStatus, hasActivity));
}

function normalizeMissionDeadline(dueDateValue) {
  if (!dueDateValue) return null;
  const parsed = new Date(dueDateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  const isDateOnlyMidnight = parsed.getUTCHours() === 0
    && parsed.getUTCMinutes() === 0
    && parsed.getUTCSeconds() === 0
    && parsed.getUTCMilliseconds() === 0;

  if (!isDateOnlyMidnight) return parsed;

  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    23,
    59,
    59,
    999
  ));
}

function getMissionAutoFailDeadline(dueDateValue, graceWindowMinutes = MISSION_GRACE_WINDOW_MINUTES) {
  const deadline = normalizeMissionDeadline(dueDateValue);
  if (!deadline) return null;
  return new Date(deadline.getTime() + (Number(graceWindowMinutes || 0) * 60 * 1000));
}

function shouldAutoFailMissionAttempt({ missionDoc, studentEntry, now = new Date() } = {}) {
  const deadlineAt = getMissionAutoFailDeadline(missionDoc?.dueDate);
  if (!deadlineAt) return false;
  if (!studentEntry) return false;
  if (studentEntry?.reopenedAt && !studentEntry?.failedAt) return false;
  if (hasMissionAttemptSubmission(studentEntry?.status, true)) return false;
  if (isMissionAttemptTerminal(studentEntry?.status, true)) return false;
  if (!isMissionAttemptActive(studentEntry?.status, true)) return false;

  const currentTime = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(currentTime.getTime())) return false;
  return currentTime.getTime() > deadlineAt.getTime();
}

async function performMissionDeadlineSweep({ schoolId = "", now = new Date(), logger = console } = {}) {
  // tenant-query-guard:ignore background deadline sweeps may run globally across all schools by design.
  const query = {
    dueDate: { $ne: null },
    "active.studentInfo.0": { $exists: true }
  };
  if (schoolId) {
    query.schoolId = schoolId;
  }

  const missionDocs = await Mission.find(query)
    .select("_id schoolId title dueDate active.studentInfo")
    .exec();

  let scannedMissions = 0;
  let changedMissions = 0;
  let failedAttempts = 0;

  for (const missionDoc of missionDocs) {
    scannedMissions += 1;
    let changed = false;

    (missionDoc?.active?.studentInfo || []).forEach((studentEntry) => {
      if (!shouldAutoFailMissionAttempt({ missionDoc, studentEntry, now })) return;
      studentEntry.status = MISSION_AUTO_FAIL_STATUS;
      studentEntry.failedAt = now;
      studentEntry.failureReason = MISSION_AUTO_FAIL_REASON;
      studentEntry.failureType = MISSION_DEADLINE_FAILURE_TYPE;
      studentEntry.graceWindowMinutes = MISSION_GRACE_WINDOW_MINUTES;
      changed = true;
      failedAttempts += 1;
    });

    if (!changed) continue;

    missionDoc.markModified("active.studentInfo");
    await missionDoc.save();
    changedMissions += 1;
  }

  if (failedAttempts > 0) {
    logger.info?.(
      `[mission-deadline-sweep] auto-failed ${failedAttempts} attempt(s) across ${changedMissions} mission(s).`
    );
  }

  return {
    scannedMissions,
    changedMissions,
    failedAttempts
  };
}

async function sweepExpiredMissionAttempts(options = {}) {
  if (activeSweepPromise) {
    return activeSweepPromise;
  }

  activeSweepPromise = performMissionDeadlineSweep(options)
    .finally(() => {
      activeSweepPromise = null;
    });

  return activeSweepPromise;
}

function startMissionDeadlineSweepScheduler({ intervalMs = 5 * 60 * 1000, logger = console } = {}) {
  if (sweepIntervalHandle) return sweepIntervalHandle;

  const triggerSweep = () => {
    sweepExpiredMissionAttempts({ logger })
      .catch((err) => {
        logger.error?.("[mission-deadline-sweep] scheduler error:", err?.message || err);
      });
  };

  setTimeout(triggerSweep, 15 * 1000).unref?.();
  sweepIntervalHandle = setInterval(triggerSweep, intervalMs);
  sweepIntervalHandle.unref?.();
  return sweepIntervalHandle;
}

module.exports = {
  MISSION_GRACE_WINDOW_MINUTES,
  MISSION_AUTO_FAIL_STATUS,
  MISSION_DEADLINE_FAILURE_TYPE,
  MISSION_AUTO_FAIL_REASON,
  normalizeMissionAttemptStatusKey,
  normalizeMissionDeadline,
  getMissionAutoFailDeadline,
  isMissionAttemptActive,
  hasMissionAttemptSubmission,
  isMissionAttemptTerminal,
  shouldAutoFailMissionAttempt,
  sweepExpiredMissionAttempts,
  startMissionDeadlineSweepScheduler
};
