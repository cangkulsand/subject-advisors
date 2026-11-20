# S1-INT-021 - Publish curriculum cache and synchronize production repository

- **Status:** MERGED
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 integration
- **Owner:** FOUNDATION / integration
- **Related UC / FR:** Publication of S1-FOUNDATION-005 supporting P001 UC03/UC04; no new product requirement
- **Branch / PR:** Code published on `main` in both repositories; no PR created
- **Reviewer:** Coordinator AI review passed for implementation and publication gates; human peer review pending

## 1. Plan

### Objective / problem
Publish the completed, user-authorized S1-FOUNDATION-005 implementation in the development repository, preserve both development and production histories, and synchronize the production GitHub repository to the same reviewed source tree.

### Scope and requirements
- In scope: commit the exact reviewed implementation and this publication receipt; preserve the production remote PR history using a normal merge; fast-forward both local `main` branches; reconcile production's pinned local dependencies; run required readiness checks; push both `main` branches normally and verify published refs.
- Out of scope: deployment, cache activation, provider provisioning, actual environment/secrets, database writes/migrations, schema or dependency upgrades, frontend changes, force operations, and history rewriting.
- The user explicitly authorized implementation publication, merge to `main`, and production-repository synchronization. This does not authorize deployment or production data/configuration changes.

### Starting state and integration plan
Development started on `feature-redis-caching` at `40e3e2d406fd661a3d8987f8211426806c5ee2d5`, matching DEV local/remote `main`. Production local `main` was `9001d09003c143e959601423aac8f83f20cce325`; fetched PROD `origin/main` was `d65af1cbbf659432ea235dd1eb0f83d99a2ca375`. The normal history-preserving merge incorporated PROD `origin/main` into the reviewed DEV feature branch. Its tree was verified identical to the reviewed implementation commit before either local `main` moved. Both local mains then fast-forwarded to the resulting merge commit, production dependencies were reconciled from the existing lockfile, and both origins were pushed normally after verifying their expected pre-push tips.

### Acceptance criteria
- [x] Commit contains only the 10 reviewed S1-FOUNDATION-005 paths plus this publication record; no secrets, generated files, or unrelated files.
- [x] Production remote history and local-only receipt history are preserved by normal merge/fast-forward operations; no reset, rebase, cherry-pick, force push, or wholesale conflict strategy.
- [x] Development and production local `main` have identical source trees and both remotes publish the reviewed merge commit.
- [x] Production dependencies reconcile to the committed lockfile without changing `package.json` or `package-lock.json`.
- [x] Required local checks pass; no provider, shared Neon fixture, deployment, actual env write, or DB write is performed.
- [x] The separate `ui/shared-main-template` handoff worktree remains untouched.

### Risk / assumptions / rollback
- The production remote contained a GitHub PR merge absent from its stale local checkout. The history-preserving normal merge retained both histories and the reviewed source tree. Production's local-only INT018/INT019 receipts were preserved; the direction of the tree difference is that they existed only on local PROD `main`, not on remote PROD `origin/main`.
- Both cache flags remain default-off. No actual environment, provider, database, or deployment action was taken.
- No rollback was required. Any future source rollback should use a reviewed revert commit; remote history must remain intact.

## 2. Implementation

