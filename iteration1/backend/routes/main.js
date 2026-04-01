const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const homeController = require("../controllers/home");
const parentController = require("../controllers/parent");
const announcementsController = require("../controllers/announcements");
const financeController = require("../controllers/finance");
const postsController = require("../controllers/posts");
const profileController = require("../controllers/profile");
const upload = require("../middleware/multer");
const { ensureAuth, requireTenant, requireRole } = require("../middleware/auth");
const {
  loginLimiter,
  signupLimiter,
  recoveryLimiter,
  resetLimiter,
  adminMutationLimiter,
  reportGenerationLimiter,
  financeSyncLimiter
} = require("../middleware/rateLimit");
const {
  requireFields,
  validateEmailField,
  validateObjectIdParam
} = require("../middleware/validate");
const ALL_ROLES = ["admin", "teacher", "student", "parent"];


// =============================================
// 1. PUBLIC ROUTES (No Auth Required)
// =============================================
router.get("/", homeController.getIndex);
router.get("/login", authController.getLogin);
router.get("/signup", authController.getSignup);
router.get("/logout", authController.logout);
router.get("/forgot-password", authController.getForgotPassword);

// =============================================
// 2. AUTH ROUTES
// =============================================
router.post("/login", loginLimiter, requireFields(["email", "password"]), validateEmailField("email"), authController.postLogin);
router.post(
  "/signup",
  signupLimiter,
  requireFields(["schoolName", "adminName", "email", "phone", "adminUser", "confirmUsername", "password", "confirmPassword"]),
  validateEmailField("email"),
  authController.postSignup
);
router.post(
  "/forgot-password",
  recoveryLimiter,
  requireFields(["email"]),
  validateEmailField("email"),
  authController.postForgotPassword
);
router.get("/reset-password/:token", authController.getResetPasswordByToken);
router.post(
  "/reset-password/:token",
  resetLimiter,
  requireFields(["new-password", "confirm-password"]),
  authController.postResetPasswordByToken
);

// =============================================
// 2a. AUTH ROUTES (Password Reset)
// =============================================
router.get("/reset-password", ensureAuth, requireTenant, requireRole(...ALL_ROLES), homeController.getResetPassword);
router.put(
  "/reset-password",
  ensureAuth,
  requireTenant,
  requireRole(...ALL_ROLES),
  resetLimiter,
  requireFields(["new-password", "confirm-password"]),
  authController.putResetPassword
);
// =============================================
// 3. GLOBAL AUTHENTICATED ROUTES (All Roles)
// =============================================
router.get("/profile", ensureAuth, requireTenant, requireRole(...ALL_ROLES), profileController.getProfile);
router.post("/profile/update", ensureAuth, requireTenant, requireRole(...ALL_ROLES), profileController.updateProfile);
router.post(
  "/profile/avatar",
  ensureAuth,
  requireTenant,
  requireRole("admin"),
  upload.single("avatar"),
  profileController.updateProfileAvatar
);
router.post(
  "/profile/avatar/remove",
  ensureAuth,
  requireTenant,
  requireRole("admin"),
  profileController.removeProfileAvatar
);
router.get("/feed", ensureAuth, requireTenant, requireRole(...ALL_ROLES), postsController.getFeed);

// =============================================
// 4. ADMIN ROUTES
// =============================================
router.use("/admin", ensureAuth, requireTenant, requireRole("admin"));
const adminMutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
router.use("/admin", (req, res, next) => {
  if (!adminMutationMethods.has(String(req.method || "").toUpperCase())) {
    return next();
  }
  return adminMutationLimiter(req, res, next);
});

// --- GET ---
router.get("/admin/home", homeController.getAdmin);
router.get("/admin/users", homeController.getUsers);
router.get("/admin/classes", homeController.getClasses);
router.get("/admin/attendance", homeController.getAdminAttendance);
router.get("/admin/announcements", announcementsController.getAdminAnnouncements);
router.get("/admin/reports", homeController.getAdminReports);
router.get("/admin/finance", financeController.getAdminFinance);
router.get("/admin/finance/summary", financeController.getAdminFinanceSummary);
router.get("/admin/reports/stats", homeController.getAdminReportStats);
router.get("/admin/reports/student/:id/pdf", validateObjectIdParam("id"), homeController.downloadStudentReportPdf);
router.get("/admin/reports/class/:id/pdf", validateObjectIdParam("id"), homeController.downloadClassReportPdf);

