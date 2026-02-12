const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/User");

module.exports = function (passport) {
  
  // Local Login Strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await User.findOne({ email: email.toLowerCase() });

          if (!user) {
            return done(null, false, { msg: "No account found with that email." });
          }

          const isMatch = await user.comparePassword(password);

          if (!isMatch) {
            return done(null, false, { msg: "Incorrect password." });
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

      const query = { _id: id };
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
