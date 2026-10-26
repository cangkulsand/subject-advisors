# P001 Sprint 1 manual handoff — UC03 and UC04

Status: implemented and self-reviewed; human peer review pending. No commit/push.
The handoff is an additive project overlay, containing only new P001 files.
No shared P004 files, package manifests, migrations, credentials or other owners'
modules are replaced. Use the updated main shared router before pasting this version. npm run dev and
node tools/p001/dev.mjs now run the same shared profile/records/offerings app.

## Paste into the project

1. Update the existing project to main with S1-INT-001 shared routing, then extract
   P001-Sprint1-integrated.zip to a temporary folder.
2. In the existing project, preserve your current changes. Before copying, run
   the extracted tools/p001/verify-handoff.mjs with --project pointing to your
   project and --preflight. It checks collisions without editing anything.
3. Copy the extracted contents (apps, docs, tools, P001 config files and manifest)
   into the existing project root. Merge directories; do not replace whole folders.
4. Run `node tools/p001/verify-handoff.mjs` from the project root. Any differing
   existing P001 file must be reviewed manually, not overwritten blindly.
5. Run the checks and preview below, review the diff, then the developer can commit
   and push only the reviewed P001 files through the team's normal process.

The manifest identifies the inspected base revision and hashes. Changes in existing
auth/config files are reported for compatibility review; those files are never copied
over by this package. This handoff requires the existing P004 auth source and root
dependencies. Node 22.12+ and the project's npm lockfile are required.

## Run

From the existing project root:

```powershell
npm.cmd ci
node tools/p001/verify-handoff.mjs
node tools/p001/check.mjs
node tools/p001/dev.mjs
```

Open http://127.0.0.1:5173. Ctrl+C stops both servers. Stop another local launcher
first if it already uses ports 5173/8787. On macOS/Linux use npm instead of npm.cmd.
Use /student/setup, /student/profile and /student/records. /student opens records.
Existing Clerk sign-in/sign-up and /api/me account state are reused.

Use your existing ignored configuration, supplied privately:

- .env.local: VITE_CLERK_PUBLISHABLE_KEY.
- .dev.vars: matching CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, plus DATABASE_URL.
- The local P001 Wrangler config supplies the two localhost authorized origins.

Neon shared branch name: development, formerly p004-local. Fixed branch ID:
br-shy-cherry-azuzy9v5; project still-waterfall-91972583; database neondb.
No migration needs rerunning for the branch rename. The canonical 0000–0002 schema
is already applied to this target; this package performs no DDL or auto-seeding.
Database foundation source/tooling is supplied by the updated shared main.
Do not apply historical P001/P002/P004 DDL.

No approved curriculum/semester/subject catalogue was seeded. With no configured
curricula the page truthfully asks the maintainer to supply reference data. Browser
and database tests use labeled fictional data, not official UTMSPACE examples.
Do not treat that empty-data state as an authentication failure.

## Test commands and actual results

- `node tools/p001/check.mjs`: PASS strict typecheck, lint, unit/route/client tests,
  frontend production build and Worker bundle. 49 P001 unit/route/client tests pass, alongside the shared auth/integration
  tests. With P001 alone the updated base totals 108 passes and 5 optional
  historical auth DB skips; totals increase when P002 is installed.
- `node tools/p001/test-ui.mjs`: 19 PASS, real Chromium with explicitly mocked
  Clerk/API. Covers setup routing, persisted reload, edits/cancel, failure recovery,
  zero-credit exemption, conflicts, keyboard focus, 320–1440px layouts and 200% zoom.
- `node tools/p001/test-db.mjs --target <approved-target.json>`: 15 PASS against
  the confirmed actual Neon development database, with every fixture rolled back.
  Requires the separate foundation tools/db/migrations.mjs and dev dependency pg.
  Supply dedicated DB_FOUNDATION_URL privately and an approved target file with
  allowRollbackOnlyTests:true. No fallback to app DATABASE_URL is used by this test.
- Profile and records desktop/mobile screenshots were inspected. Review fixtures
  and screenshots are explicitly DEMO / NOT OFFICIAL; see docs/p001-review/.

