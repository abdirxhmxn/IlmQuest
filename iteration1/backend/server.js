const path = require("path");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const passport = require("passport");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const flash = require("express-flash");
const csrf = require("csurf");
const helmet = require("helmet");
const logger = require("morgan");
const env = require("./config/env");
const connectDB = require("./config/database");
const mainRoutes = require("./routes/main");
const postRoutes = require("./routes/posts");
const cookieParser = require("cookie-parser");
const { rejectMongoOperators, isHtmlRequest } = require("./middleware/validate");

if (env.NODE_ENV === "production") {
  // Required behind TLS-terminating reverse proxies for secure session cookies.
  app.set("trust proxy", 1);
}

// Passport config
require("./config/passport")(passport);

//Connect To Database
connectDB();

//Using EJS for views
app.set("view engine", "ejs");
// Point Express at the new frontend folder
app.set("views", path.join(__dirname, "../frontend/views"));

//Static Folder
app.use(express.static(path.join(__dirname, "../frontend/public")));

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"]
      }
    }
  })
);

//Body Parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(rejectMongoOperators);

//Logging
app.use(logger("dev"));

//Use forms for put / delete
app.use(methodOverride("_method"));

// Setup Sessions - stored in MongoDB
app.use(cookieParser());
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.DB_STRING,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    },
  })
);

//Use flash messages for errors, info, ect...
app.use(flash());


// Passport middleware
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.authenticate("session"));

// CSRF protection must come after cookie/session middleware and before routes.
app.use(csrf());
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  return next();
});


//Setup Routes For Which The Server Is Listening
app.use("/", mainRoutes);
app.use("/post", postRoutes);

app.use((err, req, res, next) => {
  if (err.code !== "EBADCSRFTOKEN") return next(err);

  const acceptHeader = (req.get("accept") || "").toLowerCase();
  const wantsHtml = acceptHeader.includes("text/html");
  const referrer = req.get("Referrer") || req.get("Referer");

  // Keep browser UX friendly for HTML form navigation.
  if (wantsHtml && referrer) {
    req.flash("errors", [{ msg: "Invalid or expired form token. Please try again." }]);
    return res.redirect(referrer);
  }

  // Programmatic/security test requests should get an explicit 403.
  return res.status(403).json({
    error: "invalid_csrf_token",
    message: "Invalid or expired CSRF token."
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err?.message || err);
  if (isHtmlRequest(req)) {
    req.flash("errors", [{ msg: "Something went wrong. Please try again." }]);
    return res.status(500).redirect(req.get("Referrer") || req.get("Referer") || "/");
  }
  return res.status(500).json({ error: "Internal Server Error" });
});

//Server Running
app.listen(env.PORT, () => {
  console.log("Server is running, you better catch it!");
});
