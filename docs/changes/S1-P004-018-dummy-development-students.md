# S1-P004-018 — Dummy development student accounts

- **Status:** ACCOUNT CREATION AND DATABASE VERIFICATION COMPLETE — CLOSEOUT REVIEW PASSED
- **Date:** 2026-11-02
- **Sprint:** Sprint 1
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC01 registration; UC02 login, logout and server access checks
- **Branch / PR:** `main` / no PR
- **Target:** Subject Advisors DEVELOPMENT; Neon project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`
- **Review:** Corrected implementation was coordinator-reviewed. User reports successful host seeder completion; independent read-only Neon verification passed. No independent Clerk reread or browser login was performed.

## 1. Plan

### Objective
Create 50 dummy development Clerk users and matching active STUDENT access assignments and complete profiles; provide passwords at the host terminal without saving them.

### Scope
- Emails `student01+clerk_test@graduate.utm.my` through `student50+clerk_test@graduate.utm.my`; profile names `Dummy Student 01` through `Dummy Student 50`; matric numbers `DUMMY-20261101-01` through `DUMMY-20261101-50`.
- Tag Clerk users with private metadata `{ purpose: "subject-advisors-development-dummy", batch: "20261101-50" }`.
- Profiles use curriculum 3 (active SECRH Computer Networks and Security English curriculum), semester 1 (configured ID 1, fixture assumption), 0 work hours, 10 study hours.
- Assign only STUDENT / ACTIVE. The database trigger creates the STUDENT membership and audit grant.
- Create no academic records or semester offerings. Do not add staff roles, send email/invitations, change schema/config, commit, push or deploy.

### Approach and files
- Added `tools/auth/seed-development-students.mjs` and focused `tools/auth/seed-development-students.test.mjs`.
- Host command: `node tools/auth/seed-development-students.mjs --apply`. No arguments or `--dry-run` perform reads only; `--help` is offline.
- Load `.dev.vars` and `.env.local` in memory, require matching `sk_test_` / `pk_test_` development keys, and never write config files. Check the pinned Neon URL shape and verify `current_database()`, `neon.project_id` and `neon.branch_id` before any Clerk create.
- Verify Clerk Backend instance is development, the secret-key instance's domain `frontendApiUrl` matches the parsed publishable-key host, and the Frontend API environment reports development. Require enabled email/password first-factor sign-in and supported required signup attributes. If test mode is explicitly false or legal consent is required, stop. Signup restriction/allowlist mode alone does not block admin provisioning. The script calls no email, invitation, verification-code or notification endpoint.
- Find candidate users by exact email. Reuse only an unlocked, verified, password-enabled user with the expected primary email and batch metadata. Never reset an existing password. New users use Backend `createUser` with ordinary password validation; the SDK marks the first email verified by default. Send first/last name only when enabled by the instance.
- Generate a distinct cryptographically random password per new user using the instance's password policy and a two-digit suffix. Keep passwords in memory and print created/uncertain credentials in a terminal handoff, including on partial failure; write no password or key to disk, command arguments or logs. A later retry relies on the earlier terminal handoff and never prints an unknown existing password.
- After all 50 identities are mapped to their returned Clerk `user.id`, use parameterized SQL in one PostgreSQL transaction. Recheck IDs, matric numbers, profile fields, active status and sole STUDENT membership under an advisory lock. Insert only missing rows for exact batch-owned identities; perform no updates and reject collisions/mismatches. The account trigger creates the role and audit rows. Verify all 50 accounts/profiles/roles, audit grants, and zero related academic records/offerings before commit.
- Verify one newly created password with Clerk Backend `verifyPassword`; this does not create a browser session. Browser login was not performed.

### Follow-up plan — 2026-11-02
- The first host `--apply` attempt stopped at the prewrite `EMAIL_PASSWORD_SIGN_IN_UNAVAILABLE` gate. No Clerk users or database rows were created by that attempt. The host's SSL deprecation warning was nonblocking; TLS settings were not changed.
- Correct the local gate to require `email_address.enabled`, `email_address.used_for_first_factor`, and `password.enabled`. Clerk's password attribute is a credential setting, not an identifier, so its `used_for_first_factor` value may be false or absent while password sign-in is enabled.
- Add focused tests for false/absent password `used_for_first_factor`, while retaining failures for disabled/missing password and disabled email identifier. Do not change provider configuration.
- The user later reported the host command completed successfully. Root independently queried the pinned development branch read-only; do not store or request password values for this verification.

### Acceptance criteria
- The script fails closed for the wrong database branch, live/mismatched Clerk keys, non-development instance/domain, unavailable email/password sign-in, unsupported required fields, legal-consent requirement, identity or matric collision, mismatched/suspended account, extra role, or incomplete database reconciliation.
- Dry-run never invokes the mutation callback. `--apply` creates/reconciles only the intended test batch and prints only safe counts/status plus the requested terminal credential handoff.

### Risks, dependencies and rollback
- The sandbox cannot reach Clerk: direct Node fetch returned `TypeError` with cause `EACCES`. The installed Clerk SDK lookup returned a generic `unexpected_error`; the CLI `doctor` warned about unavailable host state. No live Clerk configuration, candidate email or account was verified here. Run the reviewed command only in the user's host terminal.
- If Clerk creation stops partway, the script rechecks exact email before retrying a rate-limited create and prints successful or uncertain passwords in `finally`. It never blindly replays an unknown create. The PostgreSQL transaction is atomic; on failure it rolls back all DB writes, while already-created Clerk users remain tagged for safe retry.
- No automatic deletion is performed. Reconcile only this batch by exact Clerk IDs and metadata.

## 2. Implementation

- **Status:** Implemented locally; host apply completed per user report, and database verification passed independently.
- **Files changed:** `tools/auth/seed-development-students.mjs`; `tools/auth/seed-development-students.test.mjs`; this record.
- **Summary:** Added a guarded, retry-safe host seeder with read-only default, pinned Neon target checks, Clerk instance/domain/FAPI checks, exact identity ownership checks, password handoff and transactional account/profile reconciliation.
- **Deviations:** The first host attempt stopped before writes on the invalid password-factor gate. After its correction, the user ran the host command successfully. No provider calls were made from this sandbox.

## 3. Review

- **Self-review:** Checked scope, target guards, ID-to-profile mapping, strict non-null profile checks, collision handling, no-overwrite behavior, trigger-managed STUDENT role/audit, password secrecy and partial-failure handling including recovered identity password verification.
- **Local verification:** `node --check tools/auth/seed-development-students.mjs` — PASS. `node --test tools/auth/seed-development-students.test.mjs` — PASS, 13 tests. Scoped ESLint — PASS. `node tools/auth/seed-development-students.mjs --help` — PASS, offline.
- **Coordinator review:** Corrected implementation and final record closeout passed coordinator review.
- **Host execution / database acceptance:** User reports the host `--apply` run completed successfully. Independent read-only Neon verification on project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb` confirmed 50 matching dummy profiles, 50 ACTIVE accounts with app_role STUDENT and sole STUDENT role, all profiles bound to returned Clerk IDs with curriculum 3, semester 1, 0 work hours and 10 study hours; academic records 0 and semester offerings 0. Comparison with the pre-seed baseline found all 11 original access, profile and role rows unchanged.
- **Limits:** No independent Clerk user reread or browser login was performed. The passwords were not inspected or persisted in the repository; the user should keep the handed-off email/password pairs in a password manager.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Host-side development test-data seeder
- **Added / Changed / Fixed / Removed:** Added a one-command, guarded host seeder and focused tests for the authorized 50-user dummy batch.
- **Affected tables:** `user_access_assignment`, trigger-managed `user_role_assignment` / audit log, and `student_profile` only.
- **Breaking changes / migration:** None.
- **Verification summary:** Focused tests, syntax, lint and offline help pass. User reports successful host seeding; coordinator's independent database verification confirms the requested batch, zero academic records/offerings, and unchanged original 11 access/profile/role rows.
- **Outstanding follow-up:** Store the already-handed-off credentials in a password manager. Browser login was not independently tested and is optional follow-up.
- **Final status:** ACCOUNT CREATION AND DATABASE ACCEPTANCE COMPLETE — BROWSER LOGIN NOT TESTED

### Follow-up — 2026-11-02

- **Changed:** Removed the incorrect requirement that Clerk's password attribute be marked `used_for_first_factor`; email remains the enabled first-factor identifier and password must remain enabled.
- **Verification:** `node --check tools/auth/seed-development-students.mjs` PASS; focused Node tests 13/13 PASS; scoped ESLint PASS; offline `--help` PASS; whitespace scan clean.
- **External state:** After the corrected host run, independent read-only Neon verification confirmed all 50 account/profile rows, zero records/offerings, and all 11 pre-existing access/profile/role rows unchanged. No password values were inspected or persisted by the coordinator.
- **Status:** Account creation and database verification complete; browser login not tested.




