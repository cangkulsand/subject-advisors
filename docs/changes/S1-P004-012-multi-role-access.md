# S1-P004-012 — Multi-role account access

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-28
- **Sprint:** Sprint 1 (user-authorized P004/auth and minimal shared DB/interface extension)
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC01 registration; UC02 authentication and backend role/access checks
- **Branch / PR:** `feature/p004-multi-role-access` / PR not created
- **Reviewer:** Coordinator self-review passed; human peer review pending

## 1. Plan

### Objective / problem
Support an explicitly authorized account holding STUDENT, COORDINATOR, and SYSTEM_ADMIN simultaneously while preserving stable Clerk identity, the existing global account suspension and audit FK, and secure role-specific backend authorization. The current schema and `/api/me` contract represent one role only.

### Scope and requirements
- Keep `user_access_assignment` as the one-per-Clerk-ID account row and preserve its integer ID, global `access_status`, old audit FK, and legacy `app_role` during rolling compatibility.
- Store authoritative roles as additive child memberships, with grant policy/provenance and immutable role audit. Explicit role grants only; verified email domain is an eligibility check and never a grant.
- The privately verified owner account may receive a Clerk-ID-bound COORDINATOR `OWNER_STUDENT_COORDINATOR` policy exception. The later operator workflow must reverify the email belongs to the supplied Clerk ID. No live DB grants or migration are performed in this task; private identity continuation notes are in ignored `.wrangler/multi-role-owner-context.json`.
- The user additionally requires the verified owner identity's SYSTEM_ADMIN membership to be non-removable/non-demotable through normal grant/revoke flows, even when other admins exist. Bind that protected membership to the verified Clerk ID during trusted operator provisioning, never to email matching in SQL. This role protection does not bypass global account suspension; existing active-admin suspension guards remain.
- Ordinary students require exact verified `graduate.utm.my`; other coordinators require exact verified `utm.my` plus explicit grant; admins require explicit identity grant. No role derives from email alone.
- Preserve same student data by Clerk ID, check global suspension for every role, guard every backend route, expose eligible views for client switching, split student profile state from active view, version/revalidate account cache, and preserve last-active-admin safety.
- Implementation proceeds through reviewed database/schema, backend contract/repository/authorization, trusted operator provisioning, and client gates/cache/shell slices. No public role-grant API, admin dashboard, Redis, deployment, commit/push, or live DB writes.

### Current behavior and intended behavior
Today `user_access_assignment` has unique `clerk_user_id`, one `app_role`, and global `access_status`; immutable access audit references its integer key. New runtime authorization must use role memberships. For compatibility, legacy `app_role` is a read-only bootstrap projection after insertion: an old student account insert seeds a STUDENT membership, while any later attempt to mutate `app_role` is rejected. A missing membership is an authorization failure, never a fallback to `app_role`.

### Proposed implementation and expected files
- `docs/changes/S1-P004-012-multi-role-access.md` (this plan and later actual implementation/review/changelog record).
- `db/migrations/0004_multi_role_access.sql`, `db/migrations/manifest.json` (forward-only additive schema; do not edit 0000–0003 or historical migration).
- `db/checks/005_multi_role_access.sql`, `db/checks/001_schema_verification.sql` (register extension inventory without weakening baseline checks), `tools/db/review.mjs`, `tools/db/cli.mjs`, `tools/db/migrations.test.mjs` as needed.
- Tests use synthetic IDs and transaction rollback; no live target.
- API/backend files: auth contracts, membership repository, role-specific policy, authorization middleware and security/fixture tests; additive account OpenAPI contract under `docs/api/`.
- Browser files: role-aware account snapshot validation/versioning, auth gates/context, shared RoleSwitcher and styling, student header, role-aware profile-save cache handling, unit tests and existing integration browser harness.
- Trusted tooling and handoff: operator-only provisioning command/pure helpers/tests, isolated PostgreSQL runner, Postman account-client simulation and context, `docs/auth-multi-role.md`, and caching guideline update.

