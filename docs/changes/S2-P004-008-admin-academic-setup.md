# S2-P004-008 — Admin academic setup

- **Status:** MERGED to `main` 2026-11-02 — `main` (with 0007) merged into the branch; 0008 applied and verified on Neon development 2026-11-02; human peer review pending.
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 (coordinator scope and target semester dependency); SRS amendment 2026-11-01, OP11, OP13, FR-H15–H17 and M7 administration; confirmed-offerings rules in S2-P004-006
- **Branch / PR:** `feature/admin-setup-module` (active branch selected for this task; overrides Package A's suggested `feature/p004-s2-admin-academic-setup`); PR not created
- **Reviewer:** Pending

## 1. Plan

### Objective / problem

Provide SYSTEM_ADMIN-controlled academic reference setup required by confirmed offerings: maintain learning centres and faculties, associate programmes to faculties, identify the system current semester, and assign coordinator scope to faculty + programme + learning centre. Preserve auditable history and expose a narrow read boundary that a future forecast `ScopeProvider` can consume. Shared contracts, the web client and database static checks have passed coordinator review. Standalone HTTP handlers and four admin pages are saved; concrete SQL repository, production route wiring and browser verification remain incomplete. The current GPT-6.1-Sol workers stopped with exhausted workspace credits on 2026-11-02; filesystem write access is now enabled.

### Scope and requirements

- **In scope:** learning-centre CRUD with soft deactivation; faculty CRUD with soft deactivation; nullable `programme.faculty_id` assignment; admin semester listing/create/edit and current-semester selection; coordinator assignments tied to account, faculty, programme and learning centre, with removal recorded as `ended_at`; SYSTEM_ADMIN-only API; required reason and append-only audit for every mutation; shared request/response types, OpenAPI, migration/check/tooling updates, admin UI and focused tests.
- **Out of scope:** forecast/offerings implementation or endpoints, profile work, curriculum or graduation-rule editing, student profile changes, student and coordinator pages, production DB, seed/invented institutional reference data, edits to historical migrations, and unrelated admin account detail changes.
- **Ownership boundary:** no files under profile, offerings, or coordinator modules. Keep this package independent from migration 0007 (forecast branch) and migration 0009 (P001 profile branch).

### Current behavior and evidence

- The baseline schema in `db/migrations/0001_initial_schema.sql` has `learning_centre(learning_centre_id, centre_code, centre_name)` with no active flag; `programme(programme_id, programme_code, programme_name, level, status)` with no faculty FK; and `academic_semester` with year, semester number/type, subject/credit limits and nullable dates, but no system-current marker.
- Existing semester checks require `academic_year` in `YYYY/YYYY` format, semester number 1–3, NORMAL for 1/2 and SHORT for 3, nonnegative limits, and end date not before start date. Retain these rules; do not add sequencing or institutional calendar assumptions.
- `student_profile.current_semester_id` (migration 0003) is the student's own value. It is distinct from the system marker and must not be repurposed. No current system semester exists, and none may be invented or automatically selected.
- Migration 0004 defines canonical multi-role membership in `user_role_assignment` keyed to `user_access_assignment`; `user_access_assignment.access_status` represents suspension. Coordinator eligibility must use an ACTIVE account with an active COORDINATOR membership, not legacy `user_access_assignment.app_role` compatibility data alone.
- Migration 0006 and `apps/api/src/modules/admin` establish trusted `app.access_actor` / `app.access_reason`, server-side SYSTEM_ADMIN checks, stable error codes, transactional repository writes and append-only audit patterns. `apps/web/src/features/admin/AdminUserManagement.tsx` supplies required-reason modal/in-page dialogs. `AdminRoutes.tsx` currently routes `/admin/semesters` to a placeholder.
- `tools/db/cli.mjs` enumerates structural and behavior check files explicitly; `tools/db/migrations.mjs` requires applied versions to be a prefix of the manifest. Isolated local testing may use a local manifest containing 0000–0006 and 0008; numeric gaps are accepted. Shared development must include the exact applied 0007 checksum and manifest prefix before applying 0008. Integration order is 0007 to 0008 to 0009; do not rewrite applied history.

### Proposed implementation

#### Data model / migration 0008

Create `db/migrations/0008_admin_academic_setup.sql`, independent of all 0007 objects, and add its ordered manifest entry. Keep changes additive:

- Add `learning_centre.is_active boolean NOT NULL DEFAULT true`; no hard delete. Inactive centres remain visible in historical assignments, but are omitted from active option lists and cannot receive new assignments.
- Add `faculty` with identity PK, unique nonblank code, nonblank name and `is_active` default true. Deactivation preserves records and historical references and prevents new programme/assignment use.
- Add nullable `programme.faculty_id` FK with `ON DELETE RESTRICT`; admins may assign/change it. Do not make it mandatory because existing programmes are unclassified and no verified mapping is supplied. A coordinator assignment is valid only when its programme's current `faculty_id` equals the selected faculty; changing a programme faculty with live assignments must be rejected or require assignments to be ended first (select the explicit behavior during implementation and cover it in tests; default assumption: reject until assignments are ended).
- Add `academic_semester.is_current boolean NOT NULL DEFAULT false` plus a partial unique index for at most one true row. Do not require exactly one current semester at schema/bootstrap time. Empty current state is valid; only an explicit reasoned admin action sets one. Switching current semester must be atomic, serialize concurrent switches (transaction/advisory or row lock), and leave either the prior marker or the selected marker intact on failure. A single mutation/audit should describe the transition. Preserve all existing semester validation and nullable dates.
- Add `coordinator_assignment` with FK to `user_access_assignment`, faculty, programme and learning centre; `started_at`, nullable `ended_at`, created actor/reason as appropriate. Enforce one live assignment for the same coordinator + programme + centre (and faculty consistency); preserve ended history and prohibit hard deletion. Decide implementation detail of reactivation during coding: preferred append a new row after ending, rather than reopening history. Multiple distinct active assignments are allowed.
- Add append-only academic-setup audit storage with target/entity, action, actor, timestamp, required reason, and before/after payload adequate to audit centre/faculty/programme/semester/assignment changes. Database triggers require trusted actor and nonblank reason for mutations and forbid audit UPDATE/DELETE/TRUNCATE. Preserve 0006-style actor/reason transaction-local settings. Audit records should identify `SYSTEM_ADMIN` as authenticated by the API; DB context is trusted only because the repository sets it after verified actor checks.
- Ensure reference deactivation affects reads and writes consistently: active-only selection/list endpoints; existing foreign-key history stays intact; inactive references cannot be chosen for a new assignment or programme link. Decide and document whether an already-linked programme can point to a faculty later deactivated; assumption: preserve link/history but disallow new/reassignment to inactive faculty.

Update `db/migrations/manifest.json`, `db/engineering-extensions.json`, ERD documentation, migration tooling tests and registered SQL checks. Preserve frozen `db/schema-contract.json`; do not edit it. Add descriptively named check files and register them in the relevant `tools/db/cli.mjs`, `tools/db/review.mjs`, and baseline-check allowlists. The engineering extension validator currently permits only nullable columns without defaults; update `tools/db/review.mjs` narrowly to allow registered NOT NULL boolean `is_active` / `is_current` columns with defaults, with regression tests proving the baseline remains enforced. Add checks for exact extension shape/index/FKs, audit immutability and trusted context, semester-current uniqueness/atomic switching, soft deactivation, assignment uniqueness/history, active COORDINATOR validation and programme/faculty consistency. Extend migration manifest/prefix tests for the isolated local 0000–0006 + 0008 manifest and exact-prefix shared integration, and confirm independence from 0007 schema objects.

#### API and shared contracts

Expected route/API outline, all protected by the existing authenticated SYSTEM_ADMIN gate and transactionally audited mutation repository:

- `GET /api/admin/academic-setup/learning-centres` (active option list; admin management list can include inactive), `POST` create, `PATCH /:id` edit/deactivate.
- `GET /api/admin/academic-setup/faculties`, `POST`, `PATCH /:id` including active status.
- `GET /api/admin/academic-setup/programmes` list with faculty association; `PATCH /:id/faculty` assign/clear faculty. Require reason.
- `GET /api/admin/academic-setup/semesters`; `POST` create; `PATCH /:id` edit; `GET /api/admin/academic-setup/current-semester` returns `{data:null}` when unset; `PUT /api/admin/academic-setup/current-semester` sets or advances marker. No implicit current row.
- `GET /api/admin/academic-setup/coordinator-assignments` (filterable by account/programme/centre); `POST` add; `POST /:id/end` soft-remove. Validate that target account has active COORDINATOR role membership and active access, faculty is active, programme references that faculty, and centre is active at mutation time. Every mutation body includes required normalized reason (use shared admin reason limit/convention).
- Responses use stable codes following admin conventions for invalid request, not found, conflict/duplicate, unavailable dependency, and missing/invalid role; decide exact named codes in shared contract before handlers. Never return credentials or unnecessary Clerk identity data.

OpenAPI: add `docs/api/admin-academic-setup.openapi.json` or extend admin-users spec (prefer separate spec to keep domain contract focused). Shared request/response types and validation live under `packages/shared/src/admin/`. The future forecast-facing boundary should use repository methods `currentSemesterId`, `listActiveLearningCentres`, `listScopes`, and `isScopeAssigned`. Reuse `CoordinatorAssignment` from `packages/shared/src/forecasting/confirmed-offerings.ts`. Scope reads must join a currently ACTIVE account, active COORDINATOR role membership, and unended assignments, and verify active references plus programme/faculty match. Do not cache authorization state. Keep authorization in the consuming forecast adapter; do not modify the temporary ScopeProvider or forecast branch code. `studentLearningCentreId` belongs to P001 later.

#### UI

- `/admin/semesters` replaces its placeholder with one `.admin-card` page, modal create/edit, in-page required-reason confirmation dialog for set-current, and clear empty/loading/error/success states. Show the current semester explicitly; if no row is marked current, present “No current semester set” and require deliberate selection. Do not auto-select based on dates/order.
- Provide analogous single-card management pages for learning centres, faculties/programme faculty assignment, and coordinator assignments, using existing AdminShell styling, modal and reason-dialog conventions from `AdminUserManagement.tsx` and admin browser fixtures. Assignment management should use a dedicated page (preferred) so Package B’s optional student correction UI and existing `/admin/users/:id` account detail page do not collide. If account context is linked, link to account details rather than extending that page in this package.
- All mutation forms require a reason and keep dialogs open with inline stable errors on failure. Inactive records are labelled and cannot be selected for new references. No bulk destructive/deletion controls.

### Expected files / areas

- `db/migrations/0008_admin_academic_setup.sql`, `db/migrations/manifest.json`, `db/engineering-extensions.json`, new `db/checks/*` structural and rollback-only behavior checks, `tools/db/cli.mjs`, `tools/db/migrations.test.mjs`, and `tools/db/review.mjs`, checker allowlists and tests. `db/schema-contract.json` is frozen and preserved.
- `apps/api/src/modules/admin-academic-setup/*` (or an isolated submodule integrated via minimal `apps/api` route wiring); `packages/shared/src/admin/academic-setup.ts` plus tests; `docs/api/admin-academic-setup.openapi.json`.
- `apps/web/src/features/admin/AcademicSetup*.tsx`, minimal `AdminRoutes.tsx` route switch, minimal `admin.css` additions, and `tools/admin/test-ui.mjs` / `tools/admin/fixtures.mjs`.
- `docs/database/migrations.md`, `db/erd/schema.mmd` and this change record as needed. No historical migration edits and no Package B/forecast files.

### Cross-package / migration integration

Migration 0008 must be independently applicable using an isolated local manifest containing 0000–0006 and 0008, with the numeric gap accepted, and must not reference forecast tables from 0007. Shared development requires the exact applied 0007 checksum and manifest prefix before 0008; then Package B 0009 follows. Never rewrite an applied checksum/history. Fixed active branch identity for this work is `feature/admin-setup-module`, superseding the handoff recommendation.

#### Ordered implementation steps

1. Add shared request/response types, validation and focused tests; write the local admin academic-setup OpenAPI contract.
2. Add migration 0008, exact engineering-extension registrations, descriptive SQL checks and checker/tooling regression coverage while preserving the frozen baseline contract.
3. Implement repository and SYSTEM_ADMIN API routes, including current-semester GET/PUT and forecast read methods; wire `admin/index.ts` and dispatch from `routes.ts` before its catchall.
4. Add API client and admin UI pages, mount them in `AdminShell` navigation, and update UI fixtures. Adjust only semester placeholder assertions; preserve curriculum and requirements placeholders.
5. Run code/tooling checks and local disposable DB verification; run development DB verification only after exact 0007 prefix integration and identity checks.
6. Record actual outcomes and remaining integration handoff in this change record.


### Acceptance criteria

- [x] The change record tracks staged implementation and reports only checks actually run.
- [x] Migration 0008 adds active flags, faculty/programme relation, optional unique current semester, coordinator assignment history and immutable reasoned audit without depending on 0007.
- [x] Zero or one current semester is valid; duplicate current rows are impossible; explicit switching is atomic and no current semester is invented.
- [x] Only SYSTEM_ADMIN can use management APIs; mutations require a nonblank reason, trusted verified actor context and append-only audit.
- [x] Assignment creation requires an active account, active COORDINATOR role, active faculty/programme/centre, and programme/faculty match; one live identical scope is enforced and ended rows remain queryable.
- [x] Deactivated centres/faculties are omitted from active options and blocked for new references without deleting historical references.
- [x] API contracts expose admin CRUD and a narrow repository read boundary for future ScopeProvider consumption, without changing forecast code or adding broad coordinator endpoints.
- [x] Admin pages follow one-card/modal/reason-dialog patterns; assignment UI does not alter `/admin/users/:id`.
- [x] Local DB tests use disposable loopback database only; shared DB work is development-only and waits until 0007 is integrated exactly.

### Verification plan (commands to run during implementation; none run for this plan)

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:ui:admin`
- `npm run test:db-tooling`
- `npm run lint:db`
- `npm run db:review`
- On a local disposable PostgreSQL target only: `npm run db:status -- --target .wrangler/db-foundation/target.json`, `npm run db:migrate -- --target .wrangler/db-foundation/target.json`, `npm run db:verify -- --target .wrangler/db-foundation/target.json`, `npm run db:test -- --target .wrangler/db-foundation/target.json`.
- After 0007 prefix integration, and only with an explicitly approved private Neon DEVELOPMENT target file/credential whose project/branch/database identities exactly match `docs/database/migrations.md`: rerun `db:review`, `db:status`, then `db:migrate`, `db:verify`, `db:test` against that development target. Do not connect to production. Record actual outcomes and skipped commands in this file during implementation/review.
- UI manual/browser matrix: `/admin/semesters` no-current, create/edit, set-current/switch-current, validation and failed mutation; centre/faculty active/inactive and programme link; coordinator assignment validation, duplicate prevention, end/history; forbidden non-admin access; reason required and inline API errors; one card per page and responsive/dialog focus behavior. Update only semester placeholder assertions; curriculum and requirements placeholders remain.
### Risks / assumptions / blockers / rollback

- **Dependency/blocker:** 0007 is owned by forecast work. Development migration cannot proceed until 0007 is integrated into the ordered manifest and DB. No sentinel migration or manifest rewrite workaround.
- **Credentials/approval:** private Neon development target binding and credential are not assumed available. Live dev migration requires actual private target/credential and exact target-ID verification. No production URL or DB action.
- **Data policy:** no verified faculty mapping or centre catalogue is supplied. Existing programmes may remain faculty-null; do not seed or infer real classifications.
- **Current semester:** no date-based “current” semantics are specified. Explicit admin selection only; zero current allowed until set. Advance using the existing `nextSemesterAfter` helper from `packages/shared/src/offerings/confirmed-offerings.ts`.
- **Faculty update with active assignments:** assumed to reject reassignment while live coordinator assignments reference the old faculty; implementation plan must enforce or revise with documented reason before coding.
- **Soft-reference deactivation:** preserve existing references and history; block inactive values for new selection/assignment. Existing linked inactive faculty remains displayed as inactive until an admin changes it.
- **Rollback:** migration is additive and reversible only by a separately reviewed recovery plan. Do not drop data/tables in a shared environment. For local disposable DB, rebuild/drop only that approved disposable DB through its documented lifecycle. If migration batch fails, transaction runner should roll it back. If already applied to development, repair forward with a reviewed migration; never edit 0008 or erase migration metadata.
- **Integration order:** merge migrations 0007 to 0008 to 0009. Renumber before shared application if order changes; do not rewrite applied migration history.

### Out of scope exclusions

No forecasting implementation, coordinator offering confirmation, profile learning-centre lock, curriculum/prerequisite/graduation maintenance, data imports/seeds, production DB, commit or push. The first implementation step is limited to shared contracts, validation, focused tests, and local OpenAPI; migrations, handlers, and UI follow only after review.

## 2. Implementation

- **Status:** READY_FOR_REVIEW locally, 2026-11-02.
- **Owner / scope:** P004 Package A, isolated `feature/admin-setup-module` worktree. User selected GPT-6.1-Sol execution. Other worktrees, historical migrations, frozen schema contract and profile/coordinator/offerings feature scopes are preserved.
- **Completed reviewed checkpoints:** Shared academic setup types/validators/OpenAPI; academic web client and 28 focused tests; migration/checker/static SQL support and 21 tooling tests; concrete SQL repository/error mapping/handler/Neon factory and tests. Coordinator inspected actual diffs and accepted the backend checkpoint with 318 focused tests, 13 real PostgreSQL repository tests, 135 SQL behavior assertions and 16 lock-observed races before requesting final docs.
- **Saved implementation:** Migration 0008 and registered checks; disposable database runner and `tools/admin/academic-database-races.mjs`; academic contracts, error mapper, handlers and `academic-repository.ts` implementing all sixteen operations plus uncached `AcademicScopeReader`; Neon factory/export in `admin/index.ts` and dispatch in `admin/routes.ts` before the existing catchall. Every mutation sets local verified actor/normalized reason, sparse PATCH applies only closed whitelisted supplied fields, PostgreSQL checks merged invariants, and the void current setter is followed by readback in the same transaction. SQLSTATE/constraint mapping emits only fixed domain messages. Existing admin dependencies remain compatible through an optional academic repository; production factory always provides it. Four admin pages, client/shared form helpers, navigation/styles and connected browser fixtures/matrix are implemented and coordinator-reviewed.
- **Documentation checkpoint:** Updated `db/erd/schema.mmd` and its README with the separately labelled 0008 extension (three tables/three columns/five FKs); updated `docs/database/migrations.md`, `data-contracts.md` and `verification.md` for actual local evidence, live scope-reader methods, no-current/assignment/history/audit behavior and shared exact-0007 integration gate. Only OpenAPI `info.description` changed to describe the wired backend; endpoint/schema contracts are unchanged. No baseline dictionary, historical migration or forecast/profile adapter changes.
- **Remaining integration:** Human peer review and shared Neon development migration/verification after the exact 0007 manifest prefix/checksum is integrated. Local implementation, documentation, combined checks and build are complete. No deployment or shared database application is claimed.
- **Database effects:** Only newly initialized disposable loopback PostgreSQL databases were migrated/tested. No Neon or production connection, shared database application, commit, push, merge or deployment occurred. No PostgreSQL process remained after final verification.

## 3. Review

- **Coordinator verification after workers stopped:** `npm.cmd run typecheck` PASS. `npm.cmd test` PASS: 50 files / 971 tests passed, 3 files / 27 explicit-database tests skipped. These unit tests include standalone academic handler and client cases; they do not prove backend integration.
- **Database verification:** `node tools/admin/test-academic-database.mjs` PASS on a fresh disposable PostgreSQL18.4 cluster. Applied 0000-0006+0008, repeated application no-op; all structural SQL assertions passed; existing behavior suites passed (59 baseline, 9 role boundary, 19 multi-role, 38 admin-user) and 10 academic behavior cases passed. All 16 two-session race scenarios passed with observed pg_stat_activity Lock and blocking PID evidence: current switches, duplicate live assignment, programme reassignment both orders, centre/faculty/programme-status/account-suspension/role-deletion both orders, and programme-link/faculty-deactivation both orders. Rollback/failed-target marker preservation, transition audit count and retained ended history also passed. Cluster stopped in finally.
- **Earlier actual evidence:** Shared contract21 tests and web client28 tests passed; database tooling21 tests, static db review and database lint passed; OpenAPI parsed with all192 local references resolved. UTF-8/source scope and exact structural assertion diffs inspected. `git diff --check` PASS after current changes.
- **Resumed backend evidence:** `npm.cmd run typecheck` PASS; `npm.cmd run lint` PASS (the earlier fixture lint defect is resolved by the UI worker); focused Vitest run of `academic-repository.test.ts`, `academic-integration.test.ts`, `academic-routes.test.ts`, `admin.test.ts`, and `routes.mutations.test.ts` PASS: 5 files / 318 tests. This includes 24 new SQL/error-boundary tests and 5 new Neon-factory/dispatch tests. The first new test run found one assertion expecting a rejected Promise from a synchronous whitelist guard; corrected the assertion. First typecheck/lint after adding tests found a widened status literal and unused mock parameters; fixed, then reran successfully.
- **Resumed real repository evidence:** `node tools/admin/test-academic-database.mjs` PASS on a newly initialized PostgreSQL 18.4 loopback cluster: all existing structural checks, 135 behavior assertions, 13 new real repository tests, and all 16 observed-lock race scenarios passed; cluster stopped in finally. New tests exercise all sixteen methods, transaction-local context/audit, explicit no-current and atomic switch readback, merged sparse PATCH validation, active reference/account/role rules, retained ended history, uncached scope revocation and programme/faculty inconsistency. Test URL accepts only explicitly provided loopback `utm_db_foundation_*_test` targets, never application credentials. Repository statements execute via `pg` with savepoints under an outer rollback, matching non-interactive Neon transaction semantics; the Neon HTTP transport is unit-tested with mocks, not contacted.
- **UI checkpoint evidence reported and accepted by coordinator:** Final admin browser suite 44/44 PASS, academic client 28/28 PASS, typecheck/lint PASS, and four manual mobile footer/focus checks PASS. Coordinator reviewed the actual pages/client/helper/fixtures/browser matrix/navigation/CSS diff and screenshots of desktop semester/faculties, mobile table and dialog footer. Native modal background inertness, Escape close and opener focus restoration passed. An exploratory Shift+Tab expectation differed from native browser behavior; no generic manual Tab-loop pass is claimed. Browser fixtures mock authentication/API behavior; real backend SQL is established separately by the repository suite.
- **Remaining verification:** Shared-development application and verification are deferred until exact 0007 integration and private target identity checks. Human peer review remains pending. All planned local code, SQL, browser and build checks completed.
- **Historical interruption:** Earlier workers stopped on workspace credits. A fresh user-selected GPT-6.1-Sol worker resumed successfully under unrestricted permissions; that earlier interruption no longer blocks local implementation.
- **Documentation checks:** After the docs-only checkpoint, `npm.cmd run db:review` PASS (26 source tables, 171 source fields, 39 source FKs, 6 registered engineering tables, 5 registered extension columns, 27 PL/pgSQL functions; source hash matches; no database execution). OpenAPI JSON parsed successfully with 11 paths; only its implementation description changed. Inspected Mermaid source diff for 29 entity blocks (26 baseline plus 3 academic extensions) and five new FK relationships; no diagram rendering is claimed. `git diff --check` PASS. Coordinator inspected and accepted the documentation diff, including labelled ERD extension and explicit local/shared migration boundary.
- **Review outcome:** PASS - SELF-REVIEW / coordinator actual diff and visual review. READY_FOR_REVIEW locally; human peer approval and gated shared-development verification pending. No critical local defects remain.

## 4. Changelog

- **Date:** 2026-11-02. **Type:** Added, Changed, Tests, Docs (partial).
- **Actual changes:** Reasoned academic setup contract and validation; audited additive schema and strict schema checks; local database race verification; academic client and pages; concrete SQL repository, safe error adapter, live scope reader, Neon factory and handler dispatch; focused unit/factory and real PostgreSQL repository coverage; extension ERD, database migration/data-boundary/evidence documentation and corrected OpenAPI implementation description.
- **Compatibility / impact:** Migration0008 remains independent of absent0007 for isolated local testing. Shared application must preserve exact0007 prefix/checksum and later0009 ordering. Existing user-management APIs and fixtures remain compatible. No forecast adapter, profile feature, historical migration, baseline schema contract or upstream Clerk operation changed.
- **Verification summary:** Final coordinator typecheck/lint PASS; full unit suite 1000 PASS / 40 explicit-database tests skipped in the normal run (13 academic repository tests separately PASS on disposable PostgreSQL); SQL structural checks/135 behavior assertions/16 lock-observed races PASS; browser44/client28/manual mobile4 PASS; build:local and Cloudflare build/Worker dry-run PASS. No deployed or shared-development success claimed.
- **Next handoff:** Human peer review; integrate the exact 0007 migration/checksum before 0008 and later 0009, verify the approved private development target, then apply/verify/test through the existing DB runner. Do not bypass the prefix gate, connect production or deploy. All work remains local and uncommitted; no push requested.
- **Final status:** READY_FOR_REVIEW locally; shared-development migration/verification pending integration.

### Final coordinator verification (2026-11-02)

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 52 files / 1000 tests; 4 files / 40 explicit-database tests skipped in this normal run. The 13 academic repository tests were separately run and passed on disposable PostgreSQL.
- `npm.cmd run build:local`: PASS.
- `npm.cmd run check:cloudflare`: PASS, frontend build and Worker dry-run only, using an explicitly temporary fictional Clerk publishable build key, restored afterward. Vite emitted its non-blocking >500kB bundle advisory; no deployment occurred.
- Accepted worker evidence: admin browser44, client28, database tooling21, backend focused318, real repository13, structural SQL plus135 behavior assertions and16 lock-observed races; all PASS. Visual inspection covered desktop semester/faculty screens, mobile tables and coordinator modal/footer. Documentation/ERD source diff reviewed and accepted.
- `git diff --check`: PASS. Frozen schema contract, historical migrations and other owners' feature files unchanged. Preview/database test services stopped. No commit, push, deployment or Neon connection.
- Final local status READY_FOR_REVIEW. Shared development apply/verify/test is pending the exact0007 integration and private target identity gate; human peer approval pending.

### Integration with `main` and shared development (2026-11-02)

- Committed the Package A work on `feature/admin-setup-module` and merged `main` (S2-P004-007/009/010, P003, P001 Sprint 2; migration 0007) into it.
- Resolved conflicts in `db/migrations/manifest.json` and `db/engineering-extensions.json` (0007 then 0008), `tools/db/cli.mjs` and `tools/db/review.mjs` (verify 010+012, behaviour 011+013), `tools/db/migrations.test.mjs` (versions 0000-0008; 21 extension columns; the isolated-gap test replaced by an exact 0007-prefix test), `db/checks/001_schema_verification.sql` (column cases for both; 44 FKs = 39 + 0003 + three 0007 + one 0008) and `db/checks/005_multi_role_access.sql` (36 tables).
- 0007 checks assumed Package A/B objects never exist. `010` and section G of `011` now allow 0008 objects once 0008 is recorded in `migration_meta.schema_migrations` (and 0009 objects once 0009 is recorded). `011` sets the audited `app.access_actor`/`app.access_reason` context that 0008 requires for its learning centre and semester fixtures. `tools/admin/test-academic-database.mjs` now also runs 010 and 011.
- Disposable PostgreSQL (0000-0008): ordered apply + repeated no-op PASS; structural checks PASS; behaviour 59 + 9 + 19 + 38 + 79 (UC20) + 10 (academic) PASS; 13 real repository tests PASS; 16 lock-observed races PASS.
- Combined app checks: typecheck PASS; lint PASS; `npm test` 67 files / 1329 tests passed, 59 skipped; integration 9/9; db tooling 22/22; `db:review` PASS; browser admin 44, coordinator 41, integration 35, pathway 9; `build:cloudflare` PASS (fictional public test key).
- **Neon development** (branch `br-shy-cherry-azuzy9v5`, through the existing target/branch gates over the Neon WebSocket client): status showed 0000-0007 applied with matching checksums and only 0008 pending; applied 0008; read-only verify PASS (schema, admin user management, UC20, academic setup structure). Rollback-only behaviour tests were not run on Neon because the target does not allow them (`allowRollbackOnlyTests=false`).
- Not yet done: forecasting still uses the interim `ScopeProvider`; no current semester is marked and no faculty or coordinator assignment exists until an administrator sets them up. No production action or deployment.

- 2026-11-02 — Merged `feature/admin-setup-module` into `main` at the user's request; tree identical to the verified branch. Status: MERGED; human peer review pending.

## Earlier checkpoint history

### Concrete repository checkpoint resumed (2026-11-02)

User-selected GPT-6.1-Sol resumes the existing planned API step after coordinator acceptance of the disposable DB checkpoint. Scope: implement all sixteen repository operations, uncached forecast read boundary, fixed SQL/domain error mapping, Neon transaction factory and dispatch before the existing admin catchall; test exact SQL on disposable loopback PostgreSQL and routed authorization. Every write uses one transaction with local actor/reason, sparse whitelisted PATCH fields and database-enforced merged semester invariants. No upstream Clerk calls, UI fixture changes, forecast/profile code, shared database, commit or push. Verification: typecheck, focused lint/unit/router tests and repository tests launched by the existing disposable runner; coordinator diff review remains pending.

### Database checkpoint resumed (2026-11-02)

User-selected gpt-6.1-sol resumes only migration/check/tooling/disposable DB work. Plan: fix generic trigger guards, programme INSERT link auditing, reference locking, fail-closed structural checks and baseline compatibility; add negative checker and real two-session race tests. Coordinator review remains required before dependent API work. No shared database, commit or push.

### Database static/checker review checkpoint (2026-11-02)

- **Implementation:** Corrected generic trigger semester-field guards, prohibited direct INSERT of a current marker, validated/audited programme INSERT with a faculty link, and added SHARE row locks on account/membership/programme/faculty/centre validation. Baseline checks now narrowly allow the three 0008 columns, programme FK and three registered tables; rollback fixtures establish trusted actor/reason before guarded writes. Public interfaces unchanged.
- **Checker:** Required boolean registry entries are restricted to centre is_active=true/current semester is_current=false. DEFAULT must be a boolean A_Const node; protobuf's empty boolval node means false, while NULL and expressions are rejected. Added six negative checker regression cases and isolated-gap/shared-prefix checksum/history coverage.
- **Structural SQL:** Replaced draft PASS/FAIL SELECTs with raising DO assertions for exact new table column shapes, additive defaults/nullability, five restrictive FKs, unique index keys/predicates, enabled trigger types/functions and PUBLIC ACL restrictions. This SQL has parsed successfully; runtime execution is still pending.
- **Actual checks:** `npm.cmd run test:db-tooling` passed 21/21; `npm.cmd run db:review` passed (26 baseline entities,171 source fields,39 source FKs,5 engineering extension columns; source hash matches); `npm.cmd run lint:db` passed; `git diff --check` passed. Earlier sandboxed negative-fixture test run hit EPERM writing temporary directories; approved escalated rerun passed. Initial false-literal AST decoding defect was fixed and verified by all negative cases.
- **Earlier disposable runtime attempt:** Fresh loopback PostgreSQL applied 0000-0006 + 0008 and repeated migration was a no-op. Runner then stopped on its incorrect requirement for test_name output from DO-only baseline 001. The cluster stopped in finally. Harness is corrected; a successful full runtime pass is not claimed.
- **Review outcome:** Static/checker checkpoint ready for coordinator review. Full DB checkpoint remains IN_PROGRESS: runtime structural/behavior checks, expanded behavior tests, real two-session switch/reference races, ERD/migration documentation and final review are pending. No API implementation, Neon/production connection, commit or push was performed by this worker. Historical migrations and frozen schema-contract.json unchanged.

### Independent HTTP checkpoint sequencing (2026-11-02)

Independent HTTP contract/handler checkpoint (no SQL or production wiring) may proceed against the reviewed shared contract with mocked repository while DB validation continues; concrete SQL repository/integration remains gated on DB review. Planned files: `admin/academic-contracts.ts`, `academic-errors.ts`, `academic-routes.ts`, `academic-routes.test.ts`. Verification: typecheck/lint/focused auth/validation/dispatch tests. UI/client checkpoint reviewed PASS with 28 tests, typecheck and lint; pages next.
