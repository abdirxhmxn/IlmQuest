const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const postsController = require("../controllers/posts");
const { ensureAuth, requireTenant, requireRole } = require("../middleware/auth");
const { validateObjectIdParam, requireFields } = require("../middleware/validate");

//Post Routes - simplified for now
router.use(ensureAuth, requireTenant, requireRole("admin", "teacher", "student", "parent"));

router.get("/:id", validateObjectIdParam("id"), postsController.getPost);

router.post("/createPost", requireFields(["title", "caption"]), upload.single("file"), postsController.createPost);

router.put("/likePost/:id", validateObjectIdParam("id"), postsController.likePost);

router.delete("/deletePost/:id", validateObjectIdParam("id"), postsController.deletePost);

module.exports = router;
