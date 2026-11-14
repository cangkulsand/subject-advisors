# S2-P003-005 - Create subject with initial prerequisites

- Status: MERGED to `main` (2026-11-14); human peer review pending. Before merge: READY_FOR_REVIEW (PASS SELF-REVIEW; lead diff review complete, human approval pending)
- Date: 2026-11-12
- Owner: Harraz / P003, Sprint 2, functional module M2
- Requirements: UC24, FR-B8; shared FR-B1/B2/B5 boundary with UC06
- Source: UTMSPACE_SRS_SDD_v2.3 (10 Nov).docx, section 2.2.24,
  plus the user's request for prerequisite search and code validation.
- Branch: feature/uc24-create-subject; merged into `main` on 2026-11-14 (merge commit 3fcc9fe), no PR
- Human peer review: Pending

## 1. Plan

### Current And Intended Behaviour

The P001 Sprint 2 overlay already creates subjects and manages dependencies, but
creation has no initial-prerequisite selection and is not connected to the
integrated administration workspace. Add UC24 to the existing curriculum page:
create a subject in an existing curriculum with zero or multiple mandatory
prerequisites, review the complete draft, then persist everything atomically.
Preserve existing UC06 maintenance and catalogue reuse.

### Implementation Design

- Extend the existing subject POST contract with optional `prerequisites`,
  defaulting to an empty array for existing callers. Each selection contains
  `mappingId` (curriculum-subject identity) and its canonical `code`.
- Validate array shape, positive IDs, duplicate selections, curriculum membership
  and exact canonical code correspondence on the server before writing. Never
  resolve free-text prerequisite names/codes to arbitrary records.
- Save subject, mapping, semester rules and mandatory prerequisite edges in the
  existing revision-guarded transaction. Recheck selected identities/codes against
  database rows inside the transaction; invalid references must fail the whole
  save, not be silently skipped. Retain existing graph-integrity triggers.
- Add a case-insensitive code/name search over the chosen curriculum's subjects,
  explicit multiple selection/removal, a visible selected list and an explicit
  no-prerequisites state. Search text alone is never a saved prerequisite. Resolve
  or clear an outstanding search before reviewing to avoid accidental omissions.
- Review shows the canonical names/codes of every prerequisite. Cancellation
  writes nothing. Errors preserve the draft; changing curriculum clears it only
  after the existing discard confirmation.
- Connect `/admin/curriculum` inside the existing admin shell and register its
  authenticated `/api/p001-sprint2/curricula` resources in integrated services.
  Do not expose student progress as part of this change.
- Preserve the established visual language; consume typography tokens, show
  subject name before code and run the readability guard. Use a searchable
  selection list rather than introducing a filterable table.

### Files And Compatibility

Expected edits: P001 Sprint 2 contracts/validation/repository/routes and curriculum
UI/client/styles; minimal admin-route/integration generator/router registration;
focused API, repository, client, generator and browser tests; this change record.
Reuse existing schema, authentication and graph constraints. No new dependency
or migration is planned. Existing subject PUT and catalogue attachment semantics
must remain compatible; initial prerequisites are creation-only.

The exposed execution tools do not offer a `gpt-6-luna` model override. Use the
available delegated-execution fallback without changing the selected main model.

### Acceptance And Verification

- Only active SYSTEM_ADMIN users can create subjects or read this admin catalogue.
- Create with zero, one and multiple prerequisites; selected identities and codes
  match actual subjects in the chosen curriculum.
- Reject duplicate/malformed IDs, mismatched codes, missing/out-of-curriculum
  prerequisites, invalid fields, duplicate subject codes and stale revisions.
- Initial prerequisites are mandatory, not co-requisites/advisory links. Existing
  UC06 dependency editing/cycle validation remains intact.
- Real isolated PostgreSQL checks prove full persistence and rollback on invalid
  references, duplicates and a failed later write; no live database is touched.
- Browser checks cover the integrated route, code/name search, multi-selection and
  removal, unresolved search, review/cancel, errors, keyboard use and mobile.
- Run targeted Vitest tests for affected modules, integration-generator tests,
  typecheck, lint, Cloudflare build, relevant admin/browser checks and
  `git diff --check`. Retain logs/screenshots in ignored verification locations.

