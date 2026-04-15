function resolveSchoolId(reqOrSchoolId) {
  if (reqOrSchoolId && typeof reqOrSchoolId === "object") {
    if (reqOrSchoolId.schoolId) {
      return String(reqOrSchoolId.schoolId);
    }

    const objectToString = typeof reqOrSchoolId.toString === "function"
      ? String(reqOrSchoolId.toString())
      : "";
    if (objectToString && objectToString !== "[object Object]") {
      return objectToString;
    }
    return "";
  }
  if (reqOrSchoolId) {
    return String(reqOrSchoolId);
  }
  return "";
}

function assertTenantContext(reqOrSchoolId, contextLabel = "tenant-scoped query") {
  const schoolId = resolveSchoolId(reqOrSchoolId);
  if (!schoolId || !String(schoolId).trim()) {
    const error = new Error(`Missing schoolId for ${contextLabel}.`);
    error.code = "TENANT_SCOPE_REQUIRED";
    throw error;
  }
  return String(schoolId).trim();
}

function scopedQuery(reqOrSchoolId, extra = {}) {
  const schoolId = assertTenantContext(reqOrSchoolId);
  const base = { schoolId };
  if (!extra.includeDeleted) base.deletedAt = null;
  const { includeDeleted, ...rest } = extra;
  return { ...base, ...rest };
}

function scopedIdQuery(reqOrSchoolId, id, extra = {}) {
  const schoolId = assertTenantContext(reqOrSchoolId);
  const base = { _id: id, schoolId };
  if (!extra.includeDeleted) base.deletedAt = null;
  const { includeDeleted, ...rest } = extra;
  return { ...base, ...rest };
}

function scopedInsertData(reqOrSchoolId, payload = {}) {
  return {
    ...payload,
    schoolId: assertTenantContext(reqOrSchoolId, "tenant-scoped create")
  };
}

module.exports = {
  resolveSchoolId,
  assertTenantContext,
  scopedQuery,
  scopedIdQuery,
  scopedInsertData
};
