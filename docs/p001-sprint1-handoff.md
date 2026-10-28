# P001 Sprint 1 manual handoff â€” UC03 and UC04

Status: implemented and coordinator-reviewed; human peer review pending. Prepublication
checkpoint (2026-10-27): the user authorized one local commit and normal push to
production `main`; neither has occurred. Staging is being prepared for coordinator review.
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
No migration needs rerunning for the branch rename. The canonical 0000â€“0002 schema
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
  zero-credit exemption, conflicts, keyboard focus, 320â€“1440px layouts and 200% zoom.
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

## Current student profile and records behavior (2026-10-27)

The current P001 UI exposes programme selection only. It resolves the internal
curriculum/configuration ID from the active programme catalogue, retains a valid
saved configuration while editing, and blocks saving when a new programme has
multiple applicable configurations. Curriculum versions remain internal.

The Records page presents Core, Computer Science Electives (E1/E2), Elective
Umum (U1/U2), and conditional Other tabs. The labels and choose counts come from
configured subject metadata; the client does not hardcode counts, prevent
truthful recorded outcomes based on a choose rule, or calculate graduation
eligibility. Unknown/uncoded subjects remain available in Other. Taken saves
COMPLETED; Exempted saves using full configured subject credits derived by the
API. Both outcomes autosave without
opening a modal. Grades and remarks are optional and edited later through the
per-row eye-icon modal. Saved records update by exact ID. Unticking an undated
record deletes it and offers inline Undo, which recreates it with a new ID. The
UI does not create retake/semester versions. Dated legacy rows and legacy partial
credit exemptions cannot be cleared because current API semantics cannot restore
their semester/credit data. Existing FAILED/WITHDRAWN records and multiple legacy
rows remain intact; duplicates are read-only pending reconciliation.

Successful record actions use a React-managed stack of up to three fixed green
success toasts. Each has an independent five-second lifetime, concise copy,
manual dismissal and entry/exit animation with a reduced-motion-safe timer
fallback. Informational notifications are blue; warning/danger colors are
reserved for those actual meanings. Save failures remain visible in durable
alerts; the clear Undo control remains available independently of the toast.

The current P001 button standard uses blue `#2563EB` actions with `#1D4ED8` hover
and red `#B91C1C` explicit Cancel buttons with `#991B1B` hover. Burgundy remains
the shell/navigation brand. Shared token guidance is in `docs/themeguide.md`.

The shared academic cache keeps profile and record snapshots in the signed-in tab
session and caches curriculum options for five minutes. Entries are keyed by
session, normalized API base URL, and endpoint. Successful academic writes clear
academic snapshots; failed writes do not. See `docs/cachingguide.md`.

Focused mocked UI verification for this behavior is current in
`docs/changes/S1-P001-005-records-table-integration.md`. Earlier counts elsewhere
in this handoff describe historical P001 overlay checks; they do not replace the
focused results recorded with the current implementation. This current full-credit,
optional-details policy supersedes earlier zero-credit exemption assumptions in
historical P001 test descriptions.

## API contract

All endpoints require P004 verified active STUDENT identity. Record routes also
require completed setup. Bodies never accept clerkUserId, studentId, email or roles.
Responses preserve {data:T} / {error:{code,message}}, no-store and Vary: Authorization.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/profile | Own profile, or data:null for setup |
| PUT | /api/profile | Idempotent own profile save |
| GET | /api/profile/options | Read-only active programme choices, own programme subjects, elective-group rules and optional semesters |
| GET | /api/academic-records | Own saved subject records with subject and semester labels |
| POST | /api/academic-records | Create the student's initial undated current subject record, 201 |
| PUT | /api/academic-records/:recordId | Update that owned record without changing subject/semester identity, 200 |
| DELETE | /api/academic-records/:recordId | Delete one exact owned record after an undated checkbox is unticked, returns `{recordId, subjectId}` |

GET /api/profile/options is a narrow P001 form dependency, not the shared catalogue
management API. It reads existing tables, creates no reference rows, and offers only
active programme choices with applicable configurations. The student profile UI
shows programme choices only; curriculum IDs and versions remain internal. A unique
applicable configuration is resolved internally. Existing saved configurations are
retained when valid; ambiguous new programme configurations block saving with a
student-facing setup message. Subjects reflect the resolved configuration. The API
also returns configured subject group counts and compulsory flags for the elective
and core display; the client does not invent choose counts or enforce graduation rules.

Profile input: studentName, optional matricNo, curriculumId, required currentSemesterId,
weeklyWorkingHours, availableStudyHours. IDs and hours are integers. The semester ID
must reference a configured academic semester; the profile form requires separate
academic-year and semester selections. Profile output adds studentId,
programmeCode/Name, curriculumVersion and timestamps. The schema does not have an
employment-text field; work commitments use the modeled weekly working hours.
Setup completion requires valid name/curriculum, a configured current semester and both
hour values (zero permitted). Existing profiles without a selected semester remain in
SETUP_REQUIRED until the student chooses one; no period is inferred or backfilled.
Optional matric number remains optional. This is an explicit data-entry decision;
legacy nullable hours produce SETUP_REQUIRED, while DB failures produce UNAVAILABLE.

Record input: subjectId, optional semesterId, status, optional grade, recognizedCredits
and optional remarks. COMPLETED and EXEMPTED accept null/omitted recognizedCredits
and derive full subject credits on the server; conflicting supplied values are
rejected. FAILED/WITHDRAWN require zero. Remarks are optional. All entries are
student-reported and unverified.
Lengths follow the dictionary: grade 5, remarks 255; no invented notes/updated_at fields.

Errors: 400 invalid input/reference, 401 invalid session, 403 role/setup/access denial,
404 unavailable/foreign-owned update, 409 duplicate/data conflict, 413 oversized JSON,
405 unsupported method and 503 service unavailability. Error text hides DB/SDK details.

P001 creates one current undated setup record per student/subject; it does not create
semester attempts or retake versions. New Taken records use COMPLETED and new
Exempted records use EXEMPTED. Later edits PUT the same record ID. The API's immutable
subject and semester fields are retained on update. Legacy dated or otherwise older
dated records and legacy partial-credit exemptions remain visible with their actual
status and cannot be cleared here because Undo cannot faithfully restore their
metadata. Multiple legacy rows for a subject are read-only until reconciled. Taken
and Exempted checkbox changes autosave without opening a modal. Undated clears delete
the exact record and offer inline Undo; Undo recreates the same outcome, grade and
remarks with a new ID. Grade and remarks can be edited optionally in a separate modal.
Raw records remain available to P003; P001 does not calculate graduation totals or
decide a graph projection policy. Successful saves/deletes emit
`p001:records-changed`; consumers should refetch when returning to their view.

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

Historical note: the original P001 inspection found the shared Tailwind shell absent.
The current P001 pages use scoped semantic CSS and consume shared theme variables
where available; they do not install or rewrite a design-system package.

## Delivery and rollback

Historical note: the initial P001 overlay added new files. The current follow-up also
modifies existing pages, contracts, tests and handoff files. Use the per-mini-task
change records to review/revert only scoped work; do not delete whole apps/tools
directories, overwrite concurrent owner changes, or reset the database. No down
migration or destructive cleanup is supplied. Review the current P001-002 through
P001-007 change records before integration.
Prepublication checkpoint (2026-10-27): no commit, push, PR, deployment or
privileged-user provisioning had been performed. The user's authorization applies
to the production `main` target documented in
`docs/changes/S1-INT-012-p001-session-publication.md`; human peer review remains
pending. Fresh remote verification could not authenticate and must happen before
the normal push.
