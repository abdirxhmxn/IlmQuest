const crypto = require("crypto");
const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");
const School = require("../models/School");
const env = require("../config/env");
const { sendPasswordResetEmail, isMailerConfigured } = require("../utils/mailer");
const { normalizeEmail, mapDuplicateKeyError } = require("../utils/userIdentifiers");

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, you will receive a password reset link shortly.";

function getRoleHome(role) {
  const routes = {
    admin: "/admin/home",
    teacher: "/teacher/home",
    parent: "/parent/home",
    student: "/student/home"
  };

  return routes[role] || "/student/home";
}

function createResetTokenPair() {
  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

function getResetTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function isValidResetToken(token) {
  return RESET_TOKEN_PATTERN.test(String(token || ""));
}

function appBaseUrl(req) {
  if (env.APP_BASE_URL) {
    return env.APP_BASE_URL.replace(/\/+$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
}

exports.getLogin = (req, res) => {
  if (req.user) {
    return res.redirect("/profile");
  }
  return res.render("login", { title: "Login" });
};

exports.postLogin = (req, res, next) => {
  const validationErrors = [];
  if (!validator.isEmail(req.body.email || "")) {
    validationErrors.push({ msg: "Please enter a valid email address." });
  }
  if (validator.isEmpty(req.body.password || "")) {
    validationErrors.push({ msg: "Password cannot be blank." });
  }

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("/login");
  }

  req.body.email = normalizeEmail(req.body.email);

  return passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash("errors", info);
      return res.redirect("/login");
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("LOGIN ERROR:", loginErr);
        return next(loginErr);
      }

      req.session.save((sessionErr) => {
        if (sessionErr) {
          return next(sessionErr);
        }
        return res.redirect(getRoleHome(req.user.role));
      });
    });
  })(req, res, next);
};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      console.log("Error during logout:", err);
      return res.redirect("/");
    }
    console.log("User has logged out.");

    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.log("Error: Failed to destroy the session during logout.", sessionErr);
      }
      res.clearCookie("connect.sid");
      return res.redirect("/");
    });
  });
};

exports.getSignup = (req, res) => {
  if (req.user) {
    return res.redirect(getRoleHome(req.user.role));
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

    const [existingSchoolName, existingSchoolEmail] = await Promise.all([
      School.findOne({ schoolName }),
      School.findOne({ schoolEmail: email })
    ]);

    const dupErrors = [];
    if (existingSchoolName) dupErrors.push({ msg: "That school name is already taken." });
    if (existingSchoolEmail) dupErrors.push({ msg: "That school email is already in use." });

    if (dupErrors.length) {
      req.flash("errors", dupErrors);
      return res.redirect("../signup");
    }

    const school = new School({
      schoolName,
      schoolEmail: email,
      password: req.body.password,
      adminUser: username,
      contactEmail: email,
      contactPhone: phone
    });

    await school.save();
    createdSchoolId = school._id;

    const [firstName, ...lastNameParts] = adminName.split(" ");
    const user = new User({
      schoolId: school._id,
      userName: username,
      email,
      password: req.body.password,
      role: "admin",
      firstName: firstName || "",
      lastName: lastNameParts.join(" ")
    });

    await user.save();

    req.flash("info", [{ msg: "Account created successfully. Please log in." }]);
    return res.redirect("/login");
  } catch (err) {
    try {
      if (createdSchoolId) {
        await School.deleteOne({ _id: createdSchoolId });
      }
    } catch (cleanupErr) {
      console.error("Failed to rollback school after signup error:", cleanupErr);
    }

    if (err && err.code === 11000) {
      const conflict = mapDuplicateKeyError(err);
      req.flash("errors", [{ msg: conflict?.message || "A unique identifier already exists for this school." }]);
      return res.redirect("../signup");
    }

    return next(err);
  }
};

exports.getForgotPassword = (req, res) => {
  if (req.user) {
    return res.redirect("/reset-password");
  }

  return res.render("forgotPassword.ejs", {
    title: "Forgot Password"
  });
};

