# S1-P002 — Initial eligible demand filter

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-07
- **Sprint / owner:** Sprint 1; P002 / Muhammad Nor Idham
- **Related use case:** UC08 revised lecturer scope
- **Source:** Lecturer discussion on 1 November; uploaded latest main on 7 November.
- **Branch / PR:** Isolated source copy; no branch, commit, PR or merge created.
- **Reviewer:** Self-review complete; human peer review pending.

## 1. Plan

**Problem and intended behavior:** A coordinator chooses an accepted academic snapshot in an assigned programme/centre and the system next semester. The read-only projection counts distinct positively eligible students still needing each subject; >=30 qualifies. Uncertainty and known exclusions remain separate. Export qualified IDs and full provenance/counts for Sharhan. No finalized forecast or capacity allocation is required.

**Approach / expected files:** Reuse existing Clerk/P001 auth, academic catalogue, shared engine and confirmed-offering schema. Add only the P002 derived projection, protected read API, real React screen and focused tests; minimal shared registration/navigation changes. See `docs/p002-revised-sprints.md` for exact contracts and team boundaries.

**Acceptance criteria:** Positive 30-student boundary, distinct counting and known/uncertain separation; fresh role/scope/own-profile authorization; exact accepted/confirmed source; maintained prerequisites; loading/empty/error/retry states; JSON handoff for stage 1 and no PDF/manual fallback for stage 2; real local integration and mobile readability checks.

**API / data / dependencies:** Existing migrated main through 0008; no new database schema, packages or environment settings. Existing system current-semester marker, assigned coordinator scopes, P001 profile/records and Sharhan confirmations. Shared API router, optional feature registry, student route contract and minimal nav changes require integrator review.

**Verification plan:** Baseline comparison; relevant boundary/policy/auth/source/reader/client tests; full typecheck/lint/unit/build/integration checks; real-route fictional UI and readability checks.

**Risks / assumptions / rollback:** User's revised scope supersedes the old manual UC08/PDF direction. Retain the approved engine's complete-record, zero-credit exemption and unrestricted-missing-semester-rule policy. P002 adds conservative guards for unsupported conditions/corequisites without changing the P004 engine. The inherited centre-1 mapping needs profile-owner work for multi-centre student use. Sharhan owns downstream resource formulas/adjustment/confirmation. Revert this additive feature and registration changes to roll back; accepted imports, records, legacy manual data and confirmations are unchanged.

**Out of scope:** Lecturer/resource optimization, invented 25/15 rules, P001 profile editing restrictions, programme management, registration, student-pick writes, automated approval/SMP and deployment.

## 2. Implementation

**Implemented:** A coordinator chooses an accepted academic snapshot in an assigned programme/centre and the system next semester. The read-only projection counts distinct positively eligible students still needing each subject; >=30 qualifies. Uncertainty and known exclusions remain separate. Export qualified IDs and full provenance/counts for Sharhan. No finalized forecast or capacity allocation is required.

**Actual areas:** packages/shared/src/forecasting/initial-demand.ts; p002-eligibility-policy.ts and tests; forecasting/routes.ts and tests; coordinator/InitialDemandPage.tsx, client and navigation; tools/p002 demo/verification. Complete file list and baseline/result hashes are in the delivered `CHANGESET.json`.

**Decisions / deviations:** Stage 1 reads ACCEPTED snapshots directly to avoid a circular forecast-finalization dependency. Stage 2's single PostgreSQL SELECT supplies one statement snapshot instead of an interactive/multi-statement transaction. Existing profile-aware auth is passed into the factory. No module was left as an interface-only production stub. Human-readable scope labels and the campus limitation are surfaced to students.

**Migration / compatibility:** No migration or dependency change. Old manual UC08 storage/API remains compatible; the installed student offerings screen prefers confirmed eligibility. Shared integration registry remains optional and fails closed if dependencies are absent.

## 3. Review

**Outcome:** PASS — SELF-REVIEW; READY_FOR_REVIEW. Actual source diff reviewed for scope, correctness, private ownership, compatibility and generated-file/dependency safety. Cross-owner updates are limited to required handoff/registration/navigation.

**Evidence:** `npm run typecheck`, `npm run lint`, `npm test` (1,434 passed / 59 inherited skips), `npm run build`, `npm run build:local`, `npm run test:integration` (10 passed), extra shared/demo ESLint, fictional export and 19 UI cases passed. See `docs/p002-verification.md` for commands, baseline and limits.

**Manual / visual checks:** Desktop and phone renders inspected; mandatory text/control readability and no page overflow passed at 320/375/768/1440. Keyboard sort selection exercised. Fixed narrow-screen truncated filter labels and feature button rules that would override the shared toolbar. Source/provenance and explanation whitespace reviewed.

**Remaining acceptance:** Existing centre mapping, Sharhan consuming initial candidates in his refinement stage, connected development database/auth validation and human peer review. No live DB, account creation, deployment or automatic approval claimed.

## 4. Changelog

- **2026-11-07 — Added / Changed / Fixed / Tests / Docs:** A coordinator chooses an accepted academic snapshot in an assigned programme/centre and the system next semester. The read-only projection counts distinct positively eligible students still needing each subject; >=30 qualifies. Uncertainty and known exclusions remain separate. Export qualified IDs and full provenance/counts for Sharhan. No finalized forecast or capacity allocation is required.
- **Affected routes:** `/coordinator/initial-demand`, `GET /api/coordinator/initial-demand`, `/student/eligibility`, `/student/offerings`, `GET /api/student/eligible-offerings` as appropriate to this sprint; additive integration discovery and read-only source consumption.
- **Data impact:** No migration, source deletion, production write or dependency change.
- **Verification:** Passed checks and inherited skips recorded above and in `p002-verification.md`.
- **Handoff / final status:** READY_FOR_REVIEW. Integrator reviews shared files; Sharhan consumes the initial JSON/API and owns refinement/confirmation. Profile owner replaces interim student centre mapping when Package B lands.
