% albayaanreport.cls
% Al Bayaan Institute - Progress Report Class
% Version: 1.4 (2026-03-26)

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{albayaanreport}[2026/03/26 Al Bayaan Progress Report Class]

% Pass any unknown options to article
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

% Base class
\LoadClass[11pt]{article}

% =========================
% Packages
% =========================
\RequirePackage[a4paper,margin=2.5cm]{geometry}
\RequirePackage[T1]{fontenc}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage{tabularx}
\RequirePackage{array}
\RequirePackage{setspace}
\RequirePackage{fancyhdr}
\RequirePackage{babel}
\RequirePackage{iflang}
\RequirePackage[hidelinks]{hyperref}

% =========================
% Global formatting
% =========================
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt plus 1pt minus 1pt}
\renewcommand{\arraystretch}{.8}
\onehalfspacing

% =========================
% User-settable metadata (defaults)
% =========================
\newcommand{\ABIInstitution}{Al Bayaan Institute}
\newcommand{\ABIDepartment}{}
\newcommand{\ABIProgram}{}
\newcommand{\ABISemester}{}
\newcommand{\ABITeacher}{}
\newcommand{\ABIClassRank}{}
\newcommand{\ABIFinalGrade}{}
\newcommand{\ABIReportDate}{\today}
\newcommand{\ABILogoPath}{logo.jpg}

% change the text in table rows
\newcommand{\ABIRowStrut}{\rule{0pt}{3.5ex}}

\newcommand{\ABIShortTitle}{Progress Report}
\newcommand{\ABITitle}{Student Progress Report}

% Student fields
\newcommand{\ABIStudentName}{}
\newcommand{\ABIGradeLevel}{}
\newcommand{\ABIStudentID}{}
\newcommand{\ABIParentName}{}

% Attendance fields
\newcommand{\ABIAttendancePct}{}
\newcommand{\ABIAbsences}{}
\newcommand{\ABIExcusedAbsences}{}
\newcommand{\ABILate}{}
\newcommand{\ABIEarlyPickup}{}

