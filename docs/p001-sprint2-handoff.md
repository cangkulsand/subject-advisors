# P001 Sprint 2 UC05 and UC06 handoff

Status: READY_FOR_REVIEW. Implemented and self-reviewed; independent peer review and real-account acceptance are pending. This package requires the supplied shared main project and P001-Sprint1.zip already installed. It is not a standalone replacement project.

## Included scope

UC05 / FR-A5 reads the current student's existing curriculum and subject history. It displays accumulated/remaining credits, completed and exempted credits separately, credit percentage, completed/exempted subjects, outstanding compulsory subjects and read-only progress for existing requirement groups. Failed/withdrawn attempts contribute zero. Retakes never multiply one subject's credits. A zero-credit exemption satisfies the subject without adding earned credits. Unknown or incomplete configuration is visibly flagged.

UC06 / FR-B1, B2, B4, B5 and B7 supports an authenticated active SYSTEM_ADMIN managing subjects in an existing curriculum. The administrator can create a catalogue subject, attach an existing catalogue subject, edit subject metadata and mapping classifications, configure permitted Normal/Short semester types, and add/edit/remove mandatory, co-requisite or advisory relationships. Saves require an explicit review step. Backend validation rejects self links, out-of-curriculum links, duplicates and mandatory cycles. Concurrent/co-requisite and advisory relationships are not treated as sequential prerequisites.

Only UC05 and UC06 are newly implemented. UC07 graduation-requirement editors, total required credits and semester-load configuration are absent. Existing compulsory flags and classifications are managed as subject mappings under UC06; existing graduation thresholds are read under UC05. No graduation eligibility decision (UC13), eligibility/recommendation engine, forecasting, user management, automatic English-chain inference or official academic data import is included.

## Install without replacing other programmers' work

1. Extract the ZIP outside the existing project first.
2. Run the extracted `tools/p001-sprint2/verify-handoff.mjs --project <existing-project> --preflight`. This detects collisions and checks the required shared/Sprint 1 source files without editing anything.
3. Merge the ZIP contents into the existing project root. Merge directories, not entire-folder replacement. All manifest-listed payload files are new. Review any collision manually.
4. From the project root run:

```powershell
npm.cmd ci
node tools/p001-sprint2/verify-handoff.mjs
node tools/p001-sprint2/check.mjs
node tools/p001-sprint2/dev.mjs
```

On macOS/Linux use `npm` instead of `npm.cmd`. Node 22.12+ and the existing project dependencies/lockfile are required. No dependency version or root npm script is changed. No migrations or seeds are shipped. The existing canonical foundation schema must already be applied.

Use the Sprint 2 launcher above; the original `npm run dev` remains unchanged and does not register these new routes. Stop another launcher using ports 5173/8787 first. Ctrl+C stops both local services. The preview also reuses the real Sprint 1 profile/records screens. Other shared student pages delegate to their existing components and remain incomplete if their owner code is absent.

## Private settings and roles

Reuse `.env.local` with `VITE_CLERK_PUBLISHABLE_KEY` and `.dev.vars` with matching backend Clerk keys and `DATABASE_URL`. These files are not included or modified. The dedicated Wrangler configuration supplies authorized localhost origins. Secrets stay on the backend.

- STUDENT: visit `/student/progress` after profile setup; only the server-verified Clerk user's data is queried.
- SYSTEM_ADMIN: visit `/admin/curriculum`. The account must already have an active administrator assignment from the existing access system. This package never grants roles or bypasses Clerk.
- Coordinators and students cannot access curriculum management. Administrators do not obtain access to individual student progress through UC06.

Existing programme/curriculum versions are prerequisites. If none exist, ask the foundation/configuration owner to provide approved records. UC06 can then populate subjects and relationships. No fictional catalogue is seeded into the application.

## Rules and conservative interpretations

- Curriculum total required credits and requirement thresholds come from existing configuration. Missing/nonpositive totals produce no percentage or remaining-credit claim. No fixed UTM credit total is assumed.
- Per subject, a valid completed attempt takes precedence; otherwise the maximum recognized exemption credits are counted once. Failed/withdrawn attempts cannot remove an earlier valid completion. Exemptions require explicit credits and an explanation, consistently with P001 Sprint 1.
- Requirement type `COMPULSORY` uses the compulsory mapping flag. Other types match the mapping classification exactly after trimming/case normalization. Both configured subject and credit thresholds must be met. Unmatched groups or groups without thresholds are unassessed, never silently passed. This grouping convention is documented because the existing schema has no richer requirement-to-subject association.
- Subject code/name/credits are global catalogue fields, shared across curricula. Editing requires acknowledgment of that scope. Existing foundation triggers reject credit changes affecting recorded student/imported history; no historical reconciliation is performed. Subject mappings are not deleted, avoiding orphaned history. Dependency relationships can be removed.
- Per-subject semester types are explicit. Two-credit short-semester restrictions and FYP1 normal-semester exceptions must be configured using verified rules. No subject's semester restriction is inferred solely from credit value. Configure the verified English 1 → English 2 → English 3 chain through two mandatory links. No assumptions about which real subject codes represent these courses are made.
- Mandatory cycles are checked by the application and existing PostgreSQL trigger. Co-requisite reciprocity and advisory relationships are allowed. This package stores the rules; it does not implement P002 subject eligibility or P003 scheduling.
- Curriculum snapshots include a revision. The backend checks it inside the transaction after locking before writing. Stale saves return 409 and leave saved data unchanged. Multi-query writes share one Neon transaction, and database errors roll back the whole change.

