# S2-P004-004 — Admin user management (create, invite, roles, suspend)

- **Status:** DONE (local)
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** Admin "Users & Access" (`/admin/users`); multi-role access, see `docs/auth-multi-role.md`
- **Branch / PR:** `feature/p004-s2-admin-user-management`; no PR
- **Reviewer:** Coordinator review passed; human review not required by user

## 1. Plan

### Objective / problem

The admin "Users & Access" page is read-only. SYSTEM_ADMIN needs to manage accounts: add an
application account for an existing Clerk user, invite someone not yet signed up, grant and revoke
roles, and suspend or reactivate accounts. Every mutation requires a reason that is stored in the
audit log.

### Scope and requirements

- In scope:
  - Create (a): add an application account for an EXISTING Clerk user (looked up by email) with
    chosen roles.
  - Create (b): send a Clerk email INVITATION to someone not yet signed up; intended roles are
    applied when they first sign in.
  - Read: already exists (`GET /api/admin/users`, `GET /api/admin/users/:id`, `/api/admin/audit`).
  - Update: grant role, revoke role, suspend, reactivate. Reason is trimmed, 1-500 chars.
  - Delete = SUSPEND only (no hard delete; audit FKs are ON DELETE RESTRICT).
  - Rules: SYSTEM_ADMIN only; an admin cannot suspend themselves or revoke their own SYSTEM_ADMIN
    role; the protected owner is immutable; role eligibility depends on the verified email domain
    (COORDINATOR/SYSTEM_ADMIN require exact verified `@utm.my`; STUDENT requires verified
    `@graduate.utm.my`).
- Out of scope: hard delete, protected-owner rotation, Clerk account deletion, bulk import.

### Proposed implementation

Planned mini-tasks:

- **MT1** shared contracts and pure validators (`packages/shared/src/admin/admin.ts`) with unit tests.
- **MT2** migration `0006`: access-status audit trigger on `user_access_audit_log` plus a pending
  invitation table, with `db/checks`.
- **MT3** API repository mutations in `sql.transaction` with DB error mapping (SQLSTATE 23514 and
  23505 to stable error codes).
- **MT4** API routes: `POST /api/admin/users` (existing user), `POST /api/admin/invitations`,
  `GET /api/admin/invitations`, `DELETE /api/admin/invitations/:id` (revoke invite),
  `POST /api/admin/users/:id/roles`, `DELETE /api/admin/users/:id/roles/:role`,
  `PATCH /api/admin/users/:id/access`, plus invite redemption at first sign-in.
- **MT5** web UI: add-account/invite panel, role and access controls with in-page confirmation and
  required reason.
- **MT6** tests, OpenAPI `docs/api/admin-users.openapi.json`, `docs/auth-multi-role.md` update.

APIs / database / interfaces: new admin endpoints and migration 0006 as above (MT2-MT4).
Dependencies / shared-file impact: shared contract additions are backward compatible (new exports only).

### Acceptance criteria

- [ ] SYSTEM_ADMIN can add an account for an existing Clerk user and send an invitation, each with roles and a reason.
- [ ] Grant/revoke role and suspend/reactivate work, each requiring a 1-500 char trimmed reason stored in audit.
- [ ] Self-suspension, self SYSTEM_ADMIN revoke, last-active-admin removal and protected-owner changes are rejected with stable error codes.
- [ ] Roles are re-checked against the VERIFIED email domain at grant and at invitation redemption.
- [ ] No hard delete exists; non-admins receive 403.

### Verification plan

- Per mini-task: `npx vitest run <area>`, `npm.cmd run typecheck`, `npm.cmd run lint`.
- MT2: db checks; MT5: browser UI harness; MT6: full test suite and OpenAPI validation.

### Risk / assumptions / rollback

- Risks: last-admin/self-lockout; email-domain eligibility; invite trust (roles must be re-checked
  against the VERIFIED email at redemption, never trusted from the invite alone); audit completeness
  (access-status changes have no audit trigger until MT2).
- Assumptions / blockers: roles are read from DB per request (no server-side cache); neon HTTP driver
  is used, so multi-statement writes go through `sql.transaction([...])`.
- Rollback: revert code; migration 0006 gets a documented down/forward-fix plan in MT2.

## 2. Implementation

- **Status:** MT1-MT6 implemented and reviewed.
- **Files actually changed (MT1):** `packages/shared/src/admin/admin.ts`,
  `packages/shared/src/admin/admin.test.ts`, and this record.
