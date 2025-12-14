const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const homeController = require("../controllers/home");
const postsController = require("../controllers/posts");
const { ensureAuth, ensureGuest } = require("../middleware/auth");
const posts = require("../controllers/posts");


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
router.post("/login", authController.postLogin);
router.post("/signup", authController.postSignup);

// =============================================
// 3. GLOBAL AUTHENTICATED ROUTES (All Roles)
// =============================================
router.get("/profile", ensureAuth, homeController.getProfile);
router.get("/feed", ensureAuth, postsController.getFeed);

// =============================================
// 4. ADMIN ROUTES
// =============================================

// --- GET ---
router.get("/admin/home", ensureAuth, homeController.getAdmin);
router.get("/admin/users", ensureAuth, homeController.getUsers);
router.get("/admin/classes", ensureAuth, homeController.getClasses);

// --- POST (Create) ---
router.post("/admin/students/add", ensureAuth, postsController.createStudent);
router.post("/admin/teachers/add", ensureAuth, postsController.createTeacher);
router.post("/admin/parents/add", ensureAuth, postsController.createParent);
router.post("/admin/classes/add", ensureAuth, postsController.createClass);

// --- PUT (Assign) ---
router.put("/admin/assign/student-to-parent", ensureAuth, postsController.assignParentToStudent);
router.put("/admin/assign/student-to-class", ensureAuth, postsController.assignStudentToClass);
router.put("/student/missions/begin", ensureAuth, postsController.updateStudentMission);
router.put("/student/missions/complete", ensureAuth, postsController.completeStudentMission);

// --- DELETE ---
router.delete("/admin/users/:id", ensureAuth, postsController.deleteUser);
router.delete("/admin/classes/delete/:id", ensureAuth, postsController.deleteClass);
// =============================================
// 5. TEACHER ROUTES
// =============================================

// --- GET ---
router.get("/teacher/home", ensureAuth, homeController.getTeacher);
router.get("/teacher/manage-grades", ensureAuth, homeController.getTeacherGrades);
router.get("/teacher/manage-missions", ensureAuth, homeController.getTeacherMissions);
router.get("/teacher/manage-attendance", ensureAuth, homeController.getTeacherAttendance);

// --- POST (Create) ---
router.post("/teacher/manage-missions/create-mission", ensureAuth, postsController.createMission);
router.post("/teacher/manage-attendance/save", ensureAuth, postsController.createAttendance);

// Grade Routes (both paths supported for now)
router.post("/teacher/manage-grades/add", ensureAuth, postsController.createGrade);
router.post("/teacher/grades/add", ensureAuth, postsController.createGrade); // Legacy support

// =============================================
// 6. STUDENT ROUTES
// =============================================

// --- GET ---
router.get("/student/home", ensureAuth, homeController.getMainPage);
router.get("/student/grades", ensureAuth, homeController.getGrades);
router.get("/student/missions", ensureAuth, homeController.getStudentMissions);
router.get("/student/library", ensureAuth, homeController.getLibrary);

// =============================================
// 7. PARENT ROUTES
// =============================================

// --- GET ---
router.get("/parent/home", ensureAuth, homeController.getParent);

// =============================================
// 8. FUTURE: Split into separate route files (Recommended)
// =============================================
// adminRoutes.js → teacherRoutes.js → studentRoutes.js → parentRoutes.js
// Then: router.use("/admin", adminRoutes); etc.

module.exports = router;