# IlmQuest Iteration 1

## What Iteration 1 Is
Iteration 1 is the canonical engineering baseline for IlmQuest. It consolidates multi-tenant data protections, secure admin mutations, row-level edit UX patterns, and a unified external CSS design system for frontend templates.

## Architecture Overview
- Frontend: EJS templates + external CSS + vanilla JS helpers.
- Backend: Express + Mongoose with tenant-aware middleware.
- Auth/session: Passport local strategy + sessions + CSRF protection.
- Data: MongoDB with tenant-scoped uniqueness indexes for sensitive identifiers.

## Folder Structure
- `backend/`
  - `controllers/`, `routes/`, `middleware/`, `models/`, `scripts/`, `utils/`
- `frontend/`
  - `views/` (EJS)
  - `public/css/` (`app.css`, `components.css`, `pages/*`)
  - `public/js/`
- `security-tests/`
- `package.json`

## Styling System
### Core files
- `frontend/public/css/app.css`: tokens, base styles, accessibility defaults, utilities.
- `frontend/public/css/components.css`: shared components (buttons, forms, tables, tabs, cards, dialogs, alerts).
- `frontend/public/css/pages/*`: page-specific styling.

### Breakpoint policy
Mobile-first with maintainable tiers:
- `360`, `480`, `600`, `768`, `1024`, `1280`, `1440`, `1920` (`min-width`).

QA target widths:
- `320, 360, 375, 390, 412, 428, 480, 540, 600, 768, 820, 834, 912, 1024, 1280, 1366, 1440, 1536, 1920`.

### Table strategy
- `.table-wrap { overflow-x: auto; }`
- Fixed-layout tables with nowrap + ellipsis in cells.
- Right-aligned, non-wrapping action cells.

## Multi-tenant Security Policies
- Tenant key: `schoolId`.
- Server-side authorization required for all mutations.
- Scoped uniqueness (active users):
  - `emailNormalized` unique per `schoolId`
  - `employeeIdNormalized` unique per `schoolId`
  - `studentNumberNormalized` unique per `schoolId`
- Username duplicates are allowed.
- Partial unique indexes ignore soft-deleted users (`deletedAt == null`).

## Setup
1. Install dependencies:
```bash
npm install
```
2. Configure environment (`.env`) with Mongo/session/auth values.
3. Start dev server:
```bash
npm run start
```

## Index Sync Scripts
Dry run conflict report:
```bash
npm run db:indexes:dry
```
Apply index migration:
```bash
npm run db:indexes:apply
```

## Tests
```bash
npm run test:admin-mutations
npm run test:role-authorization
npm run test:user-uniqueness
npm run test:tenant-isolation
npm run security:test:csrf
```

## Known Limitations
- Some legacy frontend CSS files remain for backward compatibility but are not canonical.
- Database-dependent test scripts require live DB connectivity.
- Iteration0 is kept as legacy reference and is not refactored as part of iteration1 styling canon.

## Roadmap (Next Iteration)
1. Expand shared UI component coverage to remaining legacy pages.
2. Add automated visual regression checks for key breakpoints.
3. Add E2E tests for admin/student/teacher edit flows.
4. Improve screenshot automation for docs generation.
