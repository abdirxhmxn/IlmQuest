const ClassModel = require("../models/Class");
const {
  GradebookError,
  buildTeacherGradebookPage,
  buildClassGradebookView,
  persistGradeEvent,
  undoGradebookCell,
  bulkSaveGradebookCells,
  getCellHistoryView,
  createAssessment,
  createTrackerColumn,
  buildGradebookCsv,
  buildStudentSummaryExport
} = require("../services/gradingV1");
const { scopedIdQuery } = require("../utils/tenant");

function isHtmxRequest(req) {
  return String(req.get("HX-Request") || "").toLowerCase() === "true";
}

function wantsJsonResponse(req) {
  const acceptHeader = (req.get("accept") || "").toLowerCase();
  return acceptHeader.includes("application/json")
    || String(req.get("X-IlmQuest-Async") || "").toLowerCase() === "true";
}

function serializeEvent(event = {}) {
  return {
    id: String(event?._id || ""),
    coordinateKey: String(event?.coordinateKey || ""),
    stableCellKey: [
      String(event?.studentId || ""),
      String(event?.category || "").trim().toLowerCase(),
      String(event?.columnKey || "").trim(),
      String(event?.dateKey || "").trim(),
      String(event?.assessmentId || "")
    ].join("|"),
    category: String(event?.category || ""),
    dateKey: String(event?.dateKey || ""),
    columnKey: String(event?.columnKey || ""),
    assessmentId: String(event?.assessmentId || ""),
    action: String(event?.action || ""),
    sequenceNumber: Number(event?.sequenceNumber || 0),
    mark: {
      key: String(event?.mark?.key || ""),
      symbol: String(event?.mark?.symbol || ""),
      label: String(event?.mark?.label || ""),
      normalizedValue: Number.isFinite(Number(event?.mark?.normalizedValue)) ? Number(event.mark.normalizedValue) : null,
      countsTowardGrade: event?.mark?.countsTowardGrade !== false
    }
  };
}

function buildCellToneFromEvent(event = {}) {
  const score = Number(event?.mark?.normalizedValue);
  if (!event?.mark?.key || !Number.isFinite(score) || event?.mark?.countsTowardGrade === false || String(event?.action || "").toLowerCase() === "clear") {
    return "empty";
  }
  if (score >= 0.85) return "excellent";
  if (score >= 0.65) return "strong";
  if (score >= 0.4) return "watch";
  return "critical";
}

function formatSummaryPercent(value, multiply = true) {
  if (!Number.isFinite(Number(value))) return "—";
  const numeric = multiply ? Number(value) * 100 : Number(value);
  return `${numeric.toFixed(1)}%`;
}

function serializeSummary(summary = {}) {
  const categoryTotals = summary?.categoryTotals || {};
  return {
    cashar: { value: Number.isFinite(Number(categoryTotals.cashar?.average)) ? Number(categoryTotals.cashar.average) : null, display: formatSummaryPercent(categoryTotals.cashar?.average) },
    writing: { value: Number.isFinite(Number(categoryTotals.writing?.average)) ? Number(categoryTotals.writing.average) : null, display: formatSummaryPercent(categoryTotals.writing?.average) },
    subject: { value: Number.isFinite(Number(categoryTotals.subject?.average)) ? Number(categoryTotals.subject.average) : null, display: formatSummaryPercent(categoryTotals.subject?.average) },
    subac: { value: Number.isFinite(Number(categoryTotals.subac?.average)) ? Number(categoryTotals.subac.average) : null, display: formatSummaryPercent(categoryTotals.subac?.average) },
    attendance: { value: Number.isFinite(Number(categoryTotals.attendance?.average)) ? Number(categoryTotals.attendance.average) : null, display: formatSummaryPercent(categoryTotals.attendance?.average) },
    behavior: { value: Number.isFinite(Number(categoryTotals.behavior?.average)) ? Number(categoryTotals.behavior.average) : null, display: formatSummaryPercent(categoryTotals.behavior?.average) },
    assessment: { value: Number.isFinite(Number(categoryTotals.assessment?.average)) ? Number(categoryTotals.assessment.average) : null, display: formatSummaryPercent(categoryTotals.assessment?.average) },
    final: { value: Number.isFinite(Number(summary?.finalPercentage)) ? Number(summary.finalPercentage) : null, display: formatSummaryPercent(summary?.finalPercentage, false) }
  };
}

function extractRequestDebug(req, payload = {}) {
  return {
    sessionUser: {
      id: String(req.user?._id || ""),
      role: String(req.user?.role || ""),
      userName: String(req.user?.userName || "")
    },
    tenant: {
      schoolId: String(req.schoolId || req.user?.schoolId || "")
    },
    payload: {
      classId: String(payload.classId || payload.activeClassId || ""),
      activeClassId: String(payload.activeClassId || ""),
      studentId: String(payload.studentId || ""),
      category: String(payload.category || ""),
      subcategory: String(payload.subcategory || payload.columnKey || ""),
      schoolDate: String(payload.schoolDate || payload.dateKey || ""),
      keyValue: String(payload.keyValue || payload.markKey || ""),
      gradingPeriodId: String(payload.gradingPeriodId || ""),
      assessmentId: String(payload.assessmentId || ""),
      clientEventId: String(payload.clientEventId || ""),
      hasCsrfToken: Boolean(payload._csrf || req.get("X-CSRF-Token"))
    },
    request: {
      contentType: String(req.get("content-type") || ""),
      accept: String(req.get("accept") || ""),
      isHtmx: isHtmxRequest(req),
      wantsJson: wantsJsonResponse(req)
    }
  };
}