### API/data/migration and cross-programmer impacts
Migration creates `user_role_assignment` keyed by account ID and role, with the closed email policy enum `ROLE_DOMAIN` / `OWNER_STUDENT_COORDINATOR`, separate grant provenance (`MIGRATION_COMPAT`, `LEGACY_INIT`, or `OPERATOR`), actor/reason, timestamp, and a `protected_owner` bit restricted to SYSTEM_ADMIN; a partial unique index allows at most one protected admin. Backfill every current `app_role` with `ROLE_DOMAIN` and `MIGRATION_COMPAT` provenance (including existing staff assignments without inferring an email exception or protected owner); add immutable `user_role_audit_log` referencing stable parent IDs; add a trigger to seed STUDENT for legacy initial account inserts and reject legacy role updates; add serialized membership-aware last-admin checks for membership mutations and account suspension/deletion; block removal/demotion/unprotection of a protected admin, allowing only a separately marked explicit bootstrap transition from unprotected to protected; and deny PUBLIC table/function privileges. The existing access audit table and its IDs/FKs remain unchanged.

Migration-before-code means old code can continue its existing behavior during deployment, but it cannot represent or authorize multiple roles and must not be considered safe for any newly multi-role grant until backend membership authorization ships. Rollback is forward-only: keep memberships/audit and revert app code; do not drop or collapse data. Returning to the old app is limited to accounts with only the legacy role projection.

### Acceptance criteria
- Migration is new version 0004 and manifest ordered; frozen migration files remain byte-identical.
- Every existing assignment backfills exactly one membership with explicit migration provenance; no email is inferred and no new privileged grants are made.
- Legacy account insert seeds one STUDENT membership; missing membership cannot be synthesized by role lookup; legacy role update fails.
- Protected-owner flag is constrained to SYSTEM_ADMIN, unique across accounts, cannot be cleared or removed through normal mutations even if another admin exists, and its account cannot be deleted while its membership FK exists.
- Duplicate grants, malformed roles/policies, coordinator exception on any non-COORDINATOR role, empty actor/reason, global suspension bypass, audit mutation/truncate, parent truncate, and last-active-admin removal/suspension are rejected.
- Membership grants/revokes/policy changes and account status changes serialize on existing advisory lock `(260002,1)`; last-admin predicate checks memberships.
- Baseline 26-table contract checks and current-semester extension remain intact; additive auth tables are verified as registered engineering extensions.
- Static DB review, migration tooling tests, DB lint and SQL parser checks pass. Use the separately prepared ignored PostgreSQL binaries to create disposable local test clusters; no Docker service or live Neon target is used.
- Existing P002 dirty files and package metadata remain untouched.

### Risks, dependencies, assumptions, rollback
- Requires trusted operator-side identity verification and transactional membership provisioning in dependent work; schema alone does not establish Clerk identity truth.
- First protected-owner grant requires explicit trusted operator action after exact Clerk ID/email verification. The future provisioning tool must not permit owner rotation/unprotection; recovery requires a separate manual database-owner procedure.
- SQL session actor/reason settings are audit context, not a browser-facing trust boundary. Only privileged trusted operator/service code may mutate role tables; runtime browser-facing database credentials must have no mutation privileges.
- Trigger-level locking protects concurrent SQL mutations, but must be exercised on PostgreSQL before live rollout.
- The old app is single-role and must not be used to grant or interpret multiple memberships; role assignment changes are staged after membership-aware backend deployment.
- No live database target or real database account rows are read or written; Clerk identity verification is read-only and does not change provider configuration. Rollback uses an app rollback while retaining additive schema/history.

