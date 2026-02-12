const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const homeController = require("../controllers/home");
const postsController = require("../controllers/posts");
const { ensureAuth, requireTenant, requireRole } = require("../middleware/auth");
const { loginLimiter, signupLimiter, resetLimiter } = require("../middleware/rateLimit");
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
router.get("/profile", ensureAuth, requireTenant, requireRole(...ALL_ROLES), homeController.getProfile);
router.get("/feed", ensureAuth, requireTenant, requireRole(...ALL_ROLES), postsController.getFeed);

// =============================================
// 4. ADMIN ROUTES
// =============================================
router.use("/admin", ensureAuth, requireTenant, requireRole("admin"));

// --- GET ---
router.get("/admin/home", homeController.getAdmin);
router.get("/admin/users", homeController.getUsers);
router.get("/admin/classes", homeController.getClasses);

// --- POST (Create) ---
router.post("/admin/students/add", requireFields(["firstName", "lastName", "email", "userName", "password", "gradeLevel", "programType"]), validateEmailField("email"), postsController.createStudent);
router.post("/admin/teachers/add", requireFields(["firstName", "lastName", "email", "userName", "password", "employeeId"]), validateEmailField("email"), postsController.createTeacher);
router.post("/admin/parents/add", requireFields(["firstName", "lastName", "email", "userName", "password"]), validateEmailField("email"), postsController.createParent);
router.post("/admin/classes/add", requireFields(["className"]), postsController.createClass);
router.post("/admin/school", requireFields(["schoolName", "schoolEmail", "password", "adminUser"]), validateEmailField("schoolEmail"), postsController.createSchool);

// --- PUT (Assign) ---
router.put("/admin/assign/student-to-parent", requireFields(["parentID", "studentID"]), postsController.assignParentToStudent);
router.put("/admin/assign/student-to-class", requireFields(["classID", "studentID"]), postsController.assignStudentToClass);

// --- DELETE ---
router.delete("/admin/users/:id", validateObjectIdParam("id"), postsController.deleteUser);
router.delete("/admin/classes/delete/:id", validateObjectIdParam("id"), postsController.deleteClass);
// =============================================
// 5. TEACHER ROUTES
// =============================================
router.use("/teacher", ensureAuth, requireTenant, requireRole("teacher"));

// --- GET ---
router.get("/teacher/home", homeController.getTeacher);
router.get("/teacher/manage-grades", homeController.getTeacherGrades);
router.get("/teacher/manage-missions", homeController.getTeacherMissions);
router.get("/teacher/manage-attendance", homeController.getTeacherAttendance);

// --- POST (Create) ---
router.post("/teacher/manage-missions/create-mission", requireFields(["missionTitle", "missionDescription", "type", "category", "rank"]), postsController.createMission);
router.post("/teacher/manage-attendance/save", requireFields(["classId", "studentId", "date", "status"]), postsController.createAttendance);

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
router.get("/parent/home", homeController.getParent);

// =============================================
// 8. FUTURE: Split into separate route files (Recommended)
// =============================================
// adminRoutes.js → teacherRoutes.js → studentRoutes.js → parentRoutes.js
// Then: router.use("/admin", adminRoutes); etc.

module.exports = router;
