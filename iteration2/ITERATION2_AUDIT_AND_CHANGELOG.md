# Iteration2 Audit And Changelog

## 1) Audit Report

### Architecture findings
- `iteration1` already had tenant scoping primitives (`scopedQuery`, `scopedIdQuery`) and role-gated route segments (`/admin`, `/teacher`, `/student`, `/parent`).
- Public auth routes still exposed `/signup` and created both:
  - a new `School`
  - an `admin` user for that school
- This allowed public tenant creation and conflicted with private provisioning requirements.
- School-admin route `POST /admin/school` existed, creating schools from inside a tenant admin context.
- Login already supported email-or-username identifier with optional school scoping.
- Username normalization and school-scoped uniqueness were already present for school users.

### Vulnerabilities / structural issues found
- Public tenant creation exposure:
  - `GET /signup`
  - `POST /signup`
- Tenant admin tenant-creation path existed (`POST /admin/school`) and needed hard blocking.
- No explicit platform-level provisioning shell existed for super-admin-only school creation.
- No owner invite onboarding flow for newly provisioned schools.
- Password reset email account labeling referenced `schoolId` instead of human-readable school name.

### Tenant-safety issues found
- Core tenant scope patterns were mostly sound; major gap was **who can create tenants**, not day-to-day scoped CRUD.
- School creation workflows were not clearly separated between platform-level and tenant-level authority.

### Public route exposure found
- Public school signup route and UI links were present in landing/header/footer/login.

### Role/permission inconsistencies found
- Missing platform-level `superAdmin` role and route space.
- `admin` role was school-scoped but still had a school-creation endpoint (now blocked).

### UX inconsistencies relevant to task
- Public CTA paths still implied self-serve tenant signup.
- Reset email labels could expose internal identifiers (`schoolId`) in user-facing copy.

---

## 2) Implementation Summary

### Added
- Platform super admin bootstrap support (env-driven).
- Platform-only provisioning workspace:
  - `GET /platform/home`
  - `POST /platform/schools`
- Owner onboarding invite workflow:
  - `GET /owner-onboarding/:token`
  - `POST /owner-onboarding/:token`
- Secure owner invite token utilities (hashed token, expiry, one-time usage).
- New platform and onboarding views/CSS.

### Modified
- Public signup backend now hard-blocked (GET/POST).
- Public marketing/auth navigation no longer promotes public school signup.
- Role-home resolution now supports `superAdmin`.
- Auth login redirect for already-authenticated users now goes to role home (prevents superAdmin `/login` loop).
- Password reset email label now prefers school name over schoolId.
- `User` model extended for:
  - `superAdmin` role
  - optional `schoolId` for platform users
  - owner invite/onboarding tracking fields
  - platform superadmin unique indexes
- `School` model extended for provisioning metadata (`ownerUserId`, `provisionedByUserId`, `provisionedAt`) and normalized school-name uniqueness.

### Disabled
- Tenant admin school creation flow (`POST /admin/school`) now returns a 403 mutation response.
- Public school signup behavior (backend enforcement, not just hidden UI).

### Preserved intentionally
- Existing school-internal management flows:
  - admin user creation (teacher/student/parent)
  - class management
  - teacher/student/parent portals
  - grading, attendance, missions, announcements/library
- Existing auth/session/csrf middleware chain and tenant scoping patterns.

---

## 3) File-By-File Changelog

### Backend
- `backend/server.js` (medium risk)
  - Added platform super-admin bootstrap call after DB connection.
- `backend/config/env.js` (low risk)
  - Added platform super-admin env fields.
- `backend/config/.env.example` (low risk)
  - Documented required platform super-admin bootstrap vars.
- `backend/config/passport.js` (medium risk)
  - Added super-admin-first resolution path for unscoped identifier login.
- `backend/middleware/auth.js` (low risk)
  - Added `superAdmin` home route mapping.
- `backend/middleware/rateLimit.js` (low risk)
  - Added `platformProvisionLimiter`.
- `backend/routes/main.js` (high risk)
  - Added platform route group and owner onboarding routes.
  - Kept `/signup` endpoints but now routed to disabled behavior.
- `backend/controllers/auth.js` (high risk)
  - Disabled public signup GET/POST responses.
  - Added `superAdmin` role-home redirect support.
  - Fixed authenticated `/login` redirect behavior to role home.
  - Improved password reset email metadata to include school names.
- `backend/controllers/posts.js` (medium risk)
  - Hard-blocked tenant-admin school creation.
- `backend/controllers/platform.js` (new, high impact)
  - Added super-admin provisioning + owner onboarding logic.
- `backend/models/User.js` (high risk)
  - Added `superAdmin` role support.
  - Made `schoolId` optional only for `superAdmin`.
  - Added owner invite/onboarding fields.
  - Added super-admin unique indexes.
- `backend/models/School.js` (medium risk)
  - Added normalized school name uniqueness + provisioning metadata.
- `backend/utils/ownerInvite.js` (new, medium impact)
  - Invite token generation/hash/validation helpers.
- `backend/utils/platformSuperAdmin.js` (new, medium impact)
  - Env-driven super-admin bootstrap utility.
