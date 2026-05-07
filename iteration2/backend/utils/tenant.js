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

function activeLifecycleFilter() {
  return {
    isDeleted: { $ne: true },
    deletedAt: null
  };
}

function deletedLifecycleFilter() {
  return {
    isDeleted: true,
    deletedAt: { $ne: null }
  };
}

function scopedQuery(reqOrSchoolId, extra = {}) {
  const schoolId = assertTenantContext(reqOrSchoolId);
  const { includeDeleted, ...rest } = extra;
  const base = { schoolId, ...rest };
  if (includeDeleted) return base;
  return { ...base, ...activeLifecycleFilter() };
}

function scopedIdQuery(reqOrSchoolId, id, extra = {}) {
  const schoolId = assertTenantContext(reqOrSchoolId);
  const { includeDeleted, ...rest } = extra;
  const base = { _id: id, schoolId, ...rest };
  if (includeDeleted) return base;
  return { ...base, ...activeLifecycleFilter() };
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
  activeLifecycleFilter,
  deletedLifecycleFilter,
  scopedQuery,
  scopedIdQuery,
  scopedInsertData
};