- **Summary (MT1):** Added `ADMIN_REASON_MAX_LENGTH` (500), `AdminInvitation` and
  `AdminInvitationStatus`, request types (create account, create invitation, grant role, revoke
  role, change access), `ADMIN_MUTATION_ERROR_CODES` / `AdminMutationErrorCode`, and pure helpers
  `normaliseReason`, `normaliseEmail`, `isAdminRole` and `validate*Request` validators that reject
  unknown fields, duplicate/invalid/empty roles and bad emails.
- **Decisions / deviations from plan:** Validators return `{ ok, value | error }` rather than throwing.
  Emails are trimmed and lower-cased; max 254 chars.
- **Migrations / env / shared contracts:** Shared contracts only (additive); no migration yet.

### MT2 - migration 0006 (access-status audit and pending invitations)

- **Files (MT2):** `db/migrations/0006_admin_user_management.sql`, `db/migrations/manifest.json`, `db/engineering-extensions.json`, `db/checks/008_admin_user_management.sql` (schema), `db/checks/009_admin_user_management_behavior_tests.sql` (rollback-only behaviour), `db/checks/005_multi_role_access.sql` (public table count 28 to 29), `tools/db/cli.mjs` (verify/test check lists), `tools/db/review.mjs` (static check list), `tools/db/migrations.test.mjs` (version list plus a 0006 test). Check number 007 was already taken (network security), so the new checks are 008 and 009.
- **Summary (MT2):**
  - Access-status audit: `user_access_status_audit` is an AFTER UPDATE OF access_status row trigger (WHEN old differs from new) on `user_access_assignment`. It requires trusted non-empty `app.access_actor`/`app.access_reason` (else SQLSTATE 23514, as in 0004) and inserts one `user_access_audit_log` row (ACCESS_STATUS_CHANGE, old/new value, performed_by = actor, reason). Being AFTER, it runs once the legacy `legacy_access_compatibility` BEFORE trigger (advisory lock 260002/1, last-admin guard) has accepted the change, so blocked changes never audit. No-op updates and INSERTs are not audited.
  - `public.admin_user_invitation` matches the MT1 `AdminInvitation` contract: uuid PK (gen_random_uuid is core since PG13; target is PG18; no pgcrypto needed), lower-case trimmed email, roles varchar(20)[] (1-3, only STUDENT/COORDINATOR/SYSTEM_ADMIN, duplicates rejected in the guard trigger because CHECK cannot use subqueries), status PENDING/ACCEPTED/REVOKED/EXPIRED, nullable clerk_invitation_id, reason trimmed 1-500, expires_at > created_at, accepted/revoked columns tied to status by one CHECK, accepted_access_assignment_id FK ON DELETE RESTRICT, partial UNIQUE (email) WHERE status = 'PENDING'. There is no protected_owner column; roles are still granted only through `user_role_assignment`, whose trigger blocks protected-owner creation.
  - Protection: `db_admin_user_invitation_guard` requires a trusted actor; INSERT must be PENDING with inviter = actor; UPDATE only from PENDING, creation fields immutable, clerk_invitation_id settable once (NULL to value), ACCEPTED not after expires_at, REVOKED needs revoker = actor, EXPIRED only after expires_at; terminal rows are frozen. DELETE and TRUNCATE use `db_immutable`. REVOKE ALL FROM PUBLIC on the table and EXECUTE on both new functions.
