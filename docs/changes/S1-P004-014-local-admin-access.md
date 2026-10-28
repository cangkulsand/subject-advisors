# S1-P004-014 — Local administrator access preflight

- **Status:** ADMIN-ONLY GRANT APPLIED; protected-owner follow-up is documented in S1-P004-015
- **Date:** 2026-10-28
- **Owner / requirements:** P004; user-authorized SYSTEM_ADMIN access preflight for the development environment.
- **Requested identity:** the user-supplied verified email.
- **Requested role:** `SYSTEM_ADMIN`; `protected_owner=false`
- **Requested actor:** `__USER_REQUESTED_OPERATOR__`
- **Reason:** `Explicit account owner request to enable the administration workspace, 2026-10-28.`
- **Execution boundary:** This change covered the additive, unprotected SYSTEM_ADMIN grant. The user ran the reviewed host handoff; this sandbox made no provider/database writes. The separately authorized protected-owner bootstrap is S1-P004-015.

## 1. Plan

The user explicitly authorized an additive SYSTEM_ADMIN grant for the supplied email. This sandbox could not reach Clerk (EACCES), so this change prepared an ignored host-run operator handoff. The user ran it with --apply; the private receipt and independent read-only database verification confirm the grant on the approved development target. The grant retained the existing STUDENT membership and left protected_owner=false. Exact email and Clerk ID remain in ignored private evidence only.

Expected artifacts: this record, ignored .wrangler/admin-access-review/grant-admin.mjs and private receipt, plus a narrow requireExistingStudent guard in the audited provisioner with unit tests. Acceptance required syntax and operator tests, exact target and migration checks, a unique active verified Clerk identity, an existing ACTIVE account with STUDENT, and the user-run explicit --apply transaction. This environment did not run --apply. Pre-write failures must report that no change was attempted; uncertain or post-commit outcomes must not claim rollback.

Out of scope for this admin-only stage: production, protected-owner/coordinator/legacy role changes (now handled separately by S1-P004-015), account creation/reactivation/status changes, schema/migration/deployment work, credential disclosure, tool installation, TLS weakening, network workarounds, executing --apply in this sandbox, and unrelated dirty files.

## 2. Implementation

**Status:** USER-APPLIED; independently database-verified.

**Files changed:** `tools/auth/role-provisioning.mjs`, `tools/auth/role-provisioning.test.mjs`, this record; ignored `.wrangler/admin-access-review/grant-admin.mjs` and private receipt/failure evidence.

The ignored host runner defaulted to SELECT-only dry-run and required --apply for mutation. It asserted the exact development project, branch, host, port, database and dedicated target variable; checked migration ledger checksums 0000-0004; verified the supplied email through the development Clerk SDK; required the pre-existing ACTIVE account with STUDENT membership; then used the audited helper to add only SYSTEM_ADMIN with owner false. The user ran it successfully at 2026-10-28T13:18:43.191Z. The private receipt records APPLIED, active account, verified primary email, memberships STUDENT and SYSTEM_ADMIN, SYSTEM_ADMIN as the added role, and protectedOwner=false. The coordinator independently verified the DEVELOPMENT target, ACTIVE account, both roles, false protected-owner status, exactly one matching admin-grant audit entry, and untouched production.

Identity lookup from this sandbox failed with ClerkAPIResponseError (unexpected_error, fetch failed); an unauthenticated Node fetch with system CA support returned sanitized cause EACCES. The grant was executed by the user on the host, not this sandbox. Ignored failure.json records the initial sanitized error and grant-receipt.json contains the private host-run receipt. The runner maps .dev.vars DATABASE_URL to DB_FOUNDATION_URL only in its process after exact target checks.

Read-only evidence: .dev.vars contains DATABASE_URL; wrangler.auth.jsonc selects the local auth Worker; Neon metadata confirms project still-waterfall-91972583, database neondb, and branch br-shy-cherry-azuzy9v5 named development (production is a different branch). Before the grant, migration ledger versions 0000-0004 matched and no protected owner existed. After the host grant, the coordinator independently confirmed one active account with STUDENT and SYSTEM_ADMIN, protected_owner=false, one matching admin-grant audit entry, and untouched production. No email, account IDs or credentials are recorded here.

## 3. Review

**Self-review:** The reviewed handoff required --apply for mutation. It did not create/reactivate accounts, remove STUDENT, change account/profile status, set protected-owner/coordinator state, or disclose credentials. It repeated Clerk verification before apply and rechecked the existing account and STUDENT membership under the transaction lock. The user receipt and independent query confirm only the additive, unprotected SYSTEM_ADMIN grant.

**Verification:** node --check passed for the host runner and provisioner. node --test tools/auth/role-provisioning.test.mjs tools/db/migrations.test.mjs passed all 18 tests. git check-ignore confirmed the runner and private evidence are ignored. The user-run receipt reports APPLIED; the coordinator separately verified the account state, memberships, protected-owner flag and audit entry.

**Review outcome:** ADMIN-ONLY GRANT APPLIED AND DATABASE-VERIFIED. This stage intentionally left SYSTEM_ADMIN unprotected. Full protected-owner bootstrap is addressed by S1-P004-015. Existing unrelated dirty files were preserved.

## 4. Changelog

2026-10-28 — S1-P004-014 — Prepared an ignored dry-run-by-default host handoff and added a locked existing-account/STUDENT guard to the audited provisioner. The user ran the authorized SYSTEM_ADMIN-only --apply; private receipt and independent database verification confirm an active development account retaining STUDENT and now having unprotected SYSTEM_ADMIN. Syntax checks and 18 operator/database tests passed. Production was untouched. Follow-up protected-owner bootstrap is documented in S1-P004-015.
