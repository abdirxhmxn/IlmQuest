const validator = require("validator");
const { normalizeEmail } = require("../utils/userIdentifiers");

const STUDENT_GRADE_LEVELS = ["Prep 1", "Prep 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
const STUDENT_PROGRAM_TYPES = ["Tahfiidth", "Khatm"];

function pickAllowedFields(source, allowedFields) {
  const out = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      out[field] = source[field];
    }
  }
  return out;
}

function validateUserPatchPayload(payload, role) {
  const errors = {};
  const clean = {};

  if (payload.firstName !== undefined) {
    const value = String(payload.firstName).trim();
    if (!value) errors.firstName = "First name is required.";
    else clean.firstName = value;
  }

  if (payload.lastName !== undefined) {
    const value = String(payload.lastName).trim();
    if (!value) errors.lastName = "Last name is required.";
    else clean.lastName = value;
  }

  if (payload.userName !== undefined) {
    const value = String(payload.userName).trim();
    if (!value) errors.userName = "Username is required.";
    else clean.userName = value;
  }

  if (payload.email !== undefined) {
    const value = String(payload.email).trim();
    if (!validator.isEmail(value)) errors.email = "Invalid email address.";
    else clean.email = normalizeEmail(value);
  }

  if (role === "student") {
    if (payload.age !== undefined) {
      const age = Number(payload.age);
      if (!Number.isInteger(age) || age < 1 || age > 99) {
        errors.age = "Age must be an integer between 1 and 99.";
      } else {
        clean.age = age;
      }
    }

    if (payload.programType !== undefined) {
      const value = String(payload.programType);
      if (!STUDENT_PROGRAM_TYPES.includes(value)) {
        errors.programType = "Invalid program type.";
      } else {
        clean.programType = value;
      }
    }

    if (payload.gradeLevel !== undefined) {
      const value = String(payload.gradeLevel);
      if (!STUDENT_GRADE_LEVELS.includes(value)) {
        errors.gradeLevel = "Invalid grade level.";
      } else {
        clean.gradeLevel = value;
      }
    }

    if (payload.enrollmentDate !== undefined) {
      const parsed = new Date(payload.enrollmentDate);
      if (Number.isNaN(parsed.getTime())) {
        errors.enrollmentDate = "Invalid enrollment date.";
      } else {
        clean.enrollmentDate = parsed;
      }
    }
  }

  if (role === "teacher") {
    if (payload.subjects !== undefined) {
      if (Array.isArray(payload.subjects)) {
        clean.subjects = payload.subjects
          .map((s) => String(s).trim())
          .filter(Boolean);
      } else {
        clean.subjects = String(payload.subjects)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    if (payload.hireDate !== undefined) {
      const parsed = new Date(payload.hireDate);
      if (Number.isNaN(parsed.getTime())) {
        errors.hireDate = "Invalid hire date.";
      } else {
        clean.hireDate = parsed;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    clean
  };
}

function validateClassPatchPayload(payload) {
  const errors = {};
  const clean = {};

  if (payload.className !== undefined) {
    const value = String(payload.className).trim();
    if (!value) errors.className = "Class name is required.";
    else clean.className = value;
  }

  if (payload.roomNumber !== undefined) {
    clean.roomNumber = String(payload.roomNumber || "").trim();
  }

  if (payload.capacity !== undefined) {
    const capacity = Number(payload.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      errors.capacity = "Capacity must be an integer between 1 and 500.";
    } else {
      clean.capacity = capacity;
    }
  }

  if (payload.active !== undefined) {
    if (typeof payload.active === "boolean") {
      clean.active = payload.active;
    } else if (payload.active === "true" || payload.active === "false") {
      clean.active = payload.active === "true";
    } else {
      errors.active = "Active must be true or false.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    clean
  };
}

module.exports = {
  pickAllowedFields,
  validateUserPatchPayload,
  validateClassPatchPayload
};
