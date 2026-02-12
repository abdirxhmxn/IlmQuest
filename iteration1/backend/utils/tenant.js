function scopedQuery(req, extra = {}) {
  return { schoolId: req.schoolId, ...extra };
}

function scopedIdQuery(req, id, extra = {}) {
  return { _id: id, schoolId: req.schoolId, ...extra };
}

module.exports = {
  scopedQuery,
  scopedIdQuery
};
