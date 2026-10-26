# S1-INT-003 — Pull shared main and refresh the P001 ZIP

- Status: READY_FOR_REVIEW; local integration update complete
- Owner: integration workspace only
- Date: 2026-10-26
- Branch: integration/sprint-1
- Origin: subject-advisors-prod (preserved)
- Human review: pending

## 1. Plan

User requested pulling shared main into the production folder before pasting the
P001 handoff. This is the existing local development integration checkout, not a
hosting or production database change. Fetch main from subject-advisors, preserve
the separate production origin/branch, back up uncommitted source/settings changes
without copying secrets, then fast-forward with tracked changes safely autostashed.
Merge shared scripts/dependencies with the already installed P002 scripts.

Compare the integration-ready P001 ZIP against the installed v1 manifest. Upgrade
only unchanged v1/current P001 files; preserve any unknown edits for manual merging.
No incoming-main/untracked path collisions were found. No feature implementation,
schema change, migration, deployment, commit or push is requested in this checkout.

Verify the actual extracted ZIP's hashes, ignored settings unchanged, both modules
detected, typecheck/lint/tests/build and shared navigation with explicit mocks.
Keep rollback backup and any autostash until local work preservation is confirmed.

## 2. Implementation

Fetched shared source main at 0ccac62 and fast-forwarded integration/sprint-1 using
git merge --ff-only --autostash FETCH_HEAD. Origin remains subject-advisors-prod.
Backed up 95 uncommitted source files and the tracked patch outside the project,
without copying secrets. The original tracked autostash is retained for recovery.

Resolved the package.json conflict using a semantic three-way merge of the old
base, backed-up local package and new shared main. All nine P002 scripts remain;
shared commands and new pg/libpg-query development dependencies are retained.
The old local lockfile was semantically identical to the old base, so the new
shared lockfile was retained. .gitignore retains both shared and P002 exclusions.
Conflict resolution was unstaged afterward; no local feature files were committed.

Validated the integration-ready ZIP's SHA-256 and extracted it for review. Eight
P001 files matched the old v1 manifest and were safely upgraded, plus the manifest.
All other P001 payload files already matched. No unknown feature edits were replaced.
Verified all 51 original P002 source/fixture/config files remain byte-identical to
their backups. Private .env.local/.dev.vars hashes are unchanged.

Installed the locked dependencies with npm ci. The first attempt hit a Windows
native-module file lock. Identified only PID 40268 by its loaded module path inside
this project's node_modules, stopped that old preview, and reran successfully.
No other project's Node processes were stopped. The app can be restarted with
npm run dev; no server auto-start or deployment is part of this update.

## 3. Review

PASS — SELF-REVIEW; independent review and real-account acceptance remain pending.

Actual results in this production-folder checkout:
- P001 installed manifest integrity: 34 payload hashes PASS. Baseline hash notices
  reflect preserved local package scripts and checkout line-ending differences;
  existing tracked auth files have no local modifications.
- prepare:integration: P001 API/web and P002 API/web all detected.
- npm ci: PASS, 220 packages installed. npm reported 6 audit findings (2 moderate,
  4 high) and the pinned ESLint deprecation. No force fix or unrelated upgrade run.
- Strict shared TypeScript check: PASS.
- Shared ESLint check: PASS.
- Shared Vitest suite: 186 PASS; 13 optional auth/offering DB tests SKIPPED.
- Shared Worker and frontend production bundles: PASS.
- Shared installed-page Chromium navigation: 9 PASS with mocked Clerk/API.
- Database static review: PASS, source hash matches, 26 tables/171 columns/39 FKs,
  applied migration hashes unchanged. No database connection or migration executed.
- Preservation checks: 51 P002 files exact, private settings unchanged, origin and
  integration branch unchanged, zero unresolved merge conflicts; git diff --check PASS.

Commands used the existing node_modules tool entrypoints plus tools/auth/build.mjs,
tools/integration/test-ui.mjs --installed and tools/db/cli.mjs review. The same public
npm scripts remain available. Real two-user Clerk/browser/HTTP tests, official
catalogue data, dependency audit remediation and peer review remain pending.

## 4. Changelog

2026-10-26: Plan created before fast-forward, package merging or ZIP extraction.

2026-10-26: Integrated shared main 0ccac62 locally, preserved existing P002 work and
private settings, refreshed the P001 handoff, reconciled package scripts, installed
locked dependencies and passed shared tests/builds/navigation. Backup and autostash
retained. No new commit, push, schema operation or production deployment performed.
