const mongoose = require("mongoose");
const env = require("./env");

const connectDB = async () => {
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  mongoose.set("strictQuery", true);

  try {
    const conn = await mongoose.connect(env.DB_STRING, {
      maxPoolSize: isProd ? 50 : 10,
      minPoolSize: isProd ? 5 : 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      autoIndex: !isProd
    });
    console.log(`DB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = connectDB;