## API contracts

Responses use `{data:T}` or `{error:{code,message}}`, private no-store headers and backend Clerk authorization. User IDs and roles are never accepted from request bodies. All routes are under `/api/p001-sprint2`.

| Method | Route | Role and operation |
| --- | --- | --- |
| GET | `/progress` | STUDENT with completed setup: own progress |
| GET | `/curricula` | SYSTEM_ADMIN: existing curriculum options and global subject catalogue |
| GET | `/curricula/:id` | SYSTEM_ADMIN: curriculum snapshot and revision |
| POST | `/curricula/:id/subjects` | SYSTEM_ADMIN: create/attach mapped subject |
| PUT | `/curricula/:id/subjects/:mappingId` | SYSTEM_ADMIN: edit subject and mapping/semester types |
| POST | `/curricula/:id/dependencies` | SYSTEM_ADMIN: create relationship |
| PUT | `/curricula/:id/dependencies/:linkId` | SYSTEM_ADMIN: edit relationship |
| DELETE | `/curricula/:id/dependencies/:linkId` | SYSTEM_ADMIN: remove relationship |

All write bodies require the snapshot `revision`. Subject input has optional `existingSubjectId`, `code`, `name`, integer nonnegative `credits`, `category`, boolean `compulsory`, and a nonempty distinct array of `NORMAL`/`SHORT` in `semesterTypes`. Updates require `confirmSharedChanges:true`. When attaching an existing global subject, its metadata is read from the catalogue instead of overwritten. Dependency input uses mapping IDs `from` (dependent subject), `required` and `kind` (`MANDATORY`, `COREQUISITE`, `RECOMMENDED`). Deletion input contains only `revision`.

Error status: 400 input/relationship validation, 401 expired/invalid identity, 403 role/setup/access denial, 404 missing resource, 405 unsupported operation, 409 duplicate/stale/integrity conflict, 413 oversized body, 503 service unavailable. Errors hide database/provider internals.

## Shared application integration

No existing shared router, shell, auth module, environment file, npm manifest or Sprint 1 file is replaced. The supplied adapter in `tools/p001-sprint2/local/api.ts` composes the two new handlers with the existing integration dispatcher, passing the same real ProfileReader-backed authorization dependencies.

For the integration lead to register these routes in another shared Worker, import `createSprint2Dependencies` and `handleSprint2Request` from `apps/api/src/modules/p001-sprint2`. Call the handler before the shared fallback dispatcher; it returns `null` for all unrelated routes. Reuse `deps.auth` for `/api/me` and the existing dispatcher so setup status stays consistent. Do not bypass the handler's backend authorization.

On the frontend register `/student/progress` with `Sprint2Routes area="progress"` and `/admin/curriculum` with `Sprint2Routes area="curriculum"`, or place the exported ProgressPage/CurriculumPage inside the shared shell using the same backend role guards and a memoized `createSprint2Client(getToken)`. Add navigation through a small reviewed shared change; no older shared-file snapshot is included for blind replacement.

## Verification actually performed

- `node tools/p001-sprint2/check.mjs`: typecheck, lint, 153 unit/route/client regression tests, frontend build and Worker bundle passed. Five optional historical live auth-database tests skipped. 45 tests are new to this package; 108 are the supplied existing suite.
- `node tools/p001-sprint2/test-ui.mjs`: 22 browser checks passed with simulated Clerk/API; includes review-before-write, permission denial, stale/error/cancel states, relationship types, deletion, mobile/desktop layouts, keyboard focus and 200% zoom. Test screenshots are labeled DEMO / NOT OFFICIAL.
- `node tools/p001-sprint2/test-db.mjs`: 16 actual PostgreSQL query/trigger/transaction checks passed in a fresh isolated in-memory PGlite database with the existing canonical schema. Covers owner isolation, retakes, zero-credit exemptions, subject/mapping/semester writes, stale changes, duplicate rollback, mandatory cycles, co-requisites, cross-curriculum rejection, shared metadata and protection of historical credits. No live Neon connection was made. This does not verify competing writes across independent database sessions.
- Desktop/mobile screenshots visually inspected. Handoff integrity, collision and fresh extracted-package installation checks are recorded in the change record.

Optional database-test runtime is isolated and is not an application dependency:

```powershell
npm.cmd install --prefix .verification-runtime --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.14
node tools/p001-sprint2/test-db.mjs
```

For browser checks install the matching test browser with `node node_modules/playwright/cli.js install chromium --only-shell`, then run the UI script. If using a custom browser-cache folder, set `PLAYWRIGHT_BROWSERS_PATH` consistently for installation and test execution.

Real Clerk + Neon acceptance, production database service permissions, independent-session concurrency and human peer review remain pending. No real account, academic records, role assignments or remote database were modified by these checks. This handoff is not a production deployment or a peer-approved merge.

## Rollback

Remove only the additive files listed in `p001-sprint2-handoff-manifest.json` and the manifest itself after reviewing your own subsequent changes. Do not delete entire shared folders or reset the database. Since no migration or shared-file replacement is shipped, no database rollback or shared-source restoration is needed. The unchanged original launcher remains available.
