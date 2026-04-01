const mongoose = require("mongoose");
const User = require("../models/User");
const { scopedQuery } = require("./tenant");

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Other"];

function normalizeRelationship(value) {
  const normalized = String(value || "").trim();
  return RELATIONSHIPS.includes(normalized) ? normalized : "Guardian";
}

function buildDisplayName(user) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const merged = `${first} ${last}`.trim();
  return merged || user?.userName || "Unknown";
}

function uniqueObjectIdStrings(values = []) {
  const out = [];
  const seen = new Set();

  (Array.isArray(values) ? values : [values]).forEach((value) => {
    const id = String(value || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });

  return out;
}

function extractParentChildIds(parentDoc) {
  const children = Array.isArray(parentDoc?.parentInfo?.children)
    ? parentDoc.parentInfo.children
    : [];
  return uniqueObjectIdStrings(children.map((entry) => entry?.childID));
}

async function getLinkedStudentsForParent(req, parentDoc) {
  const fromParentProfile = extractParentChildIds(parentDoc);

  const reverseLinkedStudents = await User.find(
    scopedQuery(req, {
      role: "student",
      "studentInfo.parents.parentID": parentDoc._id
    })
  )
    .select("_id")
    .lean();

  const reverseIds = reverseLinkedStudents.map((student) => String(student._id));
  const allIds = uniqueObjectIdStrings([...fromParentProfile, ...reverseIds]);

  if (!allIds.length) return [];

  return User.find(
    scopedQuery(req, {
      _id: { $in: allIds },
      role: "student"
    })
  ).lean();
}

async function syncParentChildrenAssignments(req, parentDoc, nextChildIds, options = {}) {
  const relationshipByChildId = options.relationshipByChildId || {};
  const defaultRelationship = normalizeRelationship(options.defaultRelationship);
  const selectedIds = uniqueObjectIdStrings(nextChildIds);
  const currentIds = extractParentChildIds(parentDoc);
  const unionIds = uniqueObjectIdStrings([...selectedIds, ...currentIds]);

  const students = unionIds.length
    ? await User.find(
      scopedQuery(req, {
        _id: { $in: unionIds },
        role: "student"
      })
    )
    : [];

  const studentMap = new Map(students.map((student) => [String(student._id), student]));
  const invalidChildIds = selectedIds.filter((id) => !studentMap.has(String(id)));
  if (invalidChildIds.length > 0) {
    const invalidError = new Error("One or more selected children are invalid for this school.");
    invalidError.code = "INVALID_CHILD_SELECTION";
    invalidError.invalidChildIds = invalidChildIds;
    throw invalidError;
  }

  const parentId = String(parentDoc._id);
  const parentName = buildDisplayName(parentDoc);
  const selectedSet = new Set(selectedIds.map(String));
  const timestamp = new Date();
  const existingParentChildren = Array.isArray(parentDoc?.parentInfo?.children)
    ? parentDoc.parentInfo.children
    : [];
  const existingRelationshipByChildId = new Map(
    existingParentChildren
      .filter((entry) => entry?.childID)
      .map((entry) => [String(entry.childID), normalizeRelationship(entry.relationship)])
  );

  for (const student of students) {
    const studentId = String(student._id);
    const previousParents = Array.isArray(student.studentInfo?.parents)
      ? student.studentInfo.parents
      : [];

    const dedupedParents = [];
    const seenParentIds = new Set();

    previousParents.forEach((entry) => {
      const linkedParentId = String(entry?.parentID || "");
      if (!mongoose.Types.ObjectId.isValid(linkedParentId)) return;
      if (linkedParentId === parentId) return;
      if (seenParentIds.has(linkedParentId)) return;
      seenParentIds.add(linkedParentId);
      dedupedParents.push(entry);
    });

    if (selectedSet.has(studentId)) {
      const relationship = normalizeRelationship(
        relationshipByChildId?.[studentId]
        || existingRelationshipByChildId.get(studentId)
        || defaultRelationship
      );
      dedupedParents.push({
        parentID: parentDoc._id,
        parentName,
        relationship,
        linkedAt: timestamp
      });
    }

    student.studentInfo = student.studentInfo || {};
    student.studentInfo.parents = dedupedParents;
    await student.save();
  }

  const nextChildren = selectedIds.map((childId) => {
    const studentDoc = studentMap.get(String(childId));
    const relationship = normalizeRelationship(
      relationshipByChildId?.[String(childId)]
      || existingRelationshipByChildId.get(String(childId))
      || defaultRelationship
    );
    return {
      childID: studentDoc._id,
      childName: buildDisplayName(studentDoc),
      relationship,
      linkedAt: timestamp
    };
  });

  parentDoc.parentInfo = parentDoc.parentInfo || {};
  parentDoc.parentInfo.children = nextChildren;
  await parentDoc.save();

  return {
    assignedChildIds: selectedIds,
    removedChildIds: currentIds.filter((id) => !selectedSet.has(String(id))),
    assignedChildren: nextChildren
  };
}

module.exports = {
  RELATIONSHIPS,
  normalizeRelationship,
  buildDisplayName,
  uniqueObjectIdStrings,
  extractParentChildIds,
  getLinkedStudentsForParent,
  syncParentChildrenAssignments
};
