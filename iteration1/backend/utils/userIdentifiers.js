function normalizeEmail(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
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
  normalizeIdentifier,
  normalizeStudentNumber,
  mapDuplicateKeyError
};