### Implementation sequence and private handoff
- The user briefly requested a next-session plan, then explicitly resumed implementation. This record remains the handoff and implementation plan. Luna execution became unavailable due to workspace credits; the coordinator continues under the project's unavailable-model fallback.
- Read-only lookup in the configured development Clerk instance confirmed one exact owner email match with a verified primary email, not banned or locked. The resolved Clerk ID is retained in the ignored private continuation file, not embedded in migrations or fixtures. No account roles were changed.
- An isolated PostgreSQL 18.4 binary package is available under ignored `.wrangler/multi-role-postgres/`. Initialize a disposable loopback-only database there to execute migrations, behavior tests, and concurrent administrator-removal checks; do not contact Neon.
- Completed schema review before backend work: protect account Clerk IDs from remapping, require explicit protection-bootstrap context on insertion, constrain the coordinator exception to the protected owner account, preserve grant provenance, restore transaction-local audit context after student initialization, and correct baseline test fixtures for the new authoritative memberships.
- Extend the account response additively with `roles` (explicit grants), `availableRoles` (verified-email-eligible grants), and `studentProfileState`. Keep `appRole`, `profileState`, and `landingPath` as compatible default/request-role projections. Never infer a missing database membership from `app_role`.
- Update the repository and every API authorization check to use memberships. Student domain/profile requirements apply only to student requests; an incomplete student profile must not block a granted staff view. Administrators require verified email and an explicit membership; ordinary coordinators require verified exact `utm.my`, with the protected owner's explicit exception requiring verified exact `graduate.utm.my`.
- Version and validate browser account snapshots, preserve existing academic retention rules, and revalidate account access before a role switch. Add an accessible shared view switcher showing only eligible assigned roles, including in the existing coordinator/admin placeholder pages. Respect unsaved-change navigation guards.
- Add a trusted operator-only owner provisioning command with a default dry-run, exact Clerk ID/email verification, transactional audited grants, and no public grant endpoint. Its live apply mode and migration rollout remain unexecuted until the target and proposed changes are reviewed.
- Update tests and API/runbook documentation. Run schema/tooling checks, local PostgreSQL behavior/concurrency checks, auth/role/cache tests, shared UI scenarios, typecheck/lint/build and deployment dry-run. Use local Postman simulation where it adds HTTP-level client verification; do not publish mocks or create a shared workspace.

### Out of scope
Live migration or privileged role grants, new admin/coordinator business dashboards, Redis, provider configuration changes, deployments, secrets in Git, and commit/push. Existing unrelated P002 and dependency edits remain local and unchanged.

## 2. Implementation

- **Status:** Local implementation complete; live activation unexecuted.
- **Files actually changed:**
  - Schema and checks: new `db/migrations/0004_multi_role_access.sql`, `db/engineering-extensions.json`, `db/checks/005_multi_role_access.sql`, `db/checks/006_multi_role_behavior_tests.sql`; updated migration manifest, checks 001/002, and `tools/db/{review,cli,migrations.test}.mjs`.
  - Backend: `apps/api/src/middleware/auth.ts`, auth contracts/policy/repository, new `multi-role.test.ts`; minimal auth fixture updates in auth, profile, offerings and integrated router tests.
  - Client: auth gates, account cache/client, cache tests and CSS; new account context, role helpers and `RoleSwitcher.tsx`; minimal `StudentShell.tsx` integration and existing shared browser harness updates.
  - Operator and verification tooling: `tools/auth/{provision-roles,role-provisioning,role-provisioning.test,test-multi-role-db,test-role-simulation}.mjs`.
  - Documentation and local simulation: `docs/auth-multi-role.md`, `docs/api/auth-multi-role.openapi.json`, `docs/cachingguide.md`, this record, `postman/mocks/account-access/{config.yaml,default.js}`, and `postman/simulations/account-access-local.{sim.yaml,context.md}`.
