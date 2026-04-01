const FinanceCategory = require("../models/FinanceCategory");
const FinanceEntry = require("../models/FinanceEntry");
const FinanceBankConnection = require("../models/FinanceBankConnection");
const FinanceBankTransaction = require("../models/FinanceBankTransaction");
const FinanceSyncLog = require("../models/FinanceSyncLog");
const ParentPayment = require("../models/ParentPayment");
const User = require("../models/User");
const Class = require("../models/Class");
const { scopedQuery } = require("./tenant");

const DEFAULT_FINANCE_CATEGORIES = {
  income: [
    { key: "tuition", label: "Tuition" },
    { key: "registration", label: "Registration" },
    { key: "food", label: "Food" },
    { key: "activities", label: "Activities / Fun" },
    { key: "donations", label: "Donations" },
    { key: "misc_income", label: "Miscellaneous Income" }
  ],
  expense: [
    { key: "payroll", label: "Payroll" },
    { key: "rent_facility", label: "Rent / Facility" },
    { key: "utilities", label: "Utilities" },
    { key: "food", label: "Food" },
    { key: "transportation", label: "Transportation" },
    { key: "supplies", label: "Supplies" },
    { key: "curriculum", label: "Curriculum" },
    { key: "extracurricular", label: "Extracurricular" },
    { key: "marketing", label: "Marketing" },
    { key: "tax_reserve", label: "Tax Reserve" },
    { key: "misc_expense", label: "Miscellaneous Expense" }
  ],
  payment: [
    { key: "tuition", label: "Tuition" },
    { key: "registration", label: "Registration" },
    { key: "materials", label: "Materials" },
    { key: "meal", label: "Meal" },
    { key: "transport", label: "Transport" },
    { key: "other", label: "Other" }
  ]
};

const PAYMENT_CATEGORY_TO_KEY = {
  Tuition: "tuition",
  Registration: "registration",
  Materials: "materials",
  Meal: "meal",
  Transport: "transport",
  Other: "other"
};

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function buildActorSnapshot(user) {
  return {
    _id: user?._id || null,
    name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.userName || "",
    role: user?.role || ""
  };
}

function normalizeFinanceCategoryKey(rawValue) {
  return String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatCurrencyLabel(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function monthBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function daysDiff(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay);
}

function normalizeParentPaymentStatus(payment, now = new Date()) {
  const expectedAmount = Number(payment.expectedAmount || 0);
  const paidAmount = Number(payment.paidAmount || 0);
  const amountDue = Math.max(expectedAmount - paidAmount, 0);
  const dueDate = payment.dueDate ? new Date(payment.dueDate) : null;
  const dueDateValid = dueDate && !Number.isNaN(dueDate.getTime());

  let status = String(payment.status || "").trim() || "Due";
  if (amountDue <= 0) status = "Paid";
  else if (status === "PendingProcessor") status = "PendingProcessor";
  else if (paidAmount > 0) status = "Partial";
  else status = "Due";

  if (amountDue > 0 && dueDateValid && dueDate < now && status !== "PendingProcessor") {
    status = "Overdue";
  }

  const paidAt = payment.paidAt ? new Date(payment.paidAt) : null;
  const paidAtValid = paidAt && !Number.isNaN(paidAt.getTime());
  const daysRemaining = dueDateValid ? daysDiff(now, dueDate) : null;

  return {
    ...payment,
    amountDue,
    status,
    daysRemaining,
    dueDate,
    dueDateLabel: dueDateValid ? formatDateLabel(dueDate) : "N/A",
    paidAt,
    paidAtValid,
    paidAtLabel: paidAtValid ? formatDateLabel(paidAt) : "—",
    currency: payment.currency || "USD"
  };
}

function paymentStatusPriority(status) {
  if (status === "Overdue") return 0;
  if (status === "PendingProcessor") return 1;
  if (status === "Partial") return 2;
  if (status === "Due") return 3;
  return 4;
}

function groupPaymentLedgerRows(normalizedPayments, parentLookup, studentLookup) {
  const grouped = new Map();

  normalizedPayments.forEach((payment) => {
    const parentId = toIdString(payment.parentId);
    if (!parentId) return;
    const existing = grouped.get(parentId) || {
      parentId,
      parent: parentLookup.get(parentId) || "Unknown Parent",
      studentNames: new Set(),
      due: 0,
      paid: 0,
      status: "Paid",
      lastPaymentAt: null,
      currency: payment.currency || "USD"
    };

    existing.due += Number(payment.amountDue || 0);
    existing.paid += Number(payment.paidAmount || 0);
    existing.currency = payment.currency || existing.currency;

    const studentId = toIdString(payment.studentId);
    if (studentId) {
      existing.studentNames.add(studentLookup.get(studentId) || "Student");
    } else {
      existing.studentNames.add("Family");
    }

    if (
      paymentStatusPriority(payment.status) < paymentStatusPriority(existing.status) ||
      (existing.status === "Paid" && payment.status !== "Paid")
    ) {
      existing.status = payment.status;
    }

    const dateCandidates = [payment.paidAt, payment.updatedAt, payment.createdAt]
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));
    const candidate = dateCandidates[0] || null;
    if (candidate && (!existing.lastPaymentAt || candidate > existing.lastPaymentAt)) {
      existing.lastPaymentAt = candidate;
    }

    grouped.set(parentId, existing);
  });

  return Array.from(grouped.values())
    .map((entry) => ({
      parentId: entry.parentId,
      parent: entry.parent,
      students: Array.from(entry.studentNames).join(", "),
      due: Number(entry.due || 0),
      dueLabel: formatCurrencyLabel(entry.due, entry.currency),
      paid: Number(entry.paid || 0),
      paidLabel: formatCurrencyLabel(entry.paid, entry.currency),
      status: entry.status,
      overdue: entry.status === "Overdue",
      lastPaymentAt: entry.lastPaymentAt,
      lastPayment: entry.lastPaymentAt ? formatDateLabel(entry.lastPaymentAt) : "—"
    }))
    .sort((a, b) => {
      const statusDiff = paymentStatusPriority(a.status) - paymentStatusPriority(b.status);
      if (statusDiff !== 0) return statusDiff;
      return Number(b.due || 0) - Number(a.due || 0);
    });
}

