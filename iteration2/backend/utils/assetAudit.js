const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const iterationRoot = path.resolve(__dirname, "../..");
const frontendRoot = path.join(iterationRoot, "frontend");
const publicRoot = path.join(frontendRoot, "public");
const viewsRoot = path.join(frontendRoot, "views");

const EXPECTED_ACTIVE_ASSETS = [
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/style.css",
  "css/animations.css",
  "css/dark-mode.css",
  "css/components/login-animation.css",
  "css/pages/admin-shell.css",
  "css/pages/app-shell.css",
  "css/pages/auth-shell.css",
  "css/pages/auth.css",
  "css/pages/platform-home.css",
  "css/pages/teacher-shell.css",
  "css/pages/teacher-dashboard.css",
  "css/pages/teacher-gradebook-v1.css",
  "js/theme-toggle.js",
  "js/nav-toggle.js",
  "js/scroll-animations.js",
  "js/app-shell.js",
  "js/login-animation.js",
  "js/shared-calculations.bundle.js",
  "js/teacher-gradebook-app.js",
  "imgs/finalLogo.jpg",
  "imgs/logo.png"
];

const HOMEPAGE_EXPECTED_ASSETS = [
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/style.css",
  "css/animations.css",
  "css/dark-mode.css",
  "js/theme-toggle.js",
  "js/nav-toggle.js",
  "js/scroll-animations.js",
  "imgs/finalLogo.jpg",
  "imgs/logo.png"
];

const OBSOLETE_CSS_CANDIDATES = [
  "css/admin-users.css",
  "css/adminLayout.css",
  "css/app.css",
  "css/authLogin.css",
  "css/main.css",
  "css/normalize.css",
  "css/pages/marketing-header.css",
  "css/pages/signup.css",
  "css/pages/teacher-grades.css",
  "css/teacherDashboard.css",
  "css/teacherGrades.css",
  "css/teacherLayout.css",
  "css/teacherMissions.css"
];

const DUPLICATE_OR_WRAPPER_CSS = new Set([
  "css/admin-users.css",
  "css/app.css",
  "css/authLogin.css"
]);

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return walkFiles(absolutePath);
    return [absolutePath];
  });
}

function toPublicRelative(absolutePath) {
  return path.relative(publicRoot, absolutePath).split(path.sep).join("/");
}

function toViewRelative(absolutePath) {
  return path.relative(viewsRoot, absolutePath).split(path.sep).join("/");
}

function getAllPublicFiles() {
  return walkFiles(publicRoot).map(toPublicRelative).sort();
}

function getPublicFilesByExtension(extension) {
  return getAllPublicFiles().filter((filePath) => filePath.endsWith(extension));
}

function getAllViewFiles() {
  return walkFiles(viewsRoot)
    .filter((filePath) => filePath.endsWith(".ejs"))
    .sort();
}

function extractReferencesFromViews(regex) {
  const references = new Set();

  getAllViewFiles().forEach((viewFile) => {
    const source = fs.readFileSync(viewFile, "utf8");
    const matches = source.matchAll(regex);
    for (const match of matches) {
      const assetPath = match?.[1];
      if (assetPath) references.add(assetPath);
    }
  });

  return Array.from(references).sort();
}

