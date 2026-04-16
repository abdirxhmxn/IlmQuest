const fs = require("node:fs/promises");
const cloudinary = require("../middleware/cloudinary");
const Announcement = require("../models/Announcement");
const Class = require("../models/Class");
const { isHtmlRequest } = require("../middleware/validate");
const { scopedQuery } = require("../utils/tenant");
const {
  buildActorSnapshot,
  toAnnouncementViewModel
} = require("../utils/announcements");

function toSafeRedirect(req, fallback = "/teacher/library") {
  return req.get("Referrer") || req.get("Referer") || fallback;
}

function appendFlash(req, type, message) {
  if (!req?.flash) return;
  if (type === "errors") req.flash("errors", [{ msg: message }]);
  else req.flash(type, message);
}

function sendMutationResult(req, res, {
  success,
  message,
  statusCode = 200,
  redirectPath = "/teacher/library",
  data = null,
  errorCode = null
}) {
  if (isHtmlRequest(req)) {
    appendFlash(req, success ? "success" : "errors", message);
    return res.status(success ? 302 : statusCode).redirect(redirectPath);
  }

  return res.status(statusCode).json({
    success,
    message,
    error: errorCode || null,
    data
  });
}

function renderTeacherLibrary(req, res, viewModel) {
  return res.render("teacher/teacherLibrary", viewModel, (err, html) => {
    if (err) {
      console.error("Teacher library render error:", err);
      if (!res.headersSent) {
        return res.status(500).send("Error loading teacher library.");
      }
      return null;
    }
    return res.send(html);
  });
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalizeText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function isCloudinaryConfigured() {
  if (typeof cloudinary.isConfigured === "function") {
    return cloudinary.isConfigured();
  }
  return Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME)
    && (process.env.CLOUDINARY_API_KEY || process.env.API_KEY)
    && (process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET)
  );
}

async function cleanupUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_err) {
    // Temp files are best-effort cleanup.
  }
}

function normalizeExternalUrl(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return { value: "", isValid: true };

  try {
    const parsed = new URL(trimmed);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return { value: "", isValid: false };
    }
    return { value: parsed.toString(), isValid: true };
  } catch (_err) {
    return { value: "", isValid: false };
  }
}

function resolveTargetClassIds(rawInput, ownedClassIds = []) {
  const ownedSet = new Set(ownedClassIds.map(String));
  const requested = toArray(rawInput)
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  if (!requested.length || requested.includes("all")) {
    return {
      classIds: [...ownedSet],
      error: ""
    };
  }

  const uniqueRequested = Array.from(new Set(requested));
  const unauthorized = uniqueRequested.filter((id) => !ownedSet.has(id));
  if (unauthorized.length) {
    return {
      classIds: [],
      error: "You can only publish resources to classes assigned to you."
    };
  }

  return {
    classIds: uniqueRequested,
    error: uniqueRequested.length ? "" : "Please select at least one class."
  };
}

async function getTeacherClasses(req) {
  return Class.find(scopedQuery(req, {
    "teachers._id": req.user._id
  }))
    .select("_id className classCode")
    .sort({ className: 1, classCode: 1 })
    .lean();
}

