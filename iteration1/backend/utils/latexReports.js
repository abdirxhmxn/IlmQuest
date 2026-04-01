const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const { execFile } = require("child_process");

const execFileAsync = util.promisify(execFile);
const ALBAYAAN_CLASS_PATH = path.resolve(__dirname, "../latex/albayaanreport.cls");
const DEFAULT_LOGO_PATH = path.resolve(__dirname, "../../frontend/public/imgs/finalLogo.jpg");

let pdflatexCheckPromise;

function escapeLatex(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&#_%])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\n/g, " ")
    .trim();
}

function normalizeLatexPath(value) {
  return String(value || "logo.jpg").replace(/\\/g, "/");
}

function latexSetter(command, value) {
  return `\\${command}{${escapeLatex(value)}}`;
}

function toTableRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "\\multicolumn{4}{l}{No records available.} \\\\ \\hline";
  }

  return rows
    .map((cells) => `${cells.map((cell) => escapeLatex(cell)).join(" & ")} \\\\ \\hline`)
    .join("\n");
}

async function ensurePdflatexAvailable() {
  if (!pdflatexCheckPromise) {
    pdflatexCheckPromise = execFileAsync("pdflatex", ["--version"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024
    }).catch((err) => {
      if (err && err.code === "ENOENT") {
        const missingError = new Error("LaTeX compiler not available (pdflatex missing on server). Install TeX Live to enable PDF downloads.");
        missingError.code = "LATEX_COMPILER_MISSING";
        throw missingError;
      }
      throw err;
    });
  }

  return pdflatexCheckPromise;
}

function renderStudentReportLatex(payload) {
  const resolvedLogoPath = normalizeLatexPath(payload.logoPath || "logo.jpg");

  return String.raw`\documentclass{albayaanreport}
${latexSetter("institution", payload.institution || "Al Bayaan Institute")}
${latexSetter("department", payload.department || "")}
${latexSetter("program", payload.program || "")}
${latexSetter("semester", payload.semester || "")}
${latexSetter("teacher", payload.teacher || "")}
${latexSetter("rank", payload.rank || "")}
${latexSetter("finalgrade", payload.finalGrade || "")}
${latexSetter("reportdate", payload.reportDate || "")}
${latexSetter("logopath", resolvedLogoPath)}
${latexSetter("reporttitle", payload.reportTitle || "Student Progress Report")}
${latexSetter("studentname", payload.studentName || "")}
${latexSetter("gradelevel", payload.gradeLevel || "")}
${latexSetter("studentid", payload.studentId || "")}
${latexSetter("parentname", payload.parentName || "")}
${latexSetter("attendancepct", payload.attendancePct || "")}
${latexSetter("absences", payload.absences || "")}
${latexSetter("excusedabsences", payload.excusedAbsences || "")}
${latexSetter("late", payload.late || "")}
${latexSetter("earlypickup", payload.earlyPickup || "")}
${latexSetter("quranlabel", payload.quranLabel || "Qur'an Memorization")}
${latexSetter("subaclabel", payload.subacLabel || "Tajweed")}
${latexSetter("islamicstudieslabel", payload.islamicStudiesLabel || "Islamic Studies")}
${latexSetter("writinglabel", payload.writingLabel || "Writing")}
${latexSetter("characterlabel", payload.characterLabel || "Akhlaq / Character")}
${latexSetter("qurangrade", payload.quranGrade || "")}
${latexSetter("subacgrade", payload.subacGrade || "")}
${latexSetter("islamicstudiesgrade", payload.islamicStudiesGrade || "")}
${latexSetter("writinggrade", payload.writingGrade || "")}
${latexSetter("charactergrade", payload.characterGrade || "")}
${latexSetter("qurancomment", payload.quranComment || "")}
${latexSetter("subaccomment", payload.subacComment || "")}
${latexSetter("islamicstudiescomment", payload.islamicStudiesComment || "")}
${latexSetter("writingcomment", payload.writingComment || "")}
${latexSetter("charactercomment", payload.characterComment || "")}

\begin{document}
\ReportHeader
\StudentInfoTable
\end{document}`;
}

