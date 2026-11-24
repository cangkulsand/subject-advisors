# Subject Advisors

Initial `main` baseline for the AI-Powered Academic Advisory System for UTMSPACE
part-time students. Teammates can clone this repository, run it locally and develop
their assigned modules on separate feature branches.

This baseline includes **Programmer 4's Sprint 1 authentication (UC01 and UC02)**:
Clerk signup/login/logout, verified institutional email checks, server-side roles and
access status, and Neon account binding. Academic profile, records, offerings and
pathway features remain assigned to their respective programmers.

## Clone and run

Requirements: Node.js 22.12+ and npm.

```powershell
git clone https://github.com/cangkulsand/subject-advisors.git
cd subject-advisors
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Press Ctrl+C to stop the frontend and API.
On macOS/Linux, use `npm` instead of `npm.cmd`.

The launcher creates local settings from the committed blank templates only when
the files do not exist. With no browser key, the page shows setup instructions.

Set the Clerk **development** publishable key in `.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=<development publishable key>
```

Set backend credentials in `.dev.vars`:

```dotenv
CLERK_PUBLISHABLE_KEY=<same development publishable key>
CLERK_SECRET_KEY=<matching development secret key>
DATABASE_URL=<Neon development database connection URL>
```

Obtain development access from the project maintainer. All developers use the shared
Neon development branch development (br-shy-cherry-azuzy9v5, database neondb).
The DATABASE_FOUNDATION baseline now provides
a single migration workflow: see docs/database/README.md. Do not apply dated feature
migrations alongside the canonical baseline. Existing app data must be preserved.
Restart the servers after editing environment files. Credentials remain local and
are excluded by Git.

The frontend uses React/Vite on port 5173 and proxies /api to the Cloudflare Worker
running locally on port 8787. Clerk and Neon require an internet connection.
See [local setup](docs/p004-local.md) for provider and migration steps.

## Start your assigned work

```powershell
git switch main
git pull --ff-only
git switch -c feature/p001-s1-profile
```

Use the branch for your assigned owner:

| Owner | Branch example | Sprint 1 scope |
| --- | --- | --- |
| P001 | feature/p001-s1-profile | UC03 profile; UC04 academic records |
| P002 | feature/p002-s1-offerings | UC08 semester offerings |
| P003 | feature/p003-s1-pathway | UC17 pathway prototype |
| P004 | feature/p004-s1-auth-followup | UC01/UC02 authentication follow-up |
| FOUNDATION | chore/foundation-s1 | Shared app/API/catalogue/tooling integration |

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing shared files. Open feature PRs
against `main`; keep each PR within its selected owner scope.

## Sprint 2 on `main` (2026-11-14)

| Owner | Feature | Record |
| --- | --- | --- |
| P004 | UC20 coordinator forecast: data source toggle (system / CSV / both), coordinator export CSV format, and one Class Offering Forecast screen where each subject is Pending, Approved or Removed per programme, learning centre and semester (`/coordinator/*`); the review, finalize and confirm flow was removed | S2-P004-007, S2-P004-009, S2-P004-010, S2-P004-017 to S2-P004-024 |
| P004 / P002 / P001 | Simplified offering flow: admin-set selection window on each semester, students pick only approved subjects of the next semester while it is open, learning centre chosen on the student profile; migration 0009 | S2-P004-017 to S2-P004-024 |
| P003 | UC17 graduation eligibility, projected pathway, flowchart layout and highlighting | S2-INT-001 (S2-P003-001..004) |
| P004 | Admin academic setup: semesters (current semester), faculties, programmes, learning centres, coordinator assignments (`/admin/*`); migration 0008 | S2-P004-008 |
| P004 (for P001 UC25 / FR-B9) | Department between faculty and programme: admin Departments page, programmes are assigned on the Programmes page (faculty derived); migration 0010 | S2-P004-025 |
| P004 (for P001 UC25 / FR-B9) | Admin Programmes page: programmes and curriculum versions create/edit/deactivate, department assignment moved here, audited; migration 0012 | S2-P001-005 |
| P004 (for P001 UC03 / FR-A3) | Programme lock: students choose their programme only when creating their profile (`409 PROFILE_PROGRAMME_LOCKED` afterwards); the admin changes it with a reason on the account detail (`PATCH /api/admin/users/{id}/programme`, `GET /api/admin/curriculum-options`), which removes stale subject picks and is audited; migration 0011 | S2-P004-026 |
| P001 (merged by P004) | Profile period locked to the admin current semester: the student no longer picks year or semester, the profile shows `academic_semester.is_current` read-only, `ProfileOptions.currentSemester`, save guarded in one statement (`503 ACADEMIC_SEMESTER_UNAVAILABLE`, `409 ACADEMIC_SEMESTER_MISMATCH`) | S2-P001-003 |
| P001 (merged by P004) | Admin Semesters page: clearer current/next summary, Add and Advance actions, per-row Edit / Set current controls | S2-P001-004 |
| P004 (for P002 UC09 / FR-C2, FR-C5) | Eligibility on student offerings: Eligible / Check with your coordinator / Not eligible with reasons; Not-eligible picks rejected (`409 OFFERING_NOT_ELIGIBLE`); CGPA rules hidden from students (not stored), coordinator forecast unchanged | S2-P004-027 |
| P003 (on P001 UC06) | UC24 create subject with zero or more initial prerequisites, saved atomically; admin Curriculum & Prerequisites page (`/admin/curriculum`) with Create Subject / Manage Prerequisites tabs; the `/api/p001-sprint2/curricula*` routes are in the shared router (SYSTEM_ADMIN) | S2-P003-005, S2-P003-006 |
| P004 (on P003 UC24 page) | Curriculum & Prerequisites page (`/admin/curriculum`) restyled to the admin template theme (cards, tables, buttons, tabs); behaviour unchanged | S2-INT-005 |
| P001 | UC05 progress and UC06 curriculum mapping overlay launched with `node tools/p001-sprint2/dev.mjs`; UC05 progress is now in the student app (S2-P001-006 below); the overlay remains for UC06 mapping (UC06 curriculum maintenance is in the shared router, via UC24 above) | S2-INT-002 (S2-P001-001..002) |
| P001 (UC05) / P003 (UC18); built by P004 | Academic progress in the student app: `/student/progress` (hidden from the student menu since S3-P004-023; opens by URL) restyled to the student template, with a read-only subject Details panel (prerequisites met/not met, unlocks, permitted semesters, status, next-semester approval); `GET /api/p001-sprint2/progress` additively returns `links`; no DB change | S2-P001-006 |

Subject names are English; see `db/reference-data/subject-english-names.csv`.

## Sprint 3 (in progress)

| Owner | Feature | Record |
| --- | --- | --- |
| P003 (UC13); built by P004 | Graduation check in the student app: `/student/graduation` (menu item after Subject records) compares earned credits with the curriculum Total credits and lets the student confirm two items the system cannot check (no outstanding fees, MUET); `GET /api/graduation-check`, `PUT /api/graduation-check/confirmations`; migration 0013 (applied to Neon development 2026-11-15) | S3-P004-001 |
| P003 (UC14–UC16); built by P004 | Graduation plan in the student app: `/student/plan` (menu item after Graduation check) plans the remaining subjects semester by semester (prerequisites, Normal/Short rules, limits, approved offerings for the next semester), shows the estimated and earliest completion and the subjects not to delay, and lets the student try what-if changes (drag a subject to another semester or use "Move…", postpone, fail, withdraw, swap an elective) and compare; semesters coloured by number; co-requisites planned together; a requirements card that only confirms completion when every configured requirement is met; a Dependencies view of the shown plan; a stale-plan check on save (409 `PLANNING_BASELINE_CHANGED`); the what-if is saved per student (`simulation_scenario` / `simulation_subject`); `GET /api/planning/input`, `GET/PUT/DELETE /api/planning/scenario`; shared engine `packages/shared/src/planning`; no migration | S3-P004-004, S3-P004-010, S3-P003-001, S3-P003-002 |
| P002 (UC11–UC12); built by P004 | Subject recommendations in the student app: `/student/recommendations` (hidden from the student menu since S3-P004-023; opens by URL) ranks every valid subject combination for the next semester by planning the rest of the degree around it, explains each subject, lists alternatives and warns about subjects not to postpone; shared engine `packages/shared/src/recommendations`; reuses `GET /api/planning/input`; read-only | S3-P004-005 |
| P001 (UC05); built by P004 | Academic progress (and the Graduation check) now match requirement types such as `ELECTIVE_E1` to categories such as `Elective E1`, so those groups no longer show as unassessed | S3-P004-006 |
| P001 (UC05); built by P004 | Academic progress (and the Graduation check) count exemptions saved without remarks, as the Subject records page allows; the Graduation plan does the same (S3-P004-007) | S3-P004-008 |
| P004 (M0/M7) | Suspending an account in Users & Access also bans it in Clerk (signed out, cannot sign in); reactivating unbans it; if Clerk fails the change is reverted (`502 SIGN_IN_BLOCK_FAILED` / `SIGN_IN_UNBLOCK_FAILED`) | S3-P004-009 |
| P004 (M0/M7) | Users & Access → **Create dummy user**: a system admin creates a ready-to-use Student (complete profile in the current semester) or Coordinator (one programme + learning centre) with a `+clerk_test` email and a generated password shown once; dummy accounts show a Dummy badge and have **Reset password** (`POST /api/admin/dummy-users`, `GET /api/admin/dummy-users/capacity`, `POST /api/admin/users/{id}/dummy-password`) | S3-P004-029 |
| P004 (M6) | Coordinator forecast: students with incomplete records are shown as Not counted ("Records incomplete") instead of a separate Uncertain group; the uncertain filter is removed; forecast numbers unchanged | S3-P004-030 |
| P004 (M6) | Coordinators forecast and approve the next **Normal** semester; Short semesters are skipped (arranged outside the app). Students still pick for the semester straight after the current one | S3-P004-031 |
| P004 (M6) | Live coordinator forecast: Class Offering Forecast calculates from the students in the system on every load or Refresh, with no snapshot step and nothing stored (`GET /api/coordinator/forecast-live`, `GET /api/coordinator/forecast-live/subjects/{id}/students`). Data Imports left the coordinator menu; the page stays reachable by URL for the hidden CSV import | S3-P004-032 |
| P004 (M6) | One email domain per role (Student `@graduate.utm.my`, Coordinator `@utm.my`, System Admin `@gmail.com`); the protected owner moves to the gmail admin (migration 0015). System Admin **View as**: Coordinator for a chosen programme and centre (can act, recorded as the admin, shown "(System Admin)"), or one student (read only), with a banner and Exit view | S3-P004-033 |
| P004 (M6) | Graduation plan: subjects outside the offering forecast (Project I/II, Industrial Training) need no coordinator approval and can always be placed in the next semester. The Move dialog lists only semesters of the subject's type, as one-click buttons in the board's semester colours, with the what-ifs as a separate group | S3-P004-034 |
| P004 (M0/M7) | Access Control List and recovery permissions written up for the requirements report ([SRS amendment](docs/requirements/srs-amendment-2026-11-24-access-control-list.md)): domain per role, who assigns roles, what each role can view, edit, approve and recover, student-to-admin promotion as separate accounts, and open decisions for the 5–6 December review. Docs only | S3-P004-035 |
| P004 (M0/M7) | Staff sign up without an invitation: a verified `@utm.my` or `@gmail.com` sign-up gets a **Waiting for access** screen (`403 ROLE_PENDING`, nothing created) instead of an error. Users & Access lists them under **Waiting for a role** (`GET /api/admin/waiting-users`) with **Assign role**, which opens Add user prefilled; the grant needs a reason and is audited. No migration | S3-P004-036 |
| P004 (M6) | Coordinator Offering History: `/coordinator/history` shows past semesters' Approved / Removed subjects and pick counts with "View students", within assigned scopes; read-only, frontend only | S3-P004-002 |
| P004 (M6) | Coordinator menu: removed the planned Data Quality and Decision Audit pages; `/coordinator/data-quality` and `/coordinator/audit` now show "Page not found"; every Overview quick link opens a built page | S3-P004-003 |
| Integration | Removed AI co-author trailers from `main` history (messages only; anyone with an older clone must reset `main` to `origin/main`) | S3-INT-001 |
| Integration | Fixed three timing races in the admin browser checks (`npm run test:ui:admin`); test tooling only | S3-INT-002 |


## Current integration boundaries

- Shared auth identity and role checks: apps/api/src/modules/auth and middleware/auth.ts.
- Private data must be scoped to the Clerk user ID returned by server authorization.
- P001 supplies ProfileReader and the academic profile setup form. Missing profile
  integration keeps academic access blocked.
- Frontend components: apps/web/src/features/auth.
- tools/auth/local supplies the shared local app and API dispatcher. P001/P002
  canonical overlays are detected when npm run dev/build/typecheck/test starts.
- Database foundation: the 26-entity baseline is applied and SQL-validated on the
  confirmed Neon development branch; see docs/database/README.md for evidence.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npx.cmd playwright install chromium
npm.cmd run test:ui
```

With local servers running, `npm.cmd run test:init-http` exercises real HTTP body handling.
test:ui uses explicitly mocked Clerk/API responses. The five optional live database
tests require AUTH_TEST_DATABASE_URL and use temporary tables rather than persistent
test accounts.

The baseline passed a fresh npm ci, 47 unit tests, 11 mocked browser checks, lint,
typecheck and module/Vite builds. Five live Neon tests and ten real HTTP regressions
passed separately. The user also reported passing signup/domain, logout/sign-in,
privileged-page denial and account-idempotency checks. Peer review remains pending.

## Team documentation

- [Database foundation and execution gate](docs/database/README.md)
- [Paste-in P001/P002 routing integration](docs/integration-copy-paste.md)

- [Sprint 1 ownership and requirements](<docs/sprint1 (1).md>)
- [Mandatory implementation workflow](docs/implementationguide.md)
- [Shared theme guide](docs/themeguide.md)
- [Contributing](CONTRIBUTING.md)
- [Local setup](docs/p004-local.md)
- [Auth API, schema and integration handoff](docs/p004-auth-handoff.md)
- [P004 delivery summary](docs/p004-pr.md)
- [Change records](docs/changes)
