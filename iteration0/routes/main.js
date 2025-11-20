const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const homeController = require("../controllers/home");
const postsController = require("../controllers/posts");
const { ensureAuth, ensureGuest } = require("../middleware/auth");
const posts = require("../controllers/posts");

//Main Routes - simplified for now
router.get("/", homeController.getIndex);

router.get("/admin/home", homeController.getAdmin);
router.get("/admin/users", homeController.getUsers);

router.get("/teacher/home", ensureAuth, homeController.getTeacher);
router.get("/teacher/manage-grades", ensureAuth, homeController.getTeacherGrades);
router.get("/teacher/manage-missions", ensureAuth, homeController.getTeacherMissions);

router.get("/parent/home", ensureAuth, homeController.getParent);

router.get("/student/home", ensureAuth, homeController.getMainPage);

router.get("/admin/classes", homeController.getClasses);


router.get("/main/grades", ensureAuth, homeController.getGrades);
router.get("/profile", ensureAuth, homeController.getProfile);
router.get("/main/missions", ensureAuth, homeController.getMissions);
router.get("/main/library", ensureAuth, homeController.getLibrary);
router.get("/feed", ensureAuth, postsController.getFeed);
router.get("/login", authController.getLogin);
router.post("/login", authController.postLogin);
router.get("/logout", authController.logout);
router.get("/signup", authController.getSignup);
router.post("/signup", authController.postSignup);

// add users
router.post("/admin/students/add", ensureAuth, postsController.createStudent);
router.post("/admin/teachers/add", ensureAuth, postsController.createTeacher);
router.post("/admin/parents/add", ensureAuth, postsController.createParent);

// assign users
router.put("/admin/assign/student-to-parent", ensureAuth, postsController.assignParentToStudent);

//add class
router.post("/admin/classes/add", ensureAuth, postsController.createClass);

// assign users
router.put("/admin/assign/student-to-class", ensureAuth, postsController.assignStudentToClass);

//delete users
router.delete("/admin/users/:id", ensureAuth, postsController.deleteUser)

//create mission
router.post('/teacher/manage-grades/create-mission', ensureAuth, postsController.createMission)
module.exports = router;