function collectCategoryBreakdown(rows, totalAmount) {
  const safeTotal = Number(totalAmount || 0);
  return rows
    .filter((row) => Number(row.amount || 0) > 0)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .map((row) => {
      const amount = Number(row.amount || 0);
      const percent = safeTotal > 0 ? (amount / safeTotal) * 100 : 0;
      return {
        ...row,
        amount,
        amountLabel: formatCurrencyLabel(amount),
        percent: Number(percent.toFixed(1))
      };
    });
}

async function ensureDefaultFinanceCategories(req, actorUser = null) {
  const actor = buildActorSnapshot(actorUser);
  const operations = [];

  Object.entries(DEFAULT_FINANCE_CATEGORIES).forEach(([entryType, categories]) => {
    categories.forEach((category) => {
      operations.push({
        updateOne: {
          filter: {
            schoolId: req.schoolId,
            entryType,
            key: category.key
          },
          update: {
            $setOnInsert: {
              schoolId: req.schoolId,
              entryType,
              key: category.key,
              label: category.label,
              description: "",
              active: true,
              isDefault: true,
              createdBy: actor,
              updatedBy: actor
            },
            $set: {
              updatedBy: actor
            }
          },
          upsert: true
        }
      });
    });
  });

  if (operations.length > 0) {
    await FinanceCategory.bulkWrite(operations, { ordered: false });
  }
}

