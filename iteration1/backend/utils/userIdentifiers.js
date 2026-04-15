function normalizeEmail(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeUserName(value) {
  if (value === undefined || value === null) return "";

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized;
}

function deriveUserNameCandidate({
  preferred = "",
  firstName = "",
  lastName = "",
  email = "",
  fallback = "user"
} = {}) {
  const preferredSlug = normalizeUserName(preferred);
  if (preferredSlug) return preferredSlug;

  const fullNameSlug = normalizeUserName(`${firstName} ${lastName}`.trim());
  if (fullNameSlug) return fullNameSlug;

  const emailLocalPart = String(email || "").split("@")[0] || "";
  const emailSlug = normalizeUserName(emailLocalPart);
  if (emailSlug) return emailSlug;

  return normalizeUserName(fallback) || "user";
}

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeStudentNumber(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function mapDuplicateKeyError(err) {
  if (!err || err.code !== 11000) return null;

  const keyPattern = err.keyPattern || {};
  if (keyPattern.emailNormalized) {
    return {
      field: "email",
      message: "Email already exists for this school."
    };
  }

  if (keyPattern.userNameNormalized) {
    return {
      field: "userName",
      message: "Username already exists for this school."
    };
  }

  if (keyPattern.employeeIdNormalized) {
    return {
      field: "employeeId",
      message: "Employee ID already exists for this school."
    };
  }

  if (keyPattern.studentNumberNormalized) {
    return {
      field: "studentNumber",
      message: "Student number already exists for this school."
    };
  }

  return {
    field: "identifier",
    message: "A unique identifier already exists for this school."
  };
}

module.exports = {
  normalizeEmail,
  normalizeUserName,
  deriveUserNameCandidate,
  normalizeIdentifier,
  normalizeStudentNumber,
  mapDuplicateKeyError
};
