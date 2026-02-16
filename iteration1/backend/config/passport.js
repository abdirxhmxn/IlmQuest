const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/User");
const { normalizeEmail } = require("../utils/userIdentifiers");

module.exports = function (passport) {
  const genericAuthFailure = "Invalid email or password. If needed, sign in with your school code.";

  // Local Login Strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passReqToCallback: true },
      async (req, email, password, done) => {
        try {
          const emailNormalized = normalizeEmail(email);
          const schoolId = req.body?.schoolId ? String(req.body.schoolId).trim() : "";
          let user = null;

          if (schoolId) {
            user = await User.findOne({
              schoolId,
              emailNormalized,
              deletedAt: null
            });
          } else {
            const candidates = await User.find({
              emailNormalized,
              deletedAt: null
            }).limit(2);

            if (candidates.length === 1) {
              user = candidates[0];
            } else if (candidates.length > 1) {
              const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              console.warn("[AUTH_AMBIGUOUS_EMAIL]", {
                requestId,
                ip: req.ip,
                emailHashHint: emailNormalized.slice(0, 3)
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
