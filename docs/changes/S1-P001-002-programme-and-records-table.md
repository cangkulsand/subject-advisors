# S1-P001-002 — Programme-only profile and curriculum records table

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up (authorized P001 scope)
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator reviewed the P001 implementation minis; human peer review pending

## 1. Plan

### Objective / problem

Let students choose a programme without exposing curriculum versions, then show
all subjects in the internally resolved curriculum in a native table. Each row
offers mutually exclusive Taken and Exempted checkboxes, initially blank. Grade
editing remains a separate later step. Preserve the existing owner, curriculum,
  credit, exemption and remarks rules; the newly approved one-current initial
  record policy is recorded below.

### Scope and requirements

- In scope: P001 profile UI programme-only selection with the existing profile
  API and internal `curriculumId` payload. The curriculum-wide subject table
  and row-level outcomes are planned separately under change S1-P001-005.
- Out of scope: PDF upload/extraction, semester configuration/offerings, grade
  editing in the table, new academic statuses, migrations/live DB writes, other
  programmers' features, commit/push, and private professor repository.

### Current behavior and intended behavior

- Profile options currently return all active curricula; the UI exposes both
  Programme and Curriculum selectors and submits `curriculumId`.
- Approved for this mini-task: do not change APIs/contracts. Derive visible
  programmes from active curriculum options; choose a sole curriculum
  internally. For an existing profile, retain its saved curriculum when it is
  still among the selected programme's active options, even if other versions
  exist. Otherwise, ambiguity produces a student-friendly configuration message
  and blocks save; never choose first/latest or expose a version selector.
- Programme selection itself participates in dirty/cancel tracking, including
  when an ambiguous selection has no resolvable internal curriculum ID.
- The current profile options return all active curricula and subjects for the
  student's resolved curriculum. The existing RecordsPage is still an attempt
  form; the records table integration is tracked separately in
  `S1-P001-005-records-table-integration.md`.
- Intended UI hides curriculum versions, lists every subject for the resolved
  curriculum in a semantic HTML table, and has unchecked-by-default mutually
  exclusive Taken/Exempted controls. Blank is no reported outcome, not a new
  stored status. Existing `COMPLETED`, `EXEMPTED`, `FAILED`, and `WITHDRAWN`
  statuses and derived/validated credit rules remain authoritative.
- Approved records policy: initial records are private to the signed-in student
  and allow one current row per student/subject, created undated. Taken maps to
  `COMPLETED`; Exempted maps to `EXEMPTED` and still requires recognized credits
  (zero allowed) and an explanation. Existing outcomes, grades, remarks and
  legacy record versions remain preserved. Clearing a saved selection requires
  explicit confirmation before deletion; clearing an unsaved selection is local.
  Multiple legacy rows for a subject remain read-only pending reconciliation.

### Proposed implementation

- This mini-task: `apps/web/src/features/profile/ProfilePage.tsx`, a focused
  profile programme-resolution helper/test if useful, and profile UI checks in
  `tools/p001/test-ui.mjs`. Keep current API contracts, validation, cache
  invalidation, setup redirect and internal `curriculumId` payload unchanged.
- Records-table integration is a separate bounded change; it consumes the
  current profile options and records contracts, keeps grades in a separate
  details editor, and does not implement semester or PDF work.

### APIs / database / cross-programmer impacts

- Current profile write accepts `curriculumId`; preserve this contract and
  resolve the selected programme to that ID in the UI only under the approved
  rules. Current options remain `{ curricula, subjects, semesters }`.
- Existing records may contain legacy attempts. New current records are
  one-per-student/subject and undated; new changes update the exact existing row
  without changing subject or semester identity. `COMPLETED` credits derive from
  configured subject credits; `EXEMPTED` supports zero or partial recognized
  credits and requires remarks; failed/withdrawn credits are zero.
- No schema migration is proposed. Existing grade/remarks/semester values must
  not be silently overwritten. Multiple legacy rows remain visible/read-only
  with a reconciliation explanation; P003's record contract stays unchanged.

### Acceptance criteria

- [ ] Profile UI presents programme choices only and resolves the existing
  curriculum ID internally under the approved safe rules.
- [ ] Records UI displays every subject in the resolved curriculum in a native
  table; Taken and Exempted controls are mutually exclusive and initially blank.
- [ ] Existing data is represented without loss or incorrect status/credit
  projection; multiple legacy rows are not merged or arbitrarily selected.
- [ ] A saved selection clears only after explicit delete confirmation, and
  unsaved selections clear locally. Updates preserve grades/remarks unless the
  student explicitly edits them.
- [ ] Writes remain authenticated, owner-scoped, curriculum-validated and enforce
  one current initial row per student/subject with existing credit/status rules.
- [ ] Cache invalidation, keyboard labels, loading/error/empty states and mobile
  table usability are covered by focused checks.

### Verification plan

