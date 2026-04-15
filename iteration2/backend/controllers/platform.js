const crypto = require("crypto");
const validator = require("validator");
const School = require("../models/School");
const User = require("../models/User");
const {
  normalizeEmail,
  normalizeUserName,
  deriveUserNameCandidate
} = require("../utils/userIdentifiers");
const {
  createOwnerInviteTokenPair,
  getOwnerInviteTokenHash,
  isValidOwnerInviteToken,
  getOwnerInviteExpiryDate
} = require("../utils/ownerInvite");

function appBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function splitFullName(rawName) {
  const parts = String(rawName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }
  const [firstName, ...rest] = parts;
  return {
    firstName: firstName.slice(0, 80),
    lastName: rest.join(" ").slice(0, 80)
  };
}

function buildOwnerUserName({ ownerUserName, ownerName, ownerEmail }) {
  return normalizeUserName(
    ownerUserName
    || deriveUserNameCandidate({ preferred: ownerName, email: ownerEmail, fallback: "school-owner" })
  );
}

function buildTempPassword() {
  return crypto.randomBytes(24).toString("hex");
}

async function renderPlatformHome(req, res, extra = {}) {
  const schools = await School.find({})
    .select("_id schoolName schoolEmail adminUser ownerUserId provisionedAt createdAt")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const ownerIds = Array.from(
    new Set(
      schools
        .map((school) => String(school.ownerUserId || "").trim())
        .filter(Boolean)
    )
  );

  const owners = ownerIds.length
    ? await User.find({
      _id: { $in: ownerIds },
      role: "admin",
      deletedAt: null
    })
      .select("_id firstName lastName userName email ownerOnboardingCompletedAt")
      .lean()
    : [];

  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const schoolRows = schools.map((school) => {
    const owner = ownerById.get(String(school.ownerUserId || "")) || null;
    const ownerName = owner
      ? (`${owner.firstName || ""} ${owner.lastName || ""}`.trim() || owner.userName || owner.email || "Owner")
      : "Unassigned";
    const ownerUserName = owner?.userName || "";
    const ownerOnboarded = Boolean(owner?.ownerOnboardingCompletedAt);
    return {
      id: String(school._id),
      schoolName: school.schoolName || "School",
      schoolEmail: school.schoolEmail || "",
      ownerName,
      ownerUserName,
      ownerOnboarded,
      provisionedAt: school.provisionedAt || school.createdAt || null
    };
  });

  const provisioningResult = req.session?.platformProvisionResult || null;
  if (req.session?.platformProvisionResult) {
    delete req.session.platformProvisionResult;
  }

  return res.render("platform/home", {
    user: req.user,
    messages: req.flash(),
    schoolRows,
    provisioningResult,
    ...extra
  });
}

