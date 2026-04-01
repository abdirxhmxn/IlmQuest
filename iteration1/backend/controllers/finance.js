const mongoose = require("mongoose");
const User = require("../models/User");
const Class = require("../models/Class");
const ParentPayment = require("../models/ParentPayment");
const FinanceCategory = require("../models/FinanceCategory");
const FinanceEntry = require("../models/FinanceEntry");
const FinanceBankConnection = require("../models/FinanceBankConnection");
const FinanceBankAccount = require("../models/FinanceBankAccount");
const FinanceBankTransaction = require("../models/FinanceBankTransaction");
const FinanceSyncLog = require("../models/FinanceSyncLog");
const { isHtmlRequest } = require("../middleware/validate");
const { scopedIdQuery, scopedQuery } = require("../utils/tenant");
const { logAdminAction, simpleDiff } = require("../utils/audit");
const bankProvider = require("../utils/bankProvider");
const { hasEncryptionSecret, encryptToken, decryptToken } = require("../utils/secureToken");
const {
  normalizeFinanceCategoryKey,
  buildActorSnapshot,
  ensureDefaultFinanceCategories,
  normalizeParentPaymentStatus,
  fetchFinanceData
} = require("../utils/finance");

const PAYMENT_STATUSES = new Set(["Due", "Partial", "Paid", "Overdue", "PendingProcessor"]);
const ENTRY_TYPES = new Set(["income", "expense"]);

function toSafeRedirect(req, fallback = "/admin/finance") {
  return req.get("Referrer") || req.get("Referer") || fallback;
}

function toPositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number(amount.toFixed(2));
}

function toDateValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toNullableObjectId(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value)) ? String(value) : null;
}

function appendFlash(req, type, message) {
  if (!req?.flash) return;
  if (type === "errors") req.flash("errors", [{ msg: message }]);
  else req.flash(type, message);
}

