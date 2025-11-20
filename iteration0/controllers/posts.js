const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const User = require("../models/User")
const Class = require("../models/Class")
const Mission = require("../models/Missions")
const Grade = require("../models/Grades")

module.exports = {
  getProfile: async (req, res) => {
    try {
      const posts = await Post.find({ user: req.user.id });
      res.render("profile.ejs", { posts: posts, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  getFeed: async (req, res) => {
    try {
      const posts = await Post.find().sort({ createdAt: "desc" }).lean();
      res.render("feed.ejs", { posts: posts });
    } catch (err) {
      console.log(err);
    }
  },
  getPost: async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      res.render("post.ejs", { post: post, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  createPost: async (req, res) => {
    try {
      // Upload image to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path);

      await Post.create({
        title: req.body.title,
        image: result.secure_url,
        cloudinaryId: result.public_id,
        caption: req.body.caption,
        likes: 0,
        user: req.user.id,
      });
      console.log("Post has been added!");
      res.redirect("/profile");
    } catch (err) {
      console.log(err);
    }
  },
  createStudent: async (req, res) => {
    try {
      await User.create({
        // Login credentials
        userName: req.body.userName,
        email: req.body.email,
        password: req.body.password,

        // Role
        role: 'student',

        // Profile info
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,

        // Student-specific info
        studentInfo: {
          gradeLevel: req.body.gradeLevel,
          programType: req.body.programType,
          enrollmentDate: Date.now(),
          studentNumber: Math.floor(Math.random() * 1000000),
          parents: []
        }
      });

      console.log('Student created successfully');
      res.redirect('/admin');

    } catch (err) {
      console.error('Error creating student:', err);

      if (err.code === 11000) {
        return res.status(400).send('Error: Username or email already exists.');
      }

      res.status(500).send('Error: Could not create student.');
    }
  },

  createTeacher: async (req, res) => {
    try {
      await User.create({
        userName: req.body.userName,
        email: req.body.email,
        password: req.body.password,
        role: 'teacher',
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,

        teacherInfo: {
          employeeId: req.body.employeeId,
          hireDate: req.body.hireDate || Date.now(),
          subjects: req.body.subjects ? req.body.subjects.split(',').map(s => s.trim()) : []
        }
      });

      console.log('Teacher created successfully');
      res.redirect('/admin');

    } catch (err) {
      console.error('Error creating teacher:', err);

      if (err.code === 11000) {
        return res.status(400).send('Error: Username, email, or employee ID already exists.');
      }

      res.status(500).send('Error: Could not create teacher.');
    }
  },

  createParent: async (req, res) => {
    try {
      await User.create({
        userName: req.body.userName,
        email: req.body.email,
        password: req.body.password,
        role: 'parent',
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        DOB: req.body.DOB || null,

        parentInfo: {
          children: []
        }
      });

      console.log(' Parent created successfully');
      res.redirect('/admin');

    } catch (err) {
      console.error(' Error creating parent:', err);

      if (err.code === 11000) {
        return res.status(400).send('Error: Username or email already exists.');
      }

      res.status(500).send('Error: Could not create parent.');
    }
  },
  assignParentToStudent: async (req, res) => {
    try {
      const { parentID, studentID, relationship } = req.body;

      const student = await User.findById(studentID);
      const parent = await User.findById(parentID);

      if (!student || student.role !== "student") {
        return res.status(404).send("Student not found");
      }

      if (!parent || parent.role !== "parent") {
        return res.status(404).send("Parent not found");
      }

      const parentName = `${parent.firstName} ${parent.lastName}`;
      const studentName = `${student.firstName} ${student.lastName}`;

      // ---------------------------
      // 1) Add to student (NO DUPES)
      // ---------------------------
      const parentExists = student.studentInfo.parents.some(
        (p) => p.parentID?.toString() === parentID
      );

      if (!parentExists) {
        student.studentInfo.parents.push({
          parentID,
          parentName,
          relationship
        });
        await student.save();
      }

      // ---------------------------
      // 2) Add child to parent (NO DUPES)
      // ---------------------------
      const childExists = parent.parentInfo.children.some(
        (c) => c.childID?.toString() === studentID
      );

      if (!childExists) {
        parent.parentInfo.children.push({
          childID: studentID,
          childName: studentName
        });
        await parent.save();
      } else {
        alert('Cannot Add duplicates')
        // res.send("Cannot add duplicates")
      }

      res.redirect("/admin/users");

    } catch (err) {
      console.error(err);
      res.status(500).send("Error assigning parent.");
    }
  },
createClass: async (req, res) => {
  try {
    const scheduleData = req.body.schedule ? JSON.parse(req.body.schedule) : {};

    const formattedSchedule = Object.keys(scheduleData).map(day => ({
      day: day,
      startTime: scheduleData[day].startTime,
      endTime: scheduleData[day].endTime
    }));

    await Class.create({
      className: req.body.className,
      classCode: `CL-${Math.floor(Math.random() * 900000)}`,
      gradeLevel: req.body.gradeLevel,
      programType: req.body.programType,
      teachers: [req.body.teachers],
      students: [],
      schedule: formattedSchedule,
      academicYear: req.body.academicYear || "2025-2026",
      active: true,
      location: req.body.location,
      roomNumber: req.body.roomNumber,
      capacity: req.body.capacity,
    });

    console.log("Class created successfully");
    res.redirect("/admin/classes");

  } catch (err) {
    console.error("Error creating class:", err);
    res.status(500).send("Error: Could not create class");
  }
},
  assignStudentToClass: async (req, res) => {
    try {
      const { classID, studentID } = req.body;

      const student = await User.findById(studentID);
      const classObj = await Class.findById(classID);

      if (!student || student.role !== "student") {
        return res.status(404).send("Student not found");
      }

      if (!classObj) {
        return res.status(404).send("Class not found");
      }

      const studentName = `${student.firstName} ${student.lastName}`;
      const className = classObj.className;
      console.log(className)
      // Prevent duplicate enrollment
      const alreadyInClass = classObj.students.some(
        s => s.toString() === studentID
      );

      if (!alreadyInClass) {
        classObj.students.push(studentID, studentName);       // store ObjectId correctly
        // classObj.studentNames.push(studentName); // snapshot name
        await classObj.save();
      }

      // Save class data to student
      student.studentInfo.classId = classID;
      student.studentInfo.className = className;

      classObj.teachers

      await student.save();

      console.log("Successfully assigned student to class");
      res.redirect("/admin/classes");

    } catch (err) {
      console.error(err);
      res.status(500).send("Error assigning student to class");
    }
  },
  likePost: async (req, res) => {
    try {
      await Post.findOneAndUpdate(
        { _id: req.params.id },
        {
          $inc: { likes: 1 },
        }
      );
      console.log("Likes +1");
      res.redirect(`/post/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
    createMission: async (req, res) => {
    try {
      await Mission.create({
        // Mission name
        title: req.body.missionTitle,
        description: req.body.missionDescription,
        
        //classification
        type: req.body.type,
        category: req.body.category,
        
        // difficulty
        rank: req.body.rank,
        pointsXP: req.body.missionPoints,

        // Time Limit
        timeLimit: req.body.timeLimit,
        dueDate: req.body.dueDate,

        //Assigned to ?
        assignedTo: {},

        //creator
        createdBy: {
        name: `MC ${req.user.firstName}`,
        employeeId: req.user.teacherInfo.employeeId
        },

        //activity
        acitve: false
      });

      console.log('Mission created successfully');
      res.redirect('/teacher/manage-missions');

    } catch (err) {
      console.error('Error creating mission:', err)
      res.status(500).send('Error: Could not create mission.');
    }
  },
      createGrades: async (req, res) => {
    try {
      await Grade.create({
        // Mission name
        title: req.body.missionTitle,
        description: req.body.missionDescription,
        
        //classification
        type: req.body.type,
        category: req.body.category,
        
        // difficulty
        rank: req.body.rank,
        pointsXP: req.body.missionPoints,

        // Time Limit
        timeLimit: req.body.timeLimit,
        dueDate: req.body.dueDate,

        //Assigned to ?
        assignedTo: {},

        //creator
        createdBy: {
        name: `MC ${req.user.firstName}`,
        employeeId: req.user.teacherInfo.employeeId
        },

        //activity
        acitve: false
      });

      console.log('Mission created successfully');
      res.redirect('/teacher/manage-missions');

    } catch (err) {
      console.error('Error creating mission:', err)
      res.status(500).send('Error: Could not create mission.');
    }
  },
  deletePost: async (req, res) => {
    try {
      // Find post by id
      let post = await Post.findById({ _id: req.params.id });
      // Delete image from cloudinary
      await cloudinary.uploader.destroy(post.cloudinaryId);
      // Delete post from db
      await Post.remove({ _id: req.params.id });
      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      res.redirect("/profile");
    }
  },
  deleteUser: async (req, res) => {
    try {
      // Find user by id
      let userID = req.params.id

      const user = await User.findById(userID);

      //remove student from class
      //remove student from parent array

      //to prevent other users from being able to delete
      if (req.user.role !== "admin") {
        return res.status(403).send("Unauthorized");
      }


      // Delete  user
      await User.findByIdAndDelete(userID);

      console.log("User deleted");
      res.redirect("/admin/users");

    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || "Error deleting user");
    }
  }

};
