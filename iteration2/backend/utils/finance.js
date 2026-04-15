const FinanceCategory = require("../models/FinanceCategory");
const FinanceEntry = require("../models/FinanceEntry");
const FinanceBankConnection = require("../models/FinanceBankConnection");
const FinanceBankTransaction = require("../models/FinanceBankTransaction");
const FinanceSyncLog = require("../models/FinanceSyncLog");
const User = require("../models/User");
const Class = require("../models/Class");
const { scopedQuery } = require("./tenant");

const DEFAULT_FINANCE_CATEGORIES = {
  income: [
    { key: "program_fees", label: "Program Fees" },
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
  ]
};

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
    entryDocs,
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
    FinanceEntry.find(scopedQuery(req, { deletedAt: null }))
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(500)
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

  const studentLookup = new Map(
    studentDocs.map((student) => [
      String(student._id),
      `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.userName || "Student"
    ])
  );
  const classLookup = new Map(
    classDocs.map((classDoc) => [String(classDoc._id), classDoc.className || classDoc.classCode || "Class"])
  );

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

  const monthlyIncome = monthlyIncomeEntries;
  const netCashFlow = monthlyIncome - monthlyExpenseEntries;

  const revenueBreakdownMap = new Map();
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
      monthlyExpense: monthlyExpenseEntries,
      monthlyExpenseLabel: formatCurrencyLabel(monthlyExpenseEntries),
      netCashFlow,
      netCashFlowLabel: formatCurrencyLabel(netCashFlow),
      unmatchedCount: Number(unmatchedCount || 0),
      matchedCount: Number(matchedCount || 0),
      lastSyncAt: newestSync?.lastSyncAt || latestSyncLog?.endedAt || null,
      lastSyncAtLabel: newestSync?.lastSyncAtLabel || (latestSyncLog?.endedAt ? formatDateTimeLabel(latestSyncLog.endedAt) : "Never"),
      lastSyncStatus: newestSync?.lastSyncStatus || latestSyncLog?.status || "never",
      lastSyncMessage: newestSync?.lastSyncMessage || latestSyncLog?.errorMessage || ""
    },
    categories: categoryOptions,
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
    revenueBreakdown
  };
}

module.exports = {
  DEFAULT_FINANCE_CATEGORIES,
  normalizeFinanceCategoryKey,
  buildActorSnapshot,
  ensureDefaultFinanceCategories,
  fetchFinanceData,
  formatDateLabel,
  formatDateTimeLabel,
  formatCurrencyLabel
};
