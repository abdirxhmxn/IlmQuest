const crypto = require("crypto");

function getEncryptionSecret() {
  const configured = String(process.env.FINANCE_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").trim();
  return configured || null;
}

function hasEncryptionSecret() {
  return Boolean(getEncryptionSecret());
}

function deriveKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptToken(plainText) {
  const secret = getEncryptionSecret();
  if (!secret) {
    const err = new Error("Finance encryption key is not configured.");
    err.code = "FINANCE_ENCRYPTION_KEY_MISSING";
    throw err;
  }

  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText || ""), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

function decryptToken(payload) {
  const secret = getEncryptionSecret();
  if (!secret) {
    const err = new Error("Finance encryption key is not configured.");
    err.code = "FINANCE_ENCRYPTION_KEY_MISSING";
    throw err;
  }

  const encoded = String(payload || "");
  const segments = encoded.split(":");
  if (segments.length !== 4 || segments[0] !== "v1") {
    const err = new Error("Encrypted token payload is malformed.");
    err.code = "FINANCE_ENCRYPTION_PAYLOAD_INVALID";
    throw err;
  }

  const iv = Buffer.from(segments[1], "base64");
  const encrypted = Buffer.from(segments[2], "base64");
  const authTag = Buffer.from(segments[3], "base64");
  const key = deriveKey(secret);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = {
  hasEncryptionSecret,
  encryptToken,
  decryptToken
};