- **Status:** Published; documentation receipt update is uncommitted for review
- **Implementation commit:** `d40dbfb9ec645d3470c4291efded344f48e9224e`, parent `40e3e2d406fd661a3d8987f8211426806c5ee2d5`, subject `feat: cache curriculum subject options (S1-FOUNDATION-005)`.
- **Integration commit:** `6cfe9d0b1367501a74c18f1fb4365b07f4fed60c`, parents `d40dbfb9ec645d3470c4291efded344f48e9224e` and `d65af1cbbf659432ea235dd1eb0f83d99a2ca375`.
- **Tree:** `c9a9efd45c3130a91a7d4fd5953d2f42b5edc6b5`, exactly equal to the reviewed implementation commit's tree. Full diff from `d40dbfb9` to `6cfe9d0` was empty.
- **Published refs at implementation publication:** DEV `main`, DEV `origin/main`, PROD `main`, PROD `origin/main`, and both `ls-remote origin refs/heads/main` results were verified at `6cfe9d0b1367501a74c18f1fb4365b07f4fed60c`. This record's two-file documentation-only closeout is separate from that verified code merge.
- **Preserved ancestors:** Both published mains contain `d40dbfb9`, DEV base `40e3e2d`, PROD local `9001d09`, and PROD remote `d65af1c` as ancestors. PROD-local-only `docs/changes/S1-INT-018-merge-staff-workspaces-main.md` and `docs/changes/S1-INT-019-sync-development-workspace.md` remain preserved.
- **Files published in implementation commit:** `.dev.vars.example`, `apps/api/src/cache/redis.ts`, `apps/api/src/cache/redis.test.ts`, `apps/api/src/modules/profile/index.ts`, `apps/api/src/modules/profile/index.test.ts`, `apps/api/src/modules/profile/profile.test.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`, `docs/cachingguide.md`, and `docs/changes/S1-FOUNDATION-005-curriculum-reference-cache.md`, plus this INT-021 record.
- **Production dependencies:** `npm.cmd install --ignore-scripts --no-audit --no-fund` completed. `@upstash/redis` is present in local `node_modules`; `package.json` and `package-lock.json` remain identical to committed `main`.
- **Worktrees at implementation publication:** DEV and PROD worktrees were clean at the published code commit. Handoff worktree remains at `67113cdae8dab0965c7bd65b643a6734d3e4b15d`. No actual environment files were intentionally modified. The initial secret-safe before/after hash comparison output was truncated and cannot be confirmed; no cryptographic equality claim is made. Coordinator independently checked environment-file modification times predate the sync-stage merge.
- **Decisions / deviations:** Used normal merge and fast-forward/push operations only. No package manifest or lockfile changes, application edits, provider changes, DB operations, or deployment.

## 3. Review

- **Self-review:** PASS. Exact source tree and refs verified; both worktrees clean; required ancestors preserved; local dependencies reconciled without manifest/lock changes; handoff worktree unchanged.
- **Coordinator review:** PASS for implementation commit, history-preserving merge, local fast-forwards, PROD readiness state, and final published refs. Independent PROD focused five-file suite passed 141 tests.
- **Test evidence in PROD:** `npm.cmd run typecheck` PASS; `npm.cmd run lint` PASS; `npm.cmd test` PASS (34 files passed, 2 skipped; 459 tests passed, 13 skipped); the two fixture DB environment variables `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` were omitted from the test child process. `npm.cmd run test:integration` PASS (7/7); `npm.cmd run build:local` PASS (132 modules); `npm.cmd run build` PASS; `npm.cmd run check:cloudflare` PASS (Wrangler 4.148.0 dry-run only, no deployment). Prior implementation focused suite passed 141 tests. No shared Neon fixture or live provider test was run.
- **Manual checks:** Both remote `main` tips were verified at their expected old values immediately before normal pushes. At implementation publication, local `main`, tracking `origin/main`, and `ls-remote` values were verified at `6cfe9d0` in each repository; both worktrees were clean. The subsequent two-file documentation-only closeout does not change runtime source. `git diff --check` and committed manifest checks passed.
- **Review outcome:** PASS - coordinator AI review; human peer review pending.
- **Human reviewer / approval:** Pending; user authorized implementation and publication. No human peer review is claimed.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Publication / Integration
- **Added / Changed / Fixed / Removed:** Published S1-FOUNDATION-005 to development and production `main`, retaining existing production remote/local receipt history.
- **Affected routes / tables / consumers:** Same implementation scope recorded in S1-FOUNDATION-005; no database schema or public API changes.
- **Breaking changes / migration steps:** None. The curriculum cache remains default-off.
- **Verification summary:** Production typecheck, lint, unit tests, integration tests, local and standard builds, Cloudflare dry-run, focused suite, clean worktrees, identical trees, ancestry preservation, and remote ref verification passed.
- **Outstanding blockers / follow-up:** Human peer review remains pending. No deployment or cache/provider activation was requested or performed.
- **Final status:** MERGED
