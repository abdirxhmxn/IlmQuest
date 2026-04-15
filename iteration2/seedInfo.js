// seedinfo.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: "./config/.env" }); // adjust if needed

const User = require("./backend/models/User");

// ===========================
//   CHECK ENVIRONMENT VARS
// ===========================
console.log("Loaded DB_STRING:", process.env.DB_STRING);
if (!process.env.DB_STRING) {
  console.error("❌ ERROR: DB_STRING is undefined. Fix your .env path or variable name.");
  process.exit(1);
}

// ===========================
//   PASSWORD HASH HELPER
// ===========================
async function hash(pwd) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pwd, salt);
}

// ===========================
//   SEED DATA
// ===========================

// ----- ADMIN -----
const adminData = [
  {
    userName: "admin",
    email: "admin@ilmquest.com",
    password: "Admin123!",
    role: "admin",
    firstName: "Jordan",
    lastName: "Lee",
    gender: "Other",
    DOB: "1990-01-01",
    teacherInfo: {},
    studentInfo: {}
  }
];

// ----- TEACHERS -----
const teacherData = [
  {
    userName: "avery.morgan",
    email: "avery.morgan@school.com",
    password: "TempPass123!",
    role: "teacher",
    firstName: "Avery",
    lastName: "Morgan",
    gender: "Female",
    DOB: "1987-03-15",
    teacherInfo: {
      employeeId: "EMP-001",
      hireDate: "2021-08-01",
      classes: [],
      subjects: ["Mathematics", "English Language Arts"]
    }
  },
  {
    userName: "samuel.brooks",
    email: "samuel.brooks@school.com",
    password: "TempPass123!",
    role: "teacher",
    firstName: "Samuel",
    lastName: "Brooks",
    gender: "Male",
    DOB: "1984-11-02",
    teacherInfo: {
      employeeId: "EMP-002",
      hireDate: "2019-09-15",
      classes: [],
      subjects: ["Science"]
    }
  },
  {
    userName: "nia.thompson",
    email: "nia.thompson@school.com",
    password: "TempPass123!",
    role: "teacher",
    firstName: "Nia",
    lastName: "Thompson",
    gender: "Female",
    DOB: "1990-06-22",
    teacherInfo: {
      employeeId: "EMP-003",
      hireDate: "2020-01-10",
      classes: [],
      subjects: ["Mathematics"]
    }
  }
];

// ----- STUDENTS -----
const studentData = [
  {
    userName: "kai.carter",
    email: "kai.carter@student.com",
    password: "Student123!",
    role: "student",
    firstName: "Kai",
    lastName: "Carter",
    gender: "Male",
    DOB: "2013-05-09",
    studentInfo: {
      enrollmentDate: "2024-09-01",
      gradeLevel: "Grade 5",
      programType: "Khatm",
      classId: null,
      studentNumber: 1001
    }
  },
  {
    userName: "ella.owens",
    email: "ella.owens@student.com",
    password: "Student123!",
    role: "student",
    firstName: "Ella",
    lastName: "Owens",
    gender: "Female",
    DOB: "2013-09-21",
    studentInfo: {
      enrollmentDate: "2024-09-01",
      gradeLevel: "Grade 5",
      programType: "Khatm",
      classId: null,
      studentNumber: 1002
    }
  },
  {
    userName: "noah.diaz",
    email: "noah.diaz@student.com",
    password: "Student123!",
    role: "student",
    firstName: "Noah",
    lastName: "Diaz",
    gender: "Male",
    DOB: "2012-02-14",
    studentInfo: {
      enrollmentDate: "2024-09-01",
      gradeLevel: "Grade 3",
      programType: "Khatm",
      classId: null,
      studentNumber: 1003
    }
  },
  {
    userName: "sofia.reed",
    email: "sofia.reed@student.com",
    password: "Student123!",
    role: "student",
    firstName: "Sofia",
    lastName: "Reed",
    gender: "Female",
    DOB: "2012-07-30",
    studentInfo: {
      enrollmentDate: "2024-09-01",
      gradeLevel: "Grade 3",
      programType: "Khatm",
      classId: null,
      studentNumber: 1004
    }
  }
];

// ===========================
//        MAIN SEED FUNC
// ===========================
async function seed() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.DB_STRING);
    console.log("🔥 Connected to MongoDB");

    console.log("🧨 Clearing old users...");
    await User.deleteMany();

    const allUsers = [...adminData, ...teacherData, ...studentData];

    console.log("🔐 Hashing passwords...");
    for (let user of allUsers) {
      user.password = await hash(user.password);
    }

    console.log("📥 Inserting users...");
    const inserted = await User.insertMany(allUsers);

    console.log("✅ SEEDING COMPLETE!");
    console.log(`Admins: ${adminData.length}`);
    console.log(`Teachers: ${teacherData.length}`);
    console.log(`Students: ${studentData.length}`);
    console.log(`Total Users Inserted: ${inserted.length}`);

  } catch (err) {
    console.error("❌ Seeding Error:", err);
  } finally {
    mongoose.connection.close();
    console.log("🔌 MongoDB connection closed.");
  }
}

seed();
