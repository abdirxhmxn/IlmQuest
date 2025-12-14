const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");

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
  try {
    const validationErrors = [];
    if (!validator.isEmail(req.body.email))
      validationErrors.push({ msg: "Please enter a valid email address." });
    if (!validator.isLength(req.body.password, { min: 8 }))
      validationErrors.push({
        msg: "Password must be at least 8 characters long",
      });

    if (req.body.password !== req.body.confirmPassword)
      validationErrors.push({ msg: "Passwords do not match" });

    if (validationErrors.length) {
      req.flash("errors", validationErrors);
      return res.redirect("../signup");
    }

    req.body.email = validator.normalizeEmail(req.body.email, {
      gmail_remove_dots: false,
    });
    const existingUser = await User.findOne({
      $or: [
        { email: req.body.email },
        { userName: req.body.userName }
      ],
    });
    if (existingUser) {
      req.flash("errors", {
        msg: "Account with that email address or username already exists.",
      });
      return res.redirect("../signup");
    }
    const user = new User({
      userName: req.body.userName,
      email: req.body.email,
      password: req.body.password,
    });
    await user.save();
    // Login user (Passport still uses callback here — this is OK)
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect("/main");
    });

  } catch (err) {
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
