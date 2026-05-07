# IlmQuest Grading System V1 Manual Testing Checklist

## Setup

1. Run `cd iteration2 && npm run db:grading-v1:indexes:apply`.
2. Run `cd iteration2 && npm run db:grading-v1:seed-keys`.
3. Run `cd iteration2 && npm run build:grading-assets`.
4. Start the app with `cd iteration2 && npm run dev`.

## Teacher Gradebook

1. Log in as a teacher assigned to at least one class with students.
2. Open `/teacher/manage-grades`.
3. Confirm class tabs render and the first class opens automatically.
4. Confirm `/teacher/manage-grades` loads successfully for a class where students have no grades yet.
5. Confirm students without any grades show `—` in summary cells and the page does not crash.
6. Confirm students with existing grades show calculated summary values instead of `—`.
7. Confirm a class with no saved grade events still shows editable dropdown cells across a visible tracker date range.
8. Confirm no dim overlay or side panel is open on initial page load.
9. Confirm the page is immediately clickable and scrollable on load.
10. Confirm the horizontal viewport opens on the left-side tracker grid, not the far-right summary columns.
11. Confirm the gradebook shows:
   - sticky student column
   - date-grouped daily columns
   - day headers under each date
   - Q / W / S tracker cells
   - Subac / Attendance / Behavior cells for each visible date
   - assessment columns
   - summary columns on the right
12. Confirm clicking a grade dropdown does not automatically open the side panel.
13. Confirm clicking a cell background or details icon opens the side panel with selected cell data.
14. Confirm the side panel closes with:
   - the close `X`
   - `Escape`
   - clicking outside on the backdrop
15. Confirm the full page becomes clickable again after closing the side panel.
16. Confirm summary cells never render `NaN%`; empty categories should show `—`.
17. Use the week/day jump control to:
   - pick a specific date
   - move to the previous week
   - move to the next week
   - jump back to today
18. Confirm the visible tracker week updates to the selected date range automatically.
19. Change a `Q`, `W`, `S`, `Subac`, `Attendance`, and `Behavior` cell.
20. Confirm:
   - the cell color updates immediately
   - the row summaries update immediately
   - the save completes without a 500 error
21. Refresh `/teacher/manage-grades` and confirm every saved value still appears in the same cell with the same color.
22. Confirm superseded values do not reappear after refresh, and cleared cells remain empty.
23. Clear a cell by choosing the blank option and confirm the summary recalculates.
24. Open a cell drawer with the `...` button and save:
   - internal comment
   - parent-facing comment
   - reviewer / revision portion for a Subac cell
   - behavior subcategory for a Behavior cell
25. Confirm comment indicators stay visible after a later grade change on the same cell.
26. Use the drawer undo button and confirm the latest cell state rolls back.
27. Press `Cmd/Ctrl + Z` outside a text field and confirm the latest successful cell change undoes.

## Assessment Columns

1. Create a new assessment from the class panel form.
2. Confirm a new assessment column appears after reload.
3. Enter assessment marks and confirm the `Assessment` summary and final grade update.

## Tenant / Role Safety

1. Log in as a different teacher not assigned to the same class and confirm gradebook access is restricted to assigned classes.
2. Attempt posting gradebook writes with a student from another class and confirm the request is rejected.
3. Confirm students do not have access to `/teacher/manage-grades` or `/api/teacher/gradebook/*`.

## Exports

1. Click `Export CSV` from a class panel and confirm the downloaded sheet reflects current visible values.
2. Load `/teacher/manage-grades/student-summary.json?classId=<classId>&studentId=<studentId>` and confirm the summary payload matches the teacher row.

## Automated Checks

1. Run `cd iteration2 && npm run test:grading-v1:calculations`.
2. Run `cd iteration2 && npm run test:grading-v1:grid-shape`.
3. Run `cd iteration2 && npm run test:grading-v1:hydration`.
4. Run `cd iteration2 && npm run test:grading-v1:ranking`.
5. Run `cd iteration2 && npm run test:grading-v1:summary-shape`.