- **Existing access_status update paths (grep of apps, tools, db, packages):** no application code UPDATEs access_status (apps only SELECT it and INSERT accounts with ON CONFLICT DO NOTHING, which is unaffected). Only test code changes status: `db/checks/002_behavior_tests.sql` (line ~90 and ~93) and `db/checks/006_multi_role_behavior_tests.sql` (lines ~75 and ~78) already run with app.access_actor/app.access_reason set earlier in the same transaction and so keep working (they now also write audit rows, rolled back); `tools/auth/test-multi-role-db.mjs` (race test, line ~73) sets actor and reason on both connections. `db/checks/003_role_boundary_tests.sql` uses WHERE false. No path was left without context. Future admin API code (MT3) must set both settings in the same transaction (set_config(..., true)) before updating access_status.
- **Rollback (down / forward-fix):** migrations here are forward-only. To back out before the API uses it: `DROP TRIGGER user_access_status_audit ON public.user_access_assignment; DROP FUNCTION public.db_user_access_status_audit(); DROP TABLE public.admin_user_invitation; DROP FUNCTION public.db_admin_user_invitation_guard();` shipped as a new migration 0007 (never edit 0006 after it is applied; the checksum is recorded). Audit rows already written to user_access_audit_log are immutable and stay. Invitation DELETE is blocked by design, so dropping the table discards invitation history; prefer a forward fix.
- **Verification (MT2):** offline only (no database was contacted): `npm run test:db-tooling`, `npm run lint:db`, `node tools/db/cli.mjs review` (parses 0006 and checks 008/009 with libpg-query). Coordinator then executed them on a disposable local PostgreSQL 18 container (`local-disposable` target, `127.0.0.1:55432`, database `utm_db_foundation_mt2`, dedicated `DB_FOUNDATION_LOCAL_URL`; no app `.env`/`DATABASE_URL` used): `db:migrate` applied 0001-0006, `db:verify` all PASS (including `admin_user_management_verification`), `db:test` 125 PASS / 0 FAIL (including 009 behaviour tests).
- **Coordinator fix (MT2):** acceptance-expiry check now uses the database clock (`clock_timestamp() > expires_at`, and `accepted_at` may not be in the future) instead of trusting a caller-supplied, possibly backdated, `accepted_at`.

### MT3 - API repository mutations, error mapping, identities, eligibility

- **Files (MT3):** `apps/api/src/modules/admin/contracts.ts`, `repository.ts`, `errors.ts` (new), `eligibility.ts` (new), `identities.ts`, `index.ts`, tests `mutations.test.ts` (new), `repository.database.test.ts` (new, opt-in), `identities.test.ts`, `admin.test.ts` (fakes extended). No route or web changes.
- **Summary (MT3):**
  - `createAdminRepository(query, transaction)`: new `AdminTransaction` runner (statements in, one row set per statement out) injected like `query`; `index.ts` wires it to `sql.transaction(statements.map(s => sql.query(...)))` (neon 1.2.0 non-interactive HTTP transaction). Mutations: `createAccount` (optional `invitationId` for atomic redemption), `grantRole`, `revokeRole`, `setAccessStatus`, `createInvitation`, `attachClerkInvitation`, `listInvitations`, `revokeInvitation`, `expireInvitations`, `acceptInvitation`. Each runs ONE transaction whose first statement is `SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)` and returns refreshed rows read inside that transaction.
  - Conditional logic: non-interactive transactions cannot branch in JS, so preconditions are `guard` statements (`SELECT CASE WHEN <cond> THEN (<non-constant subquery>)::integer END`) that fail with SQLSTATE 22P02 carrying `ADMIN_GUARD:<CODE>`, rolling back everything; the cast uses a scalar subquery because a constant would be folded at plan time. Single conditional UPDATEs (`... WHERE status='PENDING' RETURNING`) check the row count afterwards; zero rows means nothing was written, so a follow-up read classifies NOT_FOUND / INVITATION_NOT_PENDING / INVITATION_EXPIRED.
  - STUDENT auto-seed: inserting `user_access_assignment` seeds a `LEGACY_INIT` STUDENT membership. `createAccount` mirrors `tools/auth/role-provisioning.mjs`: insert account, grant SYSTEM_ADMIN then COORDINATOR as `OPERATOR` (actor = admin), then delete the seeded STUDENT row only when STUDENT was not requested (a requested STUDENT keeps the seed, exactly like provisioning). An ACCOUNT_EXISTS guard makes the account provably new in that transaction.
  - Self-lockout (own suspension, own SYSTEM_ADMIN revoke) and protected-owner suspension are guards in SQL against the immutable `clerk_user_id`; last-active-admin, protected-owner role removal and duplicate grants are enforced by the 0004/0006 triggers and mapped from SQLSTATE 23514/23505.
  - `errors.ts`: `AdminMutationError` (status, stable code, fixed safe message) and `mapAdminDatabaseError`; extra codes beyond MT1 (`INVALID_REQUEST`, `NOT_FOUND`, `ROLE_NOT_ASSIGNED`, `INVITATION_NOT_PENDING`, `INVITATION_EXPIRED`, `CONFLICT`, `MUTATION_FAILED`). Unknown errors map to `MUTATION_FAILED` (500) with no SQL text.
  - `identities.ts`: `findByEmail` (exact primary-email match, ambiguity returns null, verification status reported), `createInvitation` (`ignoreExisting:false`, `notify:true`, no metadata), `revokeInvitation`.
  - `eligibility.ts`: `checkRoleEligibility(primaryEmail, roles)` reuses `auth/policy.ts` `eligibleRoles` for STUDENT/COORDINATOR and adds the plan's exact-`@utm.my` rule for SYSTEM_ADMIN (the runtime policy does not domain-gate SYSTEM_ADMIN).