exports.postForgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email || "");

    if (!isMailerConfigured()) {
      req.flash("errors", [{ msg: "Password reset email is currently unavailable. Please contact support." }]);
      return res.redirect("/forgot-password");
    }

    const users = await User.find({
      deletedAt: null,
      $or: [{ emailNormalized: email }, { email }]
    }).select("_id role schoolId");

    if (users.length) {
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      const resetLinks = [];

      for (const account of users) {
        const { rawToken, tokenHash } = createResetTokenPair();
        await User.updateOne(
          { _id: account._id, deletedAt: null },
          {
            $set: {
              resetPasswordTokenHash: tokenHash,
              resetPasswordExpiresAt: expiresAt
            }
          }
        );

        resetLinks.push({
          role: account.role,
          schoolId: account.schoolId ? String(account.schoolId) : "",
          resetUrl: `${appBaseUrl(req)}/reset-password/${rawToken}`
        });
      }

      let emailResult;
      try {
        emailResult = await sendPasswordResetEmail({
          to: email,
          resetLinks,
          expiresAt
        });
      } catch (mailErr) {
        console.error("Failed to send password reset email:", mailErr);
        req.flash("errors", [{ msg: "We could not send the reset email right now. Please try again shortly." }]);
        return res.redirect("/forgot-password");
      }

      if (!emailResult || emailResult.sent !== true) {
        console.error("Failed to send password reset email:", emailResult);
        req.flash("errors", [{ msg: "We could not send the reset email right now. Please try again shortly." }]);
        return res.redirect("/forgot-password");
      }
    }

    req.flash("info", [{ msg: FORGOT_PASSWORD_MESSAGE }]);
    return res.redirect("/forgot-password");
  } catch (err) {
    return next(err);
  }
};

exports.getResetPasswordByToken = async (req, res, next) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!isValidResetToken(token)) {
      req.flash("errors", [{ msg: "This password reset link is invalid or has expired." }]);
      return res.redirect("/forgot-password");
    }

    const tokenHash = getResetTokenHash(token);
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
      deletedAt: null
    }).select("_id");

    if (!user) {
      req.flash("errors", [{ msg: "This password reset link is invalid or has expired." }]);
      return res.redirect("/forgot-password");
    }

    return res.render("resetPasswordToken.ejs", {
      title: "Set New Password",
      token
    });
  } catch (err) {
    return next(err);
  }
};

exports.postResetPasswordByToken = async (req, res, next) => {
  try {
    const token = String(req.params.token || "").trim();
    const password = req.body["new-password"];
    const confirmPassword = req.body["confirm-password"];

    if (!isValidResetToken(token)) {
      req.flash("errors", [{ msg: "This password reset link is invalid or has expired." }]);
      return res.redirect("/forgot-password");
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
      return res.redirect(`/reset-password/${token}`);
    }

    const tokenHash = getResetTokenHash(token);
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
      deletedAt: null
    }).select("+password");

    if (!user) {
      req.flash("errors", [{ msg: "This password reset link is invalid or has expired." }]);
      return res.redirect("/forgot-password");
    }

    user.password = password;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    req.flash("info", [{ msg: "Your password was reset successfully. Please sign in." }]);
    return res.redirect("/login");
  } catch (err) {
    return next(err);
  }
};

exports.putResetPassword = async (req, res) => {
  try {
    const password = req.body["new-password"];
    const confirmPassword = req.body["confirm-password"];

    const user = await User.findOne({
      _id: req.user._id,
      schoolId: req.schoolId,
      deletedAt: null
    }).select("+password");

    if (!user) {
      req.flash("errors", [{ msg: "User not found." }]);
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
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    req.flash("info", [{ msg: "Password updated successfully. Please sign in again." }]);
    return res.redirect("/login");
  } catch (err) {
    console.error("Error in putResetPassword:", err);
    req.flash("errors", [{ msg: "An error occurred while resetting the password. Please try again." }]);
    return res.redirect("/reset-password");
  }
};
