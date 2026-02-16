const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");
const School = require("../models/School");
const { normalizeEmail, mapDuplicateKeyError } = require("../utils/userIdentifiers");

exports.getLogin = (req, res) => {
  if (req.user) {
    return res.redirect("/profile");
  }
  res.render("login", {
    title: "Login",
  });
};

exports.postLogin = (req, res, next) => {
  const validationErrors = [];
  if (!validator.isEmail(req.body.email))
    validationErrors.push({ msg: "Please enter a valid email address." });
  if (validator.isEmpty(req.body.password))
    validationErrors.push({ msg: "Password cannot be blank." });

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("/login");
  }
  req.body.email = normalizeEmail(req.body.email);

  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash("errors", info);
      return res.redirect("/login");
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error("LOGIN ERROR:", err);
        return next(err);
      }



      req.session.save((err) => {
        if (err) {
          return next(err);
        }
        if (req.user.role === 'admin') {
          return res.redirect('/admin/home')
        } else if (req.user.role === 'teacher') {
          return res.redirect('/teacher/home')
        } else {
          return res.redirect("/student/home")
        }
      });
    });
  })(req, res, next); // << ADD next HERE

};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      console.log('Error during logout:', err);
      return res.redirect("/");
    }
    console.log('User has logged out.');

    req.session.destroy((err) => {
      if (err) {
        console.log("Error: Failed to destroy the session during logout.", err);
      }
      res.clearCookie('connect.sid'); // Clear the session cookie
      res.redirect("/");
    });
  });
};


exports.getSignup = (req, res) => {
  if (req.user) {
    const role = req.user.role;

    const routes = {
      admin: "/admin/home",
      teacher: "/teacher/home",
      student: "/student/home"
    };

    return res.redirect(routes[role]);
  }

  return res.render("signup.ejs", { title: "Create Account" });
};


exports.postSignup = async (req, res, next) => {
  let createdSchoolId = null;

  try {
    const submittedUserName = (req.body.userName || req.body.adminUser || "").trim();
    const schoolName = (req.body.schoolName || "").trim();
    const adminName = (req.body.adminName || "").trim();
    const phone = (req.body.phone || "").trim();

    const validationErrors = [];

    if (validator.isEmpty(schoolName)) {
      validationErrors.push({ msg: "School name is required." });
    }
    if (validator.isEmpty(adminName)) {
      validationErrors.push({ msg: "Administrator name is required." });
    }
    if (!validator.isEmail(req.body.email || "")) {
      validationErrors.push({ msg: "Please enter a valid email address." });
    }
    if (validator.isEmpty(submittedUserName)) {
      validationErrors.push({ msg: "Username is required." });
    }
    if (validator.isEmpty(phone)) {
      validationErrors.push({ msg: "Phone number is required." });
    }
    if (!validator.isLength(req.body.password || "", { min: 8 })) {
      validationErrors.push({ msg: "Password must be at least 8 characters long." });
    }
    if ((req.body.adminUser || "") !== (req.body.confirmUsername || "")) {
      validationErrors.push({ msg: "Usernames do not match." });
    }
    if ((req.body.password || "") !== (req.body.confirmPassword || "")) {
      validationErrors.push({ msg: "Passwords do not match." });
    }

    if (validationErrors.length) {
      req.flash("errors", validationErrors);
      return res.redirect("../signup");
    }

    req.body.email = normalizeEmail(req.body.email);

    const email = req.body.email;
    const username = submittedUserName;

    // Type-specific duplicate checks
    const [
      existingSchoolName,
      existingSchoolEmail,
    ] = await Promise.all([
      School.findOne({ schoolName }),
      School.findOne({ schoolEmail: email }),
    ]);

    const dupErrors = [];
    if (existingSchoolName) dupErrors.push({ msg: "That school name is already taken." });
    if (existingSchoolEmail) dupErrors.push({ msg: "That school email is already in use." });

    if (dupErrors.length) {
      req.flash("errors", dupErrors);
      return res.redirect("../signup");
    }

    // Create School
    const school = new School({
      schoolName,
      schoolEmail: email,
      // NOTE: Consider removing password from School entirely.
      password: req.body.password,
      adminUser: username,
      contactEmail: email,
      contactPhone: phone,
    });

    await school.save();
    createdSchoolId = school._id;

    // Create Admin User
    const [firstName, ...lastNameParts] = adminName.split(" ");
    const user = new User({
      schoolId: school._id,
      userName: username,
      email,
      password: req.body.password,
      role: "admin",
      firstName: firstName || "",
      lastName: lastNameParts.join(" "),
    });

    await user.save();

    // Do NOT auto-login. Force manual login.
    req.flash("success", { msg: "Account created successfully. Please log in." });
    return res.redirect("/login");
  } catch (err) {
    try {
      if (createdSchoolId) {
        await School.deleteOne({ _id: createdSchoolId });
      }
    } catch (cleanupErr) {
      // ignore cleanup errors; original error is more important
    }

    if (err && err.code === 11000) {
      const conflict = mapDuplicateKeyError(err);
      req.flash("errors", [{ msg: conflict?.message || "A unique identifier already exists for this school." }]);
      return res.redirect("../signup");
    }

    return next(err);
  }
};
exports.putResetPassword = async (req, res, next) => {
  try {

    const password = req.body["new-password"];
    const confirmPassword = req.body["confirm-password"];

    const user = await User.findOne({ _id: req.user._id, schoolId: req.schoolId, deletedAt: null }).select("+password");
    if (!user) {
      req.flash("errors", { msg: "User not found." });
      return res.redirect("/reset-password");
    }

    const validationErrors = [];
    if (!validator.isLength(password || "", { min: 8 })) {
      validationErrors.push({ msg: "Password must be at least 8 characters long." });
    }
    if ((password || "") !== (confirmPassword || "")) {
      validationErrors.push({ msg: "Passwords do not match." });
    }

    if (validationErrors.length) {
      req.flash("errors", validationErrors);
      return res.redirect("/reset-password");
    }

    user.password = password;
    await user.save();

    req.flash("success", { msg: "Password updated successfully." });
    return res.redirect("/login");
  } catch (err) {
    console.error("Error in putResetPassword:", err);
    req.flash("errors", { msg: "An error occurred while resetting the password. Please try again." });
    return res.redirect("/reset-password");
  }
};
// User.findOne(
//   { $or: [{ email: req.body.email }, { userName: req.body.userName }] },
//   (err, existingUser) => {
//     if (err) {
//       return next(err);
//     }
//     if (existingUser) {
//       req.flash("errors", {
//         msg: "Account with that email address or username already exists.",
//       });
//       return res.redirect("../signup");
//     }
//     user.save((err) => {
//       if (err) {
//         return next(err);
//       }
//       req.logIn(user, (err) => {
//         if (err) {
//           return next(err);
//         }
//         res.redirect("/main");
//       });
//     });
//   }
// );

//   } catch (err) {
//   console.log('error')
// }
// };