- **Race reasoning:** guards and writes share one transaction but guards read a statement snapshot, so a concurrent change can slip between guard and write; the safety-critical rules (last active admin, protected owner, duplicate grant, one pending invitation per email, terminal invitation freeze, acceptance expiry on the DB clock) are enforced by triggers/indexes under advisory lock 260002/1 or unique constraints and cannot be bypassed. Guards only add friendlier codes for the self-lockout/not-found cases. A concurrent duplicate revoke is an idempotent no-op delete.
- **Verification (MT3):** `npm.cmd run typecheck`, `npm.cmd run lint` clean; `npm.cmd test` 42 files passed, 3 skipped, 605 tests passed (24 skipped, the opt-in DB suites); `apps/api/src/modules/admin` 72 passed including 11 DB-backed tests run with `ADMIN_TEST_DATABASE_URL` pointing only at the disposable local container (`127.0.0.1:55432/utm_db_foundation_mt2`, migrated through 0006). The DB test uses `pg` (the neon HTTP driver cannot reach plain PostgreSQL) to run the repository's exact statements with `sql.transaction` semantics inside an outer rolled-back transaction with a SAVEPOINT per mutation; row counts afterwards were 0, nothing committed. The real neon HTTP transport is not exercised.

### MT4 - admin routes, invitation redemption, OpenAPI

- **Files (MT4):** `apps/api/src/modules/admin/routes.ts` (mutation routes; non-GET no longer a blanket 405), `redemption.ts` (new), `routes.mutations.test.ts` (new), `redemption.test.ts` (new), `index.ts` (shared repository factory, `createInvitationRedeemer`), `repository.ts` / `contracts.ts` (LAST_ROLE guard, `findPendingInvitationByEmail`, `clerkInvitationIdOf`), `errors.ts` and `packages/shared/src/admin/admin.ts` (codes `LAST_ROLE`, `INVITATION_DELIVERY_FAILED`), `apps/api/src/modules/auth/contracts.ts` (`InvitationRedeemer`, optional `AuthDependencies.invitations`), `apps/api/src/middleware/auth.ts` (redemption hook), `tools/integration/prepare.mjs` (generated wiring `auth.invitations = createInvitationRedeemer(...)`), tests `admin.test.ts`, `mutations.test.ts`, `repository.database.test.ts`, `docs/api/admin-users.openapi.json` (new), `docs/auth-multi-role.md`.
- **Summary (MT4):**
  - Routes: `POST /api/admin/users`, `POST /users/:id/roles`, `DELETE /users/:id/roles/:role`, `PATCH /users/:id/access`, `GET|POST /api/admin/invitations`, `DELETE /api/admin/invitations/:id`. Authorization is the existing `authorize(... SYSTEM_ADMIN)`; the actor is always its `clerkUserId`. JSON bodies: non-`application/json` gives 415; invalid JSON, bodies over 16 KB, unknown fields and invalid ids give 400; `AdminMutationError` is mapped to `{ error: { code, message } }` with its status; any other error is the generic 503 `ADMIN_UNAVAILABLE`. Unsupported methods on known paths return 405 with the right `Allow`; unknown paths are 404.
  - D1: `revokeRole` has an in-transaction `LAST_ROLE` guard (409). D2: grants to suspended accounts are allowed. D3: invitations expire in 7 days in both the database row and Clerk. D4: DB PENDING row, then Clerk, then attach; Clerk failure revokes the row and returns 503 `INVITATION_DELIVERY_FAILED`; attach failure best-effort revokes Clerk and DB. D5: existing-user creation requires a found, verified email and `checkRoleEligibility`; invitation creation checks the invited domain and refuses existing Clerk users who already have an account (`ACCOUNT_EXISTS`). D6: actor from `authorize()` only.
  - Added beyond the brief (matches acceptance criteria): `POST /users/:id/roles` re-checks eligibility against the target's CURRENT verified Clerk email (404 `NOT_FOUND`, `CLERK_USER_NOT_FOUND`, 503 if the provider is down, 422 `ROLE_NOT_ELIGIBLE`). `DELETE /invitations/:id` reads the Clerk reference through `clerkInvitationIdOf` so the public `AdminInvitation` contract is unchanged.
  - Redemption hook: `authorize()` in `apps/api/src/middleware/auth.ts`, only on the explicit `initialize` path when the user has no application account, runs before `requireStudentEmail` (so invited `@utm.my` staff, who could never self-register, can get in). `deps.invitations.redeem(identity)` finds the PENDING unexpired invitation for the exact lower-cased VERIFIED primary email, re-checks `checkRoleEligibility`, then `createAccount(clerkUserId, roles, actor = the user, 'Invitation accepted', { invitationId })` (atomic account, roles and ACCEPTED). Not redeemable (no invitation, unverified, ineligible, expired, revoked, account appeared concurrently) returns null and the old behaviour runs unchanged; infrastructure errors propagate (503) instead of silently self-registering. Existing accounts are never auto-granted. The auth module only sees the narrow `InvitationRedeemer` interface; the admin module supplies it and `tools/integration/prepare.mjs` wires it only when the admin API is installed.
