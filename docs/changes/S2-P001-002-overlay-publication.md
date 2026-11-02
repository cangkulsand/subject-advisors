# S2-P001-002 — Publish additive Sprint 2 overlay

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC05 / FR-A5; UC06 / FR-B1, B2, B4, B5 and B7
- **Branch / PR:** `P001-----Sprint-2-(UC-5,-UC6)` / PR not created
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
Place the prepared P001 Sprint 2 additive overlay into the team repository's existing Sprint 2 branch, preserving file paths and verifying the source manifest hashes. The overlay adds UC05 progress and UC06 curriculum mapping in a dedicated launcher.

### Scope and requirements
- In scope: Copy the 31 payload files named in `P001-Sprint2/p001-sprint2-handoff-manifest.json`; preserve their directory structure. Also copy the root handoff manifest as verifier support metadata because the installed verifier loads it from its repository root. Add this separate publication record. As a focused integration compatibility fix, update only `apps/api/src/modules/p001-sprint2/sprint2.test.ts` with required `AccessAssignment.roles` arrays on the three mocks and update that file's SHA-256 entry in the root handoff manifest.
- Out of scope: Any other payload, shared file, manifest-listed Sprint 2 feature record, package/dependency file, shared router, migration, secret, or another owner's feature. Do not change runtime behavior. Commit and push are deferred until coordinator review of the actual diff.

### Proposed implementation
- Expected files: all manifest-listed new files under `apps/`, `docs/`, `tools/`, and the three dedicated Sprint 2 config files, plus this record. The sole post-copy payload adjustment is the Sprint 2 test fixture and its corresponding root manifest hash.
- APIs / database / interfaces: No additional modifications. Handoff supplies an isolated Sprint 2 API/web entry point; shared-router integration remains documented follow-up.
- Dependencies / shared-file impact: Requires supplied shared main and P001 Sprint 1. The source package's three auth mocks omit the required `roles` field, despite `AccessAssignment` requiring it in this branch and main. Adapt those fixtures only; no shared auth contract change. Other baseline files are reported for compatibility review and will not be overwritten.

### Acceptance criteria
- [x] Current branch tracks the exact remote Sprint 2 branch and had no pre-existing local changes.
- [x] Preflight passes and all 31 manifest payload files were copied without overwriting an existing path.
- [x] Installed integrity verifier passes payload hashes; baseline comparison reports older shared-file hashes for review.
- [x] Dedicated check runner result is recorded; peer review remains pending.

### Verification plan
- `git fetch origin`; inspect/switch to `origin/P001-----Sprint-2-(UC-5,-UC6)`.
- `node <overlay>/tools/p001-sprint2/verify-handoff.mjs --project <repo> --preflight` before copy.
- After copy, run `node tools/p001-sprint2/verify-handoff.mjs` and `node tools/p001-sprint2/check.mjs` if dependencies/environment permit.
- Review `git status` and diff paths to ensure no unplanned edits.

### Risk / assumptions / rollback
- Risks: The remote branch is six commits behind main; baseline differences are reported but were not overwritten. Existing destination collisions are not to be replaced. Source package and installed overlay differ in the test fixture file and corresponding payload hash only.
- Assumptions / blockers: Manifest integrity and overlay instructions are authoritative; P001 Sprint 1 is expected prerequisite. Auth contracts already require explicit roles. No live Clerk/Neon credentials are included.
- Rollback: Remove only newly-added manifest paths after confirming each path still matches the overlay; retain repository files outside those paths. Keep this record for traceability.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** 31 manifest-listed payloads, including `apps/api/src/modules/p001-sprint2/sprint2.test.ts` with three mock-only `roles` fields; root `p001-sprint2-handoff-manifest.json` with the updated SHA-256 for that test; separate publication record. The root manifest is required support metadata for the installed verifier.
- **Summary:** Added the prepared overlay without replacing existing files. Added explicit roles to the STUDENT, active SYSTEM_ADMIN and suspended SYSTEM_ADMIN test fixtures, matching the required shared `AccessAssignment` type. No production behavior changed.
- **Decisions / deviations from plan:** The Sprint 2 source package's test fixtures omitted the required roles property. This installed overlay differs from the source package only in that test fixture file and its manifest hash. All other 30 payload files retain their source hashes; no shared file was changed.
- **Migrations / env / shared contracts:** No migration, environment or shared contract changes. Runtime contracts already require explicit roles.

## 3. Review

- **Self-review checklist:** Scope limited to P001 Sprint 2 overlay plus the three typed test fixture fields and their manifest hash. No existing shared files overwritten; no production/runtime behavior changed. Typecheck/lint/build and focused feature test evidence recorded below. Human review remains pending.
- **Test evidence:** `npm.cmd ci` PASS (220 packages; npm reported 11 moderate audit findings). Preflight PASS (31 missing, 0 present); installed integrity PASS (31/31 hashes). Two runs of `node tools/p001-sprint2/check.mjs` passed integration preparation, TypeScript and lint, then each had one failure in the existing `apps/api/src/cache/redis.test.ts` cold-fill/warm-hit test (551 passed, 13 skipped, 1 failed). A focused rerun of that Redis test passed (1 passed, 36 skipped), indicating a flaky or timing-sensitive existing failure. Focused Sprint 2 unit test passed (45/45). `node tools/p001-sprint2/test-db.mjs` passed 16/16 isolated PGlite checks after installing PGlite 0.5.14 only under `.verification-runtime`. Sprint 2 frontend build PASS; Worker bundle PASS. Browser UI runner was not rerun because Chromium is unavailable locally; handoff source reports its prior UI run separately. Full check runner stops at the unrelated Redis failure before its build steps; both Sprint 2 builds were run directly and passed.
- **Manual checks:** `git status` confirms only new overlay paths, root manifest and this record; no tracked shared files were modified. Current branch tracks `origin/P001-----Sprint-2-(UC-5,-UC6)`. The remote branch remains six commits behind `origin/main`; no merge was made.
- **Defects found and fixes:** Corrected the three source-package mock omissions by adding the required roles and updated only that test file's manifest hash. Existing suite's single Redis test failed in two full-suite runs and passed when isolated; it is outside P001 Sprint 2 scope and was not changed.
- **Review outcome:** PASS — SELF-REVIEW. The scoped Sprint 2 checks pass; one existing suite test is intermittently failing. Human peer review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-11-01; change ID S2-P001-002-overlay-publication; owner P001.
- **Type:** Added, Changed, Fixed, Docs, Tests.
- **Added / Changed / Fixed / Removed:** Added 31 additive P001 Sprint 2 files, root verifier manifest and this publication record. Fixed three test fixture types by adding required roles and updated that fixture's SHA-256 only. No existing shared files were replaced.
- **Affected routes / tables / consumers:** UC05/UC06 Sprint 2 routes and dedicated preview artifacts. No runtime behavior or database schema changed.
- **Breaking changes / migration steps:** None introduced; no database migration or package manifest changes.
- **Verification summary:** `npm.cmd ci`, preflight, installed integrity (31/31), typecheck, lint, Sprint 2 unit tests (45), isolated database checks (16), frontend build and Worker bundle passed. Full test suite reported 551 passed, 13 skipped and one existing Redis cache failure in two runs; focused rerun of that test passed. Browser UI runner was not rerun (Chromium unavailable locally).
- **Outstanding blockers / follow-up:** Human peer review remains pending. The full-suite Redis cold-fill/warm-hit test failed twice but passed in isolation; investigate if it recurs. Commit and push are being performed after coordinator review; final publication result will be recorded after success.
- **Final status:** READY_FOR_REVIEW.
