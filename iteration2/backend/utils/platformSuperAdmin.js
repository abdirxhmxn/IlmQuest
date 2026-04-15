const User = require("../models/User");
const {
  normalizeEmail,
  normalizeUserName,
  deriveUserNameCandidate
} = require("./userIdentifiers");

function resolveConfiguredSuperAdmin() {
  const email = normalizeEmail(process.env.PLATFORM_SUPERADMIN_EMAIL || "");
  const password = String(process.env.PLATFORM_SUPERADMIN_PASSWORD || "").trim();
  const firstName = String(process.env.PLATFORM_SUPERADMIN_FIRST_NAME || "Platform").trim();
  const lastName = String(process.env.PLATFORM_SUPERADMIN_LAST_NAME || "Admin").trim();
  const preferredUserName = normalizeUserName(
    process.env.PLATFORM_SUPERADMIN_USERNAME
    || deriveUserNameCandidate({ preferred: "platform-admin", email })
  );

  return {
    email,
    password,
    firstName: firstName || "Platform",
    lastName: lastName || "Admin",
    preferredUserName: preferredUserName || "platform-admin"
  };
}

async function resolveUniqueSuperAdminUserName(baseUserName) {
  const normalizedBase = normalizeUserName(baseUserName) || "platform-admin";
  let candidate = normalizedBase;
  let suffix = 2;
  // Keep this deterministic and short so logs remain readable.
  while (await User.findOne({ role: "superAdmin", userNameNormalized: candidate, deletedAt: null }).select("_id").lean()) {
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function ensurePlatformSuperAdminAccount() {
  const config = resolveConfiguredSuperAdmin();
  if (!config.email || !config.password) {
    return { skipped: true, reason: "missing_platform_superadmin_env" };
  }

  const existing = await User.findOne({
    role: "superAdmin",
    emailNormalized: config.email,
    deletedAt: null
  })
    .select("_id userName email")
    .lean();

  if (existing) {
    return { skipped: true, reason: "already_exists", userId: String(existing._id) };
  }

  const userName = await resolveUniqueSuperAdminUserName(config.preferredUserName);
  const superAdmin = new User({
    schoolId: null,
    role: "superAdmin",
    userName,
    email: config.email,
    password: config.password,
    firstName: config.firstName,
    lastName: config.lastName,
    mustChangePassword: false,
    isFirstLogin: false,
    temporaryPasswordIssued: false
  });

  await superAdmin.save();

  return {
    created: true,
    userId: String(superAdmin._id),
    userName: superAdmin.userName,
    email: superAdmin.email
  };
}

module.exports = {
  ensurePlatformSuperAdminAccount
};
