const crypto = require("crypto");
const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");
const School = require("../models/School");
const env = require("../config/env");
const { sendPasswordResetEmail, isMailerConfigured } = require("../utils/mailer");
const {
  normalizeEmail
} = require("../utils/userIdentifiers");
const {
  FORCE_PASSWORD_CHANGE_ROUTE,
  hasPendingPasswordSetup,
  clearPasswordSetupFlags
} = require("../utils/passwordSetup");

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, you will receive a password reset link shortly.";
const PUBLIC_SIGNUP_BLOCK_MESSAGE = "Public school signup is disabled. Please contact IlmQuest support for school provisioning.";

function getRoleHome(role) {
  const routes = {
    superAdmin: "/platform/home",
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
    if (hasPendingPasswordSetup(req.user)) {
      return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
    }
    return res.redirect(getRoleHome(req.user.role));
  }
  return res.render("login", { title: "Login" });
};

exports.postLogin = (req, res, next) => {
  const validationErrors = [];
  const identifier = String(req.body.identifier || req.body.email || "").trim();
  if (validator.isEmpty(identifier)) {
    validationErrors.push({ msg: "Email or username is required." });
  }
  if (validator.isEmpty(req.body.password || "")) {
    validationErrors.push({ msg: "Password cannot be blank." });
  }

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("/login");
  }

  req.body.identifier = identifier;
  if (req.body.schoolName !== undefined) {
    req.body.schoolName = String(req.body.schoolName || "").trim();
  }
  if (req.body.school !== undefined) {
    req.body.school = String(req.body.school || "").trim();
  }
  if (req.body.schoolId !== undefined) {
    req.body.schoolId = String(req.body.schoolId || "").trim();
  }

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
        if (hasPendingPasswordSetup(req.user)) {
          return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
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
    if (hasPendingPasswordSetup(req.user)) {
      return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
    }
    return res.redirect(getRoleHome(req.user.role));
  }

  const acceptsHtml = (req.get("accept") || "").toLowerCase().includes("text/html");
  if (acceptsHtml) {
    return res.status(404).render("signupDisabled", {
      title: "Signup Disabled",
      message: PUBLIC_SIGNUP_BLOCK_MESSAGE
    });
  }
  return res.status(404).json({
    error: "NOT_FOUND",
    message: PUBLIC_SIGNUP_BLOCK_MESSAGE
  });
};

exports.postSignup = async (req, res) => {
  const acceptsHtml = (req.get("accept") || "").toLowerCase().includes("text/html");
  if (acceptsHtml) {
    return res.status(403).render("signupDisabled", {
      title: "Signup Disabled",
      message: PUBLIC_SIGNUP_BLOCK_MESSAGE
    });
  }
  return res.status(403).json({
    error: "PUBLIC_SIGNUP_DISABLED",
    message: PUBLIC_SIGNUP_BLOCK_MESSAGE
  });
};

exports.getForgotPassword = (req, res) => {
  if (req.user) {
    if (hasPendingPasswordSetup(req.user)) {
      return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
    }
    if (String(req.user.role || "") === "superAdmin") {
      return res.redirect(getRoleHome(req.user.role));
    }
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
      const schoolIdList = Array.from(
        new Set(
          users
            .map((account) => (account.schoolId ? String(account.schoolId) : ""))
            .filter(Boolean)
        )
      );
      const schools = schoolIdList.length
        ? await School.find({ _id: { $in: schoolIdList } }).select("_id schoolName").lean()
        : [];
      const schoolNameById = new Map(
        schools.map((schoolDoc) => [String(schoolDoc._id), schoolDoc.schoolName || "School"])
      );

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
          schoolName: account.schoolId ? (schoolNameById.get(String(account.schoolId)) || "") : "",
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
    clearPasswordSetupFlags(user);
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
    clearPasswordSetupFlags(user);
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

exports.getForcePasswordChange = (req, res) => {
  return res.render("forcePasswordChange.ejs", {
    title: "Password Update Required"
  });
};

exports.putForcePasswordChange = async (req, res) => {
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
      return res.redirect("/login");
    }

    if (!hasPendingPasswordSetup(user)) {
      return res.redirect(getRoleHome(user.role));
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
      return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
    }

    user.password = password;
    clearPasswordSetupFlags(user);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    req.flash("success", "Password updated. Welcome to your dashboard.");
    return res.redirect(getRoleHome(user.role));
  } catch (err) {
    console.error("Error in putForcePasswordChange:", err);
    req.flash("errors", [{ msg: "An error occurred while updating your password. Please try again." }]);
    return res.redirect(FORCE_PASSWORD_CHANGE_ROUTE);
  }
};
