# IlmQuest
A multi-tenant school operations platform for admins, teachers, students, and parents.

## Platform Overview
IlmQuest helps schools manage users, classes, grading, attendance, and role-based workflows with tenant isolation and secure mutation controls.

## Core Features
- Admin dashboard and operational metrics
- Student and teacher user management
- Row-level secure edit UX (save/cancel, server-truth updates)
- Class creation and assignment workflows
- Student missions and grades interfaces
- Multi-tenant isolation by `schoolId`

## Tech Stack
- Node.js + Express
- MongoDB + Mongoose
- EJS server-rendered frontend
- Vanilla JS + external CSS design system
- Passport local auth + sessions + CSRF protections

## Security Posture
- Tenant-aware route/data scoping (`schoolId`)
- Role-based authorization middleware
- Scoped unique identifiers per tenant for sensitive fields
- Soft-delete-aware unique indexes
- Mutation validation and allowlists
- CSRF test coverage

## Responsiveness Philosophy
- Mobile-first CSS
- Stable breakpoint tiers with QA at common real-world widths
- Fixed-layout tables with intentional horizontal scroll wrappers where needed
- Consistent action controls and keyboard-focus states

## Screenshots
Store screenshots in:
- `docs/screenshots/`

Required screenshots:
1. `admin-users-table.png`
2. `admin-users-row-edit-mode.png`
3. `profile-view.png`
4. `mobile-responsive-example.png`
5. `admin-dashboard-overview.png`

Markdown embed examples:
```md
![Admin Users Table](docs/screenshots/admin-users-table.png)
![Edit Row Mode](docs/screenshots/admin-users-row-edit-mode.png)
![Profile View](docs/screenshots/profile-view.png)
![Mobile Responsive Example](docs/screenshots/mobile-responsive-example.png)
![Dashboard Overview](docs/screenshots/admin-dashboard-overview.png)
```

If screenshots are missing:
- Keep placeholders in this section.
- Capture with browser responsive mode at target widths (`375`, `768`, `1280`, `1440`).
- Use the filename convention above.

## Deployment Notes
- Ensure environment secrets are configured (Mongo URI, session secrets, cloud credentials if enabled).
- Run index sync dry-run before applying index migrations in production.
- Validate tenant-isolation and role tests against production-like data before rollout.

## Roadmap
1. UI design system coverage completion for remaining legacy pages.
2. Automated screenshot capture for documentation.
3. Stronger end-to-end authorization and edit-flow tests.
4. Advanced analytics and reporting modules.
