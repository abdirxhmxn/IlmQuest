# IlmQuest Grading System V1 Audit

> Date: 2026-05-07
> Target repo slice: `iteration2`
> Scope: grading, attendance, reports, leaderboards, missions, class roster, tenant isolation, and teacher gradebook UI
> Source of truth used for this implementation: user-provided Grading System V1 specification in the task prompt

## Audit Summary

The current Iteration 2 grading stack already has the right tenant and role foundations, but the academic data model is too coarse for a production spreadsheet-first institutional gradebook.

The current system stores weekly gradebook cells as mutable `Grade` documents and attendance as grouped `Attendance` documents. That is serviceable for simple teacher entry, but it does not satisfy:

- append-mostly audit trails
- deterministic cell history
- undo / redo semantics
- first-class comments surviving mark changes
- soft period locking
- shared backend + frontend calculations
- institutional report sections with live grade pulls
- staff-only academic leaderboards
- cached but non-authoritative summaries

The migration strategy for V1 is:

1. Keep tenant, role, class, student, session, and mission foundations.
2. Adapt the teacher gradebook route and UI surface.
3. Replace the academic write model with `grade_events` + supporting collections.
4. Preserve legacy `Grade` / `Attendance` paths during rollout with safe compatibility hooks and migration scripts.

## Keep

These pieces are structurally sound and should remain the foundation:

- `iteration2/backend/middleware/auth.js`
  - keep role middleware, session-driven auth, and tenant enforcement flow
- `iteration2/backend/utils/tenant.js`
  - keep `scopedQuery`, `scopedIdQuery`, and lifecycle filters as the baseline tenant guardrails
- `iteration2/backend/models/User.js`
  - keep users, student info, teacher class assignments, parent links, rank override fields
- `iteration2/backend/models/Class.js`
  - keep class ownership, teacher assignment, student roster, academic year, and customization storage
- `iteration2/backend/models/Missions.js`
  - keep missions and mission activity as the source for read-only mission leaderboard integration
- `iteration2/backend/routes/main.js`
  - keep overall route organization and role boundaries
- existing server-rendered stack
  - Express + EJS + vanilla JS stays
  - no SPA conversion

## Adapt

These pieces should stay, but need new read/write behavior or compatibility layers:

- `iteration2/backend/controllers/home.js`
  - adapt teacher gradebook reads
  - adapt student grade summaries
  - adapt report payload generation to live-grade reads
- `iteration2/backend/controllers/posts.js`
  - adapt gradebook writes away from mutable `Grade` documents
  - keep teacher/class authorization patterns
- `iteration2/backend/utils/teacherGradebook.js`
  - adapt from legacy `Grade`-document sheet rendering to grade-event snapshots and row partials
- `iteration2/frontend/views/teacher/teacherGrades.ejs`
  - adapt into the primary spreadsheet gradebook page
- `iteration2/frontend/public/js/teacher-grades.js`
  - adapt into htmx + Alpine + vanilla keyboard / optimistic spreadsheet behavior
- `iteration2/frontend/views/student/grades.ejs`
  - adapt to read V1 summaries instead of legacy weighted-average assumptions
- `iteration2/backend/utils/latexReports.js`
  - keep only as transitional compatibility if needed; new report rendering should be EJS-first
- `iteration2/backend/models/School.js`
  - adapt to cooperate with tenant-owned GridFS logo metadata
- `iteration2/backend/utils/ranks.js`
  - keep mission rank / XP logic
  - adapt academic ranking separately so grade rank privacy is enforced independently from missions rank

## Deprecate

These pieces can remain temporarily for compatibility, but should no longer be authoritative for V1:

- `iteration2/backend/models/Grades.js`
  - legacy grade store
  - may remain as a migration / compatibility shadow path only
- `iteration2/backend/models/Attendance.js`
  - legacy grouped attendance store
  - may remain as a migration / compatibility shadow path only
- `iteration2/backend/controllers/posts.js#createGrade`
  - legacy modal/assignment-grade entry path
- `iteration2/backend/controllers/posts.js#upsertTeacherGradebookCell`
  - current mutable gradebook write path
- `iteration2/frontend/views/teacher/teacherMissions.ejs` quick grade entry block
  - legacy lightweight grade capture path
- LaTeX-only report generation flow
  - should no longer be the primary report experience for V1

## Replace

These capabilities need a full V1 replacement:

- spreadsheet write model
  - replace mutable cell records with append-mostly `grade_events`
- comments
  - replace `feedback.content` as the only note channel with first-class per-cell comments
- summary math
  - replace ad hoc averages in controllers with shared backend/browser calculations
- report authoring
  - replace PDF-only generation workflow with report documents storing teacher-written sections and live data pulls