module.exports = {
  getPlatformHome: async (req, res) => {
    try {
      return await renderPlatformHome(req, res);
    } catch (err) {
      console.error("Platform home error:", err);
      req.flash("errors", [{ msg: "Unable to load platform provisioning workspace." }]);
      return res.status(500).redirect("/login");
    }
  },

  postProvisionSchool: async (req, res) => {
    let createdSchoolId = null;
    let createdOwnerId = null;

    try {
      const schoolName = String(req.body.schoolName || "").trim();
      const schoolEmail = normalizeEmail(req.body.schoolEmail || "");
      const ownerName = String(req.body.ownerName || "").trim();
      const ownerEmail = normalizeEmail(req.body.ownerEmail || "");
      const ownerUserName = buildOwnerUserName({
        ownerUserName: req.body.ownerUserName || "",
        ownerName,
        ownerEmail
      });

      const validationErrors = [];
      if (!schoolName) validationErrors.push("School name is required.");
      if (!validator.isEmail(schoolEmail)) validationErrors.push("A valid school email is required.");
      if (!ownerName) validationErrors.push("Owner full name is required.");
      if (!validator.isEmail(ownerEmail)) validationErrors.push("A valid owner email is required.");
      if (!ownerUserName) validationErrors.push("A valid owner username is required.");

      if (validationErrors.length) {
        req.flash("errors", validationErrors.map((msg) => ({ msg })));
        return res.redirect("/platform/home");
      }

      const schoolNameNormalized = schoolName.toLowerCase();
      const [schoolNameConflict, schoolEmailConflict] = await Promise.all([
        School.findOne({ schoolNameNormalized }).select("_id").lean(),
        School.findOne({ schoolEmail }).select("_id").lean()
      ]);

      if (schoolNameConflict) {
        req.flash("errors", [{ msg: "That school name is already provisioned." }]);
        return res.redirect("/platform/home");
      }

      if (schoolEmailConflict) {
        req.flash("errors", [{ msg: "That school email is already provisioned." }]);
        return res.redirect("/platform/home");
      }

      const tempSchoolPassword = buildTempPassword();
      const tempOwnerPassword = buildTempPassword();
      const now = new Date();

      const school = await School.create({
        schoolName,
        schoolEmail,
        password: tempSchoolPassword,
        adminUser: ownerUserName,
        contactEmail: schoolEmail,
        provisionedByUserId: req.user?._id || null,
        provisionedAt: now
      });
      createdSchoolId = school._id;

      const { firstName, lastName } = splitFullName(ownerName);

      const owner = await User.create({
        schoolId: school._id,
        role: "admin",
        isSchoolOwner: true,
        userName: ownerUserName,
        email: ownerEmail,
        password: tempOwnerPassword,
        firstName,
        lastName,
        mustChangePassword: false,
        isFirstLogin: false,
        temporaryPasswordIssued: false
      });
      createdOwnerId = owner._id;

      const { rawToken, tokenHash } = createOwnerInviteTokenPair();
      const expiresAt = getOwnerInviteExpiryDate();

      await User.updateOne(
        { _id: owner._id, role: "admin", deletedAt: null },
        {
          $set: {
            ownerInviteTokenHash: tokenHash,
            ownerInviteExpiresAt: expiresAt,
            ownerInviteSentAt: now
          }
        }
      );

      await School.updateOne(
        { _id: school._id },
        {
          $set: {
            ownerUserId: owner._id,
            adminUser: owner.userName,
            provisionedByUserId: req.user?._id || null,
            provisionedAt: now
          }
        }
      );

      const inviteLink = `${appBaseUrl(req)}/owner-onboarding/${rawToken}`;
      req.flash("success", "School provisioned successfully. Share the owner onboarding link securely.");
      if (req.session) {
        req.session.platformProvisionResult = {
          schoolName: school.schoolName,
          ownerEmail: owner.email,
          ownerUserName: owner.userName,
          inviteLink,
          expiresAt: expiresAt.toISOString()
        };
        return req.session.save(() => res.redirect("/platform/home"));
      }
      return res.redirect("/platform/home");
    } catch (err) {
      console.error("Platform school provisioning error:", err);

      if (createdOwnerId) {
        await User.deleteOne({ _id: createdOwnerId }).catch(() => null);
      }
      if (createdSchoolId) {
        await School.deleteOne({ _id: createdSchoolId }).catch(() => null);
      }

      if (err?.code === 11000) {
        req.flash("errors", [{ msg: "A unique identifier already exists. Check school and owner values." }]);
        return res.redirect("/platform/home");
      }

      req.flash("errors", [{ msg: "Could not provision the school. Please try again." }]);
      return res.redirect("/platform/home");
    }
  },

  getOwnerOnboarding: async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!isValidOwnerInviteToken(token)) {
        req.flash("errors", [{ msg: "This onboarding link is invalid or expired." }]);
        return res.redirect("/login");
      }

      const tokenHash = getOwnerInviteTokenHash(token);
      const owner = await User.findOne({
        role: "admin",
        isSchoolOwner: true,
        ownerInviteTokenHash: tokenHash,
        ownerInviteExpiresAt: { $gt: new Date() },
        deletedAt: null
      })
        .select("_id schoolId firstName lastName userName email ownerInviteExpiresAt")
        .lean();

      if (!owner) {
        req.flash("errors", [{ msg: "This onboarding link is invalid or expired." }]);
        return res.redirect("/login");
      }

      const school = await School.findById(owner.schoolId).select("schoolName schoolEmail").lean();

      return res.render("ownerOnboarding", {
        title: "School Owner Onboarding",
        messages: req.flash(),
        token,
        owner: {
          fullName: `${owner.firstName || ""} ${owner.lastName || ""}`.trim() || owner.userName || "School Owner",
          userName: owner.userName || "",
          email: owner.email || "",
          expiresAt: owner.ownerInviteExpiresAt
        },
        school: {
          schoolName: school?.schoolName || "School",
          schoolEmail: school?.schoolEmail || ""
        }
      });
    } catch (err) {
      console.error("Owner onboarding page error:", err);
      req.flash("errors", [{ msg: "Unable to load onboarding. Please request a new invitation." }]);
      return res.redirect("/login");
    }
  },

  postOwnerOnboarding: async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      const password = String(req.body.password || "");
      const confirmPassword = String(req.body.confirmPassword || "");
      const userName = normalizeUserName(req.body.userName || "");
      const firstName = String(req.body.firstName || "").trim().slice(0, 80);
      const lastName = String(req.body.lastName || "").trim().slice(0, 80);

      if (!isValidOwnerInviteToken(token)) {
        req.flash("errors", [{ msg: "This onboarding link is invalid or expired." }]);
        return res.redirect("/login");
      }

      const validationErrors = [];
      if (!validator.isLength(password, { min: 8 })) {
        validationErrors.push({ msg: "Password must be at least 8 characters long." });
      }
      if (password !== confirmPassword) {
        validationErrors.push({ msg: "Passwords do not match." });
      }
      if (!userName) {
        validationErrors.push({ msg: "Username is required." });
      }
      if (!firstName) {
        validationErrors.push({ msg: "First name is required." });
      }

      if (validationErrors.length) {
        req.flash("errors", validationErrors);
        return res.redirect(`/owner-onboarding/${token}`);
      }

      const tokenHash = getOwnerInviteTokenHash(token);
      const owner = await User.findOne({
        role: "admin",
        isSchoolOwner: true,
        ownerInviteTokenHash: tokenHash,
        ownerInviteExpiresAt: { $gt: new Date() },
        deletedAt: null
      }).select("+password +ownerInviteTokenHash +ownerInviteExpiresAt");

      if (!owner) {
        req.flash("errors", [{ msg: "This onboarding link is invalid or expired." }]);
        return res.redirect("/login");
      }

      const conflict = await User.findOne({
        _id: { $ne: owner._id },
        schoolId: owner.schoolId,
        userNameNormalized: userName,
        deletedAt: null
      })
        .select("_id")
        .lean();

      if (conflict) {
        req.flash("errors", [{ msg: "That username is already in use for this school." }]);
        return res.redirect(`/owner-onboarding/${token}`);
      }

      owner.userName = userName;
      owner.firstName = firstName;
      owner.lastName = lastName;
      owner.password = password;
      owner.ownerInviteTokenHash = null;
      owner.ownerInviteExpiresAt = null;
      owner.ownerOnboardingCompletedAt = new Date();
      owner.mustChangePassword = false;
      owner.isFirstLogin = false;
      owner.temporaryPasswordIssued = false;

      await owner.save();
      await School.updateOne(
        { _id: owner.schoolId },
        { $set: { adminUser: owner.userName, ownerUserId: owner._id } }
      );

      req.flash("success", "Account setup complete. You can now sign in.");
      return res.redirect("/login");
    } catch (err) {
      console.error("Owner onboarding submit error:", err);
      req.flash("errors", [{ msg: "Could not complete onboarding. Please request a new invite." }]);
      return res.redirect("/login");
    }
  }
};