### Risks, Assumptions And Rollback

Existing curricula and official subject data must already exist. Do not infer
academic policy or enforce a new institutional subject-code pattern. Canonical
prerequisite codes come from stored subjects, not typed guesses. Live Clerk/Neon
and multi-session concurrency acceptance are separate from fixture/local checks.
Rollback is a reviewed reversal of this change's edits only.

Out of scope: UC25 programme creation, UC07 rules, student registration/offerings,
new catalogue seeds, production writes/deployment, commits or pushes.

## 2. Implementation

Implemented as planned on `feature/uc24-create-subject` (no `gpt-6-luna`
override exposed; executed with the available delegated fallback).

- `apps/api/src/modules/p001-sprint2/contracts.ts` — new
  `PrerequisiteSelection { mappingId, code }`; `SubjectInput.prerequisites?`
  optional so legacy callers are unaffected.
- `validation.ts` — `prerequisites` allowed only on create; strict array of
  `{mappingId, code}` objects, positive IDs, code text max 20, duplicate mapping
  IDs rejected; PUT with the field rejected. New `validatePrerequisites` matches
  each selection to a snapshot subject by mappingId **and** canonical code.
- `routes.ts` — subject POST validates selections against the current snapshot
  before `repository.subject`; PUT unchanged.
- `repository.ts` — creation inserts all initial `MANDATORY` edges inside the
  same revision-guarded transaction (`jsonb_to_recordset` left-joined to live
  `curriculum_subject`/`subject` rows; unresolvable references fail and roll
  back — the foundation integrity trigger raises `23514`). `databaseError`
  maps `23502` to `INVALID_PREREQUISITE` (400) as a backstop. Works for both
  new-subject and catalogue-reuse creation paths.
- `apps/web/src/features/p001-sprint2/client.ts` — thin wrapper delegating to
  the shared `createAcademicClient` (`'/api/p001-sprint2' + path`, optional
  `baseUrl`), inheriting session fencing and cache invalidation.
- `CurriculumPage.tsx` — creation form retitled "Create subject (UC24)" vs
  "Edit existing subject (UC06)". Creation-only prerequisite block:
  case-insensitive code/name search over the curriculum's mapped subjects,
  explicit Add/Remove buttons, selected list, "No prerequisites" state, name
  primary + muted code secondary. An outstanding non-empty search blocks
  review with an explanatory error; search text is never submitted. Review
  and success messages list the full draft — name, code, credit hours,
  category, compulsory flag, programme/curriculum, semesters and every
  selected prerequisite (or explicit none); catalogue-attach shows the real
  catalogue row. Pre-review validation checks required fields, nonnegative
  integer credits, at least one semester type and that selections still
  match the snapshot. Subject lists, catalogue options and relationship
  labels are name-first per the theme guide. Selection and search clear on
  reset/cancel/success/curriculum switch/entering edit; errors preserve the
  draft. Client also blocks a duplicate catalogue code.
- `sprint2.css` — `.s2-picks` result/selection list styles using typography
  tokens; rows stack (full-width name and 44px button) at ≤400px; `.s2-code`
  token style applied to the subject list; list, not a table.
- `apps/web/src/features/admin/AdminRoutes.tsx` — `/admin/curriculum` now
  mounts `CurriculumPage` inside `AdminShell` via memoized
  `createSprint2Client(getToken, apiBase)`; `/admin/requirements` stays
  planned. Header title "Curriculum & Prerequisites".
- `apps/api/src/integration/router.ts` — optional `curriculum` feature
  handler for `/api/p001-sprint2/curricula` and descendants only (student
  progress stays unexposed); absent feature still fails closed after a real
  SYSTEM_ADMIN authorization check.
- `tools/integration/prepare.mjs` — `curriculumApi` discovery on
  `p001-sprint2/index.ts`; generated services import
  `createSprint2Repository`/`neonDatabase` plus `handleSprint2Request` and
  reuse the shared `auth` (no auth reconstruction, invitations untouched).

## 3. Review

Evidence (all on this branch, uncommitted; logs and screenshots in
`.wrangler/uc24-review/`):