function sendMutationResult(req, res, { success, message, statusCode = 200, redirectPath = "/admin/finance", data = null, errorCode = null }) {
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

async function resolveScopedUser(req, userId, role = null) {
  if (!toNullableObjectId(userId)) return null;
  const criteria = role ? { _id: userId, role } : { _id: userId };
  return User.findOne(scopedQuery(req, criteria)).lean();
}

async function resolveScopedClass(req, classId) {
  if (!toNullableObjectId(classId)) return null;
  return Class.findOne(scopedQuery(req, { _id: classId })).lean();
}

async function resolveOrCreateCategory(req, actor, { entryType, categoryKey, categoryLabel }) {
  const normalizedType = String(entryType || "").trim().toLowerCase();
  if (!ENTRY_TYPES.has(normalizedType)) {
    const err = new Error("Invalid entry type.");
    err.code = "ENTRY_TYPE_INVALID";
    throw err;
  }

  const normalizedKey = normalizeFinanceCategoryKey(categoryKey || categoryLabel);
  const normalizedLabel = String(categoryLabel || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (!normalizedKey || !normalizedLabel) {
    const err = new Error("Category is required.");
    err.code = "CATEGORY_REQUIRED";
    throw err;
  }

  let existing = await FinanceCategory.findOne(
    scopedQuery(req, {
      entryType: normalizedType,
      key: normalizedKey
    })
  );

  if (!existing && normalizedLabel) {
    const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    existing = await FinanceCategory.findOne(
      scopedQuery(req, {
        entryType: normalizedType,
        label: { $regex: `^${escapedLabel}$`, $options: "i" }
      })
    );
  }

  if (existing) {
    if (!existing.active) {
      existing.active = true;
    }
    if (normalizedLabel && existing.label !== normalizedLabel) {
      existing.label = normalizedLabel;
    }
    existing.updatedBy = actor;
    await existing.save();
    return {
      categoryKey: existing.key,
      categoryLabel: existing.label
    };
  }

  const created = await FinanceCategory.create({
    schoolId: req.schoolId,
    entryType: normalizedType,
    key: normalizedKey,
    label: normalizedLabel,
    active: true,
    isDefault: false,
    createdBy: actor,
    updatedBy: actor
  });

  return {
    categoryKey: created.key,
    categoryLabel: created.label
  };
}

function buildParentFormRows(parents = [], studentLookup = new Map()) {
  return parents.map((parent) => {
    const fullName = `${parent.firstName || ""} ${parent.lastName || ""}`.trim() || parent.userName || "Parent";
    const children = Array.isArray(parent?.parentInfo?.children)
      ? parent.parentInfo.children
        .map((child) => {
          const childId = child?.childID ? String(child.childID) : "";
          if (!childId) return null;
          return {
            id: childId,
            name: child.childName || studentLookup.get(childId) || "Student"
          };
        })
        .filter(Boolean)
      : [];

    return {
      id: String(parent._id),
      name: fullName,
      children
    };
  });
}

function buildEmptyFinanceState() {
  return {
    monthLabel: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    summary: {
      monthlyIncome: 0,
      monthlyIncomeLabel: "$0.00",
      monthlyPaymentCollected: 0,
      monthlyPaymentCollectedLabel: "$0.00",
      monthlyExpense: 0,
      monthlyExpenseLabel: "$0.00",
      netCashFlow: 0,
      netCashFlowLabel: "$0.00",
      outstanding: 0,
      outstandingLabel: "$0.00",
      paidFamilies: 0,
      unpaidFamilies: 0,
      unmatchedCount: 0,
      matchedCount: 0,
      lastSyncAt: null,
      lastSyncAtLabel: "Never",
      lastSyncStatus: "never",
      lastSyncMessage: ""
    },
    categories: {
      income: [],
      expense: [],
      payment: []
    },
    payments: { rows: [] },
    entries: { rows: [], matchOptions: [] },
    bank: {
      connections: [],
      unmatchedRows: [],
      latestSync: null
    },
    revenueBreakdown: [],
    paymentMatchOptions: []
  };
}

async function buildFinancePagePayload(req) {
  let financeLoadError = "";

  try {
    await ensureDefaultFinanceCategories(req, req.user);
  } catch (err) {
    console.error("Finance category bootstrap error:", err);
    financeLoadError = "Could not seed finance categories.";
  }

  const [financeResult, parentResult, studentResult, classResult] = await Promise.allSettled([
    fetchFinanceData(req, { limit: 25 }),
    User.find(scopedQuery(req, { role: "parent" }))
      .select("_id firstName lastName userName parentInfo.children")
      .sort({ firstName: 1, lastName: 1 })
      .lean(),
    User.find(scopedQuery(req, { role: "student" }))
      .select("_id firstName lastName userName")
      .sort({ firstName: 1, lastName: 1 })
      .lean(),
    Class.find(scopedQuery(req))
      .select("_id className classCode")
      .sort({ className: 1 })
      .lean()
  ]);

  if (financeResult.status === "rejected") {
    console.error("Finance aggregate load error:", financeResult.reason);
    financeLoadError = "Finance data is temporarily unavailable.";
  }
  if (parentResult.status === "rejected") {
    console.error("Finance parent lookup error:", parentResult.reason);
    financeLoadError = financeLoadError || "Finance data is temporarily unavailable.";
  }
  if (studentResult.status === "rejected") {
    console.error("Finance student lookup error:", studentResult.reason);
    financeLoadError = financeLoadError || "Finance data is temporarily unavailable.";
  }
  if (classResult.status === "rejected") {
    console.error("Finance class lookup error:", classResult.reason);
    financeLoadError = financeLoadError || "Finance data is temporarily unavailable.";
  }

  const finance = financeResult.status === "fulfilled" ? financeResult.value : buildEmptyFinanceState();
  const parentDocs = parentResult.status === "fulfilled" ? parentResult.value : [];
  const studentDocs = studentResult.status === "fulfilled" ? studentResult.value : [];
  const classDocs = classResult.status === "fulfilled" ? classResult.value : [];

  const studentLookup = new Map(
    studentDocs.map((student) => [
      String(student._id),
      `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.userName || "Student"
    ])
  );

  const parentsForForm = buildParentFormRows(parentDocs, studentLookup);
  const studentsForForm = studentDocs.map((student) => ({
    id: String(student._id),
    name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.userName || "Student"
  }));
  const classesForForm = classDocs.map((classDoc) => ({
    id: String(classDoc._id),
    name: classDoc.className || classDoc.classCode || "Class"
  }));

  return {
    finance,
    parentsForForm,
    studentsForForm,
    classesForForm,
    financeLoadError
  };
}

module.exports = {
  getAdminFinance: async (req, res) => {
    try {
      const payload = await buildFinancePagePayload(req);
      const flashed = req.flash();
      const mergedMessages = {
        ...flashed
      };

      if (payload.financeLoadError) {
        const existing = Array.isArray(mergedMessages.error) ? mergedMessages.error : [];
        mergedMessages.error = [...existing, payload.financeLoadError];
      }

      return res.render("admin/finance.ejs", {
        user: req.user,
        activePage: "finance",
        financePage: payload,
        providerStatus: bankProvider.safeConfigSummary(),
        encryptionConfigured: hasEncryptionSecret(),
        messages: mergedMessages
      });
    } catch (err) {
      console.error("Admin finance page error:", err);
      return res.status(500).send("Error loading finance module.");
    }
  },

  getAdminFinanceSummary: async (req, res) => {
    try {
      const finance = await fetchFinanceData(req, { limit: 25 });
      return res.json({
        success: true,
        finance
      });
    } catch (err) {
      console.error("Admin finance summary error:", err);
      return res.status(500).json({
        success: false,
        error: "FINANCE_SUMMARY_FAILED",
        message: "Failed to refresh finance summary."
      });
    }
  },

  createCategory: async (req, res) => {
    try {
      const actor = buildActorSnapshot(req.user);
      const entryType = String(req.body.entryType || "").trim().toLowerCase();
      const label = String(req.body.label || "").trim();

      if (!["income", "expense", "payment"].includes(entryType)) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Invalid category type.",
          errorCode: "FINANCE_CATEGORY_TYPE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!label) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Category label is required.",
          errorCode: "FINANCE_CATEGORY_LABEL_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const key = normalizeFinanceCategoryKey(req.body.key || label);
      if (!key) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Category key is invalid.",
          errorCode: "FINANCE_CATEGORY_KEY_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      const existing = await FinanceCategory.findOne(
        scopedQuery(req, { entryType, key })
      );

      if (existing) {
        const before = existing.toObject();
        existing.label = label.slice(0, 80);
        existing.active = true;
        existing.updatedBy = actor;
        await existing.save();

        await logAdminAction(req, {
          action: "finance_category_update",
          targetType: "FinanceCategory",
          targetId: existing._id,
          before,
          after: existing.toObject(),
          diff: simpleDiff(before, existing.toObject())
        });
      } else {
        const created = await FinanceCategory.create({
          schoolId: req.schoolId,
          entryType,
          key,
          label: label.slice(0, 80),
          active: true,
          isDefault: false,
          createdBy: actor,
          updatedBy: actor
        });

        await logAdminAction(req, {
          action: "finance_category_create",
          targetType: "FinanceCategory",
          targetId: created._id,
          before: {},
          after: created.toObject()
        });
      }

      return sendMutationResult(req, res, {
        success: true,
        message: "Finance category saved.",
        redirectPath: "/admin/finance#categories"
      });
    } catch (err) {
      console.error("Finance category mutation error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Could not save category.",
        errorCode: "FINANCE_CATEGORY_SAVE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  createEntry: async (req, res) => {
    try {
      const actor = buildActorSnapshot(req.user);
      const entryType = String(req.body.entryType || "").trim().toLowerCase();
      const amount = toPositiveAmount(req.body.amount);
      const occurredAt = toDateValue(req.body.occurredAt);
      const status = String(req.body.status || "posted").trim().toLowerCase();
      const source = String(req.body.source || "manual").trim().toLowerCase();
      const currency = String(req.body.currency || "USD").trim().toUpperCase();

      if (!ENTRY_TYPES.has(entryType)) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Invalid finance entry type.",
          errorCode: "FINANCE_ENTRY_TYPE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!amount) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Amount must be greater than zero.",
          errorCode: "FINANCE_ENTRY_AMOUNT_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!occurredAt) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Entry date is invalid.",
          errorCode: "FINANCE_ENTRY_DATE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      const allowedStatus = new Set(["posted", "pending", "void"]);
      const allowedSource = new Set(["manual", "bank_sync", "payment_processor", "imported", "system"]);
      if (!allowedStatus.has(status) || !allowedSource.has(source)) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Entry status or source is invalid.",
          errorCode: "FINANCE_ENTRY_STATE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      const category = await resolveOrCreateCategory(req, actor, {
        entryType,
        categoryKey: req.body.categoryKey,
        categoryLabel: req.body.categoryLabel
      });

      const linkedParentId = toNullableObjectId(req.body.linkedParentId);
      const linkedStudentId = toNullableObjectId(req.body.linkedStudentId);
      const linkedClassId = toNullableObjectId(req.body.linkedClassId);

      if (linkedParentId) {
        const parentDoc = await resolveScopedUser(req, linkedParentId, "parent");
        if (!parentDoc) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Linked parent is invalid for this school.",
            errorCode: "FINANCE_ENTRY_PARENT_INVALID",
            redirectPath: toSafeRedirect(req)
          });
        }
      }

      if (linkedStudentId) {
        const studentDoc = await resolveScopedUser(req, linkedStudentId, "student");
        if (!studentDoc) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Linked student is invalid for this school.",
            errorCode: "FINANCE_ENTRY_STUDENT_INVALID",
            redirectPath: toSafeRedirect(req)
          });
        }
      }

      if (linkedClassId) {
        const classDoc = await resolveScopedClass(req, linkedClassId);
        if (!classDoc) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Linked class is invalid for this school.",
            errorCode: "FINANCE_ENTRY_CLASS_INVALID",
            redirectPath: toSafeRedirect(req)
          });
        }
      }

      const created = await FinanceEntry.create({
        schoolId: req.schoolId,
        entryType,
        categoryKey: category.categoryKey,
        categoryLabel: category.categoryLabel,
        amount,
        currency,
        occurredAt,
        source,
        status,
        vendorOrPayer: String(req.body.vendorOrPayer || "").trim(),
        reference: String(req.body.reference || "").trim(),
        memo: String(req.body.memo || "").trim(),
        linkedParentId: linkedParentId || null,
        linkedStudentId: linkedStudentId || null,
        linkedClassId: linkedClassId || null,
        createdBy: actor,
        updatedBy: actor
      });

      await logAdminAction(req, {
        action: "finance_entry_create",
        targetType: "FinanceEntry",
        targetId: created._id,
        before: {},
        after: created.toObject()
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Finance entry created.",
        redirectPath: "/admin/finance#ledger"
      });
    } catch (err) {
      console.error("Finance entry creation error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: err?.message || "Could not create finance entry.",
        errorCode: err?.code || "FINANCE_ENTRY_CREATE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  archiveEntry: async (req, res) => {
    try {
      const entry = await FinanceEntry.findOne(scopedIdQuery(req, req.params.id, { deletedAt: null }));
      if (!entry) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Finance entry not found.",
          errorCode: "FINANCE_ENTRY_NOT_FOUND",
          redirectPath: toSafeRedirect(req)
        });
      }

      const before = entry.toObject();
      entry.deletedAt = new Date();
      entry.updatedBy = buildActorSnapshot(req.user);
      await entry.save();

      await logAdminAction(req, {
        action: "finance_entry_archive",
        targetType: "FinanceEntry",
        targetId: entry._id,
        before,
        after: entry.toObject(),
        diff: simpleDiff(before, entry.toObject())
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Finance entry archived.",
        redirectPath: "/admin/finance#ledger"
      });
    } catch (err) {
      console.error("Finance entry archive error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Could not archive finance entry.",
        errorCode: "FINANCE_ENTRY_ARCHIVE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  createManualPayment: async (req, res) => {
    try {
      const actor = buildActorSnapshot(req.user);
      const parentId = toNullableObjectId(req.body.parentId);
      const studentId = toNullableObjectId(req.body.studentId);
      const classId = toNullableObjectId(req.body.classId);
      const expectedAmount = toPositiveAmount(req.body.expectedAmount);
      const paidAmountRaw = Number(req.body.paidAmount || 0);
      const paidAmount = Number.isFinite(paidAmountRaw) && paidAmountRaw >= 0 ? Number(paidAmountRaw.toFixed(2)) : 0;
      const dueDate = toDateValue(req.body.dueDate);
      const method = String(req.body.method || "").trim();

      if (!parentId) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Parent selection is required.",
          errorCode: "FINANCE_PAYMENT_PARENT_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!expectedAmount) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Expected amount must be greater than zero.",
          errorCode: "FINANCE_PAYMENT_AMOUNT_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (!dueDate) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Due date is invalid.",
          errorCode: "FINANCE_PAYMENT_DUE_DATE_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      const parentDoc = await resolveScopedUser(req, parentId, "parent");
      if (!parentDoc) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 422,
          message: "Selected parent is invalid for this school.",
          errorCode: "FINANCE_PAYMENT_PARENT_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      if (studentId) {
        const studentDoc = await resolveScopedUser(req, studentId, "student");
        if (!studentDoc) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Selected student is invalid for this school.",
            errorCode: "FINANCE_PAYMENT_STUDENT_INVALID",
            redirectPath: toSafeRedirect(req)
          });
        }

        const parentChildren = Array.isArray(parentDoc?.parentInfo?.children)
          ? parentDoc.parentInfo.children.map((child) => String(child?.childID || ""))
          : [];
        if (!parentChildren.includes(String(studentId))) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Selected student is not linked to that parent.",
            errorCode: "FINANCE_PAYMENT_STUDENT_PARENT_MISMATCH",
            redirectPath: toSafeRedirect(req)
          });
        }
      }

      if (classId) {
        const classDoc = await resolveScopedClass(req, classId);
        if (!classDoc) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Selected class is invalid for this school.",
            errorCode: "FINANCE_PAYMENT_CLASS_INVALID",
            redirectPath: toSafeRedirect(req)
          });
        }
      }

      const allowedCategories = new Set(["Tuition", "Registration", "Materials", "Meal", "Transport", "Other"]);
      const category = String(req.body.category || "Tuition").trim();
      const safeCategory = allowedCategories.has(category) ? category : "Other";

      const normalized = normalizeParentPaymentStatus(
        {
          expectedAmount,
          paidAmount,
          dueDate,
          status: "Due"
        },
        new Date()
      );

      let status = String(req.body.status || "").trim();
      if (!PAYMENT_STATUSES.has(status)) {
        status = normalized.status;
      }

      const created = await ParentPayment.create({
        schoolId: req.schoolId,
        parentId,
        studentId: studentId || null,
        classId: classId || null,
        title: String(req.body.title || "Manual Payment").trim() || "Manual Payment",
        category: safeCategory,
        expectedAmount,
        paidAmount: Math.min(paidAmount, expectedAmount),
        currency: String(req.body.currency || "USD").trim().toUpperCase(),
        dueDate,
        paidAt: status === "Paid" || paidAmount > 0 ? toDateValue(req.body.paidAt) || new Date() : null,
        status,
        method,
        processor: String(req.body.processor || "").trim(),
        processorReference: String(req.body.processorReference || "").trim(),
        receiptReference: String(req.body.receiptReference || "").trim(),
        notes: String(req.body.notes || "").trim(),
        createdBy: actor,
        updatedBy: actor
      });

      await logAdminAction(req, {
        action: "finance_payment_create",
        targetType: "ParentPayment",
        targetId: created._id,
        before: {},
        after: created.toObject()
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Manual payment record created.",
        redirectPath: "/admin/finance#payments"
      });
    } catch (err) {
      console.error("Finance manual payment error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: err?.message || "Could not create payment record.",
        errorCode: err?.code || "FINANCE_PAYMENT_CREATE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  createBankLinkToken: async (req, res) => {
    try {
      const linkToken = await bankProvider.createLinkToken({
        clientUserId: String(req.user?._id || ""),
        legalName: `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim()
      });

      return res.json({
        success: true,
        data: {
          linkToken: linkToken.link_token,
          expiration: linkToken.expiration || null
        }
      });
    } catch (err) {
      console.error("Finance bank link-token error:", err?.code || err?.message || err);
      const status = err?.code === "BANK_PROVIDER_NOT_CONFIGURED" ? 503 : 502;
      return res.status(status).json({
        success: false,
        error: err?.code || "BANK_LINK_TOKEN_FAILED",
        message: err?.message || "Could not create bank link token."
      });
    }
  },

  connectBankAccount: async (req, res) => {
    try {
      if (!hasEncryptionSecret()) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 503,
          message: "Finance encryption key is not configured. Set FINANCE_ENCRYPTION_KEY before connecting bank accounts.",
          errorCode: "FINANCE_ENCRYPTION_KEY_MISSING",
          redirectPath: toSafeRedirect(req)
        });
      }

      const publicToken = String(req.body.publicToken || "").trim();
      if (!publicToken) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Public token is required.",
          errorCode: "BANK_PUBLIC_TOKEN_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const actor = buildActorSnapshot(req.user);
      const exchange = await bankProvider.exchangePublicToken(publicToken);
      const encryptedAccessToken = encryptToken(exchange.access_token);

      let connection = await FinanceBankConnection.findOne(
        scopedQuery(req, {
          provider: "plaid",
          providerItemId: exchange.item_id
        })
      );

      const before = connection ? connection.toObject() : {};
      if (!connection) {
        connection = new FinanceBankConnection({
          schoolId: req.schoolId,
          provider: "plaid",
          providerItemId: exchange.item_id,
          institutionId: String(req.body.institutionId || "").trim(),
          institutionName: String(req.body.institutionName || "").trim() || "Connected Bank",
          accessTokenEncrypted: encryptedAccessToken,
          status: "connected",
          lastSyncStatus: "never",
          createdBy: actor,
          updatedBy: actor
        });
      } else {
        connection.institutionId = String(req.body.institutionId || connection.institutionId || "").trim();
        connection.institutionName = String(req.body.institutionName || connection.institutionName || "").trim() || "Connected Bank";
        connection.accessTokenEncrypted = encryptedAccessToken;
        connection.status = "connected";
        connection.updatedBy = actor;
      }

      await connection.save();

      const accountsResponse = await bankProvider.getAccounts(exchange.access_token);
      const accountOps = (accountsResponse.accounts || []).map((account) => ({
        updateOne: {
          filter: {
            schoolId: req.schoolId,
            connectionId: connection._id,
            providerAccountId: String(account.account_id || "")
          },
          update: {
            $set: {
              schoolId: req.schoolId,
              connectionId: connection._id,
              providerAccountId: String(account.account_id || ""),
              name: account.name || "",
              officialName: account.official_name || "",
              mask: account.mask || "",
              type: account.type || "",
              subtype: account.subtype || "",
              isoCurrencyCode: account.balances?.iso_currency_code || "USD",
              currentBalance: Number(account.balances?.current || 0),
              availableBalance: Number.isFinite(Number(account.balances?.available))
                ? Number(account.balances.available)
                : null,
              active: true,
              lastSyncedAt: new Date()
            }
          },
          upsert: true
        }
      }));

      if (accountOps.length > 0) {
        await FinanceBankAccount.bulkWrite(accountOps, { ordered: false });
      }

      await logAdminAction(req, {
        action: before?._id ? "finance_bank_connection_update" : "finance_bank_connection_create",
        targetType: "FinanceBankConnection",
        targetId: connection._id,
        before,
        after: connection.toObject(),
        diff: simpleDiff(before || {}, connection.toObject())
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Bank connection saved.",
        data: {
          connectionId: String(connection._id),
          institutionName: connection.institutionName || "Connected Bank",
          accountCount: Number((accountsResponse.accounts || []).length)
        },
        redirectPath: "/admin/finance#bank-sync"
      });
    } catch (err) {
      console.error("Finance bank connect error:", err?.code || err?.message || err);
      const statusCode = err?.code === "BANK_PROVIDER_NOT_CONFIGURED" ? 503 : 502;
      return sendMutationResult(req, res, {
        success: false,
        statusCode,
        message: err?.message || "Could not connect bank account.",
        errorCode: err?.code || "BANK_CONNECT_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  syncBankTransactions: async (req, res) => {
    const actor = buildActorSnapshot(req.user);
    try {
      if (!hasEncryptionSecret()) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 503,
          message: "Finance encryption key is not configured. Set FINANCE_ENCRYPTION_KEY before syncing bank transactions.",
          errorCode: "FINANCE_ENCRYPTION_KEY_MISSING",
          redirectPath: toSafeRedirect(req)
        });
      }

      const requestedConnectionId = toNullableObjectId(req.body.connectionId);
      const connectionQuery = requestedConnectionId
        ? scopedQuery(req, { _id: requestedConnectionId })
        : scopedQuery(req, { status: "connected" });

      const connections = await FinanceBankConnection.find(connectionQuery).lean();
      if (!connections.length) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "No bank connections found to sync.",
          errorCode: "BANK_CONNECTION_NOT_FOUND",
          redirectPath: toSafeRedirect(req)
        });
      }

      const overallStats = {
        processed: 0,
        added: 0,
        modified: 0,
        removed: 0,
        duplicates: 0,
        unmatched: 0,
        matched: 0,
        errors: 0
      };

      for (const connection of connections) {
        const syncLog = await FinanceSyncLog.create({
          schoolId: req.schoolId,
          connectionId: connection._id,
          provider: connection.provider,
          trigger: "manual",
          triggeredBy: actor,
          status: "success",
          cursorBefore: connection.lastCursor || "",
          startedAt: new Date()
        });

        try {
          const decryptedAccessToken = decryptToken(connection.accessTokenEncrypted);
          const accountDocs = await FinanceBankAccount.find(
            scopedQuery(req, { connectionId: connection._id, active: true })
          ).lean();
          const accountLookup = new Map(
            accountDocs.map((account) => [String(account.providerAccountId), account])
          );

          let cursor = connection.lastCursor || "";
          let hasMore = true;
          let guard = 0;
          let aggregateAdded = [];
          let aggregateModified = [];
          let aggregateRemoved = [];
          let requestId = "";

          while (hasMore && guard < 20) {
            const chunk = await bankProvider.syncTransactions({
              accessToken: decryptedAccessToken,
              cursor
            });

            aggregateAdded = aggregateAdded.concat(chunk.added || []);
            aggregateModified = aggregateModified.concat(chunk.modified || []);
            aggregateRemoved = aggregateRemoved.concat(chunk.removed || []);
            cursor = chunk.nextCursor || cursor;
            hasMore = Boolean(chunk.hasMore);
            requestId = chunk.requestId || requestId;
            guard += 1;
          }

          const upsertCandidates = [...aggregateAdded, ...aggregateModified];
          const providerIds = upsertCandidates
            .map((row) => String(row.transaction_id || ""))
            .filter(Boolean);

          const existingRows = providerIds.length
            ? await FinanceBankTransaction.find(
              scopedQuery(req, { providerTransactionId: { $in: providerIds } })
            )
              .select("_id providerTransactionId reconciliation")
              .lean()
            : [];
          const existingLookup = new Map(existingRows.map((row) => [String(row.providerTransactionId), row]));

          const upsertOps = upsertCandidates.map((transaction) => {
            const providerTransactionId = String(transaction.transaction_id || "");
            const account = accountLookup.get(String(transaction.account_id || ""));
            const direction = Number(transaction.amount || 0) < 0 ? "inflow" : "outflow";
            const postedDate = transaction.date ? new Date(transaction.date) : null;
            const authorizedDate = transaction.authorized_date ? new Date(transaction.authorized_date) : null;
            const existing = existingLookup.get(providerTransactionId);

            return {
              updateOne: {
                filter: {
                  schoolId: req.schoolId,
                  providerTransactionId
                },
                update: {
                  $set: {
                    schoolId: req.schoolId,
                    connectionId: connection._id,
                    bankAccountId: account?._id || null,
                    accountName: account?.name || account?.officialName || "",
                    providerTransactionId,
                    providerPendingTransactionId: String(transaction.pending_transaction_id || ""),
                    amount: Number(transaction.amount || 0),
                    isoCurrencyCode: transaction.iso_currency_code || account?.isoCurrencyCode || "USD",
                    unofficialCurrencyCode: transaction.unofficial_currency_code || "",
                    direction,
                    pending: Boolean(transaction.pending),
                    sourceStatus: transaction.pending ? "pending" : "posted",
                    authorizedDate: authorizedDate && !Number.isNaN(authorizedDate.getTime()) ? authorizedDate : null,
                    postedDate: postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
                    name: String(transaction.name || "").trim(),
                    merchantName: String(transaction.merchant_name || "").trim(),
                    categoryPrimary: String((transaction.personal_finance_category || {}).primary || "").trim(),
                    categoryDetailed: String((transaction.personal_finance_category || {}).detailed || "").trim(),
                    paymentChannel: String(transaction.payment_channel || "").trim(),
                    website: String(transaction.website || "").trim(),
                    raw: transaction || {},
                    importedAt: new Date(),
                    reconciliation: existing?.reconciliation || {
                      status: "unmatched",
                      matchedType: "none",
                      method: "none",
                      matchedId: null,
                      matchedAt: null,
                      matchedBy: {},
                      note: ""
                    }
                  }
                },
                upsert: true
              }
            };
          });

          if (upsertOps.length) {
            await FinanceBankTransaction.bulkWrite(upsertOps, { ordered: false });
          }

          const removedIds = aggregateRemoved
            .map((row) => String(row.transaction_id || ""))
            .filter(Boolean);
          if (removedIds.length) {
            await FinanceBankTransaction.deleteMany(
              scopedQuery(req, { providerTransactionId: { $in: removedIds } })
            );
          }

          const unmatchedCount = await FinanceBankTransaction.countDocuments(
            scopedQuery(req, { connectionId: connection._id, "reconciliation.status": "unmatched" })
          );
          const matchedCount = await FinanceBankTransaction.countDocuments(
            scopedQuery(req, { connectionId: connection._id, "reconciliation.status": "matched" })
          );

          await FinanceBankConnection.updateOne(
            scopedQuery(req, { _id: connection._id }),
            {
              $set: {
                status: "connected",
                lastCursor: cursor || connection.lastCursor || "",
                lastSyncAt: new Date(),
                lastSyncStatus: "success",
                lastSyncMessage: "",
                updatedBy: actor
              }
            }
          );

          syncLog.status = "success";
          syncLog.cursorAfter = cursor || "";
          syncLog.endedAt = new Date();
          syncLog.addedCount = aggregateAdded.length;
          syncLog.modifiedCount = aggregateModified.length;
          syncLog.removedCount = aggregateRemoved.length;
          syncLog.processedCount = upsertCandidates.length;
          syncLog.duplicateCount = Math.max(existingRows.length, 0);
          syncLog.unmatchedCount = unmatchedCount;
          syncLog.matchedCount = matchedCount;
          syncLog.requestId = requestId;
          await syncLog.save();

          overallStats.processed += upsertCandidates.length;
          overallStats.added += aggregateAdded.length;
          overallStats.modified += aggregateModified.length;
          overallStats.removed += aggregateRemoved.length;
          overallStats.duplicates += Math.max(existingRows.length, 0);
          overallStats.unmatched += unmatchedCount;
          overallStats.matched += matchedCount;
        } catch (connectionErr) {
          overallStats.errors += 1;
          console.error("Finance bank sync connection error:", connectionErr?.code || connectionErr?.message || connectionErr);

          await FinanceBankConnection.updateOne(
            scopedQuery(req, { _id: connection._id }),
            {
              $set: {
                status: "error",
                lastSyncAt: new Date(),
                lastSyncStatus: "failed",
                lastSyncMessage: String(connectionErr?.message || "Sync failed"),
                updatedBy: actor
              }
            }
          );

          syncLog.status = "failed";
          syncLog.endedAt = new Date();
          syncLog.errorMessage = String(connectionErr?.message || "Sync failed");
          await syncLog.save();
        }
      }

      await logAdminAction(req, {
        action: "finance_bank_sync",
        targetType: "FinanceBankConnection",
        targetId: requestedConnectionId || connections[0]._id,
        before: {},
        after: {
          connectionCount: connections.length,
          ...overallStats
        }
      });

      const finance = await fetchFinanceData(req, { limit: 25 });
      const isPartial = overallStats.errors > 0;
      return sendMutationResult(req, res, {
        success: true,
        statusCode: isPartial ? 207 : 200,
        message: isPartial
          ? "Bank sync completed with some connection errors."
          : "Bank sync completed.",
        errorCode: isPartial ? "BANK_SYNC_PARTIAL" : null,
        data: {
          stats: overallStats,
          finance
        },
        redirectPath: "/admin/finance#bank-sync"
      });
    } catch (err) {
      console.error("Finance bank sync fatal error:", err?.code || err?.message || err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 502,
        message: err?.message || "Bank sync failed.",
        errorCode: err?.code || "BANK_SYNC_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  },

  reconcileBankTransaction: async (req, res) => {
    try {
      const actor = buildActorSnapshot(req.user);
      const bankTransactionId = toNullableObjectId(req.body.bankTransactionId);
      const action = String(req.body.action || "").trim().toLowerCase();
      const targetId = toNullableObjectId(req.body.targetId);
      const note = String(req.body.note || "").trim();

      if (!bankTransactionId) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Bank transaction id is required.",
          errorCode: "FINANCE_RECONCILE_TX_REQUIRED",
          redirectPath: toSafeRedirect(req)
        });
      }

      const transaction = await FinanceBankTransaction.findOne(scopedIdQuery(req, bankTransactionId));
      if (!transaction) {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 404,
          message: "Bank transaction not found.",
          errorCode: "FINANCE_RECONCILE_TX_NOT_FOUND",
          redirectPath: toSafeRedirect(req)
        });
      }

      const before = transaction.toObject();

      if (action === "ignore") {
        transaction.reconciliation = {
          status: "ignored",
          matchedType: "none",
          matchedId: null,
          method: "manual",
          matchedAt: new Date(),
          matchedBy: actor,
          note
        };
        await transaction.save();
      } else if (action === "match_entry") {
        if (!targetId) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Finance entry id is required for match.",
            errorCode: "FINANCE_RECONCILE_ENTRY_REQUIRED",
            redirectPath: toSafeRedirect(req)
          });
        }

        const entry = await FinanceEntry.findOne(scopedIdQuery(req, targetId, { deletedAt: null }));
        if (!entry) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 404,
            message: "Finance entry not found.",
            errorCode: "FINANCE_RECONCILE_ENTRY_NOT_FOUND",
            redirectPath: toSafeRedirect(req)
          });
        }

        transaction.reconciliation = {
          status: "matched",
          matchedType: "financeEntry",
          matchedId: entry._id,
          method: "manual",
          matchedAt: new Date(),
          matchedBy: actor,
          note
        };
        await transaction.save();

        entry.bankTransactionId = transaction._id;
        entry.updatedBy = actor;
        await entry.save();
      } else if (action === "match_payment") {
        if (!targetId) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 422,
            message: "Payment id is required for match.",
            errorCode: "FINANCE_RECONCILE_PAYMENT_REQUIRED",
            redirectPath: toSafeRedirect(req)
          });
        }

        const payment = await ParentPayment.findOne(scopedIdQuery(req, targetId));
        if (!payment) {
          return sendMutationResult(req, res, {
            success: false,
            statusCode: 404,
            message: "Payment not found.",
            errorCode: "FINANCE_RECONCILE_PAYMENT_NOT_FOUND",
            redirectPath: toSafeRedirect(req)
          });
        }

        transaction.reconciliation = {
          status: "matched",
          matchedType: "parentPayment",
          matchedId: payment._id,
          method: "manual",
          matchedAt: new Date(),
          matchedBy: actor,
          note
        };
        await transaction.save();

        payment.bankTransactionId = transaction._id;
        payment.updatedBy = actor;
        await payment.save();
      } else {
        return sendMutationResult(req, res, {
          success: false,
          statusCode: 400,
          message: "Invalid reconciliation action.",
          errorCode: "FINANCE_RECONCILE_ACTION_INVALID",
          redirectPath: toSafeRedirect(req)
        });
      }

      await logAdminAction(req, {
        action: "finance_transaction_reconcile",
        targetType: "FinanceBankTransaction",
        targetId: transaction._id,
        before,
        after: transaction.toObject(),
        diff: simpleDiff(before, transaction.toObject())
      });

      return sendMutationResult(req, res, {
        success: true,
        message: "Reconciliation saved.",
        redirectPath: "/admin/finance#reconciliation"
      });
    } catch (err) {
      console.error("Finance reconciliation error:", err);
      return sendMutationResult(req, res, {
        success: false,
        statusCode: 500,
        message: "Could not save reconciliation.",
        errorCode: "FINANCE_RECONCILE_FAILED",
        redirectPath: toSafeRedirect(req)
      });
    }
  }
};
