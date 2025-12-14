const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const User = require("../models/User")
const Class = require("../models/Class")
const Mission = require("../models/Missions")
const Grade = require("../models/Grades")
const Attendance = require("../models/Attendance");

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
    console.log(req.body)
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
          enrollmentDate: req.body.enrollmentDate || Date.now(),
          studentNumber: Math.floor(Math.random() * 1000000),
          parents: []
        }
      });

      console.log('Student created successfully');
      res.redirect('/admin/users');

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
        gender: req.body.gender || null,
        teacherInfo: {
          employeeId: req.body.employeeId,
          hireDate: req.body.hireDate || Date.now(),
          subjects: req.body.subjects ? req.body.subjects.split(',').map(s => s.trim()) : []
        }
      });

      console.log('Teacher created successfully');
      res.redirect('/admin/users');

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
      // Normalize arrays
      const teacherIDs = Array.isArray(req.body.teachers)
        ? req.body.teachers
        : req.body.teachers ? [req.body.teachers] : [];

      const studentIDs = Array.isArray(req.body.students)
        ? req.body.students
        : req.body.students ? [req.body.students] : [];
      console.log(teacherIDs, req.body.teachers)
      // Fetch users to attach names
      const teachers = await User.find({ _id: { $in: teacherIDs }, role: 'teacher' });
      const students = await User.find({ _id: { $in: studentIDs }, role: 'student' });
      console.log(teachers)

      // Format schedule
      const scheduleData = req.body.schedule ? JSON.parse(req.body.schedule) : {};
      const subjectData = req.body.subjects ? JSON.parse(req.body.subjects) : {};
      const formattedSchedule = Object.entries(scheduleData).map(([day, t]) => ({
        day,
        startTime: t.startTime,
        endTime: t.endTime
      }));

      // Create class document
      const newClass = await Class.create({
        className: req.body.className,
        classCode: `CL-${Math.floor(Math.random() * 1000000)}`,

        teachers: teachers.map(teacher => ({
          _id: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`
        })),

        students: students.map(student => ({
          _id: student._id,
          name: `${student.firstName} ${student.lastName}`
        })),

        schedule: formattedSchedule,
        academicYear: {
          semester: req.body.semester,
          quarter: req.body.quarter
        },
        subjects: subjectData,
        location: req.body.location,
        roomNumber: req.body.roomNumber,
        capacity: req.body.capacity,
        active: true
      });

      console.log("Class created:", newClass);
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
          name: `${req.user.firstName} ${req.user.lastName}`,
          employeeId: req.user.teacherInfo.employeeId,
          _id: req.user._id
        },

        //activity
        acitve: {
          status: true,
          studentInfo: []
        }
      });

      console.log('Mission created successfully');
      res.redirect('/teacher/manage-missions');

    } catch (err) {
      console.error('Error creating mission:', err)
      res.status(500).send('Error: Could not create mission.');
    }
  },
  createAttendance: async (req, res) => {
    try {
      const { classId, studentId, date, status } = req.body;

      // Fetch class and student documents
      const classDoc = await Class.findById(classId);
      const studentDoc = await User.findById(studentId);

      let targetDate = new Date(date + 'T00:00:00Z');

      const studentName = `${studentDoc.firstName} ${studentDoc.lastName}`;
      const teacherName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.userName;

      // Check if this exact attendance record already exists (same student, class, and date)
      let attendanceDoc = await Attendance.findOne({
        classId: classDoc._id,
        date: targetDate,
        'records.studentId': studentDoc._id
      });

      if (!attendanceDoc) {
        // Create new attendance record for this student
        await Attendance.create({
          classId: classDoc._id,
          className: classDoc.className,
          date: targetDate,
          records: [
            {
              studentId: studentDoc._id,
              studentName,
              status: status
            }
          ],
          recordedBy: {
            _id: req.user._id,
            name: teacherName
          }
        });

        console.log(`Attendance created for ${studentName} in ${classDoc.className}`);
      } else {
        // Update the existing student's attendance record
        const studentRecord = attendanceDoc.records.find(
          r => r.studentId.toString() === studentId.toString()
        );

        studentRecord.status = status;
        attendanceDoc.recordedBy = {
          _id: req.user._id,
          name: teacherName
        };

        await attendanceDoc.save();

        console.log(`Attendance updated for ${studentName} in ${classDoc.className}`);
      }

      res.redirect("/teacher/manage-attendance");

    } catch (err) {
      console.error("Error creating/updating attendance:", err);
      res.redirect("back");
    }
  },
  createGrade: async (req, res) => {
    try {
      const {
        student,
        classId,
        subject,
        quarter,
        Assignment,
        feedback,
        assignedDate,
        dueDate
      } = req.body;

      // Validate required fields
      if (!student || !classId || !subject || !quarter || !Assignment?.name || !Assignment?.grade) {
        req.flash("error", "Missing required fields.");
        return res.redirect("back");
      }

      // Validate quarter
      if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        req.flash("error", "Invalid quarter selected.");
        return res.redirect("back");
      }

      // Fetch student + class docs to store names
      const studentDoc = await User.findById(student);
      const classDoc = await Class.findById(classId);

      if (!studentDoc || !classDoc) {
        req.flash("error", "Student or class not found.");
        return res.redirect("back");
      }

      // Create grade following schema
      const newGrade = new Grade({
        students: [
          {
            _id: studentDoc._id,
            name: `${studentDoc.firstName} ${studentDoc.lastName}`
          }
        ],
        classInfo: [
          {
            _id: classDoc._id,
            name: classDoc.className
          }
        ],
        subject,
        quarter,
        Assignment: {
          name: Assignment.name.trim(),
          description: Assignment.description?.trim() || "No description provided",
          grade: Number(Assignment.grade),
          maxScore: Assignment.maxScore ? Number(Assignment.maxScore) : 100,
          type: Assignment.type
        },
        feedback: {
          content: feedback?.trim() || "",
          teacher: {
            _id: req.user._id,
            name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.userName
          }
        },
        assignedDate: assignedDate ? new Date(assignedDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        active: true
      });

      await newGrade.save();

      req.flash("success", "Grade saved successfully.");
      res.redirect("/teacher/manage-grades");

    } catch (err) {
      console.error("Error saving grade:", err);
      req.flash("error", "Could not save grade.");
      res.redirect("back");
    }
  },
  updateStudentMission: async (req, res) => {
    try {
      const { missionId } = req.body;
      console.log("Received missionId:", missionId);

      if (!missionId) {
        console.log("No missionId provided");
        return res.redirect('/student/missions');
      }

      await Mission.findByIdAndUpdate(
        missionId,
        {
          $addToSet: {
            "active.studentInfo": {
              _id: req.user._id,
              name: `${req.user.firstName} ${req.user.lastName}`,
              status: "started"
            }
          }
        }
      );

      console.log("Student mission status updated to 'started'");
      return res.redirect('/student/missions');

    } catch (err) {
      console.log(err);
      res.redirect('/student/missions');
    }
  },

  completeStudentMission: async (req, res) => {
    try {
      const { missionId } = req.body;

      console.log("missionId from form:", missionId);

      // Make sure missionId exists
      if (!missionId || missionId.trim() === "") {
        console.log("missionId is missing or empty");
        return res.redirect("/student/missions");
      }

      // Grab mission info
      const mission = await Mission.findById(missionId).lean();
      console.log("mission from DB:", mission);

      if (!mission) {
        console.log("mission not found in database");
        return res.redirect("/student/missions");
      }

      const points = mission.pointsXP || 0;

      // Update mission status
      const updatedMission = await Mission.findOneAndUpdate(
        {
          _id: missionId,
          "active.studentInfo._id": req.user._id,
          "active.studentInfo.status": "started"
        },
        {
          $set: { "active.studentInfo.$.status": "complete" }
        },
        { new: true }
      );

      if (!updatedMission) {
        console.log("failed to update mission status");
        return res.redirect("/student/missions");
      }

      // Add XP
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { points: points }
      });

      console.log(`Mission completed: ${mission.title}`);
      console.log(`XP awarded: ${points}`);

      return res.redirect("/student/missions");

    } catch (err) {
      console.log("Error in completeStudentMission:", err);
      return res.redirect("/student/missions");
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
  },
  deleteClass: async (req, res) => {
    try {
      // Find user by id
      let classID = req.params.id
      console.log(classID)
      const classDelete = await Class.findById(classID);
      console.log(classDelete)

      //to prevent other users from being able to delete
      if (req.user.role !== "admin") {
        return res.status(403).send("Unauthorized");
      }


      // Delete  user
      await Class.findByIdAndDelete(classID);

      console.log("class deleted");
      res.redirect("/admin/classes");

    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || "Error deleting user");
    }
  }
};