- `node node_modules/vitest/vitest.mjs run apps/api/src/modules/p001-sprint2/sprint2.test.ts apps/api/src/integration/router.test.ts apps/web/src/features/p001-sprint2/client.test.ts` —
  98/98 pass (`vitest.log`): UC24 validation, route auth including
  suspended/unauthenticated/coordinator POST denial, mappingId-vs-subjectId
  rejection, atomic-contract, dispatch/absent-feature, and client
  base/token/session-fence/cache-invalidation/error tests.
- `node --test tools/integration/prepare.test.mjs` — 11/11 pass, including
  `curriculumApi` present/absent discovery.
- `P001_S2_PGLITE_MODULE=node_modules/@electric-sql/pglite/dist/index.js node tools/p001-sprint2/test-db.mjs` —
  25/25 pass on isolated in-memory PGlite (`test-db.log`): multi-prerequisite
  atomic save; zero-prerequisite save; missing/foreign/mismatched reference
  rollback of subject+mapping+semester rules; late trigger failure rollback;
  duplicate-edge rejection; stale create leaves snapshot/catalogue
  unchanged; catalogue reuse shares the subject ID and persists edges. No
  live database touched. PGlite provisioned into `node_modules` only —
  `package.json`/lockfile unchanged.
- `PLAYWRIGHT_CHANNEL=msedge node tools/p001-sprint2/test-uc24-ui.mjs` — 8/8
  pass (`test-uc24-ui.log`) against real `AppRoutes` + Clerk/API fixtures:
  code and name search, duplicate avoidance, two-prerequisite save, exact
  review contents (name, credits, both prerequisites), empty prerequisites,
  unresolved search and real cancel never write, STALE_CURRICULUM failure
  preserves draft/selection, duplicate code, curriculum switch clears,
  keyboard selection, edit mode excludes prerequisites, incomplete drafts
  never reach review, stacked pick rows with ≥120px name width and no
  overflow at 320/390px, `assertReadable` on every check. Screenshots:
  `uc24-created.png`, `uc24-mobile-320.png`, `uc24-mobile-390.png`.
- `PLAYWRIGHT_CHANNEL=msedge node tools/admin/test-ui.mjs` — 45/45 pass
  (unchanged assertions still hold; the planned-destinations check verifies
  the real curriculum page and `/api/p001-sprint2/curricula` request while
  requirements stays planned).
- `npm run typecheck` (`typecheck.log`), `npm run lint` plus explicit
  `eslint tools/p001-sprint2` (`lint-final.log`, both exit 0 — earlier
  no-unused-vars findings in `test-uc24-ui.mjs` were fixed before this
  capture; `lint.log` retains the superseded run), `npm run build:cloudflare`
  (`build-cloudflare.log`), `git diff --check` — all clean (build emits only
  the pre-existing chunk size warning).
- `npm test` — full suite 1435 passed / 55 skipped / 0 failed
  (`npm-test.log`).

Limitations: fixtures/mock Clerk only — no live Clerk, Neon or shared
database was touched; multi-session concurrency not tested; the `23502`
mapping is a backstop (the foundation trigger reports unresolvable
references as `23514`/`CURRICULUM_CONFLICT` first). Lead diff review:
PASS SELF-REVIEW; human peer approval pending.

## 4. Changelog

- UC24: create subject in a curriculum with zero or multiple initial
  mandatory prerequisites, validated against canonical subject codes and
  persisted atomically with the subject, mapping and semester rules.
- Integrated `/admin/curriculum` in the admin shell and registered the
  authenticated `/api/p001-sprint2/curricula` route family in integrated
  services (`curriculumApi` discovery).
- Tests added across API validation/routes/repository contract, isolated
  PostgreSQL, integration generator/router, admin UI and a new integrated
  UC24 browser harness (`tools/p001-sprint2/test-uc24-ui.mjs`).

- 2026-11-14 - Merged into `main` by P004 (merge commit 3fcc9fe). One conflict in `apps/web/src/features/admin/AdminRoutes.tsx` resolved by keeping the Departments page (S2-P004-025) and adding `/admin/curriculum`. Checks after merge: typecheck, lint, unit tests (1519 passed, 63 skipped), integration (11 passed), build, admin browser checks (48 passed, system Chrome via `PLAYWRIGHT_CHANNEL=chrome`). Status: MERGED; human peer review pending.