- academic leaderboard
  - replace incidental dashboard averages with explicit academic leaderboard and rank cache logic
- institution logo handling
  - replace static image-only branding with tenant-owned GridFS assets

## Current Grade Read Locations

### Backend reads

- `iteration2/backend/controllers/home.js`
  - `getTeacherGrades`
  - `getGrades`
  - `getAdmin`
  - `getAdminReports`
  - `buildStudentReportPayload`
  - `buildClassReportPayload`
  - `summarizeGradeRecords`
  - `getSubjectAverage`
- `iteration2/backend/controllers/parent.js`
  - parent dashboard and parent report generation use `Grade`
- `iteration2/backend/controllers/profile.js`
  - profile metrics count grade entries
- `iteration2/backend/utils/studentProgress.js`
  - teacher / parent progress views read grade history
- `iteration2/backend/utils/teacherGradebook.js`
  - builds current spreadsheet-like teacher page from `Grade` docs

### Frontend grade display surfaces

- `iteration2/frontend/views/teacher/teacherGrades.ejs`
- `iteration2/frontend/views/student/grades.ejs`
- `iteration2/frontend/views/teacher/teacherStudentProgress.ejs`
- `iteration2/frontend/views/parent/childProgress.ejs`
- `iteration2/frontend/views/parent/dashboard.ejs`
- `iteration2/frontend/views/admin/admin.ejs`
- `iteration2/frontend/views/admin/reports.ejs`

## Current Grade Write Locations

- `iteration2/backend/controllers/posts.js#createGrade`
  - legacy teacher assignment/assessment grade creation
- `iteration2/backend/controllers/posts.js#upsertTeacherGradebookCell`
  - current weekly sheet cell mutation path

## Current Attendance Read/Write Locations

### Reads

- `iteration2/backend/controllers/home.js`
  - admin attendance
  - student grades dashboard
  - teacher dashboard
  - report payload generation
- `iteration2/backend/controllers/parent.js`
  - parent dashboard / report payloads
- `iteration2/backend/controllers/profile.js`
  - attendance profile metrics
- `iteration2/backend/utils/studentProgress.js`
  - progress views
- `iteration2/frontend/views/teacher/teacherAttendance.ejs`
- `iteration2/frontend/views/admin/attendance.ejs`

### Writes

- `iteration2/backend/controllers/posts.js#createAttendance`

## Current Report Locations

- `iteration2/backend/controllers/home.js`
  - admin report page
  - student/class PDF generation
- `iteration2/backend/controllers/parent.js`
  - parent report download
- `iteration2/backend/models/ReportActivity.js`
  - report activity history
- `iteration2/backend/utils/latexReports.js`
  - LaTeX report renderer/compiler
- `iteration2/backend/latex/albayaanreport.cls`
  - current PDF contract

## Current Leaderboard / Rank Locations

- `iteration2/backend/utils/ranks.js`
  - missions/XP rank ladder
- `iteration2/backend/controllers/home.js`
  - student dashboard and admin analytics use incidental grade/XP ranking
- `iteration2/backend/controllers/posts.js`
  - rank override and points adjustment flows
- `iteration2/frontend/views/student/student.ejs`
  - student-facing missions leaderboard / rank surfaces

## Migration Safety Notes

- Existing `schoolId` tenant isolation is good and must remain mandatory on all new collections.
- Existing `Class` rosters and teacher assignments are the correct authorization backbone for V1.
- Existing mission data must remain authoritative for mission leaderboard reads.
- Existing `Grade` and `Attendance` collections should not be removed; V1 should provide migration scripts and compatibility read/write pathways during rollout.
- Existing auth/session behavior must remain untouched.

## V1 Implementation Direction

- New authoritative write model:
  - `grade_events`
  - `comments`
  - `assessments`
  - `grading_periods`
  - `key_systems`
  - `summary_cache`
  - `reports`
  - `leaderboards`
  - `rank_cache`
  - `period_rankings`
  - `institution_assets`
  - `counters`
- New authoritative read model:
  - live cell snapshots derived from latest non-superseded grade events
  - cached summaries for speed, but never as the source of truth
- New teacher UI:
  - spreadsheet-first
  - dropdown cells
  - sticky headers/columns
  - htmx partial refreshes
  - Alpine side panel state
  - shared browser/backend math

## Recommended Compatibility Approach

- Keep legacy collections readable during rollout.
- Add migration scripts to backfill legacy grades and attendance into V1 events.
- Optionally maintain compatibility shadows for selected legacy views while V1 views replace the main teacher and report experiences.
- Move student-facing and report-facing academic summaries onto V1 summary builders as soon as the new event system is stable.
