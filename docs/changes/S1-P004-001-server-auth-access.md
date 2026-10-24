# S1-P004-001-server-auth-access — Verified identity and application access

- **Status:** READY_FOR_REVIEW (isolated feature; integrated UC01/UC02 PARTIAL)
- **Date:** 2026-10-24
- **Sprint:** Sprint 1
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC01 / FR-A1; UC02 / FR-A2
- **Branch / PR:** Not created; target directory is not a Git repository
- **Reviewer:** Human peer review pending

Process chronology: docs/implementationguide.md appeared during this session and was
discovered after implementation/validation. This record captures the plan previously
announced in the conversation and docs/p004-auth-plan.md; it was not created before
the original code edits. This timing deviation is explicit. No peer approval is claimed.

## 1. Plan

### Objective / problem
Implement this P004 task in a target directory that initially contained only the sprint
specification. No application foundation, auth modules, manifest or Git metadata existed.

### Scope and requirements
In scope: Verified identity and application access, for UC01 and UC02 only.
Out of scope: other programmers' features, FOUNDATION app/API scaffolding, reference data,
profile forms, records, offerings, pathway, staff dashboards and later sprints.

### Proposed implementation
Validate Clerk bearer session tokens with authorized parties, check live session status and current primary email, initialize STUDENT/ACTIVE idempotently in Neon, and enforce local role/status and profile setup before private APIs.

Expected files: apps/api/src/modules/auth/*; apps/api/src/middleware/auth.ts; db/migrations/20261024_p004_user_access_assignment.sql.

API/data/shared impact: GET /api/me and bodyless POST /api/me/initialize; user_access_assignment table; AuthDependencies, ProfileReader and Me contracts. FOUNDATION wires router/bindings/CORS. P001 provides a valid profile/curriculum reader. Backend requires Clerk secret/public key, authorized origins and DATABASE_URL.

### Acceptance criteria
Server policy tests reject unverified/spoofed domains, wrong roles, suspended accounts and ended sessions. Initialization cannot accept browser-supplied roles/IDs or overwrite existing assignments. Missing profile integration blocks academic access.

Local automated criteria are satisfied; real-service and integrated app acceptance remain
pending. No missing service is replaced with fake production authentication/data.

### Verification plan
Run npm.cmd run typecheck, npm.cmd run lint, npm.cmd test, npm.cmd run build,
and npm.cmd run test:ui. Opt-in Neon tests require a dedicated test database.
Later live checks use approved identities and the handoff acceptance checklist.

### Risk / assumptions / rollback
The selected Clerk application/settings and FOUNDATION/P001 contracts must be integrated.
Student policy applies to the current verified primary institutional email. Live session
lookups intentionally fail closed on provider outages. Browser guards do not replace API guards.
Rollback: Unregister feature routes before release and revert feature source; never introduce an auth bypass. Keep/backup populated access assignments and coordinate schema recovery instead of dropping real data.

## 2. Implementation

- **Status:** Implemented for isolated review; integration pending.
- **Files actually changed:** apps/api/src/modules/auth/*; apps/api/src/middleware/auth.ts; db/migrations/20261024_p004_user_access_assignment.sql.
- **Summary:** Validate Clerk bearer session tokens with authorized parties, check live session status and current primary email, initialize STUDENT/ACTIVE idempotently in Neon, and enforce local role/status and profile setup before private APIs.
- **Decisions / deviations:** Missing app/profile dependencies use typed seams and clear
  placeholders. Test identities/mocks are labelled and never exported from production
  entry points. Existing user setup notes are preserved.
- **Migrations / env / contracts:** GET /api/me and bodyless POST /api/me/initialize; user_access_assignment table; AuthDependencies, ProfileReader and Me contracts. FOUNDATION wires router/bindings/CORS. P001 provides a valid profile/curriculum reader. Backend requires Clerk secret/public key, authorized origins and DATABASE_URL.
- Exact setup/API/bootstrap instructions: [P004 handoff](../p004-auth-handoff.md).

## 3. Review

- **Self-review checklist:** Scope, plan coverage, server authorization, input validation,
  failure states, contracts, additive migration design, no sensitive logging, UI states,
  keyboard retry, focused file inventory and documentation reviewed.
- **Test evidence:** npm.cmd run typecheck PASS; npm.cmd run lint PASS;
  npm.cmd test 41 PASS / 5 Neon tests SKIPPED; npm.cmd run build PASS;
  npm.cmd run test:ui 11 PASS (headless Chromium, mocked Clerk/API).
- **Installation evidence:** npm install/registry ping blocked by network EACCES;
  pinned cached dependencies used for local checks. No lockfile generated.
- **Manual checks:** Source/contract/file inventory inspected. git status confirms no
  repository. No real signup, external migration, role provisioning or deployment performed.
- **Defects found and fixes:** Verified no-op conflict handling preserves role, status and timestamps. Live Clerk session lookup supplements JWT validation. Real database concurrency, migration execution and real logout replay remain pending.
- **Review outcome:** PASS — SELF-REVIEW for isolated feature code.
- **Human reviewer / approval:** Pending. No merge or peer approval claimed.
- **Unverified:** Real Clerk email verification/logout replay, real Neon persistence/concurrency,
  Cloudflare workerd runtime, full Vite app, and integrated P001 profile setup.

## 4. Changelog

- **Date:** 2026-10-24
- **Change ID / owner / UC:** S1-P004-001-server-auth-access; P004; UC01 and UC02.
- **Type:** Added, Security, Tests, Docs, Chore.
- **Actual changes:** Verified identity and application access; implemented in the files listed above.
- **Compatibility / impact:** GET /api/me and bodyless POST /api/me/initialize; user_access_assignment table; AuthDependencies, ProfileReader and Me contracts. FOUNDATION wires router/bindings/CORS. P001 provides a valid profile/curriculum reader. Backend requires Clerk secret/public key, authorized origins and DATABASE_URL.
- **Verification:** Typecheck/lint/module build and 41 unit + 11 mocked browser checks pass.
  Five optional Neon tests skipped. Human peer review pending.
- **Outstanding:** FOUNDATION/P001 integration, live provider settings and acceptance,
  registry access/portable lockfile, peer review. See handoff for exact commands.
- **Final status:** READY_FOR_REVIEW; integrated UC01/UC02 remain PARTIAL.
