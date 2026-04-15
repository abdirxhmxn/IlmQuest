const crypto = require("crypto");

const OWNER_INVITE_TOKEN_BYTES = 32;
const OWNER_INVITE_TOKEN_TTL_MS = 1000 * 60 * 60 * 48; // 48 hours
const OWNER_INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function createOwnerInviteTokenPair() {
  const rawToken = crypto.randomBytes(OWNER_INVITE_TOKEN_BYTES).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

function getOwnerInviteTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function isValidOwnerInviteToken(token) {
  return OWNER_INVITE_TOKEN_PATTERN.test(String(token || ""));
}

function getOwnerInviteExpiryDate(now = Date.now()) {
  return new Date(Number(now) + OWNER_INVITE_TOKEN_TTL_MS);
}

module.exports = {
  OWNER_INVITE_TOKEN_TTL_MS,
  createOwnerInviteTokenPair,
  getOwnerInviteTokenHash,
  isValidOwnerInviteToken,
  getOwnerInviteExpiryDate
};