Do not claim the mock browser suite is real Clerk sign-in. Manual real-account
two-user browser acceptance, full accessibility audit and competing-write concurrency
tests remain pending. Official catalogue content and independent peer review remain
external dependencies. No test changed real profiles or access assignments.

## API contract

All endpoints require P004 verified active STUDENT identity. Record routes also
require completed setup. Bodies never accept clerkUserId, studentId, email or roles.
Responses preserve {data:T} / {error:{code,message}}, no-store and Vary: Authorization.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/profile | Own profile, or data:null for setup |
| PUT | /api/profile | Idempotent own profile save |
| GET | /api/profile/options | Read-only form curricula, own curriculum subjects and configured semesters |
| GET | /api/academic-records | Own attempts with subject and semester labels |
| POST | /api/academic-records | Create a new attempt, 201 |
| PUT | /api/academic-records/:recordId | Update an owned attempt, 200 |

GET /api/profile/options is a narrow P001 form dependency, not the shared catalogue
management API. It reads existing tables, creates no reference rows, and offers only
curricula/programmes with null or ACTIVE status. Subjects reflect the saved curriculum.

Profile input: studentName, optional matricNo, curriculumId, weeklyWorkingHours,
availableStudyHours. IDs and hours are integers. Profile output adds studentId,
programmeCode/Name, curriculumVersion and timestamps. The schema does not have an
employment-text field; work commitments use the modeled weekly working hours.
Setup completion requires valid name/curriculum and both hour values (zero permitted).
Optional matric number remains optional. This is an explicit data-entry decision;
legacy nullable hours produce SETUP_REQUIRED, while DB failures produce UNAVAILABLE.

Record input: subjectId, optional semesterId, status, optional grade, recognizedCredits
and remarks. COMPLETED accepts null/omitted recognizedCredits and derives subject
credits on the server; a conflicting supplied completed-credit value is rejected.
FAILED/WITHDRAWN require zero. EXEMPTED requires explicit recognizedCredits (zero
through configured subject credits) and an explanation in remarks. This explanation
rule is local data-entry validation, not university approval. All entries are unverified.
Lengths follow the dictionary: grade 5, remarks 255; no invented notes/updated_at fields.

Errors: 400 invalid input/reference, 401 invalid session, 403 role/setup/access denial,
404 unavailable/foreign-owned update, 409 duplicate/data conflict, 413 oversized JSON,
405 unsupported method and 503 service unavailability. Error text hides DB/SDK details.

Attempts in different semesters are retained. Duplicate subject+semester and duplicate
undated subject attempts conflict; editing is explicit. Raw attempts are available to
P003; P001 does not calculate graduation totals or decide a graph projection policy.
On successful browser saves the page emits p001:records-changed; consumers should
refetch when returning to their view. There is no persisted duplicate pathway state.

## Shared application integration

The included P001 preview composes existing P004 auth with the real ProfileReader:

```ts
const deps = createP001Dependencies(env);
const response = await handleAuthRequest(request, deps.auth)
  ?? await handleP001Request(request, deps);
```

Import these from apps/api/src/modules/{auth,profile}. Preserve existing auth/session
logic and register P001 routes in the actual shared router when available. Inject the
same deps.auth into /api/me so setup completion is visible to AuthGate.
ProfilePage and RecordsPage take an AcademicClient created with Clerk's getToken.
Setup/profile need STUDENT gating; records need STUDENT plus requireProfile.
The shared preview mounts the real P002 offering UI/API when its canonical overlay
is pasted; its profile guard uses P001's real ProfileReader. Missing owner modules
remain unavailable. No staff implementation, pathway renderer or auth bypass is added.
Preserve shared package.json/.gitignore/router files when copying older P002 overlays;
see docs/integration-copy-paste.md.

The Tailwind/shared shell foundation is absent in the inspected base. P001 uses scoped
semantic CSS fallbacks matching themeguide.md and consumes shared theme variables when
available. No design-system package or shared global CSS is installed/rewritten.

## Delivery and rollback

All source files are new. Remove only files identified by the manifest to revert the
overlay in a review copy; do not delete whole apps/tools directories or reset the DB.
No down migration or destructive cleanup is supplied. Review the change record at
docs/changes/S1-P001-001-profile-and-records.md before integration.
No commit, push, PR, deployment or privileged-user provisioning was performed.
