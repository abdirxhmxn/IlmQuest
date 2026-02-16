function scopedQuery(req, extra = {}) {
  const base = { schoolId: req.schoolId };
  if (!extra.includeDeleted) base.deletedAt = null;
  const { includeDeleted, ...rest } = extra;
  return { ...base, ...rest };
}

function scopedIdQuery(req, id, extra = {}) {
  const base = { _id: id, schoolId: req.schoolId };
  if (!extra.includeDeleted) base.deletedAt = null;
  const { includeDeleted, ...rest } = extra;
  return { ...base, ...rest };
}

module.exports = {
  scopedQuery,
  scopedIdQuery
};
