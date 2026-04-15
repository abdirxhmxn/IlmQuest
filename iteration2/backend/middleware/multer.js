const multer = require("multer");
const path = require("path");

module.exports = multer({
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  storage: multer.diskStorage({}),
  fileFilter: (req, file, cb) => {
    const ext = String(path.extname(file.originalname || "")).toLowerCase();
    const mimeType = String(file.mimetype || "").toLowerCase();
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png"];
    const allowedExtensions = [".jpg", ".jpeg", ".png"];

    if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mimeType)) {
      req.fileValidationError = "Only JPG and PNG image files are allowed.";
      return cb(null, false);
    }
    cb(null, true);
  },
});
