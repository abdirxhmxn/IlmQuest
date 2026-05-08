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
const { ensurePlatformSuperAdminAccount } = require("./utils/platformSuperAdmin");
const { startMissionDeadlineSweepScheduler } = require("./utils/missionDeadlines");
const { rejectMongoOperators, isHtmlRequest } = require("./middleware/validate");
const {
  publicRoot,
  computeAssetBuildHash,
  buildAssetUrl,
  buildAssetDiagnostics,
  logAssetDiagnostics
} = require("./utils/assetAudit");
const isProduction = env.NODE_ENV === "production";
const staticRoot = publicRoot;
const fingerprintAssetPattern = /\.[0-9a-f]{8,}\./i;
const ASSET_VERSION = computeAssetBuildHash();
const BOOT_TIME = Date.now();
const PORT = parseInt(env.PORT, 10) || 3050;
let dbConnected = false;

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err?.message || err);
  console.error(err?.stack || "");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason?.message || reason);
  if (reason?.stack) console.error(reason.stack);
  process.exit(1);
});

if (isProduction) {
  // Required behind TLS-terminating reverse proxies for secure session cookies.
  app.set("trust proxy", 1);
}

// Health route must be registered before ALL other middleware so Railway's
// healthcheck never touches CSRF, sessions, Passport, or EJS rendering.
app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    env: env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    dbConnected,
    port: PORT
  });
});

// Passport config
require("./config/passport")(passport);

//Connect To Database
connectDB();
mongoose.connection.once("open", async () => {
  dbConnected = true;
  console.log(`[DB] MongoDB connected (${Date.now() - BOOT_TIME}ms since boot)`);
  try {
    const bootstrap = await ensurePlatformSuperAdminAccount();
    if (bootstrap?.created) {
      console.log(`[BOOTSTRAP] Super admin ready: ${bootstrap.email}`);
    }
    startMissionDeadlineSweepScheduler();
  } catch (err) {
    console.error("[BOOTSTRAP] Failed to ensure platform super admin:", err?.message || err);
  }
});
mongoose.connection.on("error", (err) => {
  dbConnected = false;
  console.error("[DB] MongoDB connection error:", err?.message || err);
});
mongoose.connection.on("disconnected", () => {
  dbConnected = false;
  console.warn("[DB] MongoDB disconnected");
});

//Using EJS for views
app.set("view engine", "ejs");
// Point Express at the new frontend folder
app.set("views", path.join(__dirname, "../frontend/views"));
app.set("etag", "strong");

//Static Folder
app.use(
  express.static(staticRoot, {
    etag: true,
    lastModified: true,
    index: false,
    maxAge: isProduction ? "1d" : 0,
    setHeaders: (res, filePath) => {
      if (!isProduction) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      const fileName = path.basename(filePath);
      if (fingerprintAssetPattern.test(fileName)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    }
  })
);

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net"
        ],
        "font-src": [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],
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
app.use(logger(isProduction ? "combined" : "dev"));

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
      mongoUrl: env.DB_STRING,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: isProduction,
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

// Asset version injected into every view for cache-busting query params.
// Changes whenever the deployed asset tree changes.
app.use((_req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.assetUrl = (assetPath) => buildAssetUrl(assetPath, ASSET_VERSION);
  return next();
});

if (isProduction) {
  app.get("/debug/assets", (_req, res) => {
    const diagnostics = buildAssetDiagnostics(ASSET_VERSION);
    res.setHeader("Cache-Control", "no-store");
    return res.json(diagnostics);
  });
}


//Setup Routes For Which The Server Is Listening
app.use("/", mainRoutes);
app.use("/post", postRoutes);

app.use((err, req, res, next) => {
  if (err?.name !== "MulterError") return next(err);

  const acceptHeader = (req.get("accept") || "").toLowerCase();
  const wantsHtml = acceptHeader.includes("text/html");
  const referrer = req.get("Referrer") || req.get("Referer");

  const message = err.code === "LIMIT_FILE_SIZE"
    ? "Image is too large. Maximum allowed size is 5MB."
    : "Invalid upload. Please use a JPG or PNG image.";

  if (wantsHtml && referrer) {
    req.flash("errors", [{ msg: message }]);
    return res.redirect(referrer);
  }

  return res.status(400).json({
    error: "invalid_upload",
    message
  });
});

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

app.listen(PORT, "0.0.0.0", () => {
  const elapsed = Date.now() - BOOT_TIME;
  console.log("=".repeat(60));
  console.log("[BOOT] IlmQuest production server ready");
  console.log(`[BOOT] NODE_ENV   : ${env.NODE_ENV}`);
  console.log(`[BOOT] PORT       : ${PORT}`);
  console.log(`[BOOT] HOST       : 0.0.0.0`);
  console.log(`[BOOT] CWD        : ${process.cwd()}`);
  console.log(`[BOOT] Views      : ${path.join(__dirname, "../frontend/views")}`);
  console.log(`[BOOT] Static     : ${staticRoot}`);
  console.log(`[BOOT] Asset hash : ${ASSET_VERSION}`);
  console.log(`[BOOT] On Railway : ${!!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_GIT_COMMIT_SHA)}`);
  console.log(`[BOOT] DB URL set : ${!!env.DB_STRING}`);
  console.log(`[BOOT] Session key: ${!!env.SESSION_SECRET}`);
  console.log(`[BOOT] Elapsed    : ${elapsed}ms`);
  console.log("=".repeat(60));
  logAssetDiagnostics(buildAssetDiagnostics(ASSET_VERSION));
});
