const User = require("../models/User");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const ParentPayment = require("../models/ParentPayment");
const ReportActivity = require("../models/ReportActivity");
const { scopedIdQuery, scopedQuery } = require("../utils/tenant");
const { renderStudentReportLatex, compileLatexToPdf, normalizeJobName } = require("../utils/latexReports");
const { getLinkedStudentsForParent, buildDisplayName } = require("../utils/parentLinks");
const { getVisibleAnnouncementsForUser, toAnnouncementViewModel } = require("../utils/announcements");

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function toPercentLabel(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return `${number.toFixed(digits)}%`;
}

function toPercentOrBlank(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${number.toFixed(digits)}%`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatCurrency(value, currency = "USD") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase()
  }).format(amount);
}

function daysDiff(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay);
}

function inferSubjectSlot(rawSubjectName = "") {
  const name = String(rawSubjectName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return null;
  if (/(qur|quran|hifdh|memorization)/.test(name)) return "quran";
  if (/(tajweed|tajwid|subac)/.test(name)) return "subac";
  if (/(islamic|fiqh|seerah|aqidah|hadith)/.test(name)) return "islamicStudies";
  if (/(writing|composition|arabic writing)/.test(name)) return "writing";
  if (/(character|akhlaq|adab|behavior|behaviour|conduct)/.test(name)) return "character";
  return null;
}

function summarizeAttendanceForStudent(attendanceDocs, studentId) {
  const presentStatuses = new Set(["Present", "Late", "Excused"]);
  const ignoredStatuses = new Set(["Holiday", "Weather"]);

  let presentCount = 0;
  let totalCount = 0;
  let absences = 0;
  let excused = 0;
  let late = 0;
  const recentRows = [];

  attendanceDocs
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((doc) => {
      const record = (doc.records || []).find((entry) => toIdString(entry.studentId) === String(studentId));
      if (!record) return;
      const status = String(record.status || "");
      if (!status || ignoredStatuses.has(status)) return;

      totalCount += 1;
      if (presentStatuses.has(status)) presentCount += 1;
      if (status === "Absent") absences += 1;
      if (status === "Excused") excused += 1;
      if (status === "Late") late += 1;

      if (recentRows.length < 8) {
        recentRows.push({
          date: doc.date,
          dateLabel: formatDate(doc.date),
          className: doc.className || "Class",
          status
        });
      }
    });

  const attendanceRate = totalCount > 0 ? (presentCount / totalCount) * 100 : null;
  return {
    attendanceRate,
    absences,
    excused,
    late,
    totalCount,
    recentRows
  };
}

function summarizeGradesForStudent(grades, studentId) {
  let totalPercent = 0;
  let gradeCount = 0;
  const bySubject = new Map();
  const recent = [];

  grades
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((grade) => {
      const hasStudent = (grade.students || []).some((student) => toIdString(student._id) === String(studentId));
      if (!hasStudent) return;

      const score = Number(grade?.Assignment?.grade || 0);
      const maxScore = Number(grade?.Assignment?.maxScore || 100);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

      const percent = (score / maxScore) * 100;
      totalPercent += percent;
      gradeCount += 1;

      const subjectLabel = String(
        grade.subjectLabel || grade.subject || grade.gradingContext?.subject?.label || "Subject"
      ).trim() || "Subject";

      const agg = bySubject.get(subjectLabel) || {
        subject: subjectLabel,
        sum: 0,
        count: 0,
        latestComment: "",
        latestUpdatedAt: null
      };
      agg.sum += percent;
      agg.count += 1;

      const comment = String(grade?.feedback?.content || "").trim();
      const updatedAt = new Date(grade.updatedAt || grade.createdAt || Date.now());
      if (comment && (!agg.latestUpdatedAt || updatedAt > agg.latestUpdatedAt)) {
        agg.latestComment = comment;
        agg.latestUpdatedAt = updatedAt;
      }
      bySubject.set(subjectLabel, agg);

      if (recent.length < 10) {
        recent.push({
          assignment: grade?.Assignment?.name || "Assessment",
          subject: subjectLabel,
          score,
          maxScore,
          percent,
          comment,
          updatedAt: grade.updatedAt || grade.createdAt,
          updatedAtLabel: formatDate(grade.updatedAt || grade.createdAt)
        });
      }
    });

  const subjectRows = Array.from(bySubject.values())
    .map((entry) => ({
      subject: entry.subject,
      averagePercent: entry.count > 0 ? entry.sum / entry.count : null,
      averageLabel: toPercentLabel(entry.count > 0 ? entry.sum / entry.count : null),
      teacherComment: entry.latestComment || ""
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return {
    overallAverage: gradeCount > 0 ? totalPercent / gradeCount : null,
    overallLabel: toPercentLabel(gradeCount > 0 ? totalPercent / gradeCount : null),
    gradeCount,
    subjectRows,
    recent
  };
}

function summarizeSubjectsForClassReport(grades) {
  const slots = {
    quran: { sum: 0, count: 0, comments: [] },
    subac: { sum: 0, count: 0, comments: [] },
    islamicStudies: { sum: 0, count: 0, comments: [] },
    writing: { sum: 0, count: 0, comments: [] },
    character: { sum: 0, count: 0, comments: [] }
  };

  grades.forEach((grade) => {
    const score = Number(grade?.Assignment?.grade || 0);
    const maxScore = Number(grade?.Assignment?.maxScore || 100);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;

    const subjectName = grade?.subjectLabel || grade?.subject || grade?.Assignment?.type || "";
    const slot = inferSubjectSlot(subjectName);
    if (!slot || !slots[slot]) return;

    const percent = (score / maxScore) * 100;
    slots[slot].sum += percent;
    slots[slot].count += 1;

    const comment = String(grade?.feedback?.content || "").trim();
    if (comment) slots[slot].comments.push(comment);
  });

  const summarized = {};
  Object.entries(slots).forEach(([slot, value]) => {
    const avg = value.count > 0 ? value.sum / value.count : null;
    summarized[slot] = {
      grade: toPercentOrBlank(avg),
      comment: value.comments.slice(0, 2).join(" | ")
    };
  });

  return summarized;
}

function computeNextRecurringDueDate(parentDoc, now = new Date()) {
  const billingProfile = parentDoc?.parentInfo?.billingProfile || {};
  const billingDay = Math.min(28, Math.max(1, Number(billingProfile.billingDayOfMonth || 1)));
  const dueDate = new Date(now.getFullYear(), now.getMonth(), billingDay);

  if (dueDate < now) {
    return new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
  }
  return dueDate;
}

function normalizePaymentStatus(payment, now = new Date()) {
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

  const daysRemaining = dueDateValid ? daysDiff(now, dueDate) : null;

  return {
    ...payment,
    status,
    amountDue,
    dueDate,
    dueDateLabel: dueDateValid ? formatDate(dueDate) : "N/A",
    paidAtLabel: payment.paidAt ? formatDate(payment.paidAt) : "—",
    createdAtLabel: payment.createdAt ? formatDateTime(payment.createdAt) : "—",
    daysRemaining
  };
}

function buildPaymentRing(nextPayment, now = new Date()) {
  if (!nextPayment) {
    return {
      percent: 0,
      state: "none",
      amountLabel: "$0.00",
      statusLabel: "No payment due",
      dueLabel: "No pending invoices"
    };
  }

  if (nextPayment.status === "Paid") {
    return {
      percent: 100,
      state: "paid",
      amountLabel: formatCurrency(0, nextPayment.currency),
      statusLabel: "Paid",
      dueLabel: `Paid on ${nextPayment.paidAtLabel || nextPayment.dueDateLabel}`
    };
  }

  if (nextPayment.status === "Overdue") {
    return {
      percent: 100,
      state: "overdue",
      amountLabel: formatCurrency(nextPayment.amountDue, nextPayment.currency),
      statusLabel: "Overdue",
      dueLabel: `Due ${nextPayment.dueDateLabel}`
    };
  }

  if (nextPayment.status === "PendingProcessor") {
    return {
      percent: 85,
      state: "pending",
      amountLabel: formatCurrency(nextPayment.amountDue, nextPayment.currency),
      statusLabel: "Payment Requested",
      dueLabel: `Awaiting processor setup (${nextPayment.dueDateLabel})`
    };
  }

  const dueDate = nextPayment.dueDate ? new Date(nextPayment.dueDate) : null;
  const dueDateValid = dueDate && !Number.isNaN(dueDate.getTime());
  const windowDays = 30;
  let percent = 0;

  if (dueDateValid) {
    const startDate = new Date(dueDate);
    startDate.setDate(startDate.getDate() - windowDays);
    const elapsed = now.getTime() - startDate.getTime();
    const total = dueDate.getTime() - startDate.getTime();
    percent = total > 0 ? (elapsed / total) * 100 : 0;
  }

  percent = Math.max(0, Math.min(100, percent));

  return {
    percent,
    state: "due",
    amountLabel: formatCurrency(nextPayment.amountDue, nextPayment.currency),
    statusLabel: nextPayment.daysRemaining != null && nextPayment.daysRemaining >= 0
      ? `${nextPayment.daysRemaining} day(s) left`
      : "Due soon",
    dueLabel: `Due ${nextPayment.dueDateLabel}`
  };
}

function computeChildStatusChip(summary) {
  const avg = Number.isFinite(summary?.overallAverage)
    ? Number(summary.overallAverage)
    : null;
  const attendance = Number.isFinite(summary?.attendanceRate)
    ? Number(summary.attendanceRate)
    : null;
  if (avg != null && avg < 70) return { label: "Needs Attention", tone: "danger" };
  if (attendance != null && attendance < 80) return { label: "Attendance Alert", tone: "warning" };
  if (Number.isFinite(avg) && avg >= 85 && Number.isFinite(attendance) && attendance >= 90) {
    return { label: "On Track", tone: "success" };
  }
  return { label: "In Progress", tone: "neutral" };
}

function buildReportErrorMessage(err) {
  if (err?.code === "LATEX_COMPILER_MISSING") {
    return "PDF compiler not available on this server. Install pdflatex (TeX Live).";
  }
  if (err?.code === "LATEX_CLASS_MISSING") {
    return "The report class file is missing on the server. Contact engineering support.";
  }
  return "Could not generate the report PDF.";
}

function pdfFileName(prefix, studentName) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${normalizeJobName(`${prefix}-${studentName}`)}-${stamp}.pdf`;
}

