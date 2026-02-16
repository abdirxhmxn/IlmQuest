/* eslint-disable no-console */
const postsController = require("../controllers/posts");
const { pickAllowedFields, validateUserPatchPayload } = require("../middleware/adminMutations");
const { mapDuplicateKeyError } = require("../utils/userIdentifiers");

function createMockRes(resolve) {
  return {
    statusCode: 200,
    payload: null,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      resolve({ statusCode: this.statusCode, payload: body, redirectedTo: this.redirectedTo });
    },
    redirect(path) {
      this.redirectedTo = path;
      resolve({ statusCode: this.statusCode, payload: this.payload, redirectedTo: path });
    }
  };
}

async function checkUnauthorizedPatchBlocked() {
  return new Promise((resolve, reject) => {
    const req = {
      method: "PATCH",
      params: { id: "000000000000000000000000" },
      body: { firstName: "Attempt" },
      user: { _id: "student-1", role: "student" },
      schoolId: "school-1",
      get(name) {
        if (String(name).toLowerCase() === "accept") return "application/json";
        return "";
      },
      flash() {}
    };
    const res = createMockRes(resolve);
    postsController.patchUser(req, res).catch(reject);
  });
}

async function main() {
  const unauthorized = await checkUnauthorizedPatchBlocked();
  if (unauthorized.statusCode !== 403) {
    throw new Error(`Expected unauthorized PATCH to fail with 403, got ${unauthorized.statusCode}`);
  }

  const filtered = pickAllowedFields(
    { firstName: "A", role: "admin", $where: "bad", email: "a@example.com" },
    ["firstName", "email"]
  );

  if ("role" in filtered || "$where" in filtered) {
    throw new Error("pickAllowedFields leaked non-allowed fields.");
  }

  const { isValid, errors } = validateUserPatchPayload(
    { firstName: "", email: "not-an-email", age: 120 },
    "student"
  );
  if (isValid || !errors.firstName || !errors.email || !errors.age) {
    throw new Error("validateUserPatchPayload failed to catch invalid input.");
  }

  const mapped = mapDuplicateKeyError({
    code: 11000,
    keyPattern: { emailNormalized: 1 }
  });
  if (!mapped || mapped.field !== "email") {
    throw new Error("Duplicate key mapping failed for emailNormalized.");
  }

  console.log("Admin mutation check passed.");
}

main().catch((err) => {
  console.error("Admin mutation check failed:", err.message);
  process.exit(1);
});