- **Schema summary:** Added explicit memberships, constrained email policies, immutable grant provenance/audit, one protected owner, immutable Clerk identity, legacy student initialization and membership-aware last-active-admin guards. Existing roles backfill without new privileges. Serialized account/membership mutations preserve last-admin safety. Frozen migrations 0000-0003 and historical migration remain unchanged.
- **Backend summary:** Every protected request uses current memberships and global suspension. Exact verified domains determine eligibility only after explicit grants. The protected owner's coordinator exception is bound to the same account. Missing memberships fail closed. Added `roles`, `availableRoles` and `studentProfileState` while retaining default/request-role projections. Student setup/unavailability does not block an eligible staff view.
- **Client summary:** Eligible multi-role accounts can switch views after a fresh `/api/me` check; single-role users have no selector. Existing navigation guards retain unsaved drafts. Cache v3 validates memberships and profile consistency, rejects stale stored snapshots, handles access/session invalidation races and preserves academic caching. Completely legacy network responses normalize only when all new fields are absent.
- **Provisioning summary:** Trusted operator command verifies the exact active Clerk identity and primary email, defaults to a SELECT-only dry-run, uses explicit approved DB targets, and applies audited transactional grants only with `--apply`. Owner bootstrap grants all three roles and protects SYSTEM_ADMIN; subsequent normal removal, demotion, unprotection or rotation is rejected. New coordinator accounts receive only their requested staff grant. No public grant API was added.
- **Decisions / deviations:** Luna became unavailable because workspace credits were exhausted; coordinator execution used the project's unavailable-model fallback after notification. PostgreSQL execution became available through ignored, isolated local binaries, replacing the earlier static-only limitation. Existing unrelated P002 cleanup and package dependency/lock edits were preserved. No new root dependencies or scripts were required.
- **Migrations / env / shared contracts:** Migration 0004 must precede the new backend. Deploy membership-aware backend/client before issuing multi-role grants. Operator tooling reuses existing explicit `DB_FOUNDATION_...` target credentials and server-side `CLERK_SECRET_KEY`; no secret is added to browser configuration. Admin/coordinator pages remain guarded placeholders.

## 3. Review

- **Self-review checklist:** PASS for scope, plan/diff, backend authorization, validation, compatibility, additive migration, privacy, accessible view selection, checks and documentation. Reviewed the actual diff and new files; unrelated dirty files were preserved. No live database, provider mutation, Git push or deployment was performed.
- **Test evidence (2026-10-28):**
  - `npm.cmd run typecheck`: PASS.
  - `npm.cmd test`: PASS, 357 tests; 13 opt-in database tests skipped because their explicit live/test connection variables were not supplied. These skips do not represent live provider/database acceptance.
  - `npm.cmd run lint`: PASS; direct ESLint on the five new `tools/auth/*.mjs` files: PASS.
  - `npm.cmd run db:review`: PASS, frozen 26-table/171-field/39-source-FK mapping plus two registered engineering tables; SQL/PLpgSQL parsing passed.
  - `npm.cmd run test:db-tooling`: PASS, 12 tests; `npm.cmd run lint:db`: PASS.
  - `node tools/auth/test-multi-role-db.mjs`: PASS on disposable local PostgreSQL 18.4. Applied 0000-0003, seeded synthetic historical assignments, then applied 0004. Executed structural checks 001/004/005 and rollback behavior checks 002 (59), 003 (9), 006 (19). Verified concurrent last-admin revoke/suspend serialization, owner provisioning dry-run/apply/idempotence, owner-rotation denial and coordinator-only grants. Cluster stopped afterwards; no Neon connection was used.
  - `node --test tools/auth/role-provisioning.test.mjs`: PASS, 4 tests.
  - `node tools/integration/test-ui.mjs --installed` with the existing Playwright browser cache: PASS, 34 scenarios. Clerk/API are mocked. Includes all three owner views, fresh switch checks, revocation, student-only denial, incomplete setup, mobile widths and unsaved drafts.
  - Local Postman CLI 1.74.0 simulation plus `node tools/auth/test-role-simulation.mjs`: PASS, 5 actual client/cache HTTP checks, including expected 403 denial and malformed-response rejection. Simulation stopped. No cloud mock/workspace was created.
  - `postman spec lint docs/api/auth-multi-role.openapi.json --issueType=syntax`: PASS. Default governance lint required Postman login; no authenticated governance result is claimed.
  - `npm.cmd run check:cloudflare`: PASS, frontend/Worker build and deployment dry-run only.
  - `git diff --check`: PASS; frozen migrations unchanged; no real owner identity embedded in source, migrations or fixtures.
