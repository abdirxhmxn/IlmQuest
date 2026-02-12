const User = require("../models/User");
const Mission = require("../models/Missions");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Attendance = require("../models/Attendance");
const Verses = require("../models/Verses");
const Reflection = require("../models/Reflections");
const { scopedQuery } = require("../utils/tenant");

// Helper to calculate a student's weighted average for a subject (defaults missing categories to 100%)
const getSubjectAverage = (grades, studentID, subject) => {
  const weightMap = {
    Homework: 20,
    Quiz: 15,
    Test: 25,
    Exam: 25,
    Behavior: 7.5,
    Participation: 7.5
  };
  const totalWeight = Object.values(weightMap).reduce((a, b) => a + b, 0);

  const filtered = grades.filter(
    g =>
      g.subject === subject &&
      g.students.some(s => s._id.toString() === studentID.toString())
  );

  // Group grades by category
  const categoryScores = {};
  filtered.forEach(g => {
    const category = g.Assignment.type;
    if (!weightMap[category]) return;
    const percent = ((g.Assignment.grade || 0) / (g.Assignment.maxScore || 100)) * 100;
    if (!categoryScores[category]) categoryScores[category] = [];
    categoryScores[category].push(percent);
  });

  // Calculate weighted average, defaulting missing categories to 100%
  let weightedSum = 0;
  Object.entries(weightMap).forEach(([category, weight]) => {
    const scores = categoryScores[category];
    const avg = scores && scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 100; // default full credit if no grade yet
    weightedSum += (avg / 100) * weight;
  });

  if (!totalWeight) return "100.00";
  return (weightedSum).toFixed(2);
};
module.exports = {
  getIndex: (req, res) => {
    res.render("index.ejs");
  },
  getMainPage: async (req, res) => {
    try {
      const verses = await Verses.find().lean();
      const reminders = await Reflection.find().lean()
      const randomVerses = verses[Math.floor(Math.random() * verses.length)];
      const randomReminders = reminders[Math.floor(Math.random() * reminders.length)]
      res.render("student/student.ejs", {
        user: req.user,
        verses: randomVerses,
        reflections: randomReminders
      });

    } catch (err) {
      console.error(err);
      res.send("Error loading reflection");
    }
  },
  getAdmin: async (req, res) => {
    try {
      // const Users = await User.find().lean();
      const students = await User.find(scopedQuery(req, { role: "student" })).lean()
      const teachers = await User.find(scopedQuery(req, { role: 'teacher' })).lean()
      const parents = await User.find(scopedQuery(req, { role: "parent" })).lean()
      const missions = await Mission.find(scopedQuery(req)).lean();
      const classes = await Class.find(scopedQuery(req)).lean();


      res.render("admin/admin.ejs", {
        user: req.user,
        classes: classes,
        missions: missions,
        teachers: teachers,
        students: students,
        parents: parents
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacher: async (req, res) => {
    try {
      const missions = await Mission.find(scopedQuery(req)).lean();
      const classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const students = classes.flatMap(cls => cls.students);
      const classIds = classes.map(cls => cls._id);
      const grades = await Grade.find(scopedQuery(req, { 'classInfo._id': { $in: classIds } })).lean();

      res.render("teacher/teacher.ejs", {
        user: req.user,
        classes,
        missions,
        students,
        grades,
        getSubjectAverage
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacherGrades: async (req, res) => {
    try {
      const missions = await Mission.find(scopedQuery(req)).lean();
      const classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
      const students = classes.flatMap(cls => cls.students);
      const classIds = classes.map(cls => cls._id);
      const grades = await Grade.find(scopedQuery(req, { 'classInfo._id': { $in: classIds } })).lean();
      res.render("teacher/teacherGrades.ejs", {
        user: req.user,
        classes,
        missions,
        students,
        grades,
        getSubjectAverage
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacherAttendance: async (req, res) => {
    try {
      // 1. Get teacher's classes (with students populated if needed)
      const classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id }))
        .select('className students classCode _id') // only what you need
        .lean();

      if (classes.length === 0) {
        return res.render('teacher/teacherAttendance', {
          user: req.user,
          classes: [],
          months: [],
          selectedYear: new Date().getFullYear(),
          attendance: []
        });
      }

      const classIds = classes.map(c => c._id);
      const selectedYear = parseInt(req.query.year, 10) || new Date().getFullYear();

      // 2. Only fetch attendance for THIS teacher's classes + selected year
      const startDate = new Date(`${selectedYear}-01-01`);
      const endDate = new Date(`${selectedYear}-12-31`);

      const attendance = await Attendance.find({
        schoolId: req.schoolId,
        classId: { $in: classIds },
        date: { $gte: startDate, $lte: endDate }
      }).lean();

      // 3. Pre-build a fast lookup map (BEST PRACTICE — makes EJS 100x faster)
      const attendanceMap = {};

      attendance.forEach(doc => {
        const dateKey = doc.date.toISOString().slice(0, 10); // "2025-12-15"
        doc.records.forEach(r => {
          const key = `${doc.classId}_${dateKey}_${r.studentId}`;
          attendanceMap[key] = r.status;
        });
      });

      // 4. Generate months
      const months = Array.from({ length: 12 }, (_, i) => {
        const days = new Date(selectedYear, i + 1, 0).getDate();
        return {
          name: new Date(selectedYear, i).toLocaleString('en-US', { month: 'long' }),
          index: i,
          days
        };
      });

      // 5. Render with clean, fast data
      res.render('teacher/teacherAttendance', {
        user: req.user,
        classes,
        months,
        selectedYear,
        attendanceMap,     // ← This is the magic
        // Remove: attendance, students (not needed anymore)
      });

    } catch (err) {
      console.error('Attendance load error:', err);
      res.status(500).render('error', { message: 'Failed to load attendance' });
    }
  },
  getParent: async (req, res) => {
    try {
      if (req.body.role === 'parent') return res.render("parent/parent.ejs")
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getTeacherMissions: async (req, res) => {
    try {
      const students = await User.find(scopedQuery(req, { role: "student" })).lean()
      const missions = await Mission.find(scopedQuery(req)).lean();
      const classes = await Class.find(scopedQuery(req)).lean();
      const grades = await Grade.find(scopedQuery(req)).lean();
      res.render("teacher/teacherMissions.ejs", {
        user: req.user,
        classes: classes,
        missions: missions,
        students: students,
        grades: grades
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getParent: async (req, res) => {
    try {
      if (req.body.role === 'parent') return res.render("parent/parent.ejs")
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getDashboard: async (req, res) => {
    try {
      switch (req.user.role) {
        case 'admin':
          const parents = await User.find(scopedQuery(req, { role: "parent" })).lean()
          const teachers = await User.find(scopedQuery(req, { role: 'teacher' })).lean()
          const students = await User.find(scopedQuery(req, { role: 'student' })).lean()
          const classes = await Class.find(scopedQuery(req)).lean();
          res.render("admin/admin.ejs", {
            user: req.user,
            classes: classes,
            teachers: teachers,
            students: students
          })
          break;
        case 'teacher':
          res.render("teacher/teacher.ejs", {
            user: req.user,
          });
          break;
        case 'student':
          const verses = await Verses.find().lean();
          const reminders = await Reflection.find().lean()
          const randomVerses = verses[Math.floor(Math.random() * verses.length)];
          const randomReminders = reminders[Math.floor(Math.random() * reminders.length)]
          res.render("student/student.ejs", {
            user: req.user,
            verses: randomVerses,
            reflections: randomReminders
          });
          break;
        case 'parent':
          res.render("parent/parent.ejs")
          break;
        default:
          res.render('/')
      }
    } catch (err) {
      console.log(err)
      res.send("Error loading users")
    }
  },
  getGrades: async (req, res) => {
    //percentage to gpa calculation: (percentage/100)*4
    //get averge for all gpas and that is the final grade
    //get average for all subjects and that is the final grade
    const classes = await Class.find(scopedQuery(req, { 'students._id': { $in: req.user._id } })).lean();
    // Get class IDs
    const classIds = classes.map(cls => cls._id);
    const grades = await Grade.find(scopedQuery(req, {
      'classInfo._id': { $in: classIds },
      'students._id': req.user._id
    })).lean();
    console.log(grades)

    const attendance = await Attendance.find(scopedQuery(req, {
      'records.studentId': req.user._id
    })).lean();

    const selectedYear = parseInt(req.query.year, 10) || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
      const days = new Date(selectedYear, i + 1, 0).getDate();
      return {
        name: new Date(selectedYear, i).toLocaleString("en-US", { month: "long" }),
        index: i,
        days
      };
    });
    console.log(grades)
    console.log(classes)
    console.log(attendance)

    try {
      res.render('student/grades.ejs', {
        user: req.user,
        grades: grades,
        getSubjectAverage,
        classes: classes,
        attendance: attendance,
        selectedYear: selectedYear,
        months: months
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getMissions: async (req, res) => {
    try {
      res.render('missions.ejs', {
        user: req.user,
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getLibrary: async (req, res) => {
    try {
      res.render('library.ejs', {
        user: req.user,
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getProfile: async (req, res) => {
    console.log(req.user.role)
    let classes;
    if (req.user.role === 'teacher') {
      classes = await Class.find(scopedQuery(req, { 'teachers._id': req.user._id })).lean();
    } else if (req.user.role === 'student') {
      classes = await Class.find(scopedQuery(req, { 'students._id': req.user._id })).lean();
    } else {
      classes = await Class.find(scopedQuery(req)).lean();

    }
    console.log(classes)
    try {
      res.render('profile.ejs', {
        user: req.user,
        classes: classes
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getUsers: async (req, res) => {
    try {
      const students = await User.find(scopedQuery(req, { role: "student" })).lean();
      const teachers = await User.find(scopedQuery(req, { role: "teacher" })).lean();

      const parents = await User.find(scopedQuery(req, { role: "parent" }))
        .populate({
          path: "parentInfo.children.childID",
          select: "firstName lastName userName",
          match: { schoolId: req.schoolId }
        })
        .lean();

      // normalize null fields
      students.forEach(s => {
        s.studentInfo = s.studentInfo || {};
        s.studentInfo.parents = s.studentInfo.parents || [];
      });

      parents.forEach(p => {
        p.parentInfo = p.parentInfo || {};
        p.parentInfo.children = p.parentInfo.children || [];
      });

      res.render("admin/users.ejs", {
        user: req.user,
        students,
        teachers,
        parents,

        getAge: function (dob) {
          if (!dob) return "N/A";
          let birth = new Date(dob);
          let diff = Date.now() - birth;
          return Math.abs(new Date(diff).getUTCFullYear() - 1970);
        }
      });

    } catch (err) {
      console.error(err);
      return res.status(500).send("Error loading users"); // only 1 response
    }
  },
  getResetPassword: async (req, res) => {
    try {
      if (!req.user) return res.redirect("/login");

      res.render("resetPassword.ejs", {
        user: req.user,
        messages: req.flash(),
      });
    } catch (err) {
      console.error("Error rendering reset password page:", err);
      res.status(500).send("Error loading reset password page.");
    }
  },
  getClasses: async (req, res) => {
    try {
      const students = await User.find(scopedQuery(req, { role: "student" })).lean()
      const teachers = await User.find(scopedQuery(req, { role: "teacher" })).lean()
      const classes = await Class.find(scopedQuery(req)).lean()
      res.render("admin/class.ejs", {
        user: req.user,
        students,
        teachers,
        classes
      })
    } catch (err) {
      console.log(err)
      res.redirect('/admin/classes')
    }
  },
  getStudentMissions: async (req, res) => {
    try {
      const classes = await Class.find(scopedQuery(req, { 'students._id': req.user._id })).lean();

      const allStudentIds = classes
        .flatMap(c => c.students.map(s => s._id.toString()));

      const uniqueStudentIds = [...new Set(allStudentIds)];

      const studentUsers = await User.find(scopedQuery(req, {
        _id: { $in: uniqueStudentIds }
      })).sort({ points: -1 });

      console.log('Students:', studentUsers.length)
      const fullName = `${req.user.firstName} ${req.user.lastName}`;

      let teacherNames = [];
      classes.forEach(cls => {
        if (cls.teachers && cls.teachers.length > 0) {
          cls.teachers.forEach(t => {
            teacherNames.push(t.name);
          });
        }
      });

      const missions = await Mission.find(scopedQuery(req, {
        'createdBy.name': { $in: teacherNames }
      })).lean();

      console.log("classes:", classes.length);
      console.log("missions found:", missions.length);

      const activeMissions = missions.filter(m =>
        m.active?.studentInfo?.some(s =>
          s.name === fullName && s.status === "started"
        )
      );

      console.log("activeMissions count:", activeMissions.length);

      // FIXED: Only log if there are active missions
      if (activeMissions.length > 0) {
        console.log("First active mission:", activeMissions[0].title);
      } else {
        console.log("No active missions found for this student");
      }

      res.render("student/missions.ejs", {
        user: req.user,
        missions: missions,
        classes: classes,
        activeMissions: activeMissions,
        students: studentUsers
      });

    } catch (err) {
      console.log(`Error: ${err}`);
      res.status(500).send("Error loading missions page");
    }
  }

};