// --- POST (Create) ---
router.post("/admin/students/add", requireFields(["firstName", "lastName", "email", "userName", "password", "gradeLevel", "programType"]), validateEmailField("email"), postsController.createStudent);
router.post("/admin/teachers/add", requireFields(["firstName", "lastName", "email", "userName", "password"]), validateEmailField("email"), postsController.createTeacher);
router.post("/admin/parents/add", requireFields(["firstName", "lastName", "email", "userName", "password"]), validateEmailField("email"), postsController.createParent);
router.post("/admin/classes/add", requireFields(["className"]), postsController.createClass);
router.post("/admin/school", requireFields(["schoolName", "schoolEmail", "password", "adminUser"]), validateEmailField("schoolEmail"), postsController.createSchool);
router.post("/admin/reports/student/:id/generate", reportGenerationLimiter, validateObjectIdParam("id"), homeController.generateStudentReportPdfAsync);
router.post("/admin/reports/class/:id/generate", reportGenerationLimiter, validateObjectIdParam("id"), homeController.generateClassReportPdfAsync);
router.post("/admin/announcements", requireFields(["title", "content"]), announcementsController.createAnnouncement);
router.post("/admin/announcements/:id/update", validateObjectIdParam("id"), requireFields(["title", "content"]), announcementsController.updateAnnouncement);
router.post("/admin/announcements/:id/publish", validateObjectIdParam("id"), announcementsController.toggleAnnouncementPublish);
router.post("/admin/announcements/:id/pin", validateObjectIdParam("id"), announcementsController.toggleAnnouncementPin);
router.post("/admin/announcements/:id/archive", validateObjectIdParam("id"), announcementsController.archiveAnnouncement);
router.post("/admin/finance/categories", requireFields(["entryType", "label"]), financeController.createCategory);
router.post("/admin/finance/entries", requireFields(["entryType", "amount", "occurredAt"]), financeController.createEntry);
router.post("/admin/finance/payments", requireFields(["parentId", "expectedAmount", "dueDate"]), financeController.createManualPayment);
router.post("/admin/finance/bank/link-token", financeController.createBankLinkToken);
router.post("/admin/finance/bank/connect", financeSyncLimiter, requireFields(["publicToken"]), financeController.connectBankAccount);
router.post("/admin/finance/bank/sync", financeSyncLimiter, financeController.syncBankTransactions);
router.post("/admin/finance/reconcile", requireFields(["bankTransactionId", "action"]), financeController.reconcileBankTransaction);

// --- PUT/PATCH (Update + Assign) ---
router.put("/admin/assign/student-to-parent", requireFields(["parentID", "studentID"]), postsController.assignParentToStudent);
router.put("/admin/assign/student-to-class", requireFields(["classID", "studentID"]), postsController.assignStudentToClass);
router.patch("/admin/users/:id", validateObjectIdParam("id"), postsController.patchUser);
router.put("/admin/users/:id", validateObjectIdParam("id"), postsController.patchUser);
router.post(
  "/admin/users/:id/avatar",
  validateObjectIdParam("id"),
  upload.single("avatar"),
  postsController.updateUserAvatar
);
router.post(
  "/admin/users/:id/avatar/remove",
  validateObjectIdParam("id"),
  postsController.removeUserAvatar
);
router.put("/admin/parents/:id/children", validateObjectIdParam("id"), postsController.updateParentChildrenAssignments);
router.patch("/admin/classes/:id", validateObjectIdParam("id"), postsController.patchClass);
router.post("/admin/classes/:id/customize", validateObjectIdParam("id"), requireFields(["teacherId"]), postsController.updateTeacherClassCustomizationByAdmin);
router.post("/admin/finance/entries/:id/archive", validateObjectIdParam("id"), financeController.archiveEntry);

// --- DELETE ---
router.delete("/admin/users/:id", validateObjectIdParam("id"), postsController.deleteUser);
router.delete("/admin/classes/delete/:id", validateObjectIdParam("id"), postsController.deleteClass);
router.patch("/admin/users/:id/restore", validateObjectIdParam("id"), postsController.restoreUser);
router.patch("/admin/classes/:id/restore", validateObjectIdParam("id"), postsController.restoreClass);
// =============================================
// 5. TEACHER ROUTES
// =============================================
router.use("/teacher", ensureAuth, requireTenant, requireRole("teacher"));

// --- GET ---
router.get("/teacher/home", homeController.getTeacher);
router.get("/teacher/manage-grades", homeController.getTeacherGrades);
router.get("/teacher/manage-missions", homeController.getTeacherMissions);
router.get("/teacher/manage-attendance", homeController.getTeacherAttendance);
router.get("/teacher/customize", homeController.getTeacherCustomization);

// --- POST (Create) ---
router.post("/teacher/manage-missions/create-mission", requireFields(["missionTitle", "missionDescription", "type", "category", "rank"]), postsController.createMission);
router.post("/teacher/manage-attendance/save", requireFields(["classId", "studentId", "date", "status"]), postsController.createAttendance);
router.post("/teacher/customize/:id", validateObjectIdParam("id"), postsController.updateTeacherClassCustomization);

// Grade Routes (both paths supported for now)
router.post("/teacher/manage-grades/add", requireFields(["student", "classId", "subject", "quarter"]), postsController.createGrade);
router.post("/teacher/grades/add", requireFields(["student", "classId", "subject", "quarter"]), postsController.createGrade); // Legacy support

// =============================================
// 6. STUDENT ROUTES
// =============================================
router.use("/student", ensureAuth, requireTenant, requireRole("student"));

// --- GET ---
router.get("/student/home", homeController.getMainPage);
router.get("/student/grades", homeController.getGrades);
router.get("/student/missions", homeController.getStudentMissions);
router.get("/student/library", homeController.getLibrary);
router.put("/student/missions/begin", requireFields(["missionId"]), postsController.updateStudentMission);
router.put("/student/missions/complete", requireFields(["missionId"]), postsController.completeStudentMission);
// =============================================
// 7. PARENT ROUTES
// =============================================
router.use("/parent", ensureAuth, requireTenant, requireRole("parent"));

// --- GET ---
router.get("/parent/home", parentController.getDashboard);
router.get("/parent/child/:id", validateObjectIdParam("id"), parentController.getChildDashboard);
router.get("/parent/reports/:studentId/download", validateObjectIdParam("studentId"), parentController.downloadStudentReportPdf);
router.post("/parent/payments/checkout", parentController.requestPaymentCheckout);

// =============================================
// 8. FUTURE: Split into separate route files (Recommended)
// =============================================
// adminRoutes.js → teacherRoutes.js → studentRoutes.js → parentRoutes.js
// Then: router.use("/admin", adminRoutes); etc.

module.exports = router;