async function buildParentPortalViewModel(req, options = {}) {
  const parent = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
  if (!parent) return null;

  const linkedStudents = await getLinkedStudentsForParent(req, parent);
  const childIds = linkedStudents.map((student) => student._id);
  const childIdSet = new Set(childIds.map((id) => String(id)));

  const selectedChildIdRaw = options.selectedChildId || req.query.childId;
  const invalidSelectedChildId = Boolean(selectedChildIdRaw) && !childIdSet.has(String(selectedChildIdRaw));
  const selectedChildId = selectedChildIdRaw && childIdSet.has(String(selectedChildIdRaw))
    ? String(selectedChildIdRaw)
    : childIds.length
      ? String(childIds[0])
      : null;

  const [classDocs, gradeDocs, attendanceDocs, paymentDocs, reportDocs, parentAnnouncementsRaw] = await Promise.all([
    childIds.length
      ? Class.find(scopedQuery(req, { "students._id": { $in: childIds } })).lean()
      : [],
    childIds.length
      ? Grade.find(scopedQuery(req, { "students._id": { $in: childIds } })).sort({ createdAt: -1 }).lean()
      : [],
    childIds.length
      ? Attendance.find(scopedQuery(req, { "records.studentId": { $in: childIds } })).sort({ date: -1 }).lean()
      : [],
    ParentPayment.find(scopedQuery(req, { parentId: parent._id })).sort({ dueDate: 1, createdAt: -1 }).lean(),
    childIds.length
      ? ReportActivity.find(
        scopedQuery(req, {
          reportType: "student",
          "target._id": { $in: childIds }
        })
      )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
      : [],
    getVisibleAnnouncementsForUser(req, parent, { limit: 10 })
  ]);

  const childNameById = new Map(
    linkedStudents.map((student) => [String(student._id), buildDisplayName(student)])
  );

  const classByStudentId = new Map();
  classDocs.forEach((classDoc) => {
    (classDoc.students || []).forEach((entry) => {
      classByStudentId.set(String(entry._id), classDoc);
    });
  });

  const gradesByStudentId = new Map();
  const attendanceByStudentId = new Map();

  linkedStudents.forEach((child) => {
    gradesByStudentId.set(String(child._id), []);
    attendanceByStudentId.set(String(child._id), []);
  });

  gradeDocs.forEach((grade) => {
    (grade.students || []).forEach((studentRef) => {
      const id = String(studentRef._id);
      if (!gradesByStudentId.has(id)) return;
      gradesByStudentId.get(id).push(grade);
    });
  });

  attendanceDocs.forEach((doc) => {
    (doc.records || []).forEach((record) => {
      const id = String(record.studentId);
      if (!attendanceByStudentId.has(id)) return;
      attendanceByStudentId.get(id).push({
        ...doc,
        records: [record]
      });
    });
  });

  const childSummaries = linkedStudents.map((child) => {
    const childId = String(child._id);
    const childGrades = gradesByStudentId.get(childId) || [];
    const childAttendance = attendanceByStudentId.get(childId) || [];
    const classDoc = classByStudentId.get(childId);

    const gradeSummary = summarizeGradesForStudent(childGrades, childId);
    const attendanceSummary = summarizeAttendanceForStudent(childAttendance, childId);
    const statusChip = computeChildStatusChip({
      overallAverage: gradeSummary.overallAverage,
      attendanceRate: attendanceSummary.attendanceRate
    });

    return {
      childId,
      fullName: buildDisplayName(child),
      gradeLevel: child?.studentInfo?.gradeLevel || "N/A",
      programType: child?.studentInfo?.programType || "N/A",
      className: classDoc?.className || "Unassigned",
      teacherNames: (classDoc?.teachers || []).map((teacher) => teacher.name).filter(Boolean).join(", ") || "N/A",
      overallAverage: gradeSummary.overallAverage,
      overallAverageLabel: gradeSummary.overallLabel,
      attendanceRate: attendanceSummary.attendanceRate,
      attendanceRateLabel: toPercentLabel(attendanceSummary.attendanceRate),
      gradeCount: gradeSummary.gradeCount,
      statusChip
    };
  });

  const selectedChild = childSummaries.find((entry) => entry.childId === selectedChildId) || null;
  const selectedChildGrades = selectedChildId ? (gradesByStudentId.get(selectedChildId) || []) : [];
  const selectedChildAttendance = selectedChildId ? (attendanceByStudentId.get(selectedChildId) || []) : [];

  const selectedGradesSummary = summarizeGradesForStudent(selectedChildGrades, selectedChildId);
  const selectedAttendanceSummary = summarizeAttendanceForStudent(selectedChildAttendance, selectedChildId);

  const normalizedPayments = paymentDocs
    .map((entry) => {
      const normalized = normalizePaymentStatus(entry, new Date());
      const childId = normalized.studentId ? String(normalized.studentId) : "";
      return {
        ...normalized,
        childName: childId ? (childNameById.get(childId) || "N/A") : "Family"
      };
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const familyOutstanding = normalizedPayments.reduce((sum, payment) => sum + Number(payment.amountDue || 0), 0);
  const totalPaid = normalizedPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);

  let nextPayment = normalizedPayments.find((payment) =>
    ["Due", "Overdue", "Partial", "PendingProcessor"].includes(payment.status) && Number(payment.amountDue || 0) > 0
  ) || null;

  if (!nextPayment) {
    const monthlyAmount = Number(parent?.parentInfo?.billingProfile?.monthlyTuitionAmount || 0);
    if (monthlyAmount > 0) {
      const dueDate = computeNextRecurringDueDate(parent, new Date());
      nextPayment = normalizePaymentStatus(
        {
          _id: null,
          title: "Monthly Tuition",
          category: "Tuition",
          expectedAmount: monthlyAmount,
          paidAmount: 0,
          currency: parent?.parentInfo?.billingProfile?.currency || "USD",
          dueDate,
          status: "Due",
          notes: "Auto-generated from billing profile"
        },
        new Date()
      );
      nextPayment.synthetic = true;
    }
  }

  const paymentRing = buildPaymentRing(nextPayment, new Date());

  const recentReports = reportDocs.map((entry) => ({
    studentId: String(entry?.target?._id || ""),
    studentName: entry?.target?.name || "Student",
    generatedAt: entry.createdAt,
    generatedAtLabel: formatDateTime(entry.createdAt),
    fileName: entry.fileName || ""
  }));

  const selectedStudentDoc = linkedStudents.find((entry) => String(entry._id) === String(selectedChildId)) || null;
  const announcements = parentAnnouncementsRaw.map((announcement) =>
    toAnnouncementViewModel(announcement)
  );

  return {
    parent,
    linkedStudents,
    invalidSelectedChildId,
    selectedChildId,
    selectedStudentDoc,
    childSummaries,
    selectedChild,
    selectedGradesSummary,
    selectedAttendanceSummary,
    payments: normalizedPayments,
    nextPayment,
    paymentRing,
    familyOutstanding,
    totalPaid,
    recentReports,
    announcements
  };
}

async function buildStudentReportPayloadForParent(req, parentDoc, studentDoc) {
  const [classDocs, gradeDocs, attendanceDocs] = await Promise.all([
    Class.find(scopedQuery(req, { "students._id": studentDoc._id })).lean(),
    Grade.find(scopedQuery(req, { "students._id": studentDoc._id })).sort({ createdAt: -1 }).lean(),
    Attendance.find(scopedQuery(req, { "records.studentId": studentDoc._id })).sort({ date: -1 }).lean()
  ]);

  const primaryClass = classDocs[0] || null;
  const teacherName = (primaryClass?.teachers || []).map((entry) => entry.name).filter(Boolean).join(", ");
  const gradeSummary = summarizeGradesForStudent(gradeDocs, studentDoc._id);
  const attendanceSummary = summarizeAttendanceForStudent(attendanceDocs, studentDoc._id);
  const subjectSummary = summarizeSubjectsForClassReport(gradeDocs);
  const parentName = buildDisplayName(parentDoc);

  return {
    studentName: buildDisplayName(studentDoc),
    institution: "Al Bayaan Institute",
    department: "",
    program: studentDoc?.studentInfo?.programType || primaryClass?.programType || "",
    semester: primaryClass?.academicYear?.semester || "",
    teacher: teacherName,
    rank: "",
    finalGrade: toPercentOrBlank(gradeSummary.overallAverage),
    reportDate: formatDate(new Date()),
    reportTitle: "Student Progress Report",
    gradeLevel: studentDoc?.studentInfo?.gradeLevel || "",
    studentId: studentDoc?.studentInfo?.studentNumber ? String(studentDoc.studentInfo.studentNumber) : "",
    parentName,
    attendancePct: toPercentOrBlank(attendanceSummary.attendanceRate),
    absences: String(attendanceSummary.absences || 0),
    excusedAbsences: String(attendanceSummary.excused || 0),
    late: String(attendanceSummary.late || 0),
    earlyPickup: "",
    quranLabel: "Qur'an Memorization",
    subacLabel: "Tajweed",
    islamicStudiesLabel: "Islamic Studies",
    writingLabel: "Writing",
    characterLabel: "Akhlaq / Character",
    quranGrade: subjectSummary.quran.grade,
    subacGrade: subjectSummary.subac.grade,
    islamicStudiesGrade: subjectSummary.islamicStudies.grade,
    writingGrade: subjectSummary.writing.grade,
    characterGrade: subjectSummary.character.grade,
    quranComment: subjectSummary.quran.comment,
    subacComment: subjectSummary.subac.comment,
    islamicStudiesComment: subjectSummary.islamicStudies.comment,
    writingComment: subjectSummary.writing.comment,
    characterComment: subjectSummary.character.comment,
    logoPath: "logo.jpg"
  };
}

module.exports = {
  getDashboard: async (req, res) => {
    try {
      const portal = await buildParentPortalViewModel(req);
      if (!portal) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/login");
      }

      if (portal.invalidSelectedChildId) {
        req.flash("errors", [{ msg: "You are not authorized for the selected child profile." }]);
        return res.redirect("/parent/home");
      }

      return res.render("parent/dashboard.ejs", {
        user: req.user,
        activePage: "dashboard",
        portal,
        messages: req.flash()
      });
    } catch (err) {
      console.error("Parent dashboard error:", err);
      return res.status(500).send("Error loading parent dashboard.");
    }
  },

  getChildDashboard: async (req, res) => {
    try {
      const parentDoc = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
      if (!parentDoc) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/parent/home");
      }

      const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
      const isLinked = linkedStudents.some((student) => String(student._id) === String(req.params.id));
      if (!isLinked) {
        req.flash("errors", [{ msg: "You are not authorized for that child profile." }]);
        return res.redirect("/parent/home");
      }

      return res.redirect(`/parent/home?childId=${req.params.id}`);
    } catch (err) {
      console.error("Parent child route error:", err);
      req.flash("errors", [{ msg: "Unable to load child profile." }]);
      return res.redirect("/parent/home");
    }
  },

  requestPaymentCheckout: async (req, res) => {
    try {
      const parentDoc = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
      if (!parentDoc) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/login");
      }

      const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
      const linkedChildIds = new Set(linkedStudents.map((student) => String(student._id)));
      const selectedChildId = req.body.childId ? String(req.body.childId) : "";

      if (selectedChildId && !linkedChildIds.has(selectedChildId)) {
        req.flash("errors", [{ msg: "You are not authorized for the selected student." }]);
        return res.redirect("/parent/home");
      }

      const requestedAmount = Number(req.body.amount || 0);
      let paymentDoc = null;

      if (req.body.paymentId) {
        paymentDoc = await ParentPayment.findOne(
          scopedIdQuery(req, req.body.paymentId, { parentId: parentDoc._id })
        );
        if (!paymentDoc) {
          req.flash("errors", [{ msg: "Payment request not found." }]);
          return res.redirect("/parent/home");
        }
      } else {
        const monthlyAmount = Number(parentDoc?.parentInfo?.billingProfile?.monthlyTuitionAmount || 0);
        if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
          req.flash("errors", [{ msg: "No billable amount is configured yet. Please contact the school office." }]);
          return res.redirect("/parent/home");
        }

        const dueDate = computeNextRecurringDueDate(parentDoc, new Date());
        paymentDoc = await ParentPayment.create({
          schoolId: req.schoolId,
          parentId: parentDoc._id,
          studentId: selectedChildId || null,
          title: "Monthly Tuition",
          category: "Tuition",
          expectedAmount: monthlyAmount,
          paidAmount: 0,
          currency: parentDoc?.parentInfo?.billingProfile?.currency || "USD",
          dueDate,
          status: "Due",
          notes: "Created from parent portal billing profile.",
          createdBy: {
            _id: req.user._id,
            name: buildDisplayName(req.user),
            role: req.user.role
          },
          updatedBy: {
            _id: req.user._id,
            name: buildDisplayName(req.user),
            role: req.user.role
          }
        });
      }

      const amountDue = Math.max(Number(paymentDoc.expectedAmount || 0) - Number(paymentDoc.paidAmount || 0), 0);
      if (amountDue <= 0) {
        req.flash("info", [{ msg: "This payment record is already settled." }]);
        return res.redirect(selectedChildId ? `/parent/home?childId=${selectedChildId}` : "/parent/home");
      }
      const attemptAmount = Number.isFinite(requestedAmount) && requestedAmount > 0
        ? Math.min(requestedAmount, amountDue || requestedAmount)
        : amountDue;

      paymentDoc.attempts.push({
        requestedAmount: Math.max(0, attemptAmount),
        requestedAt: new Date(),
        status: "requested",
        channel: "portal",
        // TODO: Replace with real processor checkout session creation (Stripe/Adyen/etc).
        note: "Checkout requested from parent portal. No funds captured."
      });

      if (amountDue > 0) {
        paymentDoc.status = "PendingProcessor";
      }

      paymentDoc.updatedBy = {
        _id: req.user._id,
        name: buildDisplayName(req.user),
        role: req.user.role
      };
      await paymentDoc.save();

      req.flash("success", "Payment request submitted. No charge has been made yet while processor integration is pending.");
      return res.redirect(selectedChildId ? `/parent/home?childId=${selectedChildId}` : "/parent/home");
    } catch (err) {
      console.error("Parent checkout request error:", err);
      req.flash("errors", [{ msg: "Could not submit payment request right now." }]);
      return res.redirect("/parent/home");
    }
  },

  downloadStudentReportPdf: async (req, res) => {
    try {
      const parentDoc = await User.findOne(scopedIdQuery(req, req.user._id, { role: "parent" }));
      if (!parentDoc) {
        req.flash("errors", [{ msg: "Parent account not found." }]);
        return res.redirect("/parent/home");
      }

      const linkedStudents = await getLinkedStudentsForParent(req, parentDoc);
      const student = linkedStudents.find((entry) => String(entry._id) === String(req.params.studentId));

      if (!student) {
        req.flash("errors", [{ msg: "You are not authorized to view that report." }]);
        return res.redirect("/parent/home");
      }

      const payload = await buildStudentReportPayloadForParent(req, parentDoc, student);
      const latexSource = renderStudentReportLatex(payload);
      const fileName = pdfFileName("parent-student-report", payload.studentName);
      const pdfBuffer = await compileLatexToPdf({
        latexSource,
        jobName: normalizeJobName(`parent-student-report-${payload.studentName}`)
      });

      await ReportActivity.create({
        schoolId: req.schoolId,
        reportType: "student",
        generatedBy: {
          _id: req.user._id,
          name: buildDisplayName(req.user)
        },
        target: {
          _id: student._id,
          name: buildDisplayName(student)
        },
        fileName
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(pdfBuffer);
    } catch (err) {
      console.error("Parent report generation failed:", err?.details || err);
      req.flash("errors", [{ msg: buildReportErrorMessage(err) }]);
      return res.redirect("/parent/home");
    }
  }
};
