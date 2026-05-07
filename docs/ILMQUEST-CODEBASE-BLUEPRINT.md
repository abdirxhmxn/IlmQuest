# IlmQuest Codebase Blueprint

> **Version:** Iteration 2 (current production candidate)
> **Generated:** 2026-05-06
> **Auditor:** Senior engineering review of `/Users/mcabdirahman/Desktop/IlmQuest/iteration2`
> **Purpose:** Complete technical blueprint — sufficient to rebuild IlmQuest from scratch.

---

## Blueprint Completeness Checklist

- [x] All major folders documented
- [x] All roles documented
- [x] All models documented
- [x] All routes/pages documented
- [x] All APIs documented
- [x] All services documented
- [x] Mission system documented
- [x] Leaderboard system documented
- [x] XP/rank system documented
- [x] Grades documented
- [x] Attendance documented
- [x] Dashboards documented
- [x] Security audit completed
- [x] Deployment documented
- [x] Rebuild guide included

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Environment Variables](#4-environment-variables)
5. [Overall Architecture](#5-overall-architecture)
6. [User Roles and Permissions](#6-user-roles-and-permissions)
7. [Authentication System](#7-authentication-system)
8. [Multi-Tenancy and schoolId Isolation](#8-multi-tenancy-and-schoolid-isolation)
9. [Database Models and Schemas](#9-database-models-and-schemas)
10. [Routes, Pages, and Navigation](#10-routes-pages-and-navigation)
11. [APIs / Server Actions](#11-apis--server-actions)
12. [Services and Business Logic](#12-services-and-business-logic)
13. [Mission System Blueprint](#13-mission-system-blueprint)
14. [Leaderboard System Blueprint](#14-leaderboard-system-blueprint)
15. [XP, Rank, and Gamification System](#15-xp-rank-and-gamification-system)
16. [Grades and Academic Tracking](#16-grades-and-academic-tracking)
17. [Attendance System](#17-attendance-system)
18. [Dashboard Systems](#18-dashboard-systems)
19. [UI Component System](#19-ui-component-system)
20. [Styling and Design System](#20-styling-and-design-system)
21. [Uploads and Media](#21-uploads-and-media)
22. [Notifications and Email](#22-notifications-and-email)
23. [Payments and Finance](#23-payments-and-finance)
24. [Validation and Error Handling](#24-validation-and-error-handling)
25. [Security Audit](#25-security-audit)
26. [Testing](#26-testing)
27. [Deployment and Infrastructure](#27-deployment-and-infrastructure)
28. [Full Rebuild Guide](#28-full-rebuild-guide)
29. [Critical Business Rules](#29-critical-business-rules)
30. [Known Gaps and Technical Debt](#30-known-gaps-and-technical-debt)
31. [Glossary](#31-glossary)

---

## 1. Executive Summary

**What IlmQuest is:**
IlmQuest is a multi-tenant Islamic educational platform (LMS) designed for Islamic schools ("markaz", plural "marakiz"). It provides school administration, teacher tools, student progress tracking, parent visibility, and a gamification layer that motivates students through Islamic learning objectives.

**Target users:**
- Platform operators (super-admin) who provision schools
- School administrators (markaz admins) who manage their tenant
- Teachers who track grades, attendance, and assign missions
- Students who complete missions and track their rank/XP
- Parents who monitor child progress and tuition payments

**Core educational purpose:**
Digitize and gamify the Islamic school experience. Students earn XP and progress through ranks (F → S) by completing "missions" — Islamic-themed tasks covering knowledge (Ilm), character (Adab & Akhlaq), excellence (Ihsaan), piety (Taqwa), and trustworthiness (Amanah). Academic tracking includes memorization grading (Al Bayaan system), revision (Subac), attendance, and PDF report generation.

**Core modules:**
1. Multi-tenant school provisioning (super-admin)
2. User management (students, teachers, parents, admins)
3. Mission system (Islamic task assignments with XP rewards)
4. XP/Rank gamification (F → E → D → C → B → A → S)
5. Grade tracking (memorization + revision symbolic scales)
6. Attendance management
7. Parent dashboard (child progress visibility)
8. Finance module (manual entries + Plaid bank sync)
9. Announcements and library resources
10. PDF report generation (LaTeX)

**Current maturity level:**
Iteration 2 — production-ready for small-to-medium Islamic schools. Core features are complete; finance module is advanced but partially integrated; some legacy CSS files coexist with the new design system.

**Architectural philosophy:**
Server-rendered MVC (Express + EJS). No client-side framework. Tenant isolation through `schoolId` on every document. Role-based access enforced in middleware. Security-first: CSRF, rate limiting, Helmet, NoSQL injection protection, partial unique indexes.

---

## 2. Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| EJS | ^5.0.1 | Server-side HTML templating |
| Vanilla JS | ES6+ | Client-side interactivity |
| CSS (custom) | N/A | Component + page-level styles |
| No framework | — | Intentional — no React/Vue/Angular |

**Rendering:** Full server-side rendering. Every page load is an Express route that renders an EJS template. No SPA, no client-side routing, no hydration.

**State management:** Session-based (server-side). Flash messages for transient state. No client-side state store.

**Styling:** Custom CSS design system organized into:
- `base.css` — CSS variables, reset, a11y
- `app.css` — utility tokens
- `components.css` — buttons, forms, tables, cards, modals, tabs
- `layout.css` — grid and flexbox helpers
- `pages/*.css` — page-specific styles (one file per page)
- `components/*.css` — modular component files

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | LTS | Runtime |
| Express | ^4.17.1 | HTTP framework |
| Passport.js | ^0.6.0 | Authentication middleware |
| passport-local | ^1.0.0 | Username/password strategy |
| express-session | ^1.17.1 | Session management |
| connect-mongo | ^5.1.0 | MongoDB session store |
| csurf | ^1.2.2 | CSRF protection |
| helmet | ^8.0.0 | HTTP security headers |
| express-rate-limit | ^7.4.1 | Request throttling |
| method-override | ^3.0.0 | PUT/DELETE from HTML forms |
| multer | ^1.4.5-lts.1 | File uploads |
| morgan | ^1.10.0 | HTTP request logging |
| bcrypt | ^6.0.0 | Password hashing |
| nodemailer | ^8.0.4 | SMTP email |
| validator | ^13.6.0 | Input validation |
| lodash | ^4.17.23 | Utility functions |
| pdflatex | ^0.0.1 | PDF report compilation |
| dotenv | ^8.2.0 | Environment variable loading |

### Database
| Technology | Version | Purpose |
|---|---|---|
| MongoDB | ^5 (via driver) | Primary database |
| Mongoose | ^7.8.7 | ODM / schema enforcement |

**Connection config:**
- `maxPoolSize: 50` (production), `10` (development)
- `minPoolSize: 5` (production), `1` (development)
- `serverSelectionTimeoutMS: 10000`
- `socketTimeoutMS: 45000`
- `autoIndex: false` (production — indexes managed by migration scripts)

### Infrastructure
| Technology | Purpose |
|---|---|
| Render | Cloud hosting (PaaS) |
| MongoDB Atlas | Database hosting |
| Cloudinary | Image/media CDN |
| Plaid | Bank data aggregation (finance module) |
| Nodemailer/SMTP | Transactional email |
| pdflatex (system) | PDF generation from LaTeX |

---

## 3. Repository Structure

```
IlmQuest/
├── iteration0/          # Initial prototype (empty placeholder)
├── iteration1/          # Iteration 1 (deprecated)
├── iteration2/          # CURRENT PRODUCTION VERSION
│   ├── backend/
│   │   ├── config/
│   │   │   ├── .env             # Production secrets (gitignored)
│   │   │   ├── .env.example     # Template for all env vars
│   │   │   ├── database.js      # MongoDB connection factory
│   │   │   ├── env.js           # Env validation + export
│   │   │   └── passport.js      # Passport LocalStrategy setup
│   │   ├── controllers/
│   │   │   ├── auth.js          # Login, signup, password flows
│   │   │   ├── home.js          # Dashboard renderers (all roles)
│   │   │   ├── platform.js      # Super-admin provisioning
│   │   │   ├── announcements.js # Announcement CRUD
│   │   │   ├── finance.js       # Finance module controller
│   │   │   ├── parent.js        # Parent dashboard controller
│   │   │   ├── posts.js         # Create/update/delete mutations
│   │   │   ├── profile.js       # Profile view/edit
│   │   │   └── teacherLibrary.js# Teacher library resources
│   │   ├── middleware/
│   │   │   ├── auth.js          # ensureAuth, requireTenant, requireRole
│   │   │   ├── adminMutations.js# Admin mutation blockers
│   │   │   ├── cloudinary.js    # Cloudinary image upload helper
│   │   │   ├── multer.js        # Multer config (5MB, jpg/png)
│   │   │   ├── rateLimit.js     # Rate limiter factory + named limiters
│   │   │   └── validate.js      # Field validation helpers
│   │   ├── models/
│   │   │   ├── User.js          # All users (all roles share one collection)
│   │   │   ├── School.js        # School/tenant document
│   │   │   ├── Class.js         # Class with teacher customization
│   │   │   ├── Missions.js      # Mission definitions + student activity
│   │   │   ├── Grades.js        # Grade entries (symbolic + numeric)
│   │   │   ├── Attendance.js    # Attendance per class per date
│   │   │   ├── Announcement.js  # Announcements and library resources
│   │   │   ├── Post.js          # Social feed posts
│   │   │   ├── AuditLog.js      # Admin action audit trail
│   │   │   ├── Reflections.js   # Quran/Hadith reflections
│   │   │   ├── PointAdjustment.js # Manual XP adjustments by teacher
│   │   │   ├── ReportActivity.js  # PDF generation job tracking
│   │   │   ├── Verses.js          # Quranic verses
│   │   │   ├── FinanceEntry.js    # Income/expense ledger entries
│   │   │   ├── FinanceCategory.js # Finance categories
│   │   │   ├── FinanceBankAccount.js     # Linked bank accounts
│   │   │   ├── FinanceBankConnection.js  # Plaid connection tokens
│   │   │   ├── FinanceBankTransaction.js # Imported bank transactions
│   │   │   ├── FinanceSyncLog.js  # Bank sync history
│   │   │   └── ParentPayment.js   # Tuition/fee payment records
│   │   ├── routes/
│   │   │   ├── main.js          # All application routes (~305 lines)
│   │   │   └── posts.js         # Legacy post routes
│   │   ├── scripts/             # Database maintenance + validation
│   │   │   ├── admin-mutation-check.js
│   │   │   ├── attendance-dedupe-check.js
│   │   │   ├── dedupe-attendance.js
│   │   │   ├── ensure-core-indexes.js
│   │   │   ├── password-selection-check.js
│   │   │   ├── private-provisioning-check.js
│   │   │   ├── real-data-readiness-check.js
│   │   │   ├── role-authorization-check.js
│   │   │   ├── sync-user-indexes.js
│   │   │   ├── teacher-points-mission-check.js
│   │   │   ├── tenant-helper-check.js
│   │   │   ├── tenant-isolation-check.js
│   │   │   ├── tenant-query-guard.js
│   │   │   └── user-uniqueness-check.js
│   │   ├── utils/
│   │   │   ├── announcements.js     # Announcement visibility + viewmodel
│   │   │   ├── audit.js             # Audit helper functions
│   │   │   ├── auditLogger.js       # Audit log middleware helper
│   │   │   ├── bankProvider.js      # Plaid bank API wrapper
│   │   │   ├── finance.js           # Finance aggregation utilities
│   │   │   ├── gradingScales.js     # Memorization + Subac scale definitions
│   │   │   ├── latexReports.js      # PDF generation via LaTeX
│   │   │   ├── mailer.js            # Nodemailer SMTP wrapper
│   │   │   ├── missionDeadlines.js  # Auto-fail sweep scheduler
│   │   │   ├── ownerInvite.js       # Owner invite token generation
│   │   │   ├── parentLinks.js       # Parent-student display helpers
│   │   │   ├── passwordSetup.js     # Forced password change logic
│   │   │   ├── platformSuperAdmin.js# Super-admin bootstrap
│   │   │   ├── ranks.js             # XP/rank calculation engine
│   │   │   ├── secureToken.js       # Secure random token helpers
│   │   │   ├── studentProgress.js   # Progress viewmodel builder
│   │   │   ├── teacherCustomization.js # Class config resolver
│   │   │   ├── teacherGradebook.js  # Gradebook page builder
│   │   │   ├── tenant.js            # Multi-tenant scoping primitives
│   │   │   └── userIdentifiers.js   # Normalization for email/username
│   │   ├── latex/
│   │   │   └── albayaanreport.cls   # LaTeX class for PDF reports
│   │   └── server.js               # Express app bootstrap
│   ├── frontend/
│   │   ├── views/                  # EJS templates
│   │   │   ├── index.ejs           # Landing page
│   │   │   ├── login.ejs
│   │   │   ├── signup.ejs          # Disabled (shows 404)
│   │   │   ├── signupDisabled.ejs
│   │   │   ├── forgotPassword.ejs
│   │   │   ├── resetPassword.ejs
│   │   │   ├── resetPasswordToken.ejs
│   │   │   ├── forcePasswordChange.ejs
│   │   │   ├── ownerOnboarding.ejs
│   │   │   ├── profile.ejs
│   │   │   ├── feed.ejs
│   │   │   ├── platform/
│   │   │   │   └── home.ejs        # Super-admin provisioning dashboard
│   │   │   ├── admin/
│   │   │   │   ├── admin.ejs       # Admin dashboard
│   │   │   │   ├── users.ejs       # User management
│   │   │   │   ├── deleted-users.ejs
│   │   │   │   ├── class.ejs       # Class management
│   │   │   │   ├── attendance.ejs
│   │   │   │   ├── announcements.ejs
│   │   │   │   ├── finance.ejs
│   │   │   │   ├── reports.ejs
│   │   │   │   └── settings.ejs
│   │   │   ├── teacher/
│   │   │   │   ├── teacher.ejs     # Teacher dashboard
│   │   │   │   ├── teacherAttendance.ejs
│   │   │   │   ├── teacherGrades.ejs
│   │   │   │   ├── teacherMissions.ejs
│   │   │   │   ├── teacherLibrary.ejs
│   │   │   │   ├── teacherCustomization.ejs
│   │   │   │   └── teacherStudentDirectory.ejs
│   │   │   ├── student/
│   │   │   │   ├── student.ejs     # Student dashboard
│   │   │   │   ├── grades.ejs
│   │   │   │   ├── missions.ejs
│   │   │   │   └── library.ejs
│   │   │   └── parent/
│   │   │       ├── dashboard.ejs
│   │   │       └── childProgress.ejs
│   │   └── public/
│   │       ├── css/               # Stylesheets
│   │       ├── js/                # Client-side scripts
│   │       └── imgs/              # Static images and video
│   ├── security-tests/
│   │   ├── README.md
│   │   └── csrf-attack.test.js
│   ├── package.json
│   ├── Procfile
│   ├── seed.js
│   ├── seedHadith.js
│   ├── seedInfo.js
│   └── FINANCE_MODULE_FULL_CODE.txt
├── iteration3/          # Empty placeholder
├── iteration4/          # Empty placeholder
└── README.md
```

---

## 4. Environment Variables

All variables are loaded from `backend/config/.env` via `dotenv`. Validated in `backend/config/env.js`.

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `DB_STRING` | **Required** | MongoDB connection URI | `mongodb+srv://user:pass@cluster.mongodb.net/ilmquest` |
| `SESSION_SECRET` | **Required (prod)** | Express session signing key | `a_long_random_string_64+_chars` |
| `SESSION_SECRET_KEY` | Optional | Legacy alias for `SESSION_SECRET` | (same as above) |
| `PORT` | Optional | Server listen port (default: `2121`) | `2121` |
| `NODE_ENV` | Optional | Runtime environment | `production` or `development` |
| `APP_BASE_URL` | Optional | Base URL for generating invite links | `https://ilmquest.onrender.com` |
| `SMTP_HOST` | Optional | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_SERVICE` | Optional | Nodemailer service shorthand | `gmail` |
| `SMTP_PORT` | Optional | SMTP port (default: `587`) | `587` |
| `SMTP_SECURE` | Optional | TLS (`true` for port 465) | `false` |
| `SMTP_USER` | Optional | SMTP login username | `noreply@school.com` |
| `SMTP_PASS` | Optional | SMTP login password | `app_password` |
| `SMTP_FROM` | Optional | Sender address in emails | `IlmQuest <noreply@school.com>` |
| `PLATFORM_SUPERADMIN_EMAIL` | Optional | Bootstrap super-admin email | `admin@platform.com` |
| `PLATFORM_SUPERADMIN_USERNAME` | Optional | Bootstrap super-admin username | `platformadmin` |
| `PLATFORM_SUPERADMIN_PASSWORD` | Optional | Bootstrap super-admin password | `strong_password_here` |
| `PLATFORM_SUPERADMIN_FIRST_NAME` | Optional | Default: `Platform` | `Platform` |
| `PLATFORM_SUPERADMIN_LAST_NAME` | Optional | Default: `Admin` | `Admin` |
| `ALLOW_TENANT_ADMIN_SCHOOL_CREATION` | Optional | Default: `false` — blocks admin-level school creation | `false` |
| `ADMIN_ANALYTICS_CACHE_TTL_MS` | Optional | Admin dashboard cache TTL (default: `30000`) | `30000` |
| `CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary cloud name | `my_cloud` |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API key | `123456789` |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API secret | `secret_here` |
| `CLOUDINARY_URL` | Optional | Alternate single-string Cloudinary config | `cloudinary://key:secret@cloud` |
| `PLAID_CLIENT_ID` | Optional | Plaid API client ID (finance) | `plaid_client_id` |
| `PLAID_SECRET` | Optional | Plaid API secret (finance) | `plaid_secret` |
| `PLAID_ENV` | Optional | Plaid environment (default: `sandbox`) | `production` |
| `PLAID_REDIRECT_URI` | Optional | OAuth redirect for Plaid Link | `https://app.com/plaid/oauth` |
| `PLAID_WEBHOOK_URL` | Optional | Plaid webhook endpoint | `https://app.com/plaid/webhook` |
| `PLAID_PRODUCTS` | Optional | Default: `transactions` | `transactions` |
| `FINANCE_ENCRYPTION_KEY` | Optional | Key for encrypting sensitive finance tokens | `32_byte_hex_key` |

**Security notes:**
- `SESSION_SECRET` must be at least 32 random bytes (64 hex chars). Never use a predictable value.
- `FINANCE_ENCRYPTION_KEY` must be exactly 32 bytes (256-bit) for AES-256 encryption of Plaid access tokens.
- `CLOUDINARY_API_SECRET` and `PLAID_SECRET` must never be committed to version control.
- In development, `SESSION_SECRET` is auto-generated (ephemeral — sessions invalidate on restart).

---

## 5. Overall Architecture

### Frontend Architecture
Server-rendered MVC. The browser receives complete HTML from Express + EJS. JavaScript files in `/public/js/` handle purely presentational behavior (nav toggle, tab switching, form confirmation dialogs, dynamic table filtering). There is no API client — all interactions are form submissions or fetch calls to the same Express server.

### Backend Architecture
Single Express application with:
- Route layer (`backend/routes/main.js`) — maps URLs to middleware chains + controller functions
- Controller layer (`backend/controllers/*.js`) — handles HTTP request/response, calls utils, renders EJS
- Utility/service layer (`backend/utils/*.js`) — pure business logic, database queries, data transformations
- Model layer (`backend/models/*.js`) — Mongoose schemas, indexes, hooks, methods

### Request Lifecycle

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Express Middleware Stack
    participant R as Router (main.js)
    participant M as Auth Middleware
    participant C as Controller
    participant U as Utils/Services
    participant DB as MongoDB

    B->>E: HTTP Request
    E->>E: Helmet (security headers)
    E->>E: Body parser, cookie parser
    E->>E: Session (connect-mongo)
    E->>E: Passport.authenticate('session')
    E->>E: CSRF check
    E->>R: Route match
    R->>M: ensureAuth → requireTenant → requireRole
    M->>C: next() if authorized
    C->>U: Call service/utility
    U->>DB: Mongoose query (always includes schoolId)
    DB-->>U: Documents
    U-->>C: View model
    C-->>B: res.render(template, viewModel)
```

### Auth Flow

```mermaid
flowchart TD
    A[Browser: POST /login] --> B{Passport LocalStrategy}
    B --> C{School scoped?}
    C -- yes --> D[Find user by email/username in that school]
    C -- no --> E[Super-admin? Try platform-wide lookup]
    E -- found --> F[Super-admin login]
    D --> G{Password match?}
    G -- yes --> H{mustChangePassword?}
    H -- yes --> I[Redirect to /force-password-change]
    H -- no --> J[Redirect to role home]
    G -- no --> K[Flash error, redirect /login]
```

### Role Hierarchy

```mermaid
graph TD
    SA[superAdmin - Platform Level]
    SA --> AD[admin - School Level]
    AD --> TE[teacher - Class Level]
    TE --> ST[student - Individual]
    AD --> PA[parent - Read-only child view]
```

### Tenant Isolation Strategy

Every document in every collection (except `School` itself) carries a `schoolId` field. All queries go through tenant-scoping primitives in `backend/utils/tenant.js`:

```mermaid
flowchart LR
    REQ[req.user.schoolId] --> RTE[requireTenant middleware]
    RTE --> SCHID[req.schoolId]
    SCHID --> SQ[scopedQuery - adds schoolId + isDeleted filter]
    SQ --> MQ[Mongoose query]
    MQ --> DB[(MongoDB)]
```

### Caching
The admin analytics dashboard uses an in-process `Map`-based cache with a configurable TTL (default 30 seconds). Cache key is the `schoolId` string. Invalidated by cache expiry or `?refresh=1` query parameter. No distributed cache — each server process has its own cache.

### Background Jobs
One scheduled background job: `startMissionDeadlineSweepScheduler()` runs every 5 minutes (first run: 15 seconds after boot). It scans all missions with a `dueDate` and auto-fails student attempts that are past the grace window (30 minutes after deadline) and are still in `active` status.

---

## 6. User Roles and Permissions

### Role Enum
`["superAdmin", "admin", "teacher", "parent", "student"]`

### superAdmin
- **Scope:** Platform-wide (no `schoolId`)
- **Dashboard:** `/platform/home`
- **Permissions:** Create school tenants, create owner accounts, view all provisioned schools, generate invite links
- **Restrictions:** Cannot access any school-specific routes (`/admin`, `/teacher`, `/student`, `/parent`)
- **Security:** Identified by `role === "superAdmin"` AND `schoolId === null`

### admin
- **Scope:** Single school (tenant-bound by `schoolId`)
- **Dashboard:** `/admin/home`
- **Permissions:**
  - Create/update/soft-delete/restore students, teachers, parents
  - Manage classes (create, update, delete)
  - View/manage attendance for all classes
  - View/manage all grades
  - Create/publish/archive announcements
  - View/manage finance module (entries, categories, bank sync)
  - Generate and download PDF reports (student + class)
  - Manage school settings
  - Assign parents to students, assign students to classes
  - Update user avatars
- **Restrictions:** Cannot create new school tenants (blocked at route level — returns 403)

### teacher
- **Scope:** School-bound + class-bound (sees only their classes)
- **Dashboard:** `/teacher/home`
- **Permissions:**
  - View/grade students in their assigned classes
  - Record attendance for their classes
  - Create/manage missions (assigned to their classes or specific students)
  - View teacher library resources
  - Customize their class gradebook (subjects, categories, grading scales)
  - View student progress directory
  - Manually adjust student XP/points (with reason)
  - Override student rank (with reason)
  - Reopen failed mission attempts for students
- **Restrictions:** Cannot see students outside their assigned classes; cannot access admin routes

### student
- **Scope:** School-bound + individual
- **Dashboard:** `/student/home`
- **Permissions:**
  - View their own grades
  - View and begin/complete missions assigned to them or their class
  - View library resources
  - View their XP, rank, and progress
- **Restrictions:** Cannot see other students' data; cannot create any content

### parent
- **Scope:** School-bound + child-bound
- **Dashboard:** `/parent/home`
- **Permissions:**
  - View dashboard with all linked children
  - View individual child progress (grades, attendance, missions, rank)
  - Download child PDF reports
- **Restrictions:** Can only see data for children explicitly linked to their account; cannot see other students

---

## 7. Authentication System

### Login Flow
1. `GET /login` — renders `login.ejs` (redirects to role home if already authenticated)
2. `POST /login` — rate-limited (10/15min per IP), requires `password` field
3. Passport LocalStrategy (`backend/config/passport.js`):
   - Identifier resolution: accepts email or username in the `identifier` field
   - Optional school scoping: form optionally includes `schoolName` or `schoolId`
   - Super-admin resolution: if no school given, tries platform-wide lookup with `role: "superAdmin"`
   - For school-scoped users: normalizes identifier, finds by `emailNormalized` or `userNameNormalized` + `schoolId`
   - Calls `user.comparePassword(password)` (bcrypt compare)
   - Returns user to Passport session
4. Session serialized as `{ id: user._id, schoolId: user.schoolId }`
5. On deserialization: `User.findOne({ _id: id, schoolId })` to restore user
6. Post-login: redirect to `getRoleHome(role)`:
   - `superAdmin` → `/platform/home`
   - `admin` → `/admin/home`
   - `teacher` → `/teacher/home`
   - `parent` → `/parent/home`
   - `student` → `/student/home`

### Password Reset Flow
1. `GET /forgot-password` → form
2. `POST /forgot-password` — rate-limited (5/15min), validates email
3. Finds all active users with that email (across all roles/schools)
4. For each user: generates `crypto.randomBytes(32).toString('hex')` → stores SHA-256 hash + 1-hour expiry
5. Sends email with reset links (one per matching account)
6. `GET /reset-password/:token` → validates token (not expired, hash matches)
7. `POST /reset-password/:token` — requires `new-password` + `confirm-password`, min 8 chars
8. On success: clears token fields, sets new password (pre-save hook hashes it)

### Forced Password Change (First Login)
- Triggered by `mustChangePassword || isFirstLogin || temporaryPasswordIssued` flags
- `enforcePasswordChange` middleware intercepts all routes except `/force-password-change` and `/logout`
- `GET /force-password-change` — renders form
- `PUT /force-password-change` — clears all three flags, sets `passwordChangedAt`
- Only applies to roles: `teacher`, `parent`, `student` (admins excluded)

### Session Configuration
```js
{
  secret: SESSION_SECRET,      // From env
  resave: false,
  saveUninitialized: false,
  store: MongoStore (sessions collection),
  cookie: {
    maxAge: 7 days,
    httpOnly: true,
    secure: true (production only),
    sameSite: 'lax'
  }
}
```

### Password Hashing
- Algorithm: bcrypt with 10 salt rounds
- Applied in `UserSchema.pre("save")` — only when password field is modified
- `user.comparePassword(candidate)` → `bcrypt.compare(candidate, hash)`

### Security Weaknesses (Auth)
- No account lockout after failed login attempts (only IP-based rate limiting)
- No MFA/2FA support
- Session secret auto-generated (ephemeral) in development — sessions invalidated on restart
- SMTP not always configured — reset links may only appear in server logs in development

---

## 8. Multi-Tenancy and schoolId Isolation

### How schoolId is Stored
Every document in every tenant-scoped collection has:
```js
schoolId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "School",
  required: true,   // (for non-superAdmin users)
  index: true
}
```

Collections with `schoolId`: `User`, `Class`, `Missions`, `Grades`, `Attendance`, `Announcement`, `Post`, `AuditLog`, `FinanceEntry`, `FinanceCategory`, `FinanceBankAccount`, `FinanceBankConnection`, `FinanceBankTransaction`, `FinanceSyncLog`, `ParentPayment`, `PointAdjustment`, `ReportActivity`

### How schoolId is Assigned
- **School:** Created by super-admin via `POST /platform/schools`. Gets its own `_id` = `schoolId` for tenants.
- **Owner user:** Created at provisioning time with `schoolId = school._id`, `role = "admin"`, `isSchoolOwner = true`
- **Admin-created users:** Admin creates students/teachers/parents via `POST /admin/students|teachers|parents/add`. `schoolId` injected via `scopedInsertData(req, payload)`.
- **Super-admin:** `schoolId = null` always.

### Query Scoping Strategy
All tenant-scoped queries use primitives from `backend/utils/tenant.js`:

```js
// Always include schoolId + active lifecycle filter
scopedQuery(req, extra)
// { schoolId: req.schoolId, isDeleted: { $ne: true }, deletedAt: null, ...extra }

// For single-document lookups by _id
scopedIdQuery(req, id, extra)
// { _id: id, schoolId: req.schoolId, ...activeFilter, ...extra }

// For new document creation
scopedInsertData(req, payload)
// { ...payload, schoolId: req.schoolId }
```

`assertTenantContext(req)` throws `TENANT_SCOPE_REQUIRED` error if `schoolId` is missing — prevents accidental cross-tenant data access.

### Middleware Enforcement
```
requireTenant middleware:
  if (!req.user.schoolId) → 401 Unauthorized
  req.schoolId = req.user.schoolId
  next()
```

Applied via `router.use("/admin", ensureAuth, requireTenant, requireRole("admin"))` — all admin/teacher/student/parent route groups.

### Compound Indexes
All critical query patterns use compound indexes starting with `schoolId`:
```js
{ schoolId: 1, role: 1, deletedAt: 1, createdAt: -1 }      // User list queries
{ schoolId: 1, "students._id": 1 }                           // Grade lookups
{ schoolId: 1, classId: 1, date: 1 }                         // Attendance
{ schoolId: 1, "createdBy._id": 1 }                          // Mission creator
{ schoolId: 1, "active.studentInfo._id": 1 }                 // Active missions
```

### Partial Unique Indexes (Active-only uniqueness)
Unique constraints apply only to non-deleted users within a school:
```js
// Username unique per school (active users only)
{ schoolId: 1, userNameNormalized: 1 }
partialFilterExpression: { deletedAt: null, userNameNormalized: { $type: "string", $gt: "" } }

// Email unique per school (active users only)
{ schoolId: 1, emailNormalized: 1 }
partialFilterExpression: { deletedAt: null, emailNormalized: { $type: "string", $gt: "" } }
```

### Cross-Tenant Risks
1. **Mission deadline sweep:** `performMissionDeadlineSweep` intentionally runs without `schoolId` filter by default (scans all schools). This is by design — documented with comment — but creates an unscoped query. The `// tenant-query-guard:ignore` annotation exempts it from the linting script.
2. **Super-admin routes:** `/platform/*` routes query `School` and `User` collections without `schoolId` filter — correct for platform-level operations but must never be accessible to non-super-admins.
3. **Admin analytics cache:** Cache key is `schoolId` string. Cache is an in-process Map — correct for single-process deployments but would leak cross-tenant if multiple schools share a process (not currently possible with current key strategy).

### Vulnerable Areas
- No explicit cross-tenant test for the `ReportActivity` model
- `Post` collection (`/feed`) queries are school-scoped but the posts route has minimal role checks

---

## 9. Database Models and Schemas

### User (collection: `users`)
**File:** `backend/models/User.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId → School | Required for all except superAdmin |
| `userName` | String | Required, trimmed |
| `userNameNormalized` | String | Slug-safe lowercase, auto-set pre-validate |
| `email` | String | Required, lowercase |
| `emailNormalized` | String | Auto-set pre-validate |
| `password` | String | Required, bcrypt-hashed, `select: false` |
| `role` | Enum | `superAdmin/admin/teacher/parent/student` |
| `isSchoolOwner` | Boolean | Owner of the school tenant |
| `firstName`, `lastName` | String | Display name |
| `DOB` | Date | Date of birth |
| `gender` | Enum | `male/female/other` |
| `profileImage` | String | Cloudinary URL |
| `profileImageCloudinaryId` | String | For deletion |
| `studentInfo.enrollmentDate` | Date | |
| `studentInfo.gradeLevel` | Enum | `Prep 1, Prep 2, Grade 1-5` |
| `studentInfo.programType` | Enum | `Tahfiidth / Khatm` |
| `studentInfo.classId` | ObjectId → Class | Primary class assignment |
| `studentInfo.studentNumber` | Number | Unique per school |
| `studentInfo.parents` | `[StudentParentLinkSchema]` | Linked parent accounts |
| `teacherInfo.employeeId` | String | Unique per school |
| `teacherInfo.classes` | `[ObjectId]` | Assigned classes |
| `teacherInfo.subjects` | `[String]` | Teaching subjects |
| `parentInfo.children` | `[ParentChildLinkSchema]` | Linked children |
| `parentInfo.billingProfile` | Object | Monthly tuition, billing day, currency |
| `xp` | Number | Experience points (gamification) |
| `points` | Number | Alias for xp (kept in sync) |
| `rank` | Enum | `F/E/D/C/B/A/S` (auto-calculated) |
| `manualRank` | Enum | Override rank set by teacher |
| `rankOverrideEnabled` | Boolean | Is manual rank active? |
| `rankOverrideReason` | String | Why the override was set |
| `rankOverrideSetBy` | ObjectId → User | Teacher who set override |
| `rankOverrideSetAt` | Date | |
| `mustChangePassword` | Boolean | Force change on login |
| `isFirstLogin` | Boolean | First login flag |
| `temporaryPasswordIssued` | Boolean | Admin-issued temp password |
| `passwordChangedAt` | Date | Last password change timestamp |
| `ownerInviteTokenHash` | String | SHA-256 hash of invite token, `select: false` |
| `ownerInviteExpiresAt` | Date | 48-hour TTL |
| `ownerInviteSentAt` | Date | When invite was generated |
| `ownerOnboardingCompletedAt` | Date | When owner completed setup |
| `resetPasswordTokenHash` | String | SHA-256, `select: false` |
| `resetPasswordExpiresAt` | Date | 1-hour TTL |
| `isDeleted` | Boolean | Soft delete flag |
| `deletedAt` | Date | Soft delete timestamp |
| `deletedBy` | ObjectId → User | Who deleted the user |
| `deletedReason` | String | Why deleted |
| `restoredAt` | Date | If restored |
| `restoredBy` | ObjectId → User | Who restored |

**Pre-validate hook:** Normalizes `userName`, `email`, `employeeId`, `studentNumber`; clamps `xp`/`points` to non-negative integer for students.

**Pre-save hook:** Hashes `password` with bcrypt (10 rounds) when modified.

**Key indexes:**
- 6 partial unique indexes (see Section 8)
- Compound: `{ schoolId, role, deletedAt, createdAt }`
- Compound: `{ schoolId, "studentInfo.classId", role, deletedAt }`
- Compound: `{ schoolId, "parentInfo.children.childID", role, deletedAt }`

---

### School (collection: `schools`)
**File:** `backend/models/School.js`

| Field | Type | Notes |
|---|---|---|
| `schoolName` | String | Required |
| `schoolNameNormalized` | String | Lowercase, unique |
| `schoolEmail` | String | Required, unique, email validation |
| `password` | String | Hashed, `select: false` |
| `adminUser` | String | Display name for the admin |
| `address` | String | |
| `contactEmail` | String | |
| `contactPhone` | String | |
| `establishedDate` | Date | |
| `ownerUserId` | ObjectId → User | Primary owner account |
| `provisionedByUserId` | ObjectId → User | Super-admin who created it |
| `provisionedAt` | Date | Provisioning timestamp |

**Unique index:** `schoolNameNormalized` (partial, non-empty strings only)

---

### Class (collection: `classes`)
**File:** `backend/models/Class.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required, indexed |
| `className` | String | Required |
| `classCode` | String | Short identifier, unique per school |
| `teachers` | Array | `{ _id, name }` snapshots |
| `subjects` | Array | `{ name, gradeLevel }` |
| `students` | Array | `{ _id, name }` snapshots |
| `schedule` | Array | `{ day, startTime, endTime }` |
| `academicYear` | Object | `{ year, semester, quarter }` |
| `active` | Boolean | |
| `location`, `roomNumber`, `capacity` | String/Number | |
| `teacherSettings` | `[TeacherClassSettingsSchema]` | Per-teacher customization |
| `deletedAt`, `deletedBy` | Date/ObjectId | Soft delete |

**TeacherClassSettingsSchema** (embedded per teacher):
- `teacherId`, `teacherName`
- `dashboardLayout` — layout preset key
- `dashboardSections` — `[{ key, label, visible, order }]`
- `subjectConfig` — `[{ key, label, active, order, isArchived }]`
- `gradingCategories` — `[{ key, label, weight, active, isDefault }]`
- `gradingScales` — `{ memorization: {...}, subac: {...} }` (symbolic grading)
- `configVersions` — history of config snapshots for grade data integrity
- `lastCustomizedBy`, `lastCustomizedAt`, `customizationNote`

---

### Mission (collection: `missions`)
**File:** `backend/models/Missions.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required, indexed |
| `title` | String | Required |
| `description` | String | Required |
| `type` | Enum | `Ilm / Adab & Akhlaq / Ihsaan / Taqwa / Amanah` |
| `category` | Enum | `Solo / Team` |
| `rank` | Enum | `F / E / D / C / B / A / S` |
| `pointsXP` | Number | XP reward on completion (default: 10) |
| `timeLimit` | Enum | `Daily / Weekly / Timed / None` |
| `dueDate` | Date | Optional deadline |
| `assignedTo.classInfo` | `[ObjectId]` | Assigned classes |
| `assignedTo.studentInfo` | `[ObjectId]` | Assigned individual students |
| `createdBy` | Object | `{ name, employeeId, _id }` |
| `active.status` | Boolean | Is mission active? |
| `active.studentInfo` | `[MissionActiveStudentSchema]` | Per-student attempt tracking |

**MissionActiveStudentSchema** (per student attempt):
- `_id` — student ObjectId
- `name` — student name snapshot
- `attempt` — attempt number
- `status` — freeform string (normalized by `normalizeMissionAttemptStatusKey`)
- `startedAt`, `completedAt`, `failedAt`, `failureReason`, `failureType`
- `graceWindowMinutes` — grace window applied at time of auto-fail
- `reopenedAt`, `reopenedBy`, `reopenReason`

**Indexes:**
```js
{ schoolId: 1, "createdBy._id": 1 }
{ schoolId: 1, "assignedTo.classInfo": 1, createdAt: -1 }
{ schoolId: 1, "assignedTo.studentInfo": 1, createdAt: -1 }
{ schoolId: 1, "active.studentInfo._id": 1 }
{ schoolId: 1, createdAt: -1 }
```

---

### Grades (collection: `grades`)
**File:** `backend/models/Grades.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required |
| `students` | Array | `[{ _id, name }]` |
| `classInfo` | Array | `[{ _id, name }]` |
| `quarter` | Enum | `Q1/Q2/Q3/Q4` |
| `subject` | String | Legacy subject name |
| `subjectKey` | String | Normalized subject key |
| `subjectLabel` | String | Display label |
| `gradingConfigVersion` | Number | Config version at time of entry |
| `Assignment.name` | String | Required |
| `Assignment.grade` | Number | Required (numeric score) |
| `Assignment.maxScore` | Number | Default: 100 |
| `Assignment.type` | String | Assignment type |
| `Assignment.categoryKey` | String | Grading category key |
| `Assignment.categoryLabel` | String | Display category label |
| `Assignment.categoryWeight` | Number | Category weight at time of entry |
| `feedback.content` | String | Teacher feedback text |
| `feedback.teacher` | Object | `{ _id, name }` |
| `gradingContext` | `GradeContextSchema` | Teacher + config snapshot |
| `symbolicMark` | `SymbolicMarkSchema` | For memorization/subac system |
| `sheetContext` | `GradeSheetContextSchema` | Gradebook mode + date context |
| `active` | Boolean | Default: true |

---

### Attendance (collection: `attendances`)
**File:** `backend/models/Attendance.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required |
| `classId` | ObjectId → Class | Required |
| `className` | String | Denormalized name |
| `date` | Date | Required |
| `records` | Array | Per-student records |
| `records[].studentId` | ObjectId → User | Required |
| `records[].studentName` | String | Required |
| `records[].status` | Enum | `Present/Absent/Late/Excused/Holiday/Weather` |
| `recordedBy` | Object | `{ _id, name }` |

**Indexes:**
```js
{ schoolId: 1, classId: 1, date: 1 }    // Primary lookup
{ schoolId: 1, date: -1 }               // Recent attendance
{ schoolId: 1, "records.studentId": 1, date: -1 }  // Per-student history
```

---

### Announcement (collection: `announcements`)
**File:** `backend/models/Announcement.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required |
| `title`, `content`, `summary` | String | |
| `announcementType` | Enum | `announcement / library_resource` |
| `imageUrl`, `imageCloudinaryId` | String | Optional image |
| `externalUrl` | String | External link for library resources |
| `visibilityMode` | Enum | `global / scoped` |
| `targetRoles` | `[String]` | Scoped visibility |
| `targetClassIds`, `targetStudentIds`, `targetParentIds`, `targetTeacherIds` | `[ObjectId]` | Fine-grained targeting |
| `priority` | Enum | `info / warning / urgent` |
| `isPinned`, `isPublished` | Boolean | |
| `status` | Enum | `draft / published / archived` |
| `publishAt`, `publishedAt`, `expiresAt`, `archivedAt` | Date | |
| `createdBy`, `updatedBy` | `ActorSnapshotSchema` | |

---

### PointAdjustment (collection: `pointadjustments`)
**File:** `backend/models/PointAdjustment.js`

Records every manual XP/points change by a teacher:
- `schoolId`, `studentId`, `teacherId`, `classId` — all required/indexed
- `amount` — XP amount changed (min 1)
- `direction` — `add` or `subtract`
- `beforePoints`, `afterPoints`, `beforeXp`, `afterXp` — snapshot before/after
- `beforeRank`, `afterRank` — rank snapshot
- `reason` — required, max 300 chars

---

### AuditLog (collection: `auditlogs`)
**File:** `backend/models/AuditLog.js`

- `schoolId`, `actorId` — required, indexed
- `action` — event type string (e.g., `"authorization_denied"`)
- `targetType`, `targetId` — what was acted on
- `before`, `after`, `diff` — Mixed type — full change snapshot
- `ip`, `userAgent` — request context

---

### ParentPayment (collection: `parentpayments`)
**File:** `backend/models/ParentPayment.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId`, `parentId` | ObjectId | Required, indexed |
| `studentId`, `classId` | ObjectId | Optional |
| `title` | String | Default: `"Tuition Payment"` |
| `category` | Enum | `Tuition/Registration/Materials/Meal/Transport/Other` |
| `expectedAmount`, `paidAmount` | Number | |
| `currency` | String | Default: `USD` |
| `dueDate` | Date | Required |
| `paidAt` | Date | |
| `status` | Enum | `Due/Partial/Paid/Overdue/PendingProcessor` |
| `method`, `processor` | String | Payment method |
| `bankTransactionId` | ObjectId → FinanceBankTransaction | |
| `attempts` | `[PaymentAttemptSchema]` | Payment attempt history |

---

### FinanceEntry (collection: `financeentries`)
**File:** `backend/models/FinanceEntry.js`

| Field | Type | Notes |
|---|---|---|
| `schoolId` | ObjectId | Required |
| `entryType` | Enum | `income / expense` |
| `categoryKey`, `categoryLabel` | String | Required |
| `amount` | Number | Required, min 0 |
| `currency` | String | Default: `USD` |
| `occurredAt` | Date | Required, indexed |
| `source` | Enum | `manual/bank_sync/payment_processor/imported/system` |
| `status` | Enum | `posted/pending/void` |
| `vendorOrPayer`, `reference`, `memo` | String | |
| `linkedParentId`, `linkedStudentId`, `linkedClassId` | ObjectId | Optional links |
| `linkedParentPaymentId` | ObjectId → ParentPayment | |
| `bankTransactionId` | ObjectId → FinanceBankTransaction | |
| `createdBy`, `updatedBy` | `ActorSnapshotSchema` | |
| `deletedAt` | Date | Soft delete |

---

### Other Models

**FinanceCategory** — School-scoped income/expense/payment categories with `key`, `label`, `entryType`. Unique index on `(schoolId, entryType, key)`.

**FinanceBankAccount** — Plaid-linked bank accounts per school. Stores encrypted access tokens.

**FinanceBankConnection** — Plaid Link connection metadata (public token → access token exchange).

**FinanceBankTransaction** — Raw transactions imported from Plaid. Fields: `amount`, `date`, `merchantName`, `plaidTransactionId`, `category`, `pending`, `reconciled`.

**FinanceSyncLog** — History of bank sync operations: `schoolId`, `bankAccountId`, `syncedAt`, `addedCount`, `updatedCount`, `errors`.

**Reflections** — Quran/Hadith reflection entries (seeded data). Fields: `type`, `arabic`, `translation`, `reference`, `narrator`, `hadithNumber`, `tags`. Unique on `(type, reference)`.

**Verses** — Quranic verses (seeded). Used in student/teacher library views.

**Post** — Social feed posts. Fields: `schoolId`, `title`, `image`, `cloudinaryId`, `caption`, `likes`, `user`, `createdAt`.

**ReportActivity** — Tracks PDF generation jobs: `schoolId`, `reportType`, `targetId`, `status`, `filePath`, `generatedAt`, `requestedBy`.

---

## 10. Routes, Pages, and Navigation

### Public Routes (no auth)

| Method | Path | File | Purpose |
|---|---|---|---|
| GET | `/` | `controllers/home.js:getIndex` | Landing page (`index.ejs`) |
| GET | `/login` | `controllers/auth.js:getLogin` | Login form |
| GET | `/signup` | `controllers/auth.js:getSignup` | Returns 404 (disabled) |
| GET | `/logout` | `controllers/auth.js:logout` | Destroys session, redirects `/login` |
| GET | `/forgot-password` | `controllers/auth.js:getForgotPassword` | Password recovery form |

### Auth Routes

| Method | Path | Middleware | Purpose |
|---|---|---|---|
| POST | `/login` | `loginLimiter`, `requireFields(["password"])` | Authenticate user |
| POST | `/signup` | `signupLimiter` | Returns 403 (blocked) |
| POST | `/forgot-password` | `recoveryLimiter`, `requireFields`, `validateEmail` | Trigger reset email |
| GET | `/reset-password/:token` | — | Token-gated reset form |
| POST | `/reset-password/:token` | `resetLimiter`, `requireFields` | Set new password |
| GET | `/owner-onboarding/:token` | — | Owner account setup form |
| POST | `/owner-onboarding/:token` | `resetLimiter`, `requireFields` | Finalize owner account |
| GET | `/reset-password` | `ensureAuth, requireTenant, requireRole, enforcePasswordChange` | Voluntary reset form |
| PUT | `/reset-password` | (same + resetLimiter) | Voluntary reset submit |
| GET | `/force-password-change` | `ensureAuth, requireTenant, requireRole(teacher/parent/student), requirePendingPasswordChange` | Forced change form |
| PUT | `/force-password-change` | (same + resetLimiter) | Forced change submit |

### Platform Routes (superAdmin only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/platform/home` | Provisioning dashboard |
| POST | `/platform/schools` | Create new school + owner |

### Global Authenticated Routes (all roles)

| Method | Path | Purpose |
|---|---|---|
| GET | `/profile` | User profile view |
| POST | `/profile/update` | Update profile info |
| POST | `/profile/avatar` | Upload profile avatar (admin only) |
| POST | `/profile/avatar/remove` | Remove avatar (admin only) |
| GET | `/feed` | Social feed |

### Admin Routes (`/admin`, role: `admin`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/home` | Admin dashboard |
| GET | `/admin/users` | User directory |
| GET | `/admin/users/deleted` | Soft-deleted users |
| GET | `/admin/classes` | Class management |
| GET | `/admin/attendance` | Attendance overview |
| GET | `/admin/announcements` | Announcement manager |
| GET | `/admin/reports` | Report generation |
| GET | `/admin/settings` | School settings |
| GET | `/admin/finance` | Finance dashboard |
| GET | `/admin/finance/summary` | Finance summary API |
| GET | `/admin/reports/stats` | Report stats API |
| GET | `/admin/reports/student/:id/pdf` | Download student PDF |
| GET | `/admin/reports/class/:id/pdf` | Download class PDF |
| POST | `/admin/students/add` | Create student |
| POST | `/admin/teachers/add` | Create teacher |
| POST | `/admin/parents/add` | Create parent |
| POST | `/admin/classes/add` | Create class |
| POST | `/admin/school` | **Blocked** — returns 403 |
| POST | `/admin/reports/student/:id/generate` | Async PDF generation |
| POST | `/admin/reports/class/:id/generate` | Async PDF generation |
| POST | `/admin/announcements` | Create announcement |
| POST | `/admin/announcements/:id/update` | Update announcement |
| POST | `/admin/announcements/:id/publish` | Toggle publish |
| POST | `/admin/announcements/:id/pin` | Toggle pin |
| POST | `/admin/announcements/:id/archive` | Archive |
| POST | `/admin/finance/categories` | Create finance category |
| POST | `/admin/finance/entries` | Create finance entry |
| POST | `/admin/finance/bank/link-token` | Plaid Link token |
| POST | `/admin/finance/bank/connect` | Connect bank account |
| POST | `/admin/finance/bank/sync` | Sync bank transactions |
| POST | `/admin/finance/reconcile` | Reconcile bank transaction |
| PUT | `/admin/assign/student-to-parent` | Link parent ↔ student |
| PUT | `/admin/assign/student-to-class` | Assign student to class |
| PATCH | `/admin/users/:id` | Update user fields |
| PUT | `/admin/users/:id` | Update user fields |
| POST | `/admin/users/:id/avatar` | Upload user avatar |
| POST | `/admin/users/:id/avatar/remove` | Remove user avatar |
| PUT | `/admin/parents/:id/children` | Update parent children links |
| PATCH | `/admin/classes/:id` | Update class |
| POST | `/admin/classes/:id/customize` | Update teacher class config |
| POST | `/admin/finance/entries/:id/archive` | Archive finance entry |
| DELETE | `/admin/users/:id` | Soft delete user |
| DELETE | `/admin/users/:id/permanent` | Permanent delete |
| DELETE | `/admin/classes/delete/:id` | Soft delete class |
| PATCH | `/admin/users/:id/restore` | Restore soft-deleted user |
| PATCH | `/admin/classes/:id/restore` | Restore soft-deleted class |

### Teacher Routes (`/teacher`, role: `teacher`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/teacher/home` | Teacher dashboard |
| GET | `/teacher/manage-grades` | Gradebook |
| GET | `/teacher/student-progress` | Student directory with progress |
| GET | `/teacher/manage-missions` | Mission manager |
| GET | `/teacher/manage-attendance` | Attendance recorder |
| GET | `/teacher/customize` | Class customization settings |
| GET | `/teacher/students/:id/progress` | Individual student progress |
| GET | `/teacher/library` | Library resources |
| GET | `/api/teacher/students/:studentId/points-adjustments` | Get student XP history |
| POST | `/teacher/manage-missions/create-mission` | Create mission |
| POST | `/teacher/manage-attendance/save` | Record attendance |
| POST | `/teacher/customize/:id` | Save class customization |
| POST | `/teacher/students/:id/rank` | Set student rank override |
| POST | `/teacher/students/:studentId/missions/:missionId/reopen` | Reopen mission for student |
| POST | `/teacher/library` | Upload library resource |
| POST | `/teacher/manage-grades/add` | Add grade entry |
| POST | `/teacher/grades/add` | Add grade (legacy path) |
| POST | `/api/teacher/students/:studentId/points-adjustments` | Adjust student XP |
| POST | `/api/teacher/gradebook/cell` | Upsert gradebook cell |

### Student Routes (`/student`, role: `student`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/student/home` | Student dashboard |
| GET | `/student/grades` | Student grade view |
| GET | `/student/missions` | Mission list |
| GET | `/student/library` | Library resources |
| PUT | `/student/missions/begin` | Begin a mission |
| PUT | `/student/missions/complete` | Complete a mission |

### Parent Routes (`/parent`, role: `parent`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/parent/home` | Parent dashboard (all children) |
| GET | `/parent/child/:id` | Individual child dashboard |
| GET | `/parent/reports/:studentId/download` | Download child's PDF report |

---

## 11. APIs / Server Actions

> IlmQuest uses server-rendered pages (EJS) rather than a JSON API. Most "APIs" are form submissions returning HTML redirects. Some endpoints return JSON for async operations.

### JSON-returning endpoints

**`GET /admin/finance/summary`**
- Auth: admin
- Response: Finance summary object (totals by category, period)
- schoolId enforced via `req.schoolId`

**`GET /admin/reports/stats`**
- Auth: admin
- Response: Report generation statistics
- Cached per school

**`POST /admin/reports/student/:id/generate`**
- Auth: admin
- Rate-limited: 40/10min per school:user
- Async PDF compilation via pdflatex
- Response: `{ status, jobId }` or error

**`POST /api/teacher/gradebook/cell`**
- Auth: teacher
- Body: `{ classId, studentId, subject, quarter, markKey, systemKey, ... }`
- Upserts a single gradebook cell
- Response: JSON `{ success, grade }`

**`GET /api/teacher/students/:studentId/points-adjustments`**
- Auth: teacher
- Returns: `[PointAdjustment]` for that student
- Enforces teacher's class boundary

**`POST /api/teacher/students/:studentId/points-adjustments`**
- Auth: teacher
- Body: `{ amount, direction, reason }`
- Creates PointAdjustment, updates student xp+points
- Response: JSON `{ success, newXp, newRank }`

### Form-submission endpoints (return HTML redirect)

All CRUD endpoints for users, classes, missions, grades, attendance, finance, announcements follow the POST-redirect-GET pattern. On success: `res.redirect(referrer or target)` with flash success. On error: `res.redirect(back)` with flash error.

### Security enforcement per endpoint

| Concern | Implementation |
|---|---|
| Authentication | `ensureAuth` middleware |
| Tenant isolation | `requireTenant` sets `req.schoolId`; all queries use `scopedQuery` |
| Role authorization | `requireRole(...roles)` middleware |
| CSRF | `csurf` middleware on all mutation routes |
| Rate limiting | Named limiters per route group |
| ObjectId validation | `validateObjectIdParam("id")` middleware |
| Field validation | `requireFields([...])` middleware |
| NoSQL injection | `rejectMongoOperators` middleware (blocks `$` and `.` in keys) |
| File upload | `multer` limits 5MB, accepts only jpg/png |

---

## 12. Services and Business Logic

### tenant.js — Multi-Tenant Scoping Primitives
**File:** `backend/utils/tenant.js`

The single most critical service. All database access flows through these functions.

| Function | Purpose |
|---|---|
| `resolveSchoolId(reqOrSchoolId)` | Extracts schoolId string from request or raw value |
| `assertTenantContext(reqOrSchoolId, label)` | Throws `TENANT_SCOPE_REQUIRED` if schoolId missing |
| `activeLifecycleFilter()` | Returns `{ isDeleted: { $ne: true }, deletedAt: null }` |
| `deletedLifecycleFilter()` | Returns `{ isDeleted: true, deletedAt: { $ne: null } }` |
| `scopedQuery(req, extra)` | Builds query with schoolId + active lifecycle filter |
| `scopedIdQuery(req, id, extra)` | Single-document lookup with schoolId + active filter |
| `scopedInsertData(req, payload)` | Adds schoolId to insert payload |

Usage pattern:
```js
const users = await User.find(scopedQuery(req, { role: "student" }));
const classDoc = await Class.findOne(scopedIdQuery(req, classId));
const newMission = await Mission.create(scopedInsertData(req, { title, ... }));
```

### ranks.js — XP and Rank Engine
**File:** `backend/utils/ranks.js`

| Function | Purpose |
|---|---|
| `getAutoRankForXp(xp)` | Returns rank object for given XP value |
| `buildRankSummaryFromUser(student)` | Full rank summary: XP, displayRank, progress %, next rank |
| `canStudentAccessMissionRank(studentRank, missionRank)` | Default: strict match; `at_or_above` mode available |
| `getNextRank(rankKey)` | Returns next rank in ladder |
| `resolveStudentXp(student)` | Reads `xp` field, falls back to `points` |

**Rank thresholds:**
```
F:          0 XP
E:         10 XP
D:        100 XP
C:      1,000 XP
B:     10,000 XP
A:    100,000 XP
S:  1,000,000 XP (max)
```

Manual override: if `rankOverrideEnabled && manualRank`, `displayRank = manualRank`; auto-rank still calculated separately.

### missionDeadlines.js — Auto-Fail Background Sweep
**File:** `backend/utils/missionDeadlines.js`

Runs every 5 minutes (first run: 15 seconds after boot):

1. Query all missions with `dueDate != null` and at least one student entry
2. For each active student attempt: check `now > dueDate + 30min grace`
3. If past deadline and attempt is still `active`: set `status = "auto_failed"`, `failedAt = now`, `failureType = "deadline_missed"`
4. Save modified missions

**Status key normalization** (`normalizeMissionAttemptStatusKey`):
`"auto_failed" | "failed" | "completed" | "pending" | "rejected" | "active" | "assigned"`

Handles raw variants: "in_progress", "approved", "submitted", "reopen", etc.

### studentProgress.js — Progress Viewmodel Builder
**File:** `backend/utils/studentProgress.js`

**`buildStudentProgressViewModel(req, studentId, options)`**:
- Loads student + classes + grades (limit 500) + attendance (limit 500) + missions (limit 500)
- Summarizes grades by subject and category, computes overall average
- Summarizes attendance: rate, monthly 6-month trend, recent 16 rows
- Summarizes missions: counts by status, completion rate, earned XP
- Builds recent activity timeline (interleaved: grades, attendance, missions)
- Calculates performance status:
  - "On Track": grade ≥ 85% AND attendance ≥ 90%
  - "Needs Attention": grade < 70% OR attendance < 80%
  - "In Progress": everything else
- Optional teacher insights (strengths, concerns, next steps)

**`buildTeacherStudentProgressDirectoryViewModel(req, teacherId)`**:
- Loads teacher's classes → students → grades (avg) + attendance (rate) + missions (stats) for each
- Groups by class; "Unassigned" group for students without a class
- Returns `{ classGroups, totalClasses, totalStudents }`

### gradingScales.js — Symbolic Grading System
**File:** `backend/utils/gradingScales.js`

**Memorization Scale** (`systemKey = "memorization"`, maxValue = 4):

| Symbol | Label | Value | Counts |
|---|---|---|---|
| ✓ | Perfect | 4.0 | Yes |
| ✓ W | Correct With Minor Weakness | 3.5 | Yes |
| I ✓ | Level 1 Mistake | 3.0 | Yes |
| II ✓ | Level 2 Mistake | 2.0 | Yes |
| III ✓ | Level 3 Mistake | 1.0 | Yes |
| X | Incorrect / Not Completed | 0 | Yes |
| X W | Incorrect With Weakness | 0.5 | Yes |

**Subac Scale** (`systemKey = "subac"`, maxValue = 4):

| Symbol | Label | Value | Counts |
|---|---|---|---|
| ✓ | Great | 4.0 | Yes |
| I | Decent | 3.0 | Yes |
| II | Average | 2.0 | Yes |
| III | Needs Work | 1.0 | Yes |
| IIII | Failed | 0 | Yes |
| E | Excused | 0 | No |
| C | Competition | 0 | No |
| PC | Pen Check | 0 | No |
| Blank | Empty | 0 | No |

Key functions: `buildDefaultGradingScaleSet()`, `normalizeGradingScaleSet(rawScaleSet)`, `buildSymbolicMarkSnapshot(scale, markKey)`, `getStoredScoreFromMarkSnapshot(snapshot)`.

### mailer.js — Email Service
**File:** `backend/utils/mailer.js`

- `isMailerConfigured()` — true only if SMTP_HOST or SMTP_SERVICE is set
- `sendPasswordResetEmail({ to, resetLinks, expiresAt })` — HTML + plain-text, one link per matched account
- Falls back to `console.log` in development if SMTP unconfigured
- **Only trigger:** password reset. Owner invite emails not implemented.

### ownerInvite.js — Invite Token System
**File:** `backend/utils/ownerInvite.js`

- Token: 32 random bytes → 64-char hex
- Storage: SHA-256 hash in `User.ownerInviteTokenHash`, `select: false`
- TTL: 48 hours
- Pattern: `/^[a-f0-9]{64}$/i`
- Single-use: hash cleared after successful onboarding
- Link: `${APP_BASE_URL}/owner-onboarding/${rawToken}`

### platformSuperAdmin.js — Bootstrap
**File:** `backend/utils/platformSuperAdmin.js`

Called on `mongoose.connection.once("open")`. Reads env vars, skips if super-admin already exists, creates `User` with `role: "superAdmin"`, `schoolId: null`.

### announcements.js — Visibility Filter
**File:** `backend/utils/announcements.js`

`getVisibleAnnouncementsForUser(schoolId, user)` filters to published, non-expired announcements by:
- `visibilityMode === "global"` → all users
- `visibilityMode === "scoped"` → checks targetRoles, targetClassIds, targetStudentIds, targetParentIds, targetTeacherIds

### latexReports.js — PDF Generation
**File:** `backend/utils/latexReports.js`

- `renderStudentReportLatex(viewModel)` — fills LaTeX template
- `compileLatexToPdf(latexString, outputPath)` — shells out to `pdflatex`
- Uses `backend/latex/albayaanreport.cls` — custom LaTeX class
- **Risk:** User data interpolated into LaTeX without special character escaping

---

## 13. Mission System Blueprint

### Mission Types (Islamic Classification)
- **Ilm** — Knowledge (Quran, Hadith, Islamic studies)
- **Adab & Akhlaq** — Character and manners
- **Ihsaan** — Excellence in worship and action
- **Taqwa** — Piety and God-consciousness
- **Amanah** — Trustworthiness and responsibility

### Mission Lifecycle

```mermaid
stateDiagram-v2
    [*] --> assigned: Teacher creates + assigns mission
    assigned --> active: Student clicks Begin (rank check passes)
    active --> pending: Student clicks Complete
    active --> auto_failed: Deadline + 30min grace window passed
    pending --> completed: Teacher approves (XP awarded)
    pending --> rejected: Teacher rejects
    rejected --> active: Teacher reopens with reason
    auto_failed --> active: Teacher reopens with reason
    completed --> [*]
```

### Rank Gate
By default (`accessMode: "exact"`): student rank must exactly match mission rank.
`canStudentAccessMissionRank(studentRank, missionRank)` enforces this.
`at_or_above` mode available but not used in default UI.

### Mission Creation
1. Teacher: `/teacher/manage-missions` → fill form (title, description, type, category, rank, XP, timeLimit, dueDate, assignedTo)
2. `POST /teacher/manage-missions/create-mission`
3. `requireFields(["missionTitle", "missionDescription", "type", "category", "rank"])`
4. Mission document created via `scopedInsertData`

### Mission Begin (Student)
1. `PUT /student/missions/begin` with `{ missionId }`
2. Validates: mission active, student assigned, rank match, no existing attempt
3. Adds to `mission.active.studentInfo`: `{ _id, name, attempt: 1, status: "active", startedAt }`

### Mission Complete (Student)
1. `PUT /student/missions/complete` with `{ missionId }`
2. Validates: attempt is `active`
3. Updates entry: `status = "pending"`, `completedAt = now`
4. Teacher reviews pending submission

### Mission Reopen (Teacher)
1. `POST /teacher/students/:studentId/missions/:missionId/reopen` with `{ reason }`
2. Clears `failedAt`, sets `reopenedAt`, `reopenedBy`, `reopenReason`
3. Student can attempt again

### Mission Visibility Rules
- Students see missions where their classId OR their userId appears in `assignedTo` AND rank matches
- Teachers see all missions in their school they created
- Admins see all school missions

### Key Files

| File | Role |
|---|---|
| `backend/models/Missions.js` | Schema |
| `backend/utils/missionDeadlines.js` | Auto-fail sweep |
| `backend/utils/ranks.js:canStudentAccessMissionRank` | Rank gate |
| `backend/controllers/posts.js` | Create/begin/complete/reopen |
| `backend/controllers/home.js:getTeacherMissions` | Teacher view data |
| `backend/controllers/home.js:getStudentMissions` | Student view data |
| `frontend/views/teacher/teacherMissions.ejs` | Teacher UI |
| `frontend/views/student/missions.ejs` | Student UI |

---

## 14. Leaderboard System Blueprint

> **No dedicated Leaderboard model exists.** The leaderboard is a derived view from `User.xp` sorted descending, scoped by `schoolId`.

### Individual Leaderboard
Query: `User.find(scopedQuery(req, { role: "student" })).sort({ xp: -1 })`
Display rank uses `buildRankSummaryFromUser` (respects manual override).

### Teacher Leaderboard View
Teachers see students from their classes only. Admins see all school students.

### What Is NOT Implemented
- Leaderboard cycles / period resets
- Team leaderboard (no team XP aggregation)
- Hidden student toggle
- Student self-view of full class leaderboard (unclear from codebase)
- All-time vs. periodic leaderboard distinction

### Security
- All leaderboard queries scoped by `schoolId` via `scopedQuery`
- No endpoint exposes XP data without authentication + role check

---

## 15. XP, Rank, and Gamification System

### XP Sources
1. Mission completion (teacher approval) — `pointsXP` from Mission document
2. Manual teacher adjustment — `POST /api/teacher/students/:studentId/points-adjustments`

### XP Rules
- Always non-negative integer
- `user.xp` and `user.points` are identical (kept in sync for backward compatibility)
- Floor applied: `Math.max(0, Math.floor(xp))`

### Rank Thresholds
```
F:          0 ≤ XP < 10
E:         10 ≤ XP < 100
D:        100 ≤ XP < 1,000
C:      1,000 ≤ XP < 10,000
B:     10,000 ≤ XP < 100,000
A:    100,000 ≤ XP < 1,000,000
S:  1,000,000+ XP (maximum)
```

### Progress Bar Calculation
```
tierTotalXp    = nextTierMin - currentTierMin
tierProgressXp = xp - currentTierMin   (clamped to [0, tierTotalXp])
progressPercent = round(tierProgressXp / tierTotalXp × 100)
```
At S rank: `progressPercent = 100`, label = "Maximum rank reached".

### Manual Rank Override
- `POST /teacher/students/:id/rank` sets `manualRank`, `rankOverrideEnabled = true`
- `displayRank = manualRank` when override enabled
- XP-based auto-rank continues to be calculated (for records)
- Override reason, setter, and timestamp stored

### Point Adjustment Flow
1. Teacher creates adjustment: amount + direction (`add`/`subtract`) + reason
2. `PointAdjustment` document records before/after snapshot (xp, points, rank)
3. Student's `xp` and `points` updated; `rank` field recalculated and stored

### Not Implemented
- Dugsi Bucks (reward currency concept — no model)
- Achievement badges or milestones
- Team XP
- Streak systems

---

## 16. Grades and Academic Tracking

### Two Grading Modes

**Numeric:** Standard score/maxScore. Categories: homework(20%), quiz(15%), test(25%), exam(25%), behavior(7.5%), participation(7.5%) — customizable per teacher.

**Symbolic:** Memorization scale + Subac scale. Symbols map to numeric values internally. `countsTowardGrade` flag per mark controls whether it contributes to average.

### Config Versioning
Teacher class config has a `configVersion` counter. Increments on any category/scale change. Each Grade record stores `gradingConfigVersion` so historical grades remain interpretable.

### Teacher Gradebook Workflow
1. Navigate to `/teacher/manage-grades`
2. Select class, subject, quarter
3. Click a cell → select mark or enter score
4. `POST /api/teacher/gradebook/cell` — upserts one Grade document
5. Or `POST /teacher/manage-grades/add` — full grade entry form

### Grade Visibility
- Students: own grades only (`/student/grades`)
- Teachers: full gradebook for their classes
- Parents: grade summary in child progress view
- Admins: full access, PDF report generation

### PDF Report Generation
1. Admin triggers async generation: `POST /admin/reports/student/:id/generate`
2. `renderStudentReportLatex` fills LaTeX template
3. `compileLatexToPdf` → pdflatex binary
4. `GET /admin/reports/student/:id/pdf` serves file
5. Parent download: `GET /parent/reports/:studentId/download`
6. `ReportActivity` tracks job status

---

## 17. Attendance System

### Data Model
One document per class per date. Contains all student records for that session.

### Statuses
| Status | Counted in total | Counts as present |
|---|---|---|
| Present | Yes | Yes |
| Late | Yes | Yes |
| Excused | Yes | Yes |
| Absent | Yes | No |
| Holiday | No | — |
| Weather | No | — |

### Teacher Workflow
1. `/teacher/manage-attendance` → select class + date
2. Mark each student's status
3. `POST /teacher/manage-attendance/save` with `{ classId, studentId, date, status }`

### Attendance Rate Calculation
`attendanceRate = (Present + Late + Excused) / (Present + Absent + Late + Excused) × 100`

Holiday and Weather sessions are excluded from the denominator.

### Summary Data
- Monthly trend: last 6 months
- Recent rows: last 16 records
- Thresholds: ≥ 90% = "On Track", < 80% = "Needs Attention"

---

## 18. Dashboard Systems

### Admin Dashboard (`/admin/home`)
Data loaded (with 30s in-process cache):
- User counts by role
- Mission completion statistics
- Attendance summary across school
- Finance summary (if configured)
- Recent announcements (pinned + published)
- Top students by XP (leaderboard preview)

Cache: `adminAnalyticsCache` Map, key = `schoolId`, TTL = `ADMIN_ANALYTICS_CACHE_TTL_MS` (default 30s). Bypass: `?refresh=1`.

### Teacher Dashboard (`/teacher/home`)
Data loaded:
- Teacher's assigned classes with student counts
- Pending mission submissions
- Recent attendance
- Teacher's customization settings

### Student Dashboard (`/student/home`)
Data loaded:
- Rank summary (XP progress bar, display rank, next rank)
- Available missions (filtered by student rank + assignment)
- Recent grades
- Attendance rate
- Random Quran verse or Hadith reflection

### Parent Dashboard (`/parent/home`)
Data loaded:
- All linked children with rank + attendance + grade summaries
- Outstanding payments (if finance module active)
- Announcements for parents

**Individual child view** (`/parent/child/:id`):
- Full `buildStudentProgressViewModel`
- Grade summary by subject
- Attendance rate + 6-month trend
- Mission counts
- PDF download button

**Security:** Parent can only access children where `parentInfo.children[].childID` matches AND same school.

---

## 19. UI Component System

### Layout Shells (EJS Partials)
| Partial | Used By |
|---|---|
| `partials/header.ejs` + `footer.ejs` | Public/marketing pages |
| `partials/inHeader.ejs` + `inFooter.ejs` | Teacher/student authenticated shell |
| `partials/adminHeader.ejs` + `adminFooter.ejs` | Admin shell |

### Client-Side JS Files
| File | Purpose |
|---|---|
| `nav-toggle.js` | Mobile hamburger menu |
| `app-shell.js` | Authenticated app shell behavior |
| `admin-shell.js` | Admin navigation |
| `teacher-shell.js` | Teacher navigation |
| `parent-shell.js` | Parent navigation |
| `admin-users.js` | User management table interactions |
| `admin-finance.js` | Finance dashboard interactions |
| `admin-reports.js` | Report generation triggers |
| `admin-announcements.js` | Announcement CRUD interactions |
| `admin-deleted-users.js` | Deleted users table |
| `adminViewEdit.js` | Inline editing |
| `teacher-grades.js` | Gradebook cell interactions |
| `teacher-customization.js` | Settings form interactions |
| `teacher-student-progress.js` | Progress directory interactions |
| `profile.js` | Profile form |
| `scroll-animations.js` | CSS entrance animations |

### Patterns
- All forms use CSRF token hidden input + method-override for PUT/DELETE
- Flash messages displayed at top of page (success/error/info)
- Tables: sortable columns, row actions, empty states
- Modals: CSS-only toggle pattern
- No client-side framework — all JS is vanilla ES6+

---

## 20. Styling and Design System

### File Organization
```
base.css          → CSS custom properties, reset, a11y
app.css           → Utility tokens + helpers
components.css    → Shared components (buttons, forms, tables, cards, modals, tabs)
layout.css        → Grid + flexbox layouts
animations.css    → Entrance + transition animations
pages/*.css       → One file per page (canonical system)
components/*.css  → Modular component files (buttons, cards, forms, modals, navbar, sidebar, tables)
```

### Legacy CSS (Technical Debt)
These old files exist alongside the canonical `pages/*.css` system:
`teacherDashboard.css`, `teacherAttendance.css`, `teacherGrades.css`, `teacherMissions.css`, `teacherLayout.css`, `adminLayout.css`, `admin-users.css`, `authLogin.css`

They should be removed once all pages use the `pages/*.css` equivalents.

### Breakpoints (Mobile-first)
```
360px  480px  600px  768px  1024px  1280px  1440px  1920px
```

### Design Tokens (CSS Variables in base.css)
- Color palette: primary, secondary, success, warning, danger, neutral
- Spacing scale: 4px base unit
- Typography: font families, sizes, weights, line heights
- Border radius and shadow presets

---

## 21. Uploads and Media

### Upload Flow
1. HTML form with `enctype="multipart/form-data"`
2. Multer middleware: memory storage, 5MB max, JPEG/PNG only
3. Cloudinary middleware: uploads buffer → returns `{ url, public_id }`
4. URL stored in document; public_id stored for deletion

### Cloudinary Config
Env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
Or: `CLOUDINARY_URL = cloudinary://key:secret@cloud`
Backward-compatible aliases: `CLOUD_NAME`, `API_KEY`, `API_SECRET`

### Upload Endpoints
| Endpoint | Who | Purpose |
|---|---|---|
| `POST /profile/avatar` | admin | Own avatar |
| `POST /admin/users/:id/avatar` | admin | Any user's avatar |
| `POST /admin/users/:id/avatar/remove` | admin | Remove avatar |
| `POST /teacher/library` | teacher | Library resource image |

### Risks
- No magic byte validation (MIME type can be spoofed)
- No virus scanning
- No image dimension limits

---

## 22. Notifications and Email

### Implemented Email
**Password Reset** only:
- `mailer.js:sendPasswordResetEmail` — HTML + plain text
- Multiple reset links per email (one per matching account)
- Falls back to `console.log` in development if SMTP unconfigured

### Not Implemented
- Owner invite delivery (link shown in UI only)
- Mission approval/rejection notifications
- Attendance alerts to parents
- Grade notifications
- In-app notification system
- Announcement email blasts
- Push notifications

---

## 23. Payments and Finance

### Finance Module Status
Partially implemented. Functional for admin manual ledger; Plaid bank sync and parent payment portal are present but not fully integrated into the parent-facing UI.

### Manual Ledger (FinanceEntry)
- Admin creates income/expense entries via `/admin/finance`
- Categories from `FinanceCategory` collection
- Soft-delete (archive) via `deletedAt`
- Finance summary API: `GET /admin/finance/summary`

### Bank Integration (Plaid)
1. `POST /admin/finance/bank/link-token` — create Plaid Link token
2. Frontend opens Plaid Link
3. `POST /admin/finance/bank/connect` — exchange public token for access token (encrypted + stored)
4. `POST /admin/finance/bank/sync` — import transactions to `FinanceBankTransaction`
5. `POST /admin/finance/reconcile` — link transactions to finance entries

**Rate limited:** 20 syncs per 5 minutes per school:user.
**Encryption:** Plaid access tokens AES-256 encrypted with `FINANCE_ENCRYPTION_KEY`.

### ParentPayment
Status lifecycle: `Due → Partial → Paid → Overdue → PendingProcessor`
Categories: Tuition, Registration, Materials, Meal, Transport, Other
Linked to `FinanceBankTransaction` for reconciliation.

### Parent Billing Profile
Stored on `User.parentInfo.billingProfile`:
- `monthlyTuitionAmount`, `billingDayOfMonth` (1–28), `currency` (default USD)

---

## 24. Validation and Error Handling

### Server-Side Middleware
| Middleware | What it does |
|---|---|
| `requireFields(fields)` | Returns 400 if any field missing or empty |
| `validateEmailField(field)` | `validator.isEmail()` check + lowercase |
| `validateObjectIdParam(param)` | Validates MongoDB ObjectId format in URL |
| `rejectMongoOperators()` | Blocks `$` and `.` keys in request body |

### Error Handlers (server.js, in order)
1. Multer errors → 400 with friendly message
2. CSRF errors (`EBADCSRFTOKEN`) → 403 with flash (HTML) or JSON
3. Catch-all → 500 generic message

### Flash Messages
`express-flash`. Types: `errors` (array of `{ msg }`), `success`, `info`.

### Missing Validations
- No frontend JS validation (server-side only)
- No content-type enforcement on JSON API endpoints
- No XSS sanitization before storage (EJS auto-escaping handles output)
- No rate limiting on teacher/student GET routes

---

## 25. Security Audit

### Implemented Protections

| Protection | Location |
|---|---|
| CSRF (`csurf`) | `server.js` — all mutations |
| bcrypt password hashing (10 rounds) | `User.pre("save")` |
| Session: httpOnly, secure (prod), sameSite=lax, 7-day | `server.js` |
| Helmet + custom CSP | `server.js` |
| Rate limiting (per route group) | `middleware/rateLimit.js` |
| NoSQL injection block (`rejectMongoOperators`) | `middleware/validate.js` |
| Tenant isolation (`scopedQuery` + `requireTenant`) | `utils/tenant.js` + `middleware/auth.js` |
| Soft delete pattern | User + Class models |
| Partial unique indexes | `User.js` |
| ObjectId validation | `middleware/validate.js` |
| Audit logging | `AuditLog` model + `utils/auditLogger.js` |
| Finance token AES-256 encryption | `utils/bankProvider.js` |
| `X-Powered-By` removed | `server.js` |
| Trust proxy (prod) | `server.js` |

### Risks

**SEVERITY: HIGH**

| # | Issue | Affected | Fix |
|---|---|---|---|
| 1 | No per-account lockout | Auth flow | Add failed-attempt counter with lockout after 5 failures |
| 2 | LaTeX injection in PDF reports | `latexReports.js` | Escape `\`, `{`, `}`, `#`, `%`, `&` before interpolation |
| 3 | No unit tests for core business logic | All utils | Add unit tests for ranks.js, gradingScales.js, missionDeadlines.js |
| 4 | SMTP not required in production | `mailer.js` | Warn loudly or disable reset if SMTP unconfigured |

**SEVERITY: MEDIUM**

| # | Issue | Affected | Fix |
|---|---|---|---|
| 5 | `unsafe-inline` in CSP | `server.js` | Move inline scripts to external files; use nonce-based CSP |
| 6 | In-process analytics cache breaks multi-instance | `home.js` | Use Redis for shared caching |
| 7 | `POST /admin/school` route exists (blocked by middleware) | `routes/main.js` | Remove route entirely |
| 8 | No magic byte validation on uploads | `middleware/multer.js` | Add file signature check |

**SEVERITY: LOW**

| # | Issue | Affected | Fix |
|---|---|---|---|
| 9 | morgan dev-mode in production | `server.js` | Switch to `combined` mode with param masking |
| 10 | pdflatex not documented as system dependency | Deployment | Add to deployment docs; add health check |

---

## 26. Testing

### Current Tests

**CSRF Security Tests** (`security-tests/csrf-attack.test.js`):
Uses Node.js `node:test`. Verifies 6 mutation endpoints return 403 without CSRF token.
Run: `npm run security:test:csrf`

**Script-based Integrity Checks** (require live MongoDB connection):

| Script | Command | Checks |
|---|---|---|
| `tenant-isolation-check.js` | `npm run test:tenant-isolation` | schoolId in all scoped queries |
| `tenant-query-guard.js` | `npm run test:tenant-query-guard` | scopedQuery usage enforcement |
| `role-authorization-check.js` | `npm run test:role-authorization` | Role middleware on all routes |
| `admin-mutation-check.js` | `npm run test:admin-mutations` | School creation blocked |
| `password-selection-check.js` | `npm run test:password-selection` | Forced change flag logic |
| `attendance-dedupe-check.js` | `npm run test:attendance-dedupe` | Duplicate attendance detection |
| `user-uniqueness-check.js` | `npm run test:user-uniqueness` | Partial unique index behavior |
| `real-data-readiness-check.js` | `npm run test:real-data-readiness` | Production data integrity |

### Missing Tests
- No unit tests for: `ranks.js`, `gradingScales.js`, `missionDeadlines.js`, `studentProgress.js`, `userIdentifiers.js`
- No integration tests for full request/response cycles
- No E2E tests (no Playwright/Cypress)
- No finance module tests
- No PDF generation tests

### Recommended Testing Strategy
1. Unit tests (Jest or Node:test) for all pure utility functions
2. Integration tests for auth flows (login, reset, forced change)
3. Integration tests for tenant isolation (cross-school access returns empty)
4. Integration tests for mission lifecycle (create → begin → complete → approve)
5. E2E tests (Playwright) for teacher gradebook and student mission flows
6. Security tests: expand CSRF; add injection and auth bypass tests

---

## 27. Deployment and Infrastructure

### Local Setup
```bash
cd IlmQuest/iteration2
cp backend/config/.env.example backend/config/.env
# Edit .env: set DB_STRING
npm install
npm run dev   # nodemon on port 2121
```

### Production Commands
```bash
npm start    # node backend/server.js
```

### Render Deployment
**Procfile:** `web: node backend/server.js`

| Setting | Value |
|---|---|
| Root Directory | `iteration2` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Required env | `DB_STRING`, `SESSION_SECRET`, `NODE_ENV=production` |
| PORT | Auto-injected by Render |

**After first deploy — run index migrations:**
```bash
npm run db:indexes:apply
npm run db:indexes:core:apply
```

### System Dependencies (not in package.json)
- **pdflatex** — required for PDF reports
  - Ubuntu: `apt-get install texlive-latex-base texlive-latex-recommended`
  - Must be available on PATH

### Known Deployment Issues
1. pdflatex not on Render free tier by default — PDF generation fails silently
2. Session invalidation on redeploy if SESSION_SECRET changes
3. `autoIndex: false` in production — indexes must be applied manually

---

## 28. Full Rebuild Guide

### Step 1: Scaffold
```bash
mkdir ilmquest && cd ilmquest
npm init -y
npm install express mongoose passport passport-local express-session connect-mongo \
  bcrypt csurf helmet express-rate-limit method-override multer morgan express-flash \
  nodemailer ejs cloudinary validator dotenv lodash cookie-parser
```
Create structure: `backend/{config,controllers,middleware,models,routes,utils,scripts,latex}`, `frontend/{views,public/{css,js,imgs}}`

### Step 2: Database
1. MongoDB Atlas cluster
2. `DB_STRING` env var
3. `database.js` connection factory with pool settings

### Step 3: Auth
1. `User` model with all fields (see Section 9)
2. Passport LocalStrategy (email or username, optional school scope, super-admin fallback)
3. `ensureAuth`, `requireTenant`, `requireRole` middleware
4. CSRF: `csurf()` after session middleware
5. Rate limiters: login(10/15min), recovery(5/15min), reset(5/15min)

### Step 4: Tenant Isolation
1. `tenant.js` with `scopedQuery`, `scopedIdQuery`, `scopedInsertData`, `assertTenantContext`
2. Apply `requireTenant` to all school-scoped route groups
3. Validate: queries without schoolId must throw

### Step 5: Super-Admin + Provisioning
1. Bootstrap super-admin from env on DB connect
2. `/platform/home` (superAdmin only)
3. `POST /platform/schools` — creates School + owner User + 48h invite token
4. `/owner-onboarding/:token` — owner completes account setup

### Step 6: User Management
1. Admin CRUD for students, teachers, parents
2. Class management
3. Assign: students → classes, parents → students
4. Soft delete + restore

### Step 7: Mission System
1. `Mission` model with `active.studentInfo` array
2. Teacher: create missions
3. Student: begin (rank gate) + complete
4. Teacher: reopen failed attempts
5. Background sweep: auto-fail past deadline + grace window

### Step 8: XP and Rank
1. `ranks.js` with thresholds and `buildRankSummaryFromUser`
2. Award XP on mission approval
3. Manual point adjustment (teacher)
4. Manual rank override (teacher)

### Step 9: Grades
1. `Grades` model
2. `gradingScales.js` — Memorization + Subac scales
3. `teacherCustomization.js` — per-class config + versioning
4. Gradebook cell upsert API
5. Grade summary views

### Step 10: Attendance
1. `Attendance` model
2. Teacher recording workflow
3. Attendance rate calculations

### Step 11: Dashboards
1. `studentProgress.js` — `buildStudentProgressViewModel`
2. Admin analytics cache
3. Role-specific dashboard views

### Step 12: Finance
1. `FinanceEntry`, `FinanceCategory`, `ParentPayment` models
2. Manual entry CRUD
3. Plaid integration (optional)

### Step 13: Announcements
1. `Announcement` model with visibility targeting
2. Create/publish/archive/pin flows

### Step 14: PDF Reports
1. Install pdflatex
2. LaTeX template + `latexReports.js`
3. `ReportActivity` tracking

### Step 15: Uploads + Email
1. Multer (5MB, jpg/png) + Cloudinary
2. Nodemailer SMTP for password reset

### Step 16: Security Hardening
1. Helmet + CSP
2. `rejectMongoOperators` middleware
3. Partial unique indexes on User
4. Rate limiters on all mutation route groups
5. CSRF test suite

### Step 17: Deploy
1. Render: set Root Directory to `iteration2`
2. Set all required env vars
3. Install pdflatex as system package
4. Run index migration scripts
5. Verify SMTP

---

## 29. Critical Business Rules

### Mission Rules
1. Student can only begin a mission whose rank **exactly** matches their current displayed rank (strict mode default)
2. Missions with `dueDate` auto-fail active attempts **30 minutes** after the deadline
3. Teachers manage missions within their school only (schoolId isolation)
4. Teachers can reopen failed/rejected attempts individually

### XP / Rank Rules
5. XP is always a non-negative integer; cannot go below 0
6. `user.xp` and `user.points` are always identical
7. `user.rank` is a stored cache of the auto-calculated rank; definitive value = `getAutoRankForXp(xp)`
8. Manual rank override changes display rank only; XP tracking continues normally
9. Only teachers can adjust student XP; only teachers can set rank overrides

### User Management Rules
10. Public signup is permanently disabled
11. School tenants can only be created by super-admins via `/platform/schools`
12. Admin-level school creation via `POST /admin/school` is hard-blocked (returns 403)
13. Soft-deleted users cannot log in
14. Username and email unique per school among active users
15. Teachers/parents/students with temporary passwords must change on first login

### Multi-Tenancy Rules
16. Every tenant-scoped DB query must include `schoolId`
17. Super-admin users have `schoolId = null`; cannot access school-scoped routes
18. Parent can only view children in `parentInfo.children[].childID`
19. Teacher sees only students in their assigned classes

### Attendance Rules
20. Holiday and Weather are excluded from attendance rate denominator
21. Present, Late, and Excused all count as "present" for rate calculation

### Finance Rules
22. Finance entries are soft-deleted (archived), not hard-deleted
23. Plaid access tokens are AES-256 encrypted before storage
24. Finance bank sync rate-limited: 20 per 5 minutes per school:user

### Announcement Rules
25. Must be published (`isPublished = true`, `status = "published"`) to appear
26. Pinned announcements appear first
27. Expired (`expiresAt < now`) announcements hidden even if published

---

## 30. Known Gaps and Technical Debt

| Issue | Severity | Description |
|---|---|---|
| Duplicate/conflicting CSS files | Medium | Legacy CSS coexists with `pages/*.css` system |
| Mission approval controller not fully traced | High | Approval/rejection exact handler needs verification |
| Team mission category unimplemented | Low | Enum exists; team tracking logic absent |
| No owner invite email delivery | Medium | Link shown in UI; email not sent |
| No full-text search | Medium | No search across users, missions, grades |
| Single-process analytics cache | High | Breaks on multi-instance deployments |
| pdflatex undocumented as system dependency | High | Silent failure if not installed |
| No per-account lockout on login | High | Only IP rate limiting |
| LaTeX injection risk in PDF generation | High | User data not escaped for LaTeX special chars |
| No unit test coverage for core logic | High | ranks.js, gradingScales.js, missionDeadlines.js untested |
| 500-record limits in progress views | Medium | Hardcoded limit — may miss data for large schools |
| Dugsi Bucks not implemented | Low | Domain concept; no model or system |
| Leaderboard cycles not implemented | Low | No cycle/reset; all-time XP only |
| Team leaderboard not implemented | Low | No team XP aggregation |
| Student leaderboard self-visibility unclear | Low | Student dashboard shows personal rank; full leaderboard unclear |

---

## 31. Glossary

| Term | Definition |
|---|---|
| **IlmQuest** | The platform. "Ilm" (علم) = Arabic for knowledge. |
| **schoolId** | MongoDB ObjectId identifying a school tenant. On every tenant-scoped document. |
| **markaz** | Arabic for "center" — Islamic school/learning center. Plural: marakiz. |
| **Dugsi** | Somali word for Islamic school/educational institution. |
| **mission** | Gamified Islamic task assigned by teacher. Completing earns XP. |
| **Dugsi Bucks** | Proposed per-school reward currency. Not implemented. |
| **XP** | Experience Points — numeric accumulated achievement value. |
| **rank** | Letter grade derived from XP (F → E → D → C → B → A → S). |
| **leaderboard** | Derived view: students sorted by XP descending, no dedicated model. |
| **leaderboard cycle** | Concept for periodic XP resets. Not implemented. |
| **parent account** | User with `role: "parent"`. Sees only linked children's data. |
| **teacher scope** | Teachers bound to their assigned classes. |
| **scopedQuery** | `utils/tenant.js` function that adds `schoolId` + lifecycle filters to queries. |
| **soft delete** | Sets `isDeleted: true` + `deletedAt`. Reversible. |
| **permanent delete** | Hard deletion of a user document. Admin-only. |
| **admin** | School-level administrator. Not the same as platform super-admin. |
| **superAdmin** | Platform-level administrator. Creates schools. No school-specific access. |
| **owner** | Designated admin of a school tenant. `isSchoolOwner: true`. |
| **Tahfiidth** | Program type for Quran memorization students. |
| **Khatm** | Program type for Quran completion/recitation students. |
| **Memorization scale** | Al Bayaan grading scale for Quran recitation quality (✓ to X). |
| **Subac scale** | Al Bayaan grading scale for revision sessions (✓ to IIII). |
| **Subac** | Revision session — students review previously memorized Quran. |
| **Al Bayaan** | Islamic school format IlmQuest's grading system is designed around. |
| **config version** | Integer incrementing on teacher class config changes. Used to interpret historical grades. |
| **grace window** | 30 minutes after mission due date before auto-fail triggers. |
| **PointAdjustment** | Recorded manual XP change by teacher, with before/after snapshot. |
| **Plaid** | Third-party bank data aggregation API for finance bank sync. |

---

*Blueprint generated by senior engineering audit of IlmQuest iteration2.*
*Files audited: 76 JavaScript source files, 100+ EJS templates, 55+ CSS files.*
*Last updated: 2026-05-06*
