# S1-P004-019 — Development dummy coordinator identities

- **Status:** READY_FOR_REVIEW — HOST CREATION NOT RUN
- **Date:** 2026-11-02
- **Sprint / Owner:** Sprint 1 / P004
- **Related use cases:** UC01 registration; UC02 authentication and role checks
- **Target:** Subject Advisors DEVELOPMENT only; Neon `still-waterfall-91972583` / `br-shy-cherry-azuzy9v5` / `neondb`
- **Reviewer:** Coordinator review passed 2026-11-02

## 1. Plan

### Objective / scope
Provision exactly two user-requested development coordinator identities: `ecrh+clerk_test@utm.my` and `ecjh+clerk_test@utm.my`. Create no student profiles, academic records, offerings, or elevated owner/admin role. Do not modify production, provider configuration, dependencies, or existing identities.

### Approach / expected files
Add a host-run, dry-run-by-default seeder and focused tests under `tools/auth/`; reuse the existing reviewed environment, Clerk target, password, and role-provisioning helpers. Create `Dummy Coordinator ECRH` and `Dummy Coordinator ECJH` identities tagged for this batch. Grant sole active `COORDINATOR` membership through the existing audited role helper, bound to the exact verified Clerk ID/email. Existing identities are reusable only when owned by this exact batch and verified; never reset passwords. Print generated credentials only in the host terminal.

### Acceptance / verification
- Require exact development Neon and Clerk instance/domain, email identifier + password enabled, verified primary emails, and normal password checks.
- Preflight existing role/account state and refuse unrelated or conflicting identities before writes.
- Verify each account is active with sole `COORDINATOR` role and no student profile.
- Run focused tests, syntax, scoped lint and offline help. Host command: `node "D:\sharhan\development\subject advisors\tools\auth\seed-development-coordinators.mjs" --apply`.

### Risks / rollback / exclusions
Sandbox Clerk network access is blocked; live execution is not part of this change. Clerk identities cannot be automatically deleted. Role grants are transactional and audited per identity; retry only exact batch-owned identities. No direct role-table bypass, compatibility-role manipulation outside the shared role helper, email/invitation calls, or credential persistence.

## 2. Implementation

- **Status:** Implemented locally; no accounts or roles created from this sandbox.
- **Files changed:** `tools/auth/seed-development-coordinators.mjs`; `tools/auth/seed-development-coordinators.test.mjs`; `tools/auth/seed-development-students.mjs` (exports only); this record.
- **Summary:** Added a host-run seeder that defaults to read-only, pins the development Neon target, reuses existing Clerk development/domain/email-password guards, binds roles to exact verified Clerk IDs, refuses unrelated identities or conflicting account state, and calls the audited role provisioning helper for sole COORDINATOR membership. Credentials for newly created identities are handed off in terminal output only. No student profile or academic data is created.
- **Execution command:** `node "D:\sharhan\development\subject advisors\tools\auth\seed-development-coordinators.mjs" --apply`
- **External state:** No live Clerk/Neon mutation was executed; sandbox network access to Clerk is known to fail with EACCES. User must run the command in the development host terminal.

## 3. Review

- **Status:** PASS — SELF-REVIEW and coordinator review.
- **Verification:** Coordinator independently reran `node --check tools/auth/seed-development-coordinators.mjs` PASS; focused coordinator, student-seeder and role-provisioning tests 25/25 PASS; offline `--help` PASS; scoped ESLint PASS; `git diff --check` PASS. No live provider call or host execution was performed.

## 4. Changelog

- **Date:** 2026-11-02
- **Type:** Planned development test-data provisioning utility
- **Summary:** Added a guarded two-account development-only coordinator seeder and focused tests; existing student helper behavior is unchanged apart from exporting the shared config and Clerk-target functions.
- **Verification / status:** Coordinator review passed and local checks passed; host command and account creation not run. Ready for host execution.