function extractTemplateAssetReferences() {
  const cssReferences = extractReferencesFromViews(/['"](\/css\/[A-Za-z0-9/_\-.]+\.css)/g);
  const jsReferences = extractReferencesFromViews(/['"](\/js\/[A-Za-z0-9/_\-.]+\.js)/g);
  const imageReferences = extractReferencesFromViews(/['"](\/imgs\/[A-Za-z0-9/_\-.]+\.(?:png|jpe?g|svg|ico|webp))/g);

  return {
    cssReferences,
    jsReferences,
    imageReferences
  };
}

function fileExistsFromPublic(assetPath) {
  return fs.existsSync(path.join(publicRoot, assetPath));
}

function parseCssImports(cssFilePath) {
  const source = fs.readFileSync(path.join(publicRoot, cssFilePath), "utf8");
  const imports = [];
  const regex = /@import\s+url\((['"]?)(.+?\.css)\1\)/g;
  let match = regex.exec(source);

  while (match) {
    const importTarget = String(match[2] || "").trim();
    if (importTarget.startsWith("./") || importTarget.startsWith("../")) {
      imports.push(path.posix.normalize(path.posix.join(path.posix.dirname(cssFilePath), importTarget)));
    } else if (importTarget.startsWith("/css/")) {
      imports.push(importTarget.replace(/^\//, ""));
    }
    match = regex.exec(source);
  }

  return imports.filter((assetPath) => assetPath.endsWith(".css"));
}

function buildCssDependencyGraph(cssFiles) {
  return cssFiles.reduce((graph, cssFile) => {
    graph[cssFile] = parseCssImports(cssFile).filter((candidate) => cssFiles.includes(candidate));
    return graph;
  }, {});
}

function collectReachableCss(activeEntryCss, dependencyGraph) {
  const visited = new Set();
  const stack = [...activeEntryCss];

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const imports = dependencyGraph[current] || [];
    imports.forEach((importedCss) => {
      if (!visited.has(importedCss)) stack.push(importedCss);
    });
  }

  return visited;
}

function classifyCssFiles() {
  const cssFiles = getPublicFilesByExtension(".css");
  const { cssReferences } = extractTemplateAssetReferences();
  const directTemplateCss = new Set(cssReferences.map((ref) => ref.replace(/^\//, "")));
  const dependencyGraph = buildCssDependencyGraph(cssFiles);
  const reachableCss = collectReachableCss(Array.from(directTemplateCss), dependencyGraph);

  return cssFiles.map((cssFile) => {
    let classification = "unused_obsolete";

    if (directTemplateCss.has(cssFile)) {
      classification = "actively_used";
    } else if (reachableCss.has(cssFile)) {
      classification = "unsafe_to_remove_yet";
    } else if (DUPLICATE_OR_WRAPPER_CSS.has(cssFile)) {
      classification = "duplicate_conflicting";
    } else if (OBSOLETE_CSS_CANDIDATES.includes(cssFile)) {
      classification = "unused_obsolete";
    }

    return {
      path: cssFile,
      classification,
      exists: fileExistsFromPublic(cssFile),
      imports: dependencyGraph[cssFile] || []
    };
  });
}

function computeAssetBuildHash() {
  const hash = crypto.createHash("sha1");
  const commitLike = String(
    process.env.RAILWAY_GIT_COMMIT_SHA
    || process.env.SOURCE_VERSION
    || process.env.GIT_COMMIT_SHA
    || ""
  ).trim();

  if (commitLike) hash.update(commitLike);

  getAllPublicFiles().forEach((assetPath) => {
    const absolutePath = path.join(publicRoot, assetPath);
    const stats = fs.statSync(absolutePath);
    hash.update(assetPath);
    hash.update(String(stats.size));
    hash.update(String(Math.trunc(stats.mtimeMs)));
  });

  return hash.digest("hex").slice(0, 12);
}

function buildAssetUrl(assetPath, assetVersion) {
  if (!assetPath) return assetPath;
  const divider = assetPath.includes("?") ? "&" : "?";
  return `${assetPath}${divider}v=${assetVersion}`;
}

function buildAssetDiagnostics(assetVersion) {
  const templateReferences = extractTemplateAssetReferences();
  const cssAudit = classifyCssFiles();
  const activeCssFiles = cssAudit
    .filter((entry) => entry.classification === "actively_used" || entry.classification === "unsafe_to_remove_yet")
    .map((entry) => entry.path)
    .sort();
  const activeJsFiles = templateReferences.jsReferences.map((ref) => ref.replace(/^\//, "")).sort();
  const missingExpectedAssets = EXPECTED_ACTIVE_ASSETS.filter((assetPath) => !fileExistsFromPublic(assetPath));
  const missingTemplateReferencedAssets = [
    ...templateReferences.cssReferences.map((ref) => ref.replace(/^\//, "")),
    ...templateReferences.jsReferences.map((ref) => ref.replace(/^\//, "")),
    ...templateReferences.imageReferences.map((ref) => ref.replace(/^\//, ""))
  ]
    .filter((assetPath, index, list) => list.indexOf(assetPath) === index)
    .filter((assetPath) => !fileExistsFromPublic(assetPath));

  return {
    nodeEnv: String(process.env.NODE_ENV || "development"),
    cwd: process.cwd(),
    iterationRoot,
    frontendRoot,
    staticPublicDirectory: publicRoot,
    viewsDirectory: viewsRoot,
    assetVersion,
    activeCssFiles,
    activeJsFiles,
    cssFilesReferencedByTemplates: templateReferences.cssReferences.map((ref) => ref.replace(/^\//, "")),
    jsFilesReferencedByTemplates: templateReferences.jsReferences.map((ref) => ref.replace(/^\//, "")),
    imageFilesReferencedByTemplates: templateReferences.imageReferences.map((ref) => ref.replace(/^\//, "")),
    missingExpectedAssets,
    missingTemplateReferencedAssets,
    obsoleteCssFilesFound: OBSOLETE_CSS_CANDIDATES.filter((assetPath) => fileExistsFromPublic(assetPath)),
    homepageAssets: HOMEPAGE_EXPECTED_ASSETS.map((assetPath) => ({
      path: assetPath,
      exists: fileExistsFromPublic(assetPath)
    })),
    criticalAssets: EXPECTED_ACTIVE_ASSETS.map((assetPath) => ({
      path: assetPath,
      exists: fileExistsFromPublic(assetPath)
    })),
    cssAudit,
    publicCssFiles: getPublicFilesByExtension(".css"),
    publicJsFiles: getPublicFilesByExtension(".js"),
    publicImageFiles: getAllPublicFiles().filter((assetPath) => assetPath.startsWith("imgs/"))
  };
}

function logAssetDiagnostics(diagnostics) {
  console.log(`[startup] NODE_ENV: ${diagnostics.nodeEnv}`);
  console.log(`[startup] process.cwd(): ${diagnostics.cwd}`);
  console.log(`[startup] iteration root: ${diagnostics.iterationRoot}`);
  console.log(`[startup] frontend root: ${diagnostics.frontendRoot}`);
  console.log(`[startup] static public dir: ${diagnostics.staticPublicDirectory}`);
  console.log(`[startup] views dir: ${diagnostics.viewsDirectory}`);
  console.log(`[startup] asset version/build hash: ${diagnostics.assetVersion}`);

  diagnostics.criticalAssets.forEach((asset) => {
    console.log(`[startup] critical asset ${asset.exists ? "OK" : "MISSING"}: /${asset.path}`);
  });

  diagnostics.homepageAssets.forEach((asset) => {
    console.log(`[startup] homepage asset ${asset.exists ? "OK" : "MISSING"}: /${asset.path}`);
  });

  if (diagnostics.obsoleteCssFilesFound.length) {
    console.log(`[startup] obsolete css still present: ${diagnostics.obsoleteCssFilesFound.join(", ")}`);
  } else {
    console.log("[startup] obsolete css still present: none");
  }

  if (diagnostics.missingTemplateReferencedAssets.length) {
    console.log(`[startup] missing template-referenced assets: ${diagnostics.missingTemplateReferencedAssets.join(", ")}`);
  } else {
    console.log("[startup] missing template-referenced assets: none");
  }
}

module.exports = {
  EXPECTED_ACTIVE_ASSETS,
  HOMEPAGE_EXPECTED_ASSETS,
  OBSOLETE_CSS_CANDIDATES,
  iterationRoot,
  frontendRoot,
  publicRoot,
  viewsRoot,
  computeAssetBuildHash,
  buildAssetUrl,
  extractTemplateAssetReferences,
  classifyCssFiles,
  buildAssetDiagnostics,
  logAssetDiagnostics,
  toViewRelative
};
