const Announcement = require("../models/Announcement");
const { isHtmlRequest } = require("../middleware/validate");
const { logAdminAction, simpleDiff } = require("../utils/audit");
const {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_ROLES,
  buildActorSnapshot,
  isAnnouncementExpired,
  toAnnouncementViewModel,
  sortAnnouncementsForDisplay,
  getAnnouncementAudienceOptions,
  normalizeAndValidateAnnouncementInput
} = require("../utils/announcements");

function toSafeRedirect(req, fallback = "/admin/announcements") {
  return req.get("Referrer") || req.get("Referer") || fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toStatusFilter(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  const allowed = ["all", "active", "expired", "published", "draft", "archived"];
  return allowed.includes(normalized) ? normalized : "all";
}

function toSearchRegex(value) {
  const search = String(value || "").trim();
  if (!search) return null;
  return new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function buildAnnouncementAuditSnapshot(doc) {
  if (!doc) return {};
  return {
    _id: String(doc._id),
    title: doc.title,
    status: doc.status,
    isPublished: Boolean(doc.isPublished),
    isPinned: Boolean(doc.isPinned),
    visibilityMode: doc.visibilityMode,
    targetRoles: doc.targetRoles || [],
    targetClassIds: (doc.targetClassIds || []).map((id) => String(id)),
    targetStudentIds: (doc.targetStudentIds || []).map((id) => String(id)),
    targetParentIds: (doc.targetParentIds || []).map((id) => String(id)),
    targetTeacherIds: (doc.targetTeacherIds || []).map((id) => String(id)),
    publishAt: doc.publishAt || null,
    expiresAt: doc.expiresAt || null,
    priority: doc.priority
  };
}

function appendFlash(req, type, message) {
  if (!req?.flash) return;
  if (type === "errors") req.flash("errors", [{ msg: message }]);
  else req.flash(type, message);
}

function sendMutationResult(req, res, { success, message, statusCode = 200, redirectPath = "/admin/announcements", data = null, errorCode = null }) {
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

module.exports = {
  getAdminAnnouncements: async (req, res) => {
    try {
      const statusFilter = toStatusFilter(req.query.status);
      const searchQuery = String(req.query.q || "").trim();
      const page = toPositiveInt(req.query.page, 1);
      const pageSize = 30;
      const skip = (page - 1) * pageSize;
      const now = new Date();

      const query = { schoolId: req.schoolId };
      const searchRegex = toSearchRegex(searchQuery);

      if (statusFilter === "published") query.status = "published";
      if (statusFilter === "draft") query.status = "draft";
      if (statusFilter === "archived") query.status = "archived";
      if (statusFilter === "active") {
        query.status = "published";
        query.isPublished = true;
        query.$and = [
          { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] }
        ];
      }
      if (statusFilter === "expired") {
        query.status = "published";
        query.isPublished = true;
        query.expiresAt = { $lt: now };
      }

      if (searchRegex) {
        query.$or = [
          { title: searchRegex },
          { content: searchRegex },
          { summary: searchRegex }
        ];
      }

      const [total, announcements, audienceOptions] = await Promise.all([
        Announcement.countDocuments(query),
        Announcement.find(query)
          .sort({ isPinned: -1, publishAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        getAnnouncementAudienceOptions(req)
      ]);

      const announcementRows = sortAnnouncementsForDisplay(
        announcements.map((entry) => toAnnouncementViewModel(entry, audienceOptions.lookup))
      );

      const activeItems = announcementRows.filter((entry) => {
        if (!entry.isPublished || entry.status !== "published") return false;
        const raw = announcements.find((doc) => String(doc._id) === String(entry.id));
        const publishAt = raw?.publishAt ? new Date(raw.publishAt) : null;
        if (publishAt && !Number.isNaN(publishAt.getTime()) && publishAt > now) return false;
        return !entry.expired;
      });
      const expiredItems = announcementRows.filter((entry) => entry.isPublished && entry.status === "published" && entry.expired);
      const draftItems = announcementRows.filter((entry) => entry.status === "draft");
      const archivedItems = announcementRows.filter((entry) => entry.status === "archived");

      const editId = String(req.query.edit || "").trim();
      const editingAnnouncement = editId
        ? announcementRows.find((entry) => String(entry.id) === editId) || null
        : null;

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const pagination = {
        page,
        pageSize,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      };

      return res.render("admin/announcements.ejs", {
        user: req.user,
        activePage: "announcements",
        messages: req.flash(),
        announcementsPage: {
          activeItems,
          expiredItems,
          draftItems,
          archivedItems,
          activeCount: activeItems.length,
          expiredCount: expiredItems.length,
          draftCount: draftItems.length,
          archivedCount: archivedItems.length,
          allItems: announcementRows,
          filters: {
            status: statusFilter,
            q: searchQuery
          },
          pagination,
          editingAnnouncement
        },
        audienceOptions,
        announcementMeta: {
          roles: ANNOUNCEMENT_ROLES,
          priorities: ANNOUNCEMENT_PRIORITIES
        }
      });
    } catch (err) {
      console.error("Admin announcements page error:", err);
      return res.status(500).send("Error loading announcements.");
    }
  },

  createAnnouncement: async (req, res) => {
    try {
      const normalized = await normalizeAndValidateAnnouncementInput(req, req.body);
      if (!normalized.isValid) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: normalized.errors.join(" "),
          errorCode: "ANNOUNCEMENT_VALIDATION_FAILED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const actor = buildActorSnapshot(req.user);
      const createdDoc = await Announcement.create({
        schoolId: req.schoolId,
        ...normalized.clean,
        createdBy: actor
      });

      await logAdminAction(req, {
        action: "announcement_create",
        targetType: "Announcement",
        targetId: createdDoc._id,
        before: {},
        after: buildAnnouncementAuditSnapshot(createdDoc)
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Announcement created successfully.",
        redirectPath: "/admin/announcements"
      });
    } catch (err) {
      console.error("Announcement create error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to create announcement.",
        errorCode: "ANNOUNCEMENT_CREATE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  updateAnnouncement: async (req, res) => {
    try {
      const announcement = await Announcement.findOne({
        schoolId: req.schoolId,
        _id: req.params.id
      });

      if (!announcement) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Announcement not found.",
          errorCode: "ANNOUNCEMENT_NOT_FOUND",
          redirectPath: "/admin/announcements"
        });
      }

      const beforeSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      const normalized = await normalizeAndValidateAnnouncementInput(req, req.body, { existing: announcement });
      if (!normalized.isValid) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: normalized.errors.join(" "),
          errorCode: "ANNOUNCEMENT_VALIDATION_FAILED",
          redirectPath: `/admin/announcements?edit=${announcement._id}`
        });
      }

      Object.assign(announcement, normalized.clean);
      if (normalized.clean.status !== "published") {
        announcement.publishedAt = normalized.clean.status === "archived" ? announcement.publishedAt : null;
      }
      if (normalized.clean.status === "archived" && !announcement.archivedAt) {
        announcement.archivedAt = new Date();
      }
      if (normalized.clean.status !== "archived") {
        announcement.archivedAt = null;
      }

      await announcement.save();

      const afterSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      await logAdminAction(req, {
        action: "announcement_update",
        targetType: "Announcement",
        targetId: announcement._id,
        before: beforeSnapshot,
        after: afterSnapshot,
        diff: simpleDiff(beforeSnapshot, afterSnapshot)
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Announcement updated successfully.",
        redirectPath: "/admin/announcements"
      });
    } catch (err) {
      console.error("Announcement update error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to update announcement.",
        errorCode: "ANNOUNCEMENT_UPDATE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  toggleAnnouncementPublish: async (req, res) => {
    try {
      const announcement = await Announcement.findOne({
        schoolId: req.schoolId,
        _id: req.params.id
      });
      if (!announcement) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Announcement not found.",
          errorCode: "ANNOUNCEMENT_NOT_FOUND",
          redirectPath: "/admin/announcements"
        });
      }

      const beforeSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());

      const shouldPublish = String(req.body.publish || "").toLowerCase() === "true";
      if (shouldPublish) {
        announcement.status = "published";
        announcement.isPublished = true;
        announcement.publishAt = announcement.publishAt || new Date();
        announcement.publishedAt = announcement.publishedAt || new Date();
      } else {
        announcement.status = "draft";
        announcement.isPublished = false;
      }

      announcement.updatedBy = buildActorSnapshot(req.user);
      await announcement.save();

      const afterSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      await logAdminAction(req, {
        action: shouldPublish ? "announcement_publish" : "announcement_unpublish",
        targetType: "Announcement",
        targetId: announcement._id,
        before: beforeSnapshot,
        after: afterSnapshot,
        diff: simpleDiff(beforeSnapshot, afterSnapshot)
      });

      return sendMutationResult(req, res, {
        success: true,
        message: shouldPublish ? "Announcement published." : "Announcement moved to draft.",
        redirectPath: "/admin/announcements"
      });
    } catch (err) {
      console.error("Announcement publish toggle error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to change publication status.",
        errorCode: "ANNOUNCEMENT_PUBLISH_TOGGLE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  toggleAnnouncementPin: async (req, res) => {
    try {
      const announcement = await Announcement.findOne({
        schoolId: req.schoolId,
        _id: req.params.id
      });
      if (!announcement) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Announcement not found.",
          errorCode: "ANNOUNCEMENT_NOT_FOUND",
          redirectPath: "/admin/announcements"
        });
      }

      const beforeSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      announcement.isPinned = String(req.body.pin || "").toLowerCase() === "true";
      announcement.updatedBy = buildActorSnapshot(req.user);
      await announcement.save();

      const afterSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      await logAdminAction(req, {
        action: announcement.isPinned ? "announcement_pin" : "announcement_unpin",
        targetType: "Announcement",
        targetId: announcement._id,
        before: beforeSnapshot,
        after: afterSnapshot,
        diff: simpleDiff(beforeSnapshot, afterSnapshot)
      });

      return sendMutationResult(req, res, {
        success: true,
        message: announcement.isPinned ? "Announcement pinned." : "Announcement unpinned.",
        redirectPath: "/admin/announcements"
      });
    } catch (err) {
      console.error("Announcement pin toggle error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to change pin state.",
        errorCode: "ANNOUNCEMENT_PIN_TOGGLE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  archiveAnnouncement: async (req, res) => {
    try {
      const announcement = await Announcement.findOne({
        schoolId: req.schoolId,
        _id: req.params.id
      });
      if (!announcement) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Announcement not found.",
          errorCode: "ANNOUNCEMENT_NOT_FOUND",
          redirectPath: "/admin/announcements"
        });
      }

      const beforeSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      announcement.status = "archived";
      announcement.isPublished = false;
      announcement.isPinned = false;
      announcement.archivedAt = new Date();
      announcement.updatedBy = buildActorSnapshot(req.user);
      await announcement.save();

      const afterSnapshot = buildAnnouncementAuditSnapshot(announcement.toObject());
      await logAdminAction(req, {
        action: "announcement_archive",
        targetType: "Announcement",
        targetId: announcement._id,
        before: beforeSnapshot,
        after: afterSnapshot,
        diff: simpleDiff(beforeSnapshot, afterSnapshot)
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Announcement archived.",
        redirectPath: "/admin/announcements"
      });
    } catch (err) {
      console.error("Announcement archive error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Failed to archive announcement.",
        errorCode: "ANNOUNCEMENT_ARCHIVE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  }
};