- **Verification (MT4):** `npm.cmd run typecheck`, `npm.cmd run lint`, full `npm.cmd test`, and the DB-backed admin tests against the disposable local container only (see the coordinator report for outputs). The DB suite gained LAST_ROLE, pending-invitation lookup and an end-to-end redeemer test; protected-owner and last-admin fixtures now hold a second role so they still reach their own rules. Admin OpenAPI parses as JSON and has no unresolved `$ref`.

### MT5 - admin web UI

- **Files (MT5):** `apps/web/src/features/admin/AdminUserManagement.tsx` (new: `ReasonDialog`, `AddUserPanel`), `AdminPages.tsx`, `AdminRoutes.tsx`, `client.ts`, `client.test.ts`, `admin.css`; `tools/admin/fixtures.mjs`, `tools/admin/test-ui.mjs`; Part A: `apps/api/src/modules/admin/routes.ts`, `errors.ts`, `routes.mutations.test.ts`, `packages/shared/src/admin/admin.ts`, `docs/api/admin-users.openapi.json`, `docs/auth-multi-role.md`.
- **Part A:** `POST /api/admin/invitations` now returns 409 `CLERK_USER_EXISTS` ("This person already has a sign-in account. Use Add account instead.") when `findByEmail` finds a Clerk user without an application account; `ACCOUNT_EXISTS` is kept when an application account also exists.
- **Summary:** client methods `createAccount`, `grantRole`, `revokeRole`, `setAccess`, `listInvitations`, `createInvitation`, `revokeInvitation` with strict response decoding and `AdminApiError` for error bodies. `/admin/users` gains an "Add a user" panel (Add existing user / Send invitation, shared validators, inline `role="alert"` errors, success status with link to the new account) and an Invitations table (status filter, default Pending, Revoke with reason). `/admin/users/:id` gains per-role Remove, Add role (only roles not held) and Suspend/Reactivate. Every mutation uses an in-page native modal `<dialog>` (focus on reason, Escape cancels, focus restored, 1-500 char counter, stays open with the server message on failure, double-submit guarded); no `window.confirm/alert/prompt`. Protected-owner memberships and account are shown locked; own System Admin removal and own suspension are hidden (server still enforces). After success the returned detail replaces the page data and the audit list remounts.
- **Verification (MT5):** `npm.cmd run typecheck`, `npm.cmd run lint` clean; `npm.cmd test` 44 files passed, 3 skipped, 702 tests passed; `npm.cmd run test:ui:admin` 31 browser checks passed (add existing user incl. ROLE_NOT_ELIGIBLE/not found, invitation incl. CLERK_USER_EXISTS, revoke with reason, grant, remove, LAST_ROLE, suspend/reactivate, protected owner/self locks, no window dialogs, no overflow at 320/375/768); `build:cloudflare` built with DATABASE_URL, AUTH_TEST_DATABASE_URL and OFFERINGS_TEST_DATABASE_URL unset. Desktop and mobile screenshots inspected visually.

## 3. Review

