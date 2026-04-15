const fs = require("node:fs/promises");
const User = require("../models/User");
const School = require("../models/School");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const ReportActivity = require("../models/ReportActivity");
const cloudinary = require("../middleware/cloudinary");
const { scopedQuery } = require("../utils/tenant");
const { normalizeEmail, normalizeUserName } = require("../utils/userIdentifiers");

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function cleanInput(value, maxLength = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatProfileDate(value) {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function computeProfileCompleteness(userDoc = {}) {
  const checks = [
    Boolean(cleanInput(userDoc.firstName)),
    Boolean(cleanInput(userDoc.lastName)),
    Boolean(cleanInput(userDoc.userName)),
    Boolean(cleanInput(userDoc.email)),
    Boolean(userDoc.DOB),
    Boolean(cleanInput(userDoc.gender)),
    Boolean(cleanInput(userDoc.profileImage || userDoc.profilePic))
  ];

  const complete = checks.filter(Boolean).length;
  const total = checks.length;
  const percent = Math.round((complete / total) * 100);

  return { complete, total, percent };
}

function buildQuickActions(role, dashboardPath) {
  const actionsByRole = {
    admin: [
      { label: "Dashboard", href: dashboardPath },
      { label: "Manage Users", href: "/admin/users" },
      { label: "Reports", href: "/admin/reports" }
    ],
    teacher: [
      { label: "Dashboard", href: dashboardPath },
      { label: "Grades", href: "/teacher/manage-grades" },
      { label: "Attendance", href: "/teacher/manage-attendance" }
    ],
    student: [
      { label: "Dashboard", href: dashboardPath },
      { label: "My Grades", href: "/student/grades" },
      { label: "My Missions", href: "/student/missions" }
    ],
    parent: [
      { label: "Dashboard", href: dashboardPath },
      { label: "Missions", href: "/parent/home#missions" },
      { label: "Children", href: "/parent/home#children" }
    ]
  };

  return actionsByRole[role] || [{ label: "Dashboard", href: dashboardPath }];
}

async function cleanupUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_err) {
    // Ignore cleanup failures for temporary upload files.
  }
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

module.exports = {
  getProfile: async (req, res) => {
    try {
      const role = String(req.user?.role || "student");
      const userId = req.user?._id;
      const roleLabel = ({ admin: "Administrator", teacher: "Teacher", student: "Student", parent: "Parent" })[role] || "User";
      const dashboardPath = ({
        admin: "/admin/home",
        teacher: "/teacher/home",
        student: "/student/home",
        parent: "/parent/home"
      })[role] || "/student/home";

      const linkedChildIds = role === "parent"
        ? Array.from(
          new Set(
            (req.user?.parentInfo?.children || [])
              .map((entry) => toIdString(entry?.childID))
              .filter(Boolean)
          )
        )
        : [];
      const linkedChildIdSet = new Set(linkedChildIds);

      let classCriteria = {};
      if (role === "teacher") {
        classCriteria = { "teachers._id": userId };
      } else if (role === "student") {
        classCriteria = { "students._id": userId };
      } else if (role === "parent") {
        classCriteria = linkedChildIds.length ? { "students._id": { $in: linkedChildIds } } : { _id: null };
      }

      const reportCriteria =
        role === "student"
          ? { reportType: "student", "target._id": userId }
          : role === "parent"
            ? (linkedChildIds.length ? { reportType: "student", "target._id": { $in: linkedChildIds } } : { _id: null })
            : { "generatedBy._id": userId };

      const classesQuery = Class.find(scopedQuery(req, classCriteria))
        .select("className classCode academicYear teachers students subjects")
        .lean();

      const reportQuery = ReportActivity.find(scopedQuery(req, reportCriteria))
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
      const schoolQuery = School.findById(req.schoolId)
        .select("schoolName")
        .lean();

      const viewerProfileQuery = User.findOne(scopedQuery(req, { _id: userId }))
        .select("profileImage profilePic")
        .lean();

      const adminCountsQuery =
        role === "admin"
          ? Promise.all([
            User.countDocuments(scopedQuery(req, { role: "student" })),
            User.countDocuments(scopedQuery(req, { role: "teacher" })),
            User.countDocuments(scopedQuery(req, { role: "parent" })),
            User.countDocuments(scopedQuery(req))
          ])
          : Promise.resolve(null);

      const teacherGradeCountQuery =
        role === "teacher"
          ? Grade.countDocuments(scopedQuery(req, { "feedback.teacher._id": userId }))
          : Promise.resolve(0);

      const studentGradeCountQuery =
        role === "student"
          ? Grade.countDocuments(scopedQuery(req, { "students._id": userId }))
          : Promise.resolve(0);

      const studentAttendanceQuery =
        role === "student"
          ? Attendance.find(scopedQuery(req, { "records.studentId": userId })).select("records").lean()
          : Promise.resolve([]);

      const linkedChildrenQuery =
        role === "parent" && linkedChildIds.length
          ? User.find(scopedQuery(req, { _id: { $in: linkedChildIds }, role: "student" }))
            .select("firstName lastName studentInfo.gradeLevel studentInfo.programType")
            .lean()
          : Promise.resolve([]);

      const [
        classes,
        recentReportsRaw,
        adminCounts,
        teacherGradeCount,
        studentGradeCount,
        studentAttendanceDocs,
        linkedChildren,
        viewerProfile,
        schoolDoc
      ] = await Promise.all([
        classesQuery,
        reportQuery,
        adminCountsQuery,
        teacherGradeCountQuery,
        studentGradeCountQuery,
        studentAttendanceQuery,
        linkedChildrenQuery,
        viewerProfileQuery,
        schoolQuery
      ]);
      const schoolName = String(schoolDoc?.schoolName || "").trim() || "Unknown School";

      const profileUser = {
        ...req.user,
        profileImage: cleanInput(viewerProfile?.profileImage || req.user?.profileImage, 600),
        profilePic: cleanInput(viewerProfile?.profilePic || req.user?.profilePic, 600)
      };

      const classRows = (classes || []).map((classDoc) => ({
        className: classDoc.className || "Unnamed Class",
        classCode: classDoc.classCode || "N/A",
        teacherCount: Array.isArray(classDoc.teachers) ? classDoc.teachers.length : 0,
        studentCount: Array.isArray(classDoc.students) ? classDoc.students.length : 0,
        subjectCount: Array.isArray(classDoc.subjects) ? classDoc.subjects.length : 0
      }));

      const childClassMap = new Map();
      (classes || []).forEach((classDoc) => {
        (classDoc.students || []).forEach((studentRef) => {
          const childId = toIdString(studentRef?._id);
          if (!linkedChildIdSet.has(childId)) return;
          if (!childClassMap.has(childId)) childClassMap.set(childId, new Set());
          childClassMap.get(childId).add(classDoc.className || "Unnamed Class");
        });
      });

      const quickStats = [];
      const rolePanel = {
        title: `${roleLabel} Details`,
        description: "Role-specific account context",
        items: [],
        chips: [],
        listTitle: "",
        listItems: [],
        emptyListText: "No role-specific records available yet."
      };

      if (role === "admin" && Array.isArray(adminCounts)) {
        const [studentCount, teacherCount, parentCount, totalUsers] = adminCounts;
        quickStats.push(
          { label: "Total Users", value: String(totalUsers), tone: "neutral" },
          { label: "Students", value: String(studentCount), tone: "success" },
          { label: "Teachers", value: String(teacherCount), tone: "neutral" },
          { label: "Parents", value: String(parentCount), tone: "neutral" }
        );
        rolePanel.items.push(
          { label: "School", value: schoolName },
          { label: "Active Classes", value: String(classRows.length) },
          { label: "Administrative Access", value: "Users, classes, announcements, reports" }
        );
        rolePanel.chips = ["Operations", "Compliance", "Scheduling", "Reporting"];
      } else if (role === "teacher") {
        const subjectList = Array.isArray(req.user?.teacherInfo?.subjects)
          ? req.user.teacherInfo.subjects.filter(Boolean)
          : [];
        const uniqueStudents = new Set();
        (classes || []).forEach((classDoc) => {
          (classDoc?.students || []).forEach((studentRef) => uniqueStudents.add(toIdString(studentRef?._id)));
        });

        quickStats.push(
          { label: "Assigned Classes", value: String(classRows.length), tone: "success" },
          { label: "Students", value: String(uniqueStudents.size), tone: "neutral" },
          { label: "Grade Entries", value: String(teacherGradeCount || 0), tone: "neutral" }
        );
        rolePanel.items.push(
          { label: "Employee ID", value: cleanInput(req.user?.teacherInfo?.employeeId) || "Not provided" },
          { label: "Hire Date", value: formatProfileDate(req.user?.teacherInfo?.hireDate) },
          { label: "Subject Areas", value: subjectList.length ? String(subjectList.length) : "0" }
        );
        rolePanel.chips = subjectList.length ? subjectList : ["No subjects assigned"];
        rolePanel.listTitle = "Assigned Classes";
        rolePanel.listItems = classRows.map((row) => `${row.className} (${row.classCode})`);
        rolePanel.emptyListText = "No classes assigned yet.";
      } else if (role === "student") {
        let attendanceRateLabel = "N/A";
        if (Array.isArray(studentAttendanceDocs) && studentAttendanceDocs.length) {
          let attendanceTotal = 0;
          let attendancePresent = 0;
          studentAttendanceDocs.forEach((attendanceDoc) => {
            (attendanceDoc.records || []).forEach((record) => {
              if (toIdString(record.studentId) !== toIdString(userId)) return;
              attendanceTotal += 1;
              if (["Present", "Late", "Excused"].includes(String(record.status || ""))) {
                attendancePresent += 1;
              }
            });
          });
          if (attendanceTotal > 0) {
            attendanceRateLabel = `${((attendancePresent / attendanceTotal) * 100).toFixed(1)}%`;
          }
        }

        quickStats.push(
          { label: "Classes", value: String(classRows.length), tone: "neutral" },
          { label: "Grade Entries", value: String(studentGradeCount || 0), tone: "neutral" },
          { label: "Attendance", value: attendanceRateLabel, tone: "success" },
          { label: "XP Points", value: String(Number(req.user?.points || 0)), tone: "neutral" }
        );
        rolePanel.items.push(
          { label: "Student Number", value: cleanInput(req.user?.studentInfo?.studentNumber) || "Not provided" },
          { label: "Grade Level", value: cleanInput(req.user?.studentInfo?.gradeLevel) || "Not provided" },
          { label: "Program", value: cleanInput(req.user?.studentInfo?.programType) || "Not provided" },
          { label: "Rank", value: cleanInput(req.user?.rank) || "N/A" }
        );
        rolePanel.chips = (req.user?.studentInfo?.parents || []).map((parentRef) => {
          const parentName = cleanInput(parentRef?.parentName) || "Guardian";
          const relationship = cleanInput(parentRef?.relationship) || "Guardian";
          return `${parentName} (${relationship})`;
        });
        if (!rolePanel.chips.length) rolePanel.chips = ["No linked guardians"];
        rolePanel.listTitle = "Current Classes";
        rolePanel.listItems = classRows.map((row) => `${row.className} (${row.classCode})`);
        rolePanel.emptyListText = "No classes are linked yet.";
      } else if (role === "parent") {
        quickStats.push(
          { label: "Linked Children", value: String(linkedChildIds.length), tone: "neutral" },
          { label: "Active Classes", value: String(classRows.length), tone: "neutral" },
          { label: "Recent Reports", value: String(recentReportsRaw.length || 0), tone: "neutral" },
          { label: "Portal Access", value: "Read-only", tone: "success" }
        );
        rolePanel.items.push(
          { label: "Linked Students", value: String(linkedChildIds.length) },
          { label: "Academic Visibility", value: "Grades, attendance, missions" },
          { label: "Latest Report Records", value: String(recentReportsRaw.length || 0) },
          { label: "Portal Permissions", value: "Read-only academic monitoring" }
        );
        rolePanel.chips = (linkedChildren || []).map((child) => {
          const childName = `${child?.firstName || ""} ${child?.lastName || ""}`.trim() || "Student";
          return childName;
        });
        if (!rolePanel.chips.length) rolePanel.chips = ["No linked children"];
        rolePanel.listTitle = "Linked Child Context";
        rolePanel.listItems = (linkedChildren || []).map((child) => {
          const childId = toIdString(child._id);
          const childName = `${child?.firstName || ""} ${child?.lastName || ""}`.trim() || "Student";
          const classLabels = Array.from(childClassMap.get(childId) || []);
          const gradeLevel = cleanInput(child?.studentInfo?.gradeLevel) || "No grade level";
          const programType = cleanInput(child?.studentInfo?.programType) || "No program";
          const classLabel = classLabels.length ? classLabels.join(", ") : "No class assigned";
          return `${childName} · ${gradeLevel} · ${programType} · ${classLabel}`;
        });
        rolePanel.emptyListText = "No linked child records found.";
      } else {
        rolePanel.items.push({
          label: "Account Role",
          value: roleLabel
        });
      }

      const recentReports = (recentReportsRaw || []).map((entry) => ({
        title: `${entry.reportType === "class" ? "Class" : "Student"} report`,
        targetName: cleanInput(entry?.target?.name) || "Unknown target",
        generatedAt: formatProfileDate(entry.createdAt)
      }));

      const overviewRows = [
        { label: "Full Name", value: `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() || "Not provided" },
        { label: "Username", value: cleanInput(req.user?.userName) || "Not provided" },
        { label: "Role", value: roleLabel },
        { label: "Member Since", value: formatProfileDate(req.user?.createdAt) },
        { label: "School", value: schoolName }
      ];

      const profileModel = {
        dashboardPath,
        schoolName,
        roleLabel,
        avatarUrl: cleanInput(profileUser.profileImage || profileUser.profilePic, 600),
        canManageAvatar: role === "admin",
        canUploadAvatar: role === "admin" && isCloudinaryConfigured(),
        completeness: computeProfileCompleteness(profileUser),
        overviewRows,
        rolePanel,
        quickStats,
        quickActions: buildQuickActions(role, dashboardPath),
        classRows,
        recentReports,
        editable: {
          firstName: cleanInput(req.user?.firstName, 80),
          lastName: cleanInput(req.user?.lastName, 80),
          userName: cleanInput(req.user?.userName, 80),
          email: cleanInput(req.user?.email, 180),
          DOB: req.user?.DOB ? new Date(req.user.DOB).toISOString().slice(0, 10) : "",
          gender: cleanInput(req.user?.gender, 16).toLowerCase()
        }
      };

      return res.render("profile.ejs", {
        user: req.user,
        classes,
        profileModel,
        messages: req.flash()
      });
    } catch (err) {
      console.error("Error loading profile:", err);
      req.flash("errors", [{ msg: "Could not load profile page." }]);
      return res.redirect("/");
    }
  },

  updateProfile: async (req, res) => {
    try {
      const currentUser = await User.findOne(scopedQuery(req, { _id: req.user._id }));
      if (!currentUser) {
        req.flash("errors", [{ msg: "Profile account not found." }]);
        return res.redirect("/login");
      }

      const firstName = cleanInput(req.body?.firstName, 80);
      const lastName = cleanInput(req.body?.lastName, 80);
      const userName = normalizeUserName(req.body?.userName || "");
      const email = normalizeEmail(req.body?.email || "");
      const genderRaw = cleanInput(req.body?.gender, 16).toLowerCase();
      const dobInputRaw = cleanInput(req.body?.DOB, 20);

      const validationErrors = [];
      if (!firstName) validationErrors.push("First name is required.");
      if (!lastName) validationErrors.push("Last name is required.");
      if (!userName) validationErrors.push("Username is required.");
      if (!email || !email.includes("@") || !email.includes(".")) {
        validationErrors.push("A valid email address is required.");
      }
      if (genderRaw && !["male", "female", "other"].includes(genderRaw)) {
        validationErrors.push("Gender must be male, female, or other.");
      }

      let parsedDob = null;
      if (dobInputRaw) {
        parsedDob = parseDateInput(dobInputRaw);
        if (!parsedDob) validationErrors.push("Date of birth is invalid.");
      }

      if (validationErrors.length > 0) {
        req.flash("errors", validationErrors.map((msg) => ({ msg })));
        return res.redirect("/profile");
      }

      const [emailConflict, usernameConflict] = await Promise.all([
        User.findOne(
          scopedQuery(req, {
            _id: { $ne: currentUser._id },
            emailNormalized: email
          })
        ).lean(),
        User.findOne(
          scopedQuery(req, {
            _id: { $ne: currentUser._id },
            userNameNormalized: userName
          })
        ).lean()
      ]);

      if (emailConflict) {
        req.flash("errors", [{ msg: "Email already exists for this school." }]);
        return res.redirect("/profile");
      }
      if (usernameConflict) {
        req.flash("errors", [{ msg: "Username already exists for this school." }]);
        return res.redirect("/profile");
      }

      currentUser.firstName = firstName;
      currentUser.lastName = lastName;
      currentUser.userName = userName;
      currentUser.email = email;
      currentUser.gender = genderRaw || undefined;
      currentUser.DOB = parsedDob || null;

      await currentUser.save();

      req.flash("success", "Profile details updated successfully.");
      return res.redirect("/profile");
    } catch (err) {
      console.error("Error updating profile:", err);
      req.flash("errors", [{ msg: "Unable to update profile details right now." }]);
      return res.redirect("/profile");
    }
  },

  updateProfileAvatar: async (req, res) => {
    const uploadedPath = req.file?.path;

    try {
      if (req.user?.role !== "admin") {
        req.flash("errors", [{ msg: "Only admins can manage profile pictures." }]);
        return res.redirect("/profile");
      }

      if (req.fileValidationError) {
        req.flash("errors", [{ msg: req.fileValidationError }]);
        return res.redirect("/profile");
      }

      if (!req.file) {
        req.flash("errors", [{ msg: "Please choose an image file to upload." }]);
        return res.redirect("/profile");
      }

      if (!isCloudinaryConfigured()) {
        req.flash("errors", [{ msg: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET." }]);
        return res.redirect("/profile");
      }

      const currentUser = await User.findOne(scopedQuery(req, { _id: req.user._id }));
      if (!currentUser) {
        req.flash("errors", [{ msg: "Profile account not found." }]);
        return res.redirect("/login");
      }

      const uploadResult = await cloudinary.uploader.upload(uploadedPath, {
        folder: "ilmquest/profile-images",
        resource_type: "image",
        overwrite: true
      });

      if (currentUser.profileImageCloudinaryId) {
        await cloudinary.uploader.destroy(currentUser.profileImageCloudinaryId).catch(() => null);
      }

      currentUser.profileImage = uploadResult.secure_url;
      currentUser.profileImageCloudinaryId = uploadResult.public_id;
      await currentUser.save();

      req.flash("success", "Profile image updated successfully.");
      return res.redirect("/profile");
    } catch (err) {
      console.error("Error updating profile image:", err);
      req.flash("errors", [{ msg: "Unable to update profile image right now." }]);
      return res.redirect("/profile");
    } finally {
      await cleanupUploadedFile(uploadedPath);
    }
  },

  removeProfileAvatar: async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        req.flash("errors", [{ msg: "Only admins can manage profile pictures." }]);
        return res.redirect("/profile");
      }

      const currentUser = await User.findOne(scopedQuery(req, { _id: req.user._id }));
      if (!currentUser) {
        req.flash("errors", [{ msg: "Profile account not found." }]);
        return res.redirect("/login");
      }

      if (currentUser.profileImageCloudinaryId) {
        await cloudinary.uploader.destroy(currentUser.profileImageCloudinaryId).catch(() => null);
      }

      currentUser.profileImage = "";
      currentUser.profileImageCloudinaryId = "";
      await currentUser.save();

      req.flash("success", "Profile image removed successfully.");
      return res.redirect("/profile");
    } catch (err) {
      console.error("Error removing profile image:", err);
      req.flash("errors", [{ msg: "Unable to remove profile image right now." }]);
      return res.redirect("/profile");
    }
  }
};
