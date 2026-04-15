/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  const absolutePath = path.join(__dirname, "..", "..", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertContains(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message);
  }
}

function main() {
  const authController = read("backend/controllers/auth.js");
  const mainRoutes = read("backend/routes/main.js");
  const postsController = read("backend/controllers/posts.js");

  assertContains(
    authController,
    "PUBLIC_SIGNUP_BLOCK_MESSAGE",
    "Auth controller must define public signup block messaging."
  );
  assertContains(
    authController,
    "PUBLIC_SIGNUP_DISABLED",
    "Auth controller must hard-block POST /signup."
  );
  assertContains(
    authController,
    "res.status(404).render(\"signupDisabled\"",
    "Auth controller must return disabled signup render for GET /signup."
  );

  assertContains(
    mainRoutes,
    "router.use(\"/platform\", ensureAuth, requireRole(\"superAdmin\"));",
    "Main routes must gate /platform under superAdmin role."
  );
  assertContains(
    mainRoutes,
    "router.post(\n  \"/platform/schools\"",
    "Main routes must expose superAdmin school provisioning endpoint."
  );

  assertContains(
    postsController,
    "School provisioning is managed by the platform super admin only.",
    "Tenant-admin school creation route should be blocked."
  );

  console.log("[private-provisioning-check] OK");
}

try {
  main();
} catch (err) {
  console.error("[private-provisioning-check] FAILED:", err.message || err);
  process.exit(1);
}
