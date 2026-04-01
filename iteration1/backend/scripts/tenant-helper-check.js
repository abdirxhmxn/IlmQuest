/* eslint-disable no-console */
const assert = require("node:assert/strict");
const { scopedQuery, scopedIdQuery, scopedInsertData, assertTenantContext } = require("../utils/tenant");

function expectTenantError(fn, label) {
  try {
    fn();
    throw new Error(`Expected TENANT_SCOPE_REQUIRED for ${label}.`);
  } catch (err) {
    if (err?.code !== "TENANT_SCOPE_REQUIRED") {
      throw err;
    }
  }
}

function main() {
  expectTenantError(() => assertTenantContext(null, "null context"), "null context");
  expectTenantError(() => scopedQuery({}), "empty request object");
  expectTenantError(() => scopedIdQuery("", "507f1f77bcf86cd799439011"), "empty schoolId");
  expectTenantError(() => scopedInsertData(undefined, {}), "undefined insert context");

  const req = { schoolId: "school-1" };
  const query = scopedQuery(req, { role: "student" });
  assert.equal(query.schoolId, "school-1");
  assert.equal(query.deletedAt, null);
  assert.equal(query.role, "student");

  const idQuery = scopedIdQuery(req, "507f1f77bcf86cd799439011", { includeDeleted: true });
  assert.equal(idQuery.schoolId, "school-1");
  assert.equal(idQuery._id, "507f1f77bcf86cd799439011");
  assert.ok(!Object.prototype.hasOwnProperty.call(idQuery, "deletedAt"));

  const insertPayload = scopedInsertData(req, { title: "x" });
  assert.equal(insertPayload.schoolId, "school-1");
  assert.equal(insertPayload.title, "x");

  console.log("Tenant helper check passed.");
}

main();

