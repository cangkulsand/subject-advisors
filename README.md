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
| P003 (on P001 UC06) | UC24 create subject with zero or more initial prerequisites, saved atomically; admin Curriculum & Prerequisites page (`/admin/curriculum`) with Create Subject / Manage Prerequisites tabs; the `/api/p001-sprint2/curricula*` routes are in the shared router (SYSTEM_ADMIN) | S2-P003-005, S2-P003-006 |
| P001 | UC05 progress and UC06 curriculum mapping overlay launched with `node tools/p001-sprint2/dev.mjs`; UC05 progress is not yet in the shared router (UC06 curriculum maintenance is, via UC24 above) | S2-INT-002 (S2-P001-001..002) |

Subject names are English; see `db/reference-data/subject-english-names.csv`.

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