- **Self-review checklist:** MT1 coordinator diff review passed: additive exports only, no API/web
  changes, validators reject unknown fields, empty/duplicate/invalid roles, bad emails and invalid
  reasons. Domain eligibility intentionally stays server-side (MT3/MT4). MT2 coordinator SQL review
  passed after the acceptance-expiry clock fix: additive only, trusted-context pattern matches 0004,
  rejected last-admin suspension writes no audit row, invitations cannot carry protected owner.
  MT3 review passed: one Neon transaction per mutation with trusted actor/reason context first,
  safety rules left to DB triggers/indexes, unknown errors never leak SQL text, staff accounts drop
  the auto-seeded STUDENT grant. Coordinator decisions D1-D6 (LAST_ROLE, grants to suspended
  accounts allowed, 7-day expiry in DB and Clerk, invitation compensation, verified-email
  eligibility, actor from session only) passed to MT4. MT4 review passed: the first-sign-in hook
  only redeems for users without an account, with a verified exact email match and re-checked
  eligibility, and propagates infrastructure errors instead of silently self-registering. MT5 review
  passed: no encoding damage, screenshots (desktop/mobile) inspected, output escaping confirmed.
  MT6 (tests, OpenAPI, `docs/auth-multi-role.md`) was delivered inside MT4/MT5.
- **Test evidence:** MT1: `npx vitest run packages/shared/src/admin` 43/43 passed (rerun by
  coordinator); `npm run typecheck` and `npm run lint` (`--max-warnings 0`) passed. Final
  coordinator rerun: typecheck and lint clean; `npm test` 702 passed / 27 skipped (opt-in DB
  suites); admin suite with the disposable local DB 164/164; `test:ui:admin` 31 browser checks
  PASS; `test:db-tooling` 14/0; local container `db:test` 125/0.
- **Manual checks:** Visual review of `/admin/users` and `/admin/users/:id` screenshots at desktop
  and 375 px.
- **Defects found and fixes:** MT2 backdated `accepted_at` could accept an expired invitation (fixed
  to use the DB clock). MT4 redemption audit reason now names the invitation
  (`Invitation <uuid> accepted`) so the trail links back to the inviter.
- **Neon development migration (2026-11-01, user-approved):** project `still-waterfall-91972583`,
  branch `br-shy-cherry-azuzy9v5`, database `neondb`, PostgreSQL 18. Status before: 0000-0005
  applied with matching checksums, only 0006 pending. `migrate` applied 0006; read-only `verify`
  PASS (`schema_verification`, `admin_user_management_verification`); status after: none pending.
  `db:test` was not run on the shared branch. This network resets PostgreSQL TLS on port 5432, so
  the repository's own gate functions (`validateTarget`, `verifyConnectedTarget`,
  `migrationStatus`, `applyMigrations`) were run once through a temporary, deleted wrapper using
  the Neon WebSocket `Client` on port 443; the target file and dedicated credential live only under
  the ignored `.wrangler/db-foundation/`. Production was not touched.
- **Review outcome:** PASS (coordinator/AI review). Executor: Sonnet by user override of the Luna
  default.
- **Human reviewer / approval:** Not required by the user for this local change; no human approval
  is claimed.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Added
- **Added / Changed / Fixed / Removed:** Added System Administrator user management: add an existing
  Clerk user, send 7-day Clerk invitations (redeemed at first sign-in against the verified email),
  grant/remove roles, suspend/reactivate, revoke invitations; every change requires a reason and is
  audited. Delete means suspend; there is no hard delete. Added migration 0006 (access-status audit
  trigger, `admin_user_invitation`).
- **Affected routes / tables / consumers:** `POST /api/admin/users`, `POST|DELETE
  /api/admin/users/:id/roles[/:role]`, `PATCH /api/admin/users/:id/access`, `GET|POST
  /api/admin/invitations`, `DELETE /api/admin/invitations/:id`; `POST /api/me/initialize`
  (invitation redemption before student self-registration); tables `user_access_assignment`
  (new trigger), `user_access_audit_log`, `admin_user_invitation`; web `/admin/users`,
  `/admin/users/:id`.
- **Breaking changes / migration steps:** Apply migration 0006 before deploying the API. Any
  `access_status` update now requires `app.access_actor` and `app.access_reason` in the same
  transaction.
- **Verification summary:** See Test evidence above.
- **Outstanding blockers / follow-up:** Real Clerk invitation delivery and the Neon HTTP transaction
  transport are untested end-to-end (tests use fakes and `pg`); verify manually on the local app.
  Production migration and deployment not done.
- **Final status:** DONE (local; not committed, pushed or deployed)