async function fetchFinanceData(req, options = {}) {
  const limit = Number(options.limit || 25);
  const now = options.now || new Date();
  const { start: monthStart, end: monthEnd } = monthBounds(now);

  const [
    categories,
    paymentDocs,
    entryDocs,
    parentDocs,
    studentDocs,
    classDocs,
    bankConnections,
    unmatchedTransactions,
    unmatchedCount,
    matchedCount,
    latestSyncLog
  ] = await Promise.all([
    FinanceCategory.find(scopedQuery(req, { active: true }))
      .sort({ entryType: 1, label: 1 })
      .lean(),
    ParentPayment.find(scopedQuery(req)).sort({ dueDate: -1, createdAt: -1 }).lean(),
    FinanceEntry.find(scopedQuery(req, { deletedAt: null }))
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(500)
      .lean(),
    User.find(scopedQuery(req, { role: "parent" }))
      .select("_id firstName lastName userName parentInfo.children")
      .lean(),
    User.find(scopedQuery(req, { role: "student" }))
      .select("_id firstName lastName userName")
      .lean(),
    Class.find(scopedQuery(req)).select("_id className classCode").lean(),
    FinanceBankConnection.find(scopedQuery(req)).sort({ updatedAt: -1 }).lean(),
    FinanceBankTransaction.find(scopedQuery(req, { "reconciliation.status": "unmatched" }))
      .sort({ postedDate: -1, createdAt: -1 })
      .limit(limit)
      .lean(),
    FinanceBankTransaction.countDocuments(scopedQuery(req, { "reconciliation.status": "unmatched" })),
    FinanceBankTransaction.countDocuments(scopedQuery(req, { "reconciliation.status": "matched" })),
    FinanceSyncLog.findOne(scopedQuery(req)).sort({ createdAt: -1 }).lean()
  ]);

  const parentLookup = new Map(
    parentDocs.map((parent) => [
      String(parent._id),
      `${parent.firstName || ""} ${parent.lastName || ""}`.trim() || parent.userName || "Parent"
    ])
  );
  const studentLookup = new Map(
    studentDocs.map((student) => [
      String(student._id),
      `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.userName || "Student"
    ])
  );
  const classLookup = new Map(
    classDocs.map((classDoc) => [String(classDoc._id), classDoc.className || classDoc.classCode || "Class"])
  );

  const normalizedPayments = paymentDocs.map((payment) => normalizeParentPaymentStatus(payment, now));
  const paymentLedgerRows = groupPaymentLedgerRows(normalizedPayments, parentLookup, studentLookup);
  const paymentMatchOptions = normalizedPayments.slice(0, 200).map((payment) => {
    const parentName = parentLookup.get(String(payment.parentId)) || "Parent";
    return {
      id: String(payment._id),
      label: `${parentName} • ${payment.title || "Payment"} • ${payment.dueDateLabel} • ${payment.status}`
    };
  });

  const monthlyPaymentCollected = normalizedPayments.reduce((sum, payment) => {
    if (!payment.paidAtValid) return sum;
    if (payment.paidAt >= monthStart && payment.paidAt < monthEnd) {
      return sum + Number(payment.paidAmount || 0);
    }
    return sum;
  }, 0);

  const outstanding = normalizedPayments.reduce((sum, payment) => sum + Number(payment.amountDue || 0), 0);

  const familyOutstandingMap = new Map();
  paymentLedgerRows.forEach((row) => {
    familyOutstandingMap.set(row.parentId, Number(row.due || 0));
  });
  const paidFamilies = Array.from(familyOutstandingMap.values()).filter((value) => value <= 0).length;
  const unpaidFamilies = Array.from(familyOutstandingMap.values()).filter((value) => value > 0).length;

  const entries = entryDocs.filter((entry) => !entry.deletedAt);
  const monthlyIncomeEntries = entries.reduce((sum, entry) => {
    if (entry.entryType !== "income" || entry.status !== "posted") return sum;
    const occurredAt = new Date(entry.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return sum;
    if (occurredAt >= monthStart && occurredAt < monthEnd) return sum + Number(entry.amount || 0);
    return sum;
  }, 0);

  const monthlyExpenseEntries = entries.reduce((sum, entry) => {
    if (entry.entryType !== "expense" || entry.status !== "posted") return sum;
    const occurredAt = new Date(entry.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return sum;
    if (occurredAt >= monthStart && occurredAt < monthEnd) return sum + Number(entry.amount || 0);
    return sum;
  }, 0);

  const monthlyIncome = monthlyIncomeEntries + monthlyPaymentCollected;
  const netCashFlow = monthlyIncome - monthlyExpenseEntries;

  const revenueBreakdownMap = new Map();
  normalizedPayments.forEach((payment) => {
    if (!payment.paidAtValid) return;
    if (payment.paidAt < monthStart || payment.paidAt >= monthEnd) return;
    const key = PAYMENT_CATEGORY_TO_KEY[payment.category] || "other";
    const label = payment.category || "Other";
    const entry = revenueBreakdownMap.get(key) || { key, label, amount: 0 };
    entry.amount += Number(payment.paidAmount || 0);
    revenueBreakdownMap.set(key, entry);
  });

  entries.forEach((entry) => {
    if (entry.entryType !== "income" || entry.status !== "posted") return;
    const occurredAt = new Date(entry.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt < monthStart || occurredAt >= monthEnd) return;
    const key = String(entry.categoryKey || "misc_income");
    const label = entry.categoryLabel || "Income";
    const existing = revenueBreakdownMap.get(key) || { key, label, amount: 0 };
    existing.amount += Number(entry.amount || 0);
    revenueBreakdownMap.set(key, existing);
  });

  const revenueBreakdown = collectCategoryBreakdown(
    Array.from(revenueBreakdownMap.values()),
    monthlyIncome || 0
  );

  const entryRows = entries.slice(0, limit).map((entry) => ({
    id: String(entry._id),
    entryType: entry.entryType,
    entryTypeLabel: entry.entryType === "income" ? "Income" : "Expense",
    categoryKey: entry.categoryKey || "",
    categoryLabel: entry.categoryLabel || "Uncategorized",
    amount: Number(entry.amount || 0),
    amountLabel: formatCurrencyLabel(entry.amount || 0, entry.currency || "USD"),
    currency: entry.currency || "USD",
    dateLabel: formatDateLabel(entry.occurredAt),
    dateIso: entry.occurredAt ? new Date(entry.occurredAt).toISOString() : "",
    source: entry.source || "manual",
    status: entry.status || "posted",
    vendorOrPayer: entry.vendorOrPayer || "—",
    reference: entry.reference || "",
    memo: entry.memo || "",
    linkedParentName: entry.linkedParentId ? parentLookup.get(String(entry.linkedParentId)) || "Parent" : "",
    linkedStudentName: entry.linkedStudentId ? studentLookup.get(String(entry.linkedStudentId)) || "Student" : "",
    linkedClassName: entry.linkedClassId ? classLookup.get(String(entry.linkedClassId)) || "Class" : "",
    bankTransactionId: entry.bankTransactionId ? String(entry.bankTransactionId) : "",
    reconciled: Boolean(entry.bankTransactionId)
  }));

  const unmatchedRows = unmatchedTransactions.map((transaction) => {
    const direction = transaction.direction || (Number(transaction.amount || 0) < 0 ? "inflow" : "outflow");
    const absoluteAmount = Math.abs(Number(transaction.amount || 0));
    return {
      id: String(transaction._id),
      dateLabel: formatDateLabel(transaction.postedDate || transaction.authorizedDate || transaction.createdAt),
      description: transaction.name || transaction.merchantName || "Bank transaction",
      accountName: transaction.accountName || "Bank Account",
      category: transaction.categoryPrimary || transaction.categoryDetailed || "Uncategorized",
      direction,
      amount: Number(transaction.amount || 0),
      amountLabel: formatCurrencyLabel(absoluteAmount, transaction.isoCurrencyCode || "USD"),
      pending: Boolean(transaction.pending),
      statusLabel: transaction.pending ? "Pending" : "Posted"
    };
  });

  const categoryOptions = {
    income: categories.filter((category) => category.entryType === "income").map((category) => ({
      key: category.key,
      label: category.label
    })),
    expense: categories.filter((category) => category.entryType === "expense").map((category) => ({
      key: category.key,
      label: category.label
    })),
    payment: categories.filter((category) => category.entryType === "payment").map((category) => ({
      key: category.key,
      label: category.label
    }))
  };

  const connectionRows = bankConnections.map((connection) => ({
    id: String(connection._id),
    provider: connection.provider,
    institutionName: connection.institutionName || "Linked Institution",
    status: connection.status || "connected",
    lastSyncAt: connection.lastSyncAt || null,
    lastSyncAtLabel: connection.lastSyncAt ? formatDateTimeLabel(connection.lastSyncAt) : "Never",
    lastSyncStatus: connection.lastSyncStatus || "never",
    lastSyncMessage: connection.lastSyncMessage || ""
  }));

  const sortedConnectionsBySync = [...connectionRows]
    .filter((connection) => connection.lastSyncAt)
    .sort((a, b) => new Date(b.lastSyncAt) - new Date(a.lastSyncAt));
  const newestSync = sortedConnectionsBySync[0] || null;

  return {
    monthLabel: monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    summary: {
      monthlyIncome,
      monthlyIncomeLabel: formatCurrencyLabel(monthlyIncome),
      monthlyPaymentCollected,
      monthlyPaymentCollectedLabel: formatCurrencyLabel(monthlyPaymentCollected),
      monthlyExpense: monthlyExpenseEntries,
      monthlyExpenseLabel: formatCurrencyLabel(monthlyExpenseEntries),
      netCashFlow,
      netCashFlowLabel: formatCurrencyLabel(netCashFlow),
      outstanding,
      outstandingLabel: formatCurrencyLabel(outstanding),
      paidFamilies,
      unpaidFamilies,
      unmatchedCount: Number(unmatchedCount || 0),
      matchedCount: Number(matchedCount || 0),
      lastSyncAt: newestSync?.lastSyncAt || latestSyncLog?.endedAt || null,
      lastSyncAtLabel: newestSync?.lastSyncAtLabel || (latestSyncLog?.endedAt ? formatDateTimeLabel(latestSyncLog.endedAt) : "Never"),
      lastSyncStatus: newestSync?.lastSyncStatus || latestSyncLog?.status || "never",
      lastSyncMessage: newestSync?.lastSyncMessage || latestSyncLog?.errorMessage || ""
    },
    categories: categoryOptions,
    payments: {
      rows: paymentLedgerRows.slice(0, limit)
    },
    entries: {
      rows: entryRows,
      matchOptions: entryRows.map((entry) => ({
        id: String(entry.id),
        label: `${entry.entryTypeLabel} • ${entry.categoryLabel} • ${entry.amountLabel} • ${entry.dateLabel}`
      }))
    },
    bank: {
      connections: connectionRows,
      unmatchedRows,
      latestSync: latestSyncLog
        ? {
          status: latestSyncLog.status,
          startedAtLabel: formatDateTimeLabel(latestSyncLog.startedAt),
          endedAtLabel: latestSyncLog.endedAt ? formatDateTimeLabel(latestSyncLog.endedAt) : "",
          processedCount: Number(latestSyncLog.processedCount || 0),
          unmatchedCount: Number(latestSyncLog.unmatchedCount || 0),
          errorMessage: latestSyncLog.errorMessage || ""
        }
        : null
    },
    revenueBreakdown,
    paymentMatchOptions
  };
}

async function buildDashboardPaymentMetrics(req) {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthBounds(now);
  const [paymentDocs, parentDocs, studentDocs] = await Promise.all([
    ParentPayment.find(scopedQuery(req)).sort({ dueDate: -1, createdAt: -1 }).lean(),
    User.find(scopedQuery(req, { role: "parent" }))
      .select("_id firstName lastName userName")
      .lean(),
    User.find(scopedQuery(req, { role: "student" }))
      .select("_id firstName lastName userName")
      .lean()
  ]);

  const parentLookup = new Map(
    parentDocs.map((parent) => [
      String(parent._id),
      `${parent.firstName || ""} ${parent.lastName || ""}`.trim() || parent.userName || "Parent"
    ])
  );
  const studentLookup = new Map(
    studentDocs.map((student) => [
      String(student._id),
      `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.userName || "Student"
    ])
  );

  const normalizedPayments = paymentDocs.map((payment) => normalizeParentPaymentStatus(payment, now));
  const ledgerRows = groupPaymentLedgerRows(normalizedPayments, parentLookup, studentLookup);

  const monthlyCollected = normalizedPayments.reduce((sum, payment) => {
    if (!payment.paidAtValid) return sum;
    if (payment.paidAt >= monthStart && payment.paidAt < monthEnd) {
      return sum + Number(payment.paidAmount || 0);
    }
    return sum;
  }, 0);

  const outstanding = normalizedPayments.reduce((sum, payment) => sum + Number(payment.amountDue || 0), 0);
  const paidFamilies = ledgerRows.filter((row) => Number(row.due || 0) <= 0).length;
  const unpaidFamilies = ledgerRows.filter((row) => Number(row.due || 0) > 0).length;

  const revenueMap = new Map();
  normalizedPayments.forEach((payment) => {
    if (!payment.paidAtValid) return;
    if (payment.paidAt < monthStart || payment.paidAt >= monthEnd) return;
    const label = payment.category || "Other";
    const key = PAYMENT_CATEGORY_TO_KEY[label] || "other";
    const current = revenueMap.get(key) || { key, label, amount: 0 };
    current.amount += Number(payment.paidAmount || 0);
    revenueMap.set(key, current);
  });
  const revenueBreakdown = collectCategoryBreakdown(Array.from(revenueMap.values()), monthlyCollected);

  return {
    dataAvailable: true,
    monthlyCollected,
    outstanding,
    paidFamilies,
    unpaidFamilies,
    revenueBreakdown: revenueBreakdown.slice(0, 5),
    ledger: ledgerRows.slice(0, 12)
  };
}

module.exports = {
  DEFAULT_FINANCE_CATEGORIES,
  normalizeFinanceCategoryKey,
  buildActorSnapshot,
  ensureDefaultFinanceCategories,
  normalizeParentPaymentStatus,
  fetchFinanceData,
  buildDashboardPaymentMetrics,
  formatDateLabel,
  formatDateTimeLabel,
  formatCurrencyLabel
};