function normalizeOperationalError(err) {
  if (err instanceof GradebookError) return err;

  if (err?.name === "ValidationError") {
    return new GradebookError("Invalid gradebook payload.", 400, {
      validation: Object.keys(err.errors || {})
    });
  }

  if (err?.code === 11000) {
    return new GradebookError("A duplicate gradebook write was detected. Please retry once.", 409, {
      keyPattern: err.keyPattern || {}
    });
  }

  if (err?.name === "CastError") {
    return new GradebookError(`Invalid value for field: ${err.path || "unknown"}.`, 400, {
      path: err.path,
      value: String(err.value || "")
    });
  }

  if (err?.name === "MongoServerError" || err?.name === "MongoError") {
    return new GradebookError("A database error occurred while saving the grade.", 500, {
      code: err.code,
      codeName: err.codeName
    });
  }

  return err;
}

function respondWithGradebookError(req, res, err) {
  const normalizedError = normalizeOperationalError(err);
  const status = Number(normalizedError?.status || 500);
  const message = normalizedError instanceof GradebookError
    ? normalizedError.message
    : "Something went wrong while processing the gradebook request.";

  console.error("[grading-v1] request failed:", {
    method: req.method,
    path: req.originalUrl,
    status,
    message,
    requestContext: extractRequestDebug(req, req.body || req.query || {}),
    error: normalizedError?.stack || normalizedError
  });

  if (isHtmxRequest(req)) {
    return res.status(status).type("text/plain").send(message);
  }

  if (wantsJsonResponse(req)) {
    return res.status(status).json({
      success: false,
      message,
      details: normalizedError?.details || {}
    });
  }

  req.flash("errors", [{ msg: message }]);
  return res.status(status).redirect(req.get("Referrer") || req.get("Referer") || "/teacher/manage-grades");
}

async function renderStudentRowResponse(req, res, context, studentId, message = "") {
  const classDoc = await ClassModel.findOne(scopedIdQuery(req, context.classDoc._id)).lean();
  const classView = await buildClassGradebookView(req, {
    classDoc,
    periodDoc: context.periodDoc
  });
  const student = (classView.students || []).find((entry) => String(entry.id) === String(studentId));

  if (!student) {
    throw new GradebookError("Student row could not be refreshed.", 404);
  }

  if (isHtmxRequest(req)) {
    res.set(
      "HX-Trigger-After-Swap",
      JSON.stringify({
        gradebookRowState: {
          classId: classView.id,
          studentId: student.id,
          rowState: student,
          message
        }
      })
    );
    return res.render("partials/gradebook/teacherGradebookRow.ejs", {
      classView,
      student
    });
  }

  return res.json({
    success: true,
    message,
    classId: classView.id,
    studentId: student.id,
    rowState: student
  });
}