- **Manual/provider checks:** Read-only development Clerk lookup confirmed a unique exact owner match with verified primary email, neither banned nor locked. No role was granted. Provider acceptance and deployed behavior remain untested. Actual private identity details are retained only in the ignored continuation file.
- **Defects found and fixed:** Bound the coordinator exception to the protected account, blocked Clerk-ID remapping and unaudited bootstrap, retained grant provenance during protection, restored initialization audit context, rejected duplicate audit events, and verified advisory-lock races. Final review additionally blocked timestamp rewriting during owner protection and added the passing regression assertion. Fixed asynchronous Postman fixture state and Windows PostgreSQL process pipe handling before successful reruns. Client tests cover stale in-flight role refresh after same-session invalidation.
- **Review outcome:** PASS - SELF-REVIEW. Local code and verification complete.
- **Human reviewer / approval:** Pending; not peer-approved, merged or deployed. User authorized a Git push after local review; publication is scoped to the feature branch.

## 4. Changelog

- **Date / ID / owner:** 2026-10-28; S1-P004-012; P004 with minimal shared schema/UI integration.
- **Type:** Added, Changed, Security, Tests, Docs.
- **Added / Changed / Fixed:** Explicit multi-role account authorization; protected identity-bound owner administrator; verified-domain eligibility and explicit owner coordinator exception; separate student profile state; revalidated workspace switching; versioned account cache; audited operator-only provisioning; additive migration and local PostgreSQL/concurrency/browser/HTTP verification.
- **Affected routes / tables / consumers:** `/api/me`, `/api/me/initialize`, existing protected API authorization, student/staff route gates and account consumers; stable `user_access_assignment` plus new `user_role_assignment` and `user_role_audit_log`. No admin business dashboard or public role-management endpoint.
- **Breaking changes / migration steps:** Forward migration 0004 before membership-aware app deployment; actual grants only after the new backend is serving. Do not collapse membership/audit data for rollback. An old backend cannot safely represent newly multi-role grants. No new public environment secret.
- **Verification summary:** 357 unit tests, 34 mocked browser scenarios, 4 operator tests, 12 migration-tooling tests, isolated real PostgreSQL migration/behavior/concurrency/provisioning checks, 5 local Postman HTTP checks, typecheck, lint, SQL review, build and Cloudflare dry-run passed. Thirteen separately opt-in database tests were skipped. No live acceptance claim.
- **Outstanding / next session:** Human review; explicitly approve the exact live development DB target before applying 0004, deploy membership-aware code, then review/apply trusted provisioning after revalidating the private owner identity. No real roles have been changed. Production Clerk identity/instance must be checked separately before production activation. See `docs/auth-multi-role.md` for ordered commands and rollback limits.
- **Final status:** READY_FOR_REVIEW

### Git publication follow-up (2026-10-28)

- **Plan:** Publish the reviewed multi-role implementation at the user's explicit request. Use `feature/p004-multi-role-access` because Cloudflare builds from `main` and migration 0004 has not been applied. Exclude unrelated P002 dropdown cleanup, its record, and pre-existing package dependency/lock edits.
- **Implementation:** Commit only the documented auth/schema/client/operator/test/runbook changes to the feature branch; preserve excluded changes in the local worktree. No live DB changes, protected-owner grants or deployment are included.
- **Review:** Retain the passing verification evidence above; inspect staged scope, whitespace, frozen migrations, private identity exclusion and remote branch after publication. Human peer review and migration-first release remain pending.
- **Changelog:** Publish the multi-role work on the feature branch. This follow-up supersedes earlier plan statements excluding commit/push; the live-operation exclusions remain.
