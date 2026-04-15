const LocalStrategy = require("passport-local").Strategy;
const mongoose = require("mongoose");
const User = require("../models/User");
const School = require("../models/School");
const { normalizeEmail, normalizeUserName } = require("../utils/userIdentifiers");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveSchoolIdFromLoginContext(req) {
  const directSchoolId = String(req.body?.schoolId || "").trim();
  if (directSchoolId) {
    if (mongoose.Types.ObjectId.isValid(directSchoolId)) {
      return { schoolId: directSchoolId, scoped: true };
    }
    return { schoolId: "", scoped: true };
  }

  const schoolNameInput = String(req.body?.schoolName || req.body?.school || "").trim();
  if (!schoolNameInput) return { schoolId: "", scoped: false };

  const schoolDoc = await School.findOne({
    schoolName: { $regex: `^${escapeRegex(schoolNameInput)}$`, $options: "i" }
  })
    .select("_id")
    .lean();

  return {
    schoolId: schoolDoc?._id ? String(schoolDoc._id) : "",
    scoped: true
  };
}

module.exports = function (passport) {
  const genericAuthFailure = "Invalid credentials. Please check your email/username, password, and school name (if used).";

  // Local Login Strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "identifier", passReqToCallback: true },
      async (req, identifierInput, password, done) => {
        try {
          const identifier = String(identifierInput || req.body?.email || "").trim();
          if (!identifier) {
            return done(null, false, { msg: genericAuthFailure });
          }
          const isEmailIdentifier = identifier.includes("@");
          const emailNormalized = isEmailIdentifier ? normalizeEmail(identifier) : "";
          const userNameNormalized = !isEmailIdentifier ? normalizeUserName(identifier) : "";
          const { schoolId, scoped } = await resolveSchoolIdFromLoginContext(req);
          let user = null;

          if (scoped && !schoolId) {
            return done(null, false, { msg: genericAuthFailure });
          }

          if (schoolId) {
            const schoolQuery = {
              schoolId,
              deletedAt: null
            };
            if (isEmailIdentifier) {
              schoolQuery.emailNormalized = emailNormalized;
            } else {
              schoolQuery.userNameNormalized = userNameNormalized;
            }
            user = await User.findOne(schoolQuery).select("+password");
          } else {
            const superAdminQuery = { role: "superAdmin", deletedAt: null };
            if (isEmailIdentifier) {
              superAdminQuery.emailNormalized = emailNormalized;
            } else {
              superAdminQuery.userNameNormalized = userNameNormalized;
            }
            const superAdminAccount = await User.findOne(superAdminQuery).select("+password");
            if (superAdminAccount) {
              user = superAdminAccount;
            }
          }

          if (!user && !schoolId) {
            const globalQuery = {
              deletedAt: null
            };
            if (isEmailIdentifier) {
              globalQuery.emailNormalized = emailNormalized;
            } else {
              globalQuery.userNameNormalized = userNameNormalized;
            }

            const candidates = await User.find(globalQuery).select("+password").limit(2);

            if (candidates.length === 1) {
              user = candidates[0];
            } else if (candidates.length > 1) {
              const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              console.warn("[AUTH_AMBIGUOUS_IDENTIFIER]", {
                requestId,
                ip: req.ip,
                identifierHashHint: (isEmailIdentifier ? emailNormalized : userNameNormalized).slice(0, 3),
                identifierType: isEmailIdentifier ? "email" : "username"
              });
            }
          }

          if (!user) {
            return done(null, false, { msg: genericAuthFailure });
          }

          const isMatch = await user.comparePassword(password);

          if (!isMatch) {
            return done(null, false, { msg: genericAuthFailure });
          }

          console.log("🔥 USER AUTHENTICATED");
          return done(null, user);

        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // Write user.id into the session cookie
  passport.serializeUser((user, done) => {
    done(null, {
      id: user._id.toString(),
      schoolId: user.schoolId ? user.schoolId.toString() : null,
    });
  });

  // Convert session cookie id back into a user object
  passport.deserializeUser(async (sessionUser, done) => {
    try {
      const id = typeof sessionUser === "object" ? sessionUser.id : sessionUser;
      const sessionSchoolId =
        typeof sessionUser === "object" ? sessionUser.schoolId : null;

      const query = { _id: id, deletedAt: null };
      if (sessionSchoolId) {
        query.schoolId = sessionSchoolId;
      }

      // lean() returns a plain object (not a Mongoose document)
      const user = await User.findOne(query).lean();
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