module.exports = {
  getTeacherLibrary: async (req, res) => {
    try {
      const [teacherClasses, resourcesRaw] = await Promise.all([
        getTeacherClasses(req),
        Announcement.find({
          schoolId: req.schoolId,
          announcementType: "library_resource",
          "createdBy._id": req.user._id,
          status: { $ne: "archived" }
        })
          .sort({ isPublished: -1, createdAt: -1 })
          .limit(100)
          .lean()
      ]);

      const classNameById = new Map(
        teacherClasses.map((classDoc) => [
          String(classDoc._id),
          classDoc.className || classDoc.classCode || "Class"
        ])
      );

      const libraryResources = resourcesRaw.map((resourceDoc) => {
        const viewModel = toAnnouncementViewModel(resourceDoc);
        const classNames = (viewModel.targetClassIds || [])
          .map((id) => classNameById.get(String(id)) || null)
          .filter(Boolean);

        return {
          ...viewModel,
          classNames
        };
      });

      return renderTeacherLibrary(req, res, {
        user: req.user,
        messages: typeof req.flash === "function" ? req.flash() : {},
        teacherClasses: teacherClasses.map((classDoc) => ({
          id: String(classDoc._id),
          className: classDoc.className || "Class",
          classCode: classDoc.classCode || ""
        })),
        libraryResources
      });
    } catch (err) {
      console.error("Teacher library page error:", err);
      return res.status(500).send("Error loading teacher library.");
    }
  },

  createTeacherLibraryResource: async (req, res) => {
    const uploadedPath = req.file?.path;
    let uploadedCloudinaryId = "";

    try {
      if (req.fileValidationError) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 422,
          message: req.fileValidationError,
          errorCode: "LIBRARY_IMAGE_VALIDATION_FAILED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const teacherClasses = await getTeacherClasses(req);
      const ownedClassIds = teacherClasses.map((classDoc) => String(classDoc._id));

      if (!ownedClassIds.length) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 403,
          message: "No assigned classes found. Ask an admin to assign you to a class before publishing resources.",
          errorCode: "NO_TEACHER_CLASSES",
          redirectPath: "/teacher/library"
        });
      }

      const title = normalizeText(req.body.title, 160);
      const description = normalizeText(req.body.description, 4000);
      const normalizedUrl = normalizeExternalUrl(req.body.externalUrl);
      const classSelection = resolveTargetClassIds(req.body.targetClassIds, ownedClassIds);

      if (!title) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Resource title is required.",
          errorCode: "LIBRARY_TITLE_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!description) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Description is required.",
          errorCode: "LIBRARY_DESCRIPTION_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!normalizedUrl.isValid) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Please provide a valid external link starting with http:// or https://",
          errorCode: "LIBRARY_URL_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (classSelection.error) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 403,
          message: classSelection.error,
          errorCode: "LIBRARY_CLASS_SCOPE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      let imageUrl = "";

      if (req.file) {
        if (!isCloudinaryConfigured()) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 503,
            message: "Image upload is not configured right now. Please use a link-only resource or configure Cloudinary.",
            errorCode: "LIBRARY_UPLOAD_NOT_CONFIGURED",
            redirectPath: toSafeRedirect(req)
          });
        }

        const uploadResult = await cloudinary.uploader.upload(uploadedPath, {
          folder: "ilmquest/library-resources",
          resource_type: "image"
        });
        imageUrl = uploadResult?.secure_url || "";
        uploadedCloudinaryId = uploadResult?.public_id || "";
      }

      if (!imageUrl && !normalizedUrl.value) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Add either an image or an external link before publishing.",
          errorCode: "LIBRARY_CONTENT_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const now = new Date();
      const actor = buildActorSnapshot(req.user);

      await Announcement.create({
        schoolId: req.schoolId,
        announcementType: "library_resource",
        title,
        content: description,
        summary: description.slice(0, 320),
        imageUrl,
        imageCloudinaryId: uploadedCloudinaryId,
        externalUrl: normalizedUrl.value,
        visibilityMode: "scoped",
        targetRoles: ["student"],
        targetClassIds: classSelection.classIds,
        targetStudentIds: [],
        targetParentIds: [],
        targetTeacherIds: [],
        priority: "info",
        status: "published",
        isPublished: true,
        publishAt: now,
        publishedAt: now,
        createdBy: actor,
        updatedBy: actor
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Library resource published successfully.",
        redirectPath: "/teacher/library"
      });
    } catch (err) {
      if (uploadedCloudinaryId) {
        await cloudinary.uploader.destroy(uploadedCloudinaryId).catch(() => null);
      }
      console.error("Teacher library publish error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to publish library resource.",
        errorCode: "LIBRARY_PUBLISH_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    } finally {
      await cleanupUploadedFile(uploadedPath);
    }
  }
};