- After decisions and implementation: P001 strict typecheck/lint/build and unit,
  route, validation, cache and mocked UI checks; run only approved rollback-only
  repository checks if needed. Record actual commands/results in this record.
- Profile resolution cases are covered in the previous mini-task. Records UI
  verification is planned in `S1-P001-005-records-table-integration.md` for
  blank outcomes, toggles, create/update/delete confirmation, persisted detail,
  legacy statuses/duplicates, student isolation, failures and responsive use.

### Risks / assumptions / rollback

- **Resolver decision for profile UI approved:** preserve an existing saved
  curriculum when still valid for that selected programme; otherwise resolve
  only a sole active option. Ambiguous new selections block save with a clear
  configuration message. This does not define a universal canonical version or
  change the API.
- **Records policy resolved:** initial records are one current row per student
  and subject, with explicit Taken/Exempted mapping; saved clears require
  confirmation; legacy duplicates are read-only. Preserve all existing statuses
  and metadata. These decisions do not authorize automatic cleanup or migration.
- **Rollback:** revert only this P001 feature diff; no migration or database
  mutation is planned. Preserve existing saved attempt rows.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/web/src/features/profile/ProfilePage.tsx`,
  `apps/web/src/features/profile/programme-resolution.ts`,
  `apps/web/src/features/profile/programme-resolution.test.ts`, and
  `tools/p001/test-ui.mjs`.
- **Summary:** Hid curriculum selection and all curriculum-version copy from
  profile UI. Programme options remain derived from active curriculum options.
  Existing valid programme/version pairs retain the saved internal ID; a new
  programme with one active option resolves to that ID, while ambiguous choices
  show a configuration message and disable save. Programme is included in dirty
  and cancel tracking. API payload, profile validation, cache behavior and setup
  redirect remain compatible.
- **Decisions / deviations from plan:** Applied approved
  compatibility-preserving programme-resolution behavior above. Records
  semantics were implemented in the separately tracked S1-P001-005 through
  S1-P001-010 records changes. Those later user decisions supersede the interim
  zero/partial EXEMPTED credit and required-explanation assumptions retained in
  this plan's historical text.
- **Migrations / env / shared contracts:** None changed.

## 3. Review

- **Self-review checklist:** Profile-only scope; no API/schema/cache behavior or
  other owner files changed. Existing guards, validation and setup redirect
  preserved. Ambiguous configuration fails closed. Keyboard labels and current
  form behavior remain covered by the mocked UI suite.
- **Test evidence:**
  - `node tools/p001/test-ui.mjs` — PASS, 21 mocked-browser checks.
  - `node node_modules/typescript/bin/tsc -p tsconfig.p001.json` — PASS.
  - Focused ESLint on the changed component/helper/test and UI harness — PASS.
  - Focused Vitest for programme resolution — PASS, 4 tests.
  - `node node_modules/vite/bin/vite.js build --config vite.p001.config.ts` — PASS.
  - `git diff --check` — PASS.
  - No live database query or write was performed.
  - Session verification: root unit suite PASS (260 passed, 13 optional database
    checks skipped); generator suite PASS (6); root typecheck/lint and API plus
    frontend builds PASS as reported by the implementation workers. Latest
    `node tools/p001/test-ui.mjs` PASS, 34 checks including toast animation,
    five-second dismissal, reduced motion and independent Undo. The integration
    browser suite passed 24 checks before the toast-specific update.
- **Manual checks:** Initial inspection read current source/contracts/schema and
  dated development inventory.
- **Defects found and fixes:** Replaced the curriculum selector and text with
  programme-only copy; save now blocks unresolved ambiguity. No API or database
  changes were necessary.
- **Review outcome:** PASS — SELF-REVIEW; coordinator reviewed the profile and
  subsequent records implementation minis. Human peer review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Changed; Tests
- **Added / Changed / Fixed:** Profile setup/edit now displays programme only,
  resolves a safe internal curriculum ID under approved rules, and blocks
  ambiguous new selections. Added resolution unit tests and updated mocked UI
  coverage for setup, ambiguity, saved-version retention and cancel behavior.
- **Affected routes / tables / consumers:** Profile UI only; existing
  `/api/profile` and `/api/profile/options` contracts remain unchanged.
- **Breaking changes / migration steps:** None. No database schema or data
  changes.
- **Verification summary:** 21 mocked browser checks, 4 focused resolver tests,
  P001 typecheck, focused lint, P001 frontend build, and `git diff --check` all
  passed. Session checks also passed: root unit 260 with 13 optional database
  skips; integration generator 6; reported root typecheck/lint and both builds;
  latest P001 browser suite 34. Integration browser suite was 24 before the
  toast update. No live database access.
- **Outstanding blockers / follow-up:** No profile blockers remain. The
  records UI is completed in S1-P001-005 through S1-P001-010; human peer review,
  real-account acceptance and production publication remain pending.
- **Final status:** READY_FOR_REVIEW — profile and records session implementation
  is coordinator-reviewed; human peer review pending.