- `backend/utils/mailer.js` (low risk)
  - Replaced schoolId-focused labeling with school-name labeling when available.

### Frontend
- `frontend/views/index.ejs` (low risk)
  - Replaced signup CTA destinations with login-access paths.
- `frontend/views/login.ejs` (low risk)
  - Removed public signup prompt copy.
- `frontend/views/partials/header.ejs` (low risk)
  - Removed public “Get Started” tenant-signup route exposure.
- `frontend/views/partials/footer.ejs` (low risk)
  - Removed footer “Sign Up” tenant-signup route exposure.
- `frontend/views/platform/home.ejs` (new, medium impact)
  - Super-admin provisioning dashboard.
- `frontend/views/ownerOnboarding.ejs` (new, medium impact)
  - Owner invite acceptance and account setup page.
- `frontend/public/css/pages/platform-home.css` (new, low risk)
  - Styling for platform provisioning page.
- `frontend/public/css/pages/owner-onboarding.css` (new, low risk)
  - Styling for owner onboarding page.

---

## 4) Data / Schema Notes

- `User` schema changes:
  - role enum now includes `superAdmin`
  - `schoolId` required for non-`superAdmin`, nullable for `superAdmin`
  - added:
    - `isSchoolOwner`
    - `ownerInviteTokenHash` (select false)
    - `ownerInviteExpiresAt` (select false)
    - `ownerInviteSentAt`
    - `ownerOnboardingCompletedAt`
  - added unique partial indexes for super-admin username/email

- `School` schema changes:
  - `schoolNameNormalized`
  - `ownerUserId`
  - `provisionedByUserId`
  - `provisionedAt`
  - unique index on `schoolNameNormalized`

### Migration/backward compatibility
- Existing tenant users remain valid (role values unchanged).
- Existing school-admin role remains `admin`; no breaking rename to `schoolAdmin`.
- Existing tenant-scoped unique indexes remain in place.
- `superAdmin` provisioning requires env bootstrap variables to be set.

---

## 5) Manual QA Checklist

### Public access / disabled signup
1. Visit `/signup` as anonymous user:
   - expect redirect to `/login` with disabled-signup flash.
2. POST to `/signup` directly:
   - expect blocked response (403 JSON/API or redirect with error for HTML).
3. Confirm no public nav/CTA links point to `/signup` from landing/header/footer/login.

### Super admin provisioning
1. Set platform super-admin env vars:
   - `PLATFORM_SUPERADMIN_EMAIL`
   - `PLATFORM_SUPERADMIN_USERNAME`
   - `PLATFORM_SUPERADMIN_PASSWORD`
2. Start app and verify bootstrap log indicates super admin exists/created.
3. Login as super admin:
   - expect redirect to `/platform/home`.
4. Provision school from `/platform/home`:
   - expect school + owner account created.
   - expect invite link displayed with expiry.

### Owner onboarding
1. Open invite link `/owner-onboarding/:token`.
2. Complete form with username + password + names.
3. Submit and confirm redirect to `/login` with success flash.
4. Attempt reusing same invite link:
   - expect invalid/expired response.

### School self-management
1. Login as provisioned owner (`admin` role).
2. Verify `/admin/home` access and existing admin workflows still function:
   - create teacher/student/parent
   - class management
   - reports/attendance/announcements

### Tenant boundaries
1. Confirm school admin cannot create new tenants via `/admin/school`:
   - expect 403 blocked response.
2. Confirm student/teacher/parent have no public signup.
3. Run existing tenant checks in your normal environment:
   - `npm run test:tenant-isolation`
   - `npm run test:tenant-query-guard`
   - `npm run test:role-authorization`
   - `npm run test:private-provisioning`

### User-facing display checks
1. Trigger forgot-password flow and inspect email body:
   - school label should use school name (not raw schoolId).
2. Profile/header areas should continue preferring username-style display where already implemented.

---

## 6) Risk Register

1. **Bootstrap env dependency**
   - If platform super-admin env vars are not set, no automatic super-admin account is created.
   - Mitigation: configure env vars in deployment secrets.

2. **Model/index evolution**
   - New `School` and `User` indexes may require index sync in existing environments.
   - Mitigation: run index sync scripts and validate before production rollout.

3. **Legacy `/signup` template remains on disk**
   - Route is blocked, but template exists for backward compatibility.
   - Mitigation: keep backend block as source of truth; optionally remove template in a later cleanup pass.

4. **No outbound owner-invite email yet**
   - Invite link is shown in platform UI for secure sharing.
   - Mitigation: add optional email dispatch in iteration3.

5. **`admin` role naming**
   - School-level admin remains `admin` (not renamed to `schoolAdmin`) for compatibility.
   - Mitigation: if role rename is desired later, perform phased migration with alias support.

---

## 7) Recommended Iteration3 Follow-Ups

- Add dedicated platform role middleware helpers (`requirePlatformRole`, `requireSchoolRole`) for explicit separation.
- Add optional invite-email delivery for owner onboarding using existing mailer.
- Add explicit platform audit logs for school provisioning actions.
- Add migration script for backfilling `schoolNameNormalized` and new owner metadata where needed.
- Add integration tests for:
  - blocked public signup
  - super-admin provisioning
  - single-use owner onboarding token flow
