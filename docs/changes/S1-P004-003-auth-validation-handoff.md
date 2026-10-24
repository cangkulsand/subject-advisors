# S1-P004-003-auth-validation-handoff — Focused validation and integration handoff

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
In scope: Focused validation and integration handoff, for UC01 and UC02 only.
Out of scope: other programmers' features, FOUNDATION app/API scaffolding, reference data,
profile forms, records, offerings, pathway, staff dashboards and later sprints.

### Proposed implementation
Add only a temporary auth validation harness to the otherwise empty target directory. Pin tested dependencies, typecheck/lint/test/bundle auth modules, run local mocked browser checks, and document integration, trusted bootstrap and real-service acceptance.

Expected files: package.json; .gitignore; tsconfig.auth.json; vitest.auth.config.ts; eslint.config.mjs; tools/auth/*; docs/p004-auth-plan.md; docs/p004-auth-handoff.md; docs/changes/S1-P004-00{1,2,3}-*.md.

API/data/shared impact: Root package/config additions are shared files solely for P004 validation. Merge these dependencies/scripts into FOUNDATION tooling later. No shared app/API entry point, health check, catalogue schema, CI or deployment was created.

### Acceptance criteria
Every validation command has a truthful outcome. Provider mocks and skipped real database tests are explicit. Scope, shared additions, configuration, routes and dependencies are documented.

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
Rollback: Transfer tests/dependencies into FOUNDATION's harness, then remove duplicate temporary tooling. Preserve unrelated user setup notes and the change records.

## 2. Implementation

- **Status:** Implemented for isolated review; integration pending.
- **Files actually changed:** package.json; .gitignore; tsconfig.auth.json; vitest.auth.config.ts; eslint.config.mjs; tools/auth/*; docs/p004-auth-plan.md; docs/p004-auth-handoff.md; docs/changes/S1-P004-00{1,2,3}-*.md.
- **Summary:** Add only a temporary auth validation harness to the otherwise empty target directory. Pin tested dependencies, typecheck/lint/test/bundle auth modules, run local mocked browser checks, and document integration, trusted bootstrap and real-service acceptance.
- **Decisions / deviations:** Missing app/profile dependencies use typed seams and clear
  placeholders. Test identities/mocks are labelled and never exported from production
  entry points. Existing user setup notes are preserved.
- **Migrations / env / contracts:** Root package/config additions are shared files solely for P004 validation. Merge these dependencies/scripts into FOUNDATION tooling later. No shared app/API entry point, health check, catalogue schema, CI or deployment was created.
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
- **Defects found and fixes:** npm registry operations failed with EACCES. Stopped stalled installs and used ignored local junctions to existing installed packages; those packages were not modified. No lockfile/fresh install claimed. Removed obsolete Vitest config option after warning.
- **Review outcome:** PASS — SELF-REVIEW for isolated feature code.
- **Human reviewer / approval:** Pending. No merge or peer approval claimed.
- **Unverified:** Real Clerk email verification/logout replay, real Neon persistence/concurrency,
  Cloudflare workerd runtime, full Vite app, and integrated P001 profile setup.

## 4. Changelog

- **Date:** 2026-10-24
- **Change ID / owner / UC:** S1-P004-003-auth-validation-handoff; P004; UC01 and UC02.
- **Type:** Added, Security, Tests, Docs, Chore.
- **Actual changes:** Focused validation and integration handoff; implemented in the files listed above.
- **Compatibility / impact:** Root package/config additions are shared files solely for P004 validation. Merge these dependencies/scripts into FOUNDATION tooling later. No shared app/API entry point, health check, catalogue schema, CI or deployment was created.
- **Verification:** Typecheck/lint/module build and 41 unit + 11 mocked browser checks pass.
  Five optional Neon tests skipped. Human peer review pending.
- **Outstanding:** FOUNDATION/P001 integration, live provider settings and acceptance,
  registry access/portable lockfile, peer review. See handoff for exact commands.
- **Final status:** READY_FOR_REVIEW; integrated UC01/UC02 remain PARTIAL.
