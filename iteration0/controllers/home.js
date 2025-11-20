const User = require("../models/User");
const Mission = require("../models/Missions");
const Class = require("../models/Class");
const Grade = require("../models/Grades");
const Verses = require("../models/Verses");
const Reflection = require("../models/Reflections");
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
      const parents = await User.find({ role: "parent" }).lean()
      const missions = await Mission.find().lean();
      const classes = await Class.find().lean();
      res.render("admin/admin.ejs", {
        user: req.user,
        classes: classes,
        missions: missions
      });
    } catch (err) {
      console.error(err);
      res.send("Error loading users");
    }
  },
  getTeacher: async (req, res) => {
    try {
      const students = await User.find({ role: "student" }).lean()
      const missions = await Mission.find().lean();
      const classes = await Class.find().lean();
      const grades = await Grade.find().lean();

      res.render("teacher/teacherGrades.ejs", {
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
  getTeacherGrades: async (req, res) => {
    try {
      const students = await User.find({ role: "student" }).lean()
      const missions = await Mission.find().lean();
      const classes = await Class.find().lean();
      const grades = await Grade.find().lean();
      res.render("teacher/teacherGrades.ejs", {
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
    getTeacherMissions: async (req, res) => {
    try {
      const students = await User.find({ role: "student" }).lean()
      const missions = await Mission.find().lean();
      const classes = await Class.find().lean();
      const grades = await Grade.find().lean();
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
          const parents = await User.find({ role: "parent" }).lean()
          const teachers = await User.find({ role: 'teacher' }).lean()
          const students = await User.find({ role: 'student' }).lean()
          const classes = await Class.find().lean();
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
    try {
      res.render('grades.ejs', {
        user: req.user,
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
    try {
      res.render('profile.ejs', {
        user: req.user,
      })
    } catch (err) {
      console.log(err)
      res.send("Error")
    }
  },
  getUsers: async (req, res) => {
    try {
      const students = await User.find({ role: "student" }).lean();
      const teachers = await User.find({ role: "teacher" }).lean();

      const parents = await User.find({ role: "parent" })
        .populate("parentInfo.children.childID", "firstName lastName userName")
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
  getClasses: async (req, res) => {
    try {
      const students = await User.find({ role: "student" }).lean()
      const teachers = await User.find({ role: "teacher" }).lean()
      const classes = await Class.find().lean()
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

  }


};