function renderClassReportLatex(payload) {
  const studentRows = toTableRows((payload.studentRows || []).map((entry) => [
    entry.student,
    entry.grade,
    entry.attendance,
    entry.points
  ]));

  return String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{array}
\usepackage{longtable}
\usepackage{booktabs}
\setlength{\parindent}{0pt}
\begin{document}
\begin{center}
{\LARGE \textbf{IlmQuest Class Report}}\\
\vspace{0.25cm}
${escapeLatex(payload.generatedAtLabel)}
\end{center}

\vspace{0.4cm}
\textbf{Class:} ${escapeLatex(payload.className)}\\
\textbf{Code:} ${escapeLatex(payload.classCode)}\\
\textbf{Students:} ${escapeLatex(payload.studentCountLabel)}\\
\textbf{Average Grade:} ${escapeLatex(payload.averageGradeLabel)}\\
\textbf{Attendance Rate:} ${escapeLatex(payload.attendanceRateLabel)}\\
\textbf{Mission Participation:} ${escapeLatex(payload.missionParticipationLabel)}\\

\vspace{0.4cm}
\textbf{Student Snapshot}
\vspace{0.2cm}
\begin{longtable}{|p{4.1cm}|p{2.2cm}|p{2.3cm}|p{2.0cm}|}
\hline
\textbf{Student} & \textbf{Avg Grade} & \textbf{Attendance} & \textbf{Points} \\\\ \hline
${studentRows}
\end{longtable}

\vspace{0.3cm}
\textbf{Notes}\\
${escapeLatex(payload.notes || "No additional notes available from current data.")}

\end{document}`;
}

function normalizeJobName(name) {
  return String(name || "report")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "report";
}

async function exists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (_err) {
    return false;
  }
}

async function compileLatexToPdf({ latexSource, jobName }) {
  await ensurePdflatexAvailable();

  const safeJobName = normalizeJobName(jobName);
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ilmquest-report-"));
  const texFileName = `${safeJobName}.tex`;
  const texPath = path.join(tempRoot, texFileName);
  const pdfPath = path.join(tempRoot, `${safeJobName}.pdf`);
  const logPath = path.join(tempRoot, `${safeJobName}.log`);

  try {
    const requiresAlbayaanClass = latexSource.includes("\\documentclass{albayaanreport}");

    if (requiresAlbayaanClass) {
      const classExists = await exists(ALBAYAAN_CLASS_PATH);
      if (!classExists) {
        const classError = new Error("Required LaTeX class file is missing: albayaanreport.cls");
        classError.code = "LATEX_CLASS_MISSING";
        throw classError;
      }

      await fs.promises.copyFile(ALBAYAAN_CLASS_PATH, path.join(tempRoot, "albayaanreport.cls"));

      if (await exists(DEFAULT_LOGO_PATH)) {
        await fs.promises.copyFile(DEFAULT_LOGO_PATH, path.join(tempRoot, "logo.jpg"));
      }
    }

    await fs.promises.writeFile(texPath, latexSource, "utf8");

    await execFileAsync(
      "pdflatex",
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-output-directory",
        tempRoot,
        texFileName
      ],
      {
        cwd: tempRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 8
      }
    );

    const pdfBuffer = await fs.promises.readFile(pdfPath);
    return pdfBuffer;
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const missingError = new Error("LaTeX compiler not available (pdflatex missing on server). Install TeX Live to enable PDF downloads.");
      missingError.code = "LATEX_COMPILER_MISSING";
      throw missingError;
    }

    if (err && err.code === "LATEX_CLASS_MISSING") {
      throw err;
    }

    let latexLog = "";
    try {
      latexLog = await fs.promises.readFile(logPath, "utf8");
    } catch (_ignore) {
      latexLog = "";
    }

    const compileError = new Error("Failed to compile LaTeX report.");
    compileError.code = "LATEX_COMPILE_FAILED";
    compileError.details = latexLog.slice(0, 4000);
    throw compileError;
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  renderStudentReportLatex,
  renderClassReportLatex,
  compileLatexToPdf,
  normalizeJobName,
  ensurePdflatexAvailable
};
