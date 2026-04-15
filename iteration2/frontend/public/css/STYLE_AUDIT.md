# IlmQuest Style System Audit (2026-04-08)

## Scope
- Active production UI scope: `iteration1/frontend`.
- Legacy snapshot noted separately: `iteration0/frontend`.

## 1) Inline Styles and `<style>` Blocks

### Active (`iteration1`)
- Inline `style="..."`: **0**
- Inline `style='...'`: **0**
- `<style>` blocks: **0**

### Legacy (`iteration0`) - Findings (not part of active runtime)
- Inline + `<style>` occurrences: **40** total.
- Representative files:
  - `iteration0/frontend/views/profile.ejs`
  - `iteration0/frontend/views/partials/header.ejs`
  - `iteration0/frontend/views/login.ejs`
  - `iteration0/frontend/views/signup.ejs`
  - `iteration0/frontend/views/teacher/teacher.ejs`
  - `iteration0/frontend/views/admin/admin.ejs`
  - `iteration0/frontend/views/admin/class.ejs`
  - `iteration0/frontend/views/admin/users.ejs`
  - `iteration0/frontend/views/student/grades.ejs`
  - `iteration0/frontend/views/student/missions.ejs`

## 2) CSS Files Inventory and Purpose (Active `iteration1`)

### Root CSS entrypoints
- `css/base.css` - Global design tokens, reset, typography, fluid scales.
- `css/app.css` - Legacy alias entrypoint, delegates to `base.css`.
- `css/layout.css` - Shared layout shell, footer layouts, structural primitives.
- `css/components.css` - Component module aggregator.
- `css/style.css` - Marketing landing page presentation.
- `css/main.css` - Student home legacy page styles.
- `css/normalize.css` - Legacy normalization baseline.
- `css/admin-users.css` - Legacy alias to `css/pages/admin-users.css`.
- `css/authLogin.css` - Legacy alias to `css/pages/auth.css`.
- `css/adminLayout.css` - Legacy admin layout stylesheet (not active in shell path).
- `css/teacherLayout.css` - Legacy teacher layout stylesheet.
- `css/teacherDashboard.css` - Teacher missions/dashboard legacy styling.
- `css/teacherMissions.css` - Teacher mission management page styling.
- `css/teacherGrades.css` - Teacher gradebook and grade modal styling.
- `css/teacherAttendance.css` - Teacher attendance sheet styling.

### New component modules
- `css/components/buttons.css` - Buttons, action controls, tab controls.
- `css/components/forms.css` - Inputs, selects, labels, field grids, validation text.
- `css/components/cards.css` - Card surfaces, panel heads, glass behavior for cards.
- `css/components/tables.css` - Table hierarchy, wrappers, row states, mobile handling.
- `css/components/modals.css` - Dialog/modal overlays and responsive modal behavior.
- `css/components/navbar.css` - Public/in-app navbar and header nav behavior.
- `css/components/sidebar.css` - Sidebar scroll/focus/scrim shared rules.

### Page-level styles
- `css/pages/admin-shell.css` - Admin shell grid, sidebar, topbar, shared admin primitives.
- `css/pages/admin-dashboard.css` - Admin dashboard composition and KPI/insight layout.
- `css/pages/admin-users.css` - Admin users forms/tables/utility rail.
- `css/pages/admin-class.css` - Admin class creation and class table layout.
- `css/pages/admin-finance.css` - Admin finance forms/tables/bank sync UI.
- `css/pages/admin-reports.css` - Admin reports page layout.
- `css/pages/admin-announcements.css` - Admin announcements panel and controls.
- `css/pages/admin-attendance.css` - Admin attendance page layout.
- `css/pages/admin-settings.css` - Admin settings page layout and quick-link panels.
- `css/pages/parent-shell.css` - Parent shell grid/sidebar/header styling.
- `css/pages/parent-dashboard.css` - Parent dashboard sections and payment visuals.
- `css/pages/profile.css` - Unified profile center across roles.
- `css/pages/auth.css` - Authentication core views.
- `css/pages/signup.css` - Signup-specific overrides.
- `css/pages/student-grades.css` - Student grades page.
- `css/pages/student-missions.css` - Student missions page.
- `css/pages/teacher-dashboard.css` - Teacher class dashboard page.
- `css/pages/teacher-customization.css` - Teacher customization workflows.
- `css/pages/marketing-header.css` - Marketing brand label styling.

## 3) `!important` Usage

### Active (`iteration1`)
- **0 usages** after refactor.

### Legacy (`iteration0`)
- **4 usages** remain in:
  - `iteration0/frontend/public/css/teacherAttendance.css`
  - `iteration0/frontend/public/css/teacherGrades.css`

## 4) Duplicate Rules / Conflicting Selectors (Active)

Top collision selectors observed across files:
- `:root` (multiple token definitions)
- `body` (multiple global body declarations)
- `*`, `a`, `html`, `main`
- `.card`, `.card-header`, `.inline-error`, `.field-row`, `.action-cell`
- `.primary-btn`, `.secondary-btn`, `.btn-primary`
- `.table-wrap`, `.finance-table`, `.metrics-table`

Refactor actions taken:
- Introduced canonical shared sources: `base.css`, `layout.css`, `components/*`.
- Converted `authLogin.css` and root `admin-users.css` into canonical aliases.
- Removed duplicate ad-hoc `!important` overrides in active CSS.

## 5) Specificity/Override Chains (Active)

Observed risk areas:
- Shared class names overridden by page files: `.card`, `.submit-btn`, `.tab-btn`, `.primary-btn`.
- Table primitives defined in both shared and page files.
- Mixed legacy + modern selectors causing order-dependent outcomes.

Refactor direction:
- Component defaults now live in `components/*`.
- Page files remain as explicit overrides for local context only.
- Shell/page imports now load global architecture first, page overrides last.

## 6) Inconsistency Findings (Active)

Before cleanup, recurring inconsistencies included:
- Typography stacks varied across files (`Segoe UI`, Arial, legacy stacks).
- Radius and shadow values repeated with different scales.
- Spacing units mixed without a single rhythm.
- Duplicate auth styles in both `authLogin.css` and `pages/auth.css`.

Standardization introduced:
- Unified token scales in `base.css`.
- Fluid typography via `clamp()` in global scale.
- Shared card/button/form/table systems.
- Responsive breakpoint strategy anchored at: 320 / 480 / 768 / 1024 / 1280 / 1536.
