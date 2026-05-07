/* eslint-disable no-console */
const path = require("path");
const esbuild = require("esbuild");

async function buildBundle({ entryPoints, outfile, platform = "browser", format = "iife" }) {
  await esbuild.build({
    entryPoints,
    outfile,
    bundle: true,
    platform,
    format,
    target: ["es2019"],
    minify: false,
    sourcemap: false,
    logLevel: "silent"
  });
  console.log(`[build-grading-assets] built ${path.relative(process.cwd(), outfile)}`);
}

async function main() {
  const projectRoot = path.join(__dirname, "../..");

  await buildBundle({
    entryPoints: [path.join(projectRoot, "backend/src/shared/calculations/browser-entry.js")],
    outfile: path.join(projectRoot, "frontend/public/js/shared-calculations.bundle.js")
  });

  await buildBundle({
    entryPoints: [path.join(projectRoot, "frontend/src/teacher-gradebook-app.js")],
    outfile: path.join(projectRoot, "frontend/public/js/teacher-gradebook-app.js")
  });
}

main().catch((err) => {
  console.error("[build-grading-assets] failed:", err.message);
  process.exit(1);
});
