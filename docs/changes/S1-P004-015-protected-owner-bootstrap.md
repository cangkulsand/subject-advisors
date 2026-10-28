# S1-P004-015 - Protected administrator owner bootstrap

- **Status:** APPLIED_AND_DATABASE_VERIFIED
- **Date:** 2026-10-28
- **Owner / requirements:** P004; explicitly authorized development protected-owner bootstrap.
- **Identity:** The previously verified Clerk identity; exact email and ID are retained only in ignored private operator evidence.
- **Requested memberships:** `STUDENT`, `COORDINATOR`, `SYSTEM_ADMIN`; protect only the `SYSTEM_ADMIN` membership and use coordinator policy `OWNER_STUDENT_COORDINATOR`.
- **Actor / audit reason:** `__USER_REQUESTED_OPERATOR__`; `Explicit user request to complete protected owner with STUDENT, COORDINATOR and SYSTEM_ADMIN, 2026-10-28.`
- **Execution boundary:** The user ran the reviewed host command. No live provider or database writes were performed by the assistant. Production was untouched.

## 1. Plan

The user explicitly authorized completion of one full protected-owner account after the development account received its initial unprotected `SYSTEM_ADMIN` membership. The host runner binds the exact Clerk ID and email, revalidates the unique active user and verified primary email, and targets only the approved development database. It preserves the existing active account, legacy default `STUDENT`, and existing `STUDENT` and `SYSTEM_ADMIN` memberships and grant provenance. It adds `COORDINATOR` with `OWNER_STUDENT_COORDINATOR` policy and protects the existing `SYSTEM_ADMIN` membership through the audited helper.

The plan excluded production, account creation/reactivation, profile changes, public endpoints, schema or migration work, changes to protection triggers, and weakening TLS. The host runner defaults to dry-run and requires `--apply`. A fully configured owner state is a no-op. Pre-write failures report no attempted change; uncertain transaction outcomes and post-commit errors do not claim rollback.

## 2. Implementation

- **Status:** APPLIED BY USER ON HOST; INDEPENDENTLY DATABASE-VERIFIED.
- **Files in this change:** This record; `tools/auth/role-provisioning.mjs`; `tools/auth/role-provisioning.test.mjs`; ignored `.wrangler/admin-access-review/grant-owner.mjs`; private ignored `.wrangler/admin-access-review/owner-receipt.json`.
- **Existing-account guard:** The audited helper now supports request-scoped `requireExistingSystemAdmin`. It locks and rechecks the existing `SYSTEM_ADMIN` membership inside the transaction, preventing a concurrent change from causing the bootstrap to recreate it and lose its prior provenance. The existing `STUDENT` guard remains active.
- **User-run transaction:** The host receipt records `APPLIED` at `2026-10-28T13:33:01.692Z` on the approved development target. The active account's legacy default remains `STUDENT`. Final memberships are `STUDENT` (`ROLE_DOMAIN`, `MIGRATION_COMPAT`, unprotected), `COORDINATOR` (`OWNER_STUDENT_COORDINATOR`, unprotected), and `SYSTEM_ADMIN` (`ROLE_DOMAIN`, `OPERATOR`, protected). The actual delta was adding `COORDINATOR` and protecting the existing `SYSTEM_ADMIN`; no additional student or admin membership was granted. Coordinator policy did not require an update because the coordinator membership was newly added with the requested policy.
- **Independent database verification:** The coordinator separately queried the connected Neon database and confirmed project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`; ACTIVE account and all three memberships with the expected policies/protection; global protected-owner count `1`; one owner-protection audit event; and one coordinator-exception audit event matching the distinct bootstrap actor and reason. Production was untouched.
- **Earlier network limitation:** The initial sandbox Clerk lookup failed with `EACCES`. The later host run succeeded using the existing local development credentials; the sandbox limitation did not indicate a missing Clerk account. The host command emitted a non-blocking PostgreSQL SSL warning and completed successfully. No dependency or SSL configuration was changed.

## 3. Review

- **Self-review:** Coordinator review accepted the host handoff and its guards. The handoff verified the exact identity and target, refused conflicting protected owners, preserved the existing account and memberships, performed the audited transaction, checked the resulting roles/policies/protection, and wrote a private receipt from actual database state.
- **Verification:** Syntax checks and all 19 operator/database tests passed during handoff preparation. They were not rerun for this documentation-only update. The user-run receipt and the coordinator's independent read-only query confirm the applied state and audit events.
- **TLS/configuration:** The host output's PostgreSQL SSL warning was non-blocking for the successful transaction. No dependency or TLS setting was changed; this record makes no claim about future connections.
- **Review outcome:** OPERATOR GRANT APPLIED AND DATABASE-VERIFIED. Human peer review of the code changes remains pending; the coordinator's self-review is not human peer review.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Security / Chore
- **Added / Changed:** Prepared the guarded dry-run-by-default host runner, added the locked existing-`SYSTEM_ADMIN` guard and regression test, and recorded the user-run protected-owner bootstrap with independent database verification. The owner receipt remains ignored and contains the private identity.
- **Affected tables / consumers:** Existing `user_access_assignment` and `user_role_assignment` records through the audited operator helper only. No schema or public route changes.
- **Breaking changes / migration steps:** None.
- **Verification summary:** 19 operator/database tests passed during implementation review; user host receipt reports `APPLIED`; independent coordinator query confirms memberships, owner protection, and both audit events. Documentation-only update received a diff review; no tests were run for it.
- **Outstanding items:** Human peer review of code remains pending. The protected-owner operation itself is complete.
- **Final status:** APPLIED_AND_DATABASE_VERIFIED (human peer review pending for code)