module.exports = {
  getTeacherGradebook: async (req, res, next) => {
    try {
      const gradebookPage = await buildTeacherGradebookPage(req);
      return res.render("teacher/teacherGrades.ejs", {
        user: req.user,
        gradebookPage,
        messages: req.flash()
      });
    } catch (err) {
      return next(err);
    }
  },

  saveGradebookCell: async (req, res) => {
    try {
      console.info("[grading-v1] save cell request:", extractRequestDebug(req, req.body || {}));
      const result = await persistGradeEvent(req, req.body || {});
      if (wantsJsonResponse(req) && !isHtmxRequest(req)) {
        return res.json({
          success: true,
          message: "Grade saved.",
          classId: String(result.context.classDoc?._id || ""),
          studentId: String(result.context.studentDoc?._id || ""),
          gradingPeriodId: String(result.context.periodDoc?._id || ""),
          coordinateKey: result.coordinateKey,
          event: serializeEvent(result.event),
          updatedCell: {
            coordinateKey: result.coordinateKey,
            markKey: String(result.event?.mark?.key || ""),
            displayValue: String(result.event?.mark?.symbol || ""),
            label: String(result.event?.mark?.label || ""),
            tone: buildCellToneFromEvent(result.event),
            cssClass: `is-${buildCellToneFromEvent(result.event)}`
          },
          updatedRowSummary: serializeSummary(result.summary)
        });
      }
      return renderStudentRowResponse(
        req,
        res,
        result.context,
        result.context.studentDoc._id,
        "Grade saved."
      );
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  saveGradebookCellDetail: async (req, res) => {
    try {
      console.info("[grading-v1] save cell detail request:", extractRequestDebug(req, req.body || {}));
      const result = await persistGradeEvent(req, req.body || {});
      const detailView = await getCellHistoryView(req, req.body || {});
      if (wantsJsonResponse(req) && !isHtmxRequest(req)) {
        return res.json({
          success: true,
          message: "Cell details saved.",
          classId: String(result.context.classDoc?._id || ""),
          studentId: String(result.context.studentDoc?._id || ""),
          gradingPeriodId: String(result.context.periodDoc?._id || ""),
          coordinateKey: result.coordinateKey,
          event: serializeEvent(result.event),
          updatedCell: {
            coordinateKey: result.coordinateKey,
            markKey: String(result.event?.mark?.key || ""),
            displayValue: String(result.event?.mark?.symbol || ""),
            label: String(result.event?.mark?.label || ""),
            tone: buildCellToneFromEvent(result.event),
            cssClass: `is-${buildCellToneFromEvent(result.event)}`
          },
          updatedRowSummary: serializeSummary(result.summary),
          detail: detailView
        });
      }
      const classDoc = await ClassModel.findOne(scopedIdQuery(req, result.context.classDoc._id)).lean();
      const classView = await buildClassGradebookView(req, {
        classDoc,
        periodDoc: result.context.periodDoc
      });
      const rowState = (classView.students || []).find(
        (student) => String(student.id) === String(result.context.studentDoc._id)
      );

      if (isHtmxRequest(req)) {
        res.set(
          "HX-Trigger-After-Swap",
          JSON.stringify({
            gradebookRowState: {
              classId: classView.id,
              studentId: String(result.context.studentDoc._id),
              rowState,
              message: "Cell details saved."
            }
          })
        );
        return res.render("partials/gradebook/teacherGradebookDrawerContent.ejs", {
          detail: detailView,
          savedMessage: "Cell details saved."
        });
      }

      return res.json({
        success: true,
        message: "Cell details saved.",
        detail: detailView
      });
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  undoGradebookCell: async (req, res) => {
    try {
      console.info("[grading-v1] undo cell request:", extractRequestDebug(req, req.body || {}));
      const result = await undoGradebookCell(req, req.body || {});
      if (wantsJsonResponse(req) && !isHtmxRequest(req)) {
        return res.json({
          success: true,
          message: "Last cell change undone.",
          classId: String(result.context.classDoc?._id || ""),
          studentId: String(result.context.studentDoc?._id || ""),
          gradingPeriodId: String(result.context.periodDoc?._id || ""),
          coordinateKey: result.coordinateKey,
          event: serializeEvent(result.event),
          updatedCell: {
            coordinateKey: result.coordinateKey,
            markKey: String(result.event?.mark?.key || ""),
            displayValue: String(result.event?.mark?.symbol || ""),
            label: String(result.event?.mark?.label || ""),
            tone: buildCellToneFromEvent(result.event),
            cssClass: `is-${buildCellToneFromEvent(result.event)}`
          },
          updatedRowSummary: serializeSummary(result.summary)
        });
      }
      return renderStudentRowResponse(
        req,
        res,
        result.context,
        result.context.studentDoc._id,
        "Last cell change undone."
      );
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  getGradebookCellDetail: async (req, res) => {
    try {
      const detail = await getCellHistoryView(req, req.query || {});
      if (isHtmxRequest(req)) {
        return res.render("partials/gradebook/teacherGradebookDrawerContent.ejs", {
          detail,
          savedMessage: ""
        });
      }
      return res.json({
        success: true,
        detail
      });
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  bulkSaveGradebookCells: async (req, res) => {
    try {
      const results = await bulkSaveGradebookCells(req, req.body || {});
      return res.json({
        success: true,
        message: `${results.length} grade entries saved.`,
        count: results.length
      });
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  createAssessment: async (req, res) => {
    try {
      await createAssessment(req, req.body || {});
      req.flash("success", ["Assessment column created."]);
      return res.redirect("/teacher/manage-grades");
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  createTrackerColumn: async (req, res) => {
    try {
      const result = await createTrackerColumn(req, req.body || {});
      req.flash("success", ["Subac revision column added."]);
      const classId = String(result?.classId || req.body?.classId || "");
      const dateKey = String(result?.dateKey || req.body?.dateKey || "");
      const redirect = classId
        ? `/teacher/manage-grades?activeClassId=${classId}${dateKey ? `&focusDate=${dateKey}` : ""}`
        : "/teacher/manage-grades";
      return res.redirect(redirect);
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  exportGradebookCsv: async (req, res) => {
    try {
      const csv = await buildGradebookCsv(req, {
        classId: req.query?.classId || req.params?.classId
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"ilmquest-gradebook.csv\"");
      return res.send(csv);
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  },

  exportStudentSummaryJson: async (req, res) => {
    try {
      const payload = await buildStudentSummaryExport(req, {
        classId: req.query?.classId || req.params?.classId,
        studentId: req.query?.studentId || req.params?.studentId
      });
      return res.json(payload);
    } catch (err) {
      return respondWithGradebookError(req, res, err);
    }
  }
};
