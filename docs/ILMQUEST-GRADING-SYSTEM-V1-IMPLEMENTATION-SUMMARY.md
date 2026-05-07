# IlmQuest Grading System V1 Implementation Summary

## What Changed

- Added the V1 grading collections:
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
- Added a shared pure JavaScript calculation engine under `iteration2/backend/src/shared/calculations/`.
- Added the Al Bayaan V1 grading key definitions in code and a seed script for `key_systems`.
- Replaced the teacher gradebook route with a V1 spreadsheet-style gradebook backed by `grade_events`.
- Added:
  - row-level htmx cell saves
  - optimistic frontend updates using the shared calculation engine
  - drawer-based comments and metadata editing
  - undo support
  - assessment column creation
  - CSV export and JSON summary export
- Added the foundational V1 models for reports, leaderboards, rank caches, and institution assets, but those surfaces are not yet fully rebuilt onto the new grade-event workflow.

## Operational Scripts

- `npm run build:grading-assets`
- `npm run db:grading-v1:indexes:dry`
- `npm run db:grading-v1:indexes:apply`
- `npm run db:grading-v1:seed-keys`
- `npm run test:grading-v1:calculations`
- `npm run test:grading-v1:ranking`

## Main Files

- Service core: `iteration2/backend/services/gradingV1/index.js`
- Teacher controller: `iteration2/backend/controllers/grading.js`
- Shared calculations: `iteration2/backend/src/shared/calculations/`
- Teacher page: `iteration2/frontend/views/teacher/teacherGrades.ejs`
- Gradebook partials: `iteration2/frontend/views/partials/gradebook/`
- Gradebook styles: `iteration2/frontend/public/css/pages/teacher-gradebook-v1.css`
- Gradebook frontend app: `iteration2/frontend/src/teacher-gradebook-app.js`

## How To Test

1. Apply indexes and seed keys.
2. Build the grading browser assets.
3. Start the app and log in as a teacher with assigned classes.
4. Use the checklist in `docs/ILMQUEST-GRADING-SYSTEM-V1-MANUAL-CHECKLIST.md`.
