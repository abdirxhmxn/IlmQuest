module.exports = {
  ensureAuth: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    } else {
      res.redirect("/");
    }
  },
  requireTenant: function (req, res, next) {
    if (!req.isAuthenticated() || !req.user || !req.user.schoolId) {
      return res.status(401).send("Unauthorized");
    }
    req.schoolId = req.user.schoolId;
    return next();
  }
  // ensureGuest: function (req, res, next) {
  //   if (!req.isAuthenticated()) {
  //     return next();
  //   } else {
  //     res.redirect("/");
  //   }
  // },
};