% =========================
% Subject labels
% =========================
\newcommand{\ABIQuranLabel}{Qur'an Memorization}
\newcommand{\ABISubacLabel}{Tajw\={\i}d}
\newcommand{\ABIIslamicStudiesLabel}{Islamic Studies}
\newcommand{\ABICharacterLabel}{Akhlaq / Character}
\newcommand{\ABIWritingLabel}{Writing}

% =========================
% Subject grade fields + comments
% =========================
\newcommand{\ABIQuranGrade}{}
\newcommand{\ABISubacGrade}{}
\newcommand{\ABIIslamicStudiesGrade}{}
\newcommand{\ABICharacterGrade}{}
\newcommand{\ABIWritingGrade}{}

\newcommand{\ABIQuranComment}{}
\newcommand{\ABISubacComment}{}
\newcommand{\ABIIslamicStudiesComment}{}
\newcommand{\ABICharacterComment}{}
\newcommand{\ABIWritingComment}{}

% =========================
% Setters (clean API)
% =========================
\newcommand{\institution}[1]{\renewcommand{\ABIInstitution}{#1}}
\newcommand{\department}[1]{\renewcommand{\ABIDepartment}{#1}}
\newcommand{\program}[1]{\renewcommand{\ABIProgram}{#1}}
\newcommand{\semester}[1]{\renewcommand{\ABISemester}{#1}}
\newcommand{\teacher}[1]{\renewcommand{\ABITeacher}{#1}}
\newcommand{\rank}[1]{\renewcommand{\ABIClassRank}{#1}}
\newcommand{\finalgrade}[1]{\renewcommand{\ABIFinalGrade}{#1}}
\newcommand{\reportdate}[1]{\renewcommand{\ABIReportDate}{#1}}
\newcommand{\logopath}[1]{\renewcommand{\ABILogoPath}{#1}}
\newcommand{\shorttitle}[1]{\renewcommand{\ABIShortTitle}{#1}}
\newcommand{\reporttitle}[1]{\renewcommand{\ABITitle}{#1}}

\newcommand{\studentname}[1]{\renewcommand{\ABIStudentName}{#1}}
\newcommand{\gradelevel}[1]{\renewcommand{\ABIGradeLevel}{#1}}
\newcommand{\studentid}[1]{\renewcommand{\ABIStudentID}{#1}}
\newcommand{\parentname}[1]{\renewcommand{\ABIParentName}{#1}}

\newcommand{\attendancepct}[1]{\renewcommand{\ABIAttendancePct}{#1}}
\newcommand{\absences}[1]{\renewcommand{\ABIAbsences}{#1}}
\newcommand{\excusedabsences}[1]{\renewcommand{\ABIExcusedAbsences}{#1}}
\newcommand{\late}[1]{\renewcommand{\ABILate}{#1}}
\newcommand{\earlypickup}[1]{\renewcommand{\ABIEarlyPickup}{#1}}

% Subject label setters
\newcommand{\quranlabel}[1]{\renewcommand{\ABIQuranLabel}{#1}}
\newcommand{\subaclabel}[1]{\renewcommand{\ABISubacLabel}{#1}}
\newcommand{\islamicstudieslabel}[1]{\renewcommand{\ABIIslamicStudiesLabel}{#1}}
\newcommand{\characterlabel}[1]{\renewcommand{\ABICharacterLabel}{#1}}
\newcommand{\writinglabel}[1]{\renewcommand{\ABIWritingLabel}{#1}}

% Subject grade setters
\newcommand{\qurangrade}[1]{\renewcommand{\ABIQuranGrade}{#1}}
\newcommand{\subacgrade}[1]{\renewcommand{\ABISubacGrade}{#1}}
\newcommand{\islamicstudiesgrade}[1]{\renewcommand{\ABIIslamicStudiesGrade}{#1}}
\newcommand{\charactergrade}[1]{\renewcommand{\ABICharacterGrade}{#1}}
\newcommand{\writinggrade}[1]{\renewcommand{\ABIWritingGrade}{#1}}

% Subject comment setters
\newcommand{\qurancomment}[1]{\renewcommand{\ABIQuranComment}{#1}}
\newcommand{\subaccomment}[1]{\renewcommand{\ABISubacComment}{#1}}
\newcommand{\islamicstudiescomment}[1]{\renewcommand{\ABIIslamicStudiesComment}{#1}}
\newcommand{\charactercomment}[1]{\renewcommand{\ABICharacterComment}{#1}}
\newcommand{\writingcomment}[1]{\renewcommand{\ABIWritingComment}{#1}}

% =========================
% Academic year auto-calc
% =========================
\newcounter{abiyearstart}
\newcounter{abiyearend}
\newcounter{abimonth}

\newcommand{\checkacademicyear}{%
  \setcounter{abiyearstart}{\the\year}%
  \setcounter{abimonth}{\the\month}%
  % Academic year flips in September
  \ifnum\value{abimonth}<9
    \addtocounter{abiyearstart}{-1}%
  \fi
  \setcounter{abiyearend}{\value{abiyearstart}}%
  \stepcounter{abiyearend}%
}

% =========================
% Labels (EN/FR ready)
% =========================
\newcommand{\ABIYearLabel}{Academic Year: }
\newcommand{\ABISemesterLabel}{Semester: }
\newcommand{\ABITeacherLabel}{Teacher: }
\newcommand{\ABIClassRankLabel}{Class Rank: }
\newcommand{\ABIFinalGradeLabel}{Overall Final Grade: }

\AtBeginDocument{%
  \IfLanguagePatterns{english}{%
    \renewcommand{\ABIYearLabel}{Academic Year: }%
    \renewcommand{\ABISemesterLabel}{Semester: }%
    \renewcommand{\ABITeacherLabel}{Teacher: }%
    \renewcommand{\ABIClassRankLabel}{Class Rank: }%
    \renewcommand{\ABIFinalGradeLabel}{Overall Final Grade: }%
  }{}%
}

% =========================
% Report header block (first page top area)
% =========================
\newcommand{\ReportHeader}{%
  \checkacademicyear

  % Pull page up slightly like the old template
  \vspace*{-2cm}

  \begin{minipage}{0.62\linewidth}
    {\ABIYearLabel \arabic{abiyearstart}\, -- \arabic{abiyearend}}\\
    % {\ABISemesterLabel \ABISemester}\\

    Student Name: \ABIStudentName\\
    % Grade Level: \ABIGradeLevel\\
    {\ABITeacherLabel \ABITeacher}\\

    \ifx\ABIClassRank\@empty\relax
    \else
      {\ABIClassRankLabel \ABIClassRank}\\
    \fi
    {\ABIFinalGradeLabel \ABIFinalGrade}\\
  \end{minipage}
  \hfill
  \begin{minipage}{0.30\linewidth}
    \begin{flushright}
      \includegraphics[width=\linewidth]{\ABILogoPath}\\[2mm]
      \ifx\ABIProgram\@empty\relax
      \else
        {\sc \ABIProgram}\\
      \fi
    \end{flushright}
  \end{minipage}

  % Title block
  {\parskip 5pt
  \begin{center}
    \hrule
    \vspace*{1mm}
    {\huge\bfseries \ABITitle}\\[3mm]
    \hrule
    \vspace*{4mm}
    \ifx\ABIStudentName\@empty\relax
    \else
      {\Large\bfseries \ABIStudentName}\\[2mm]
    \fi
    \ABIReportDate
  \end{center}
  }

  \vspace{0.1em}
}

% =========================
% Student block (tables only)
% =========================
\newcommand{\StudentInfoTable}{%
\textbf{Attendance Breakdown}

\begin{tabularx}{\textwidth}{|X|c|}
\hline
Attendance Grade & \ABIAttendancePct \\
\hline
Total Absences & \ABIAbsences \\
\hline
Excused Absences & \ABIExcusedAbsences \\
\hline
Late Arrivals & \ABILate \\
\hline
\end{tabularx}

\vspace{.8em}

\textbf{Subject Grades}

\begin{tabularx}{\textwidth}{|
>{\raggedright\arraybackslash}m{4cm}|
>{\centering\arraybackslash}m{1.8cm}|
>{\raggedright\arraybackslash}X|}
\hline
\ABIRowStrut \textbf{Subject} & \textbf{Grade} & \textbf{Teacher Comments} \\
\hline
\ABIRowStrut \ABIQuranLabel & \ABIQuranGrade & \ABIQuranComment \\
\hline
\ABIRowStrut \ABISubacLabel & \ABISubacGrade& \ABISubacComment\\
\hline
\ABIRowStrut \ABIIslamicStudiesLabel & \ABIIslamicStudiesGrade & \ABIIslamicStudiesComment \\
\hline
\ABIRowStrut \ABIWritingLabel & \ABIWritingGrade & \ABIWritingComment \\
\hline
\ABIRowStrut \ABICharacterLabel & \ABICharacterGrade & \ABICharacterComment \\
\hline

\end{tabularx}

\vspace{.5em}
}

% End of class
\endinput
