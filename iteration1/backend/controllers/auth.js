const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");
const School = require("../models/School");

exports.getLogin = (req, res) => {
  if (req.user) {
    return res.redirect("/profile");
  }
  res.render("login", {
    title: "Login",
  });
};

exports.postLogin = (req, res, next) => {
  console.log(" LOGIN POST HIT:", req.body);

  const validationErrors = [];
  if (!validator.isEmail(req.body.email))
    validationErrors.push({ msg: "Please enter a valid email address." });
  if (validator.isEmpty(req.body.password))
    validationErrors.push({ msg: "Password cannot be blank." });

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("/login");
  }
  req.body.email = validator.normalizeEmail(req.body.email, {
    gmail_remove_dots: false,
  });

  passport.authenticate("local", (err, user, info) => {
    console.log("AUTH CALLBACK USER:", user);

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

    if (validator.isEmpty(schoolName))
      validationErrors.push({ msg: "School name is required." });
    if (validator.isEmpty(adminName))
      validationErrors.push({ msg: "Administrator name is required." });
    if (!validator.isEmail(req.body.email))
      validationErrors.push({ msg: "Please enter a valid email address." });
    if (validator.isEmpty(submittedUserName))
      validationErrors.push({ msg: "Username is required." });
    if (validator.isEmpty(phone))
      validationErrors.push({ msg: "Phone number is required." });
    if (!validator.isLength(req.body.password, { min: 8 }))
      validationErrors.push({
        msg: "Password must be at least 8 characters long",
      });
    if (req.body.adminUser !== req.body.confirmUsername)
      validationErrors.push({ msg: "Usernames do not match" });

    if (req.body.password !== req.body.confirmPassword)
      validationErrors.push({ msg: "Passwords do not match" });

    if (validationErrors.length) {
      req.flash("errors", validationErrors);
      return res.redirect("../signup");
    }

    req.body.email = validator.normalizeEmail(req.body.email, {
      gmail_remove_dots: false,
    });
    const [existingUser, existingSchool] = await Promise.all([
      User.findOne({
        $or: [{ email: req.body.email }, { userName: submittedUserName }],
      }),
      School.findOne({
        $or: [{ schoolName }, { schoolEmail: req.body.email }],
      }),
    ]);

    if (existingUser || existingSchool) {
      req.flash("errors", {
        msg: "Account with that school name, email address, or username already exists.",
      });
      return res.redirect("../signup");
    }

    const school = new School({
      schoolName,
      schoolEmail: req.body.email,
      password: req.body.password,
      adminUser: submittedUserName,
      contactEmail: req.body.email,
      contactPhone: phone,
    });

    await school.save();
    createdSchoolId = school._id;

    const [firstName, ...lastNameParts] = adminName.split(" ");
    const user = new User({
      schoolId: school._id,
      userName: submittedUserName,
      email: req.body.email,
      password: req.body.password,
      role: "admin",
      firstName: firstName || "",
      lastName: lastNameParts.join(" "),
    });
    await user.save();

    // Login user after signup
    req.logIn(school, (err) => {
      if (err) return next(err);
      res.redirect("/login");
    });

  } catch (err) {
    if (createdSchoolId) {
      await School.deleteOne({ _id: createdSchoolId });
    }
    if (err.code === 11000) {
      req.flash("errors", {
        msg: "Duplicate value found for school, email, or username.",
      });
      return res.redirect("../signup");
    }
    return next(err);
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
