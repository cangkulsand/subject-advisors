# S1-P004-008-github-handoff — Prepare the P004 branch

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-24
- **Owner / sprint / UC:** P004 / Sprint 1 / UC01 and UC02
- **Reviewer:** Human peer review pending.
- **Requested next step:** Prepare GitHub handoff after the user reported all four manual cases passed.

## 1. Plan

Problem: The local P004 feature is working, but no Git repository/commit or portable
dependency lockfile exists. The documented remote has no refs.
Approach: create a local feature/p004-s1-auth branch, configure the documented origin,
add a P004 README and handoff/PR summary, generate a registry-backed lockfile in an
isolated ignored directory, and commit explicitly selected P004 files only.
Do not publish/push or modify another programmer's work.
Expected files: README.md, package-lock.json if generation succeeds, handoff update and
this record; local Git metadata. The newly found p002 directory and user reference/setup
documents remain outside the P004 commit.

Acceptance: secret files/generated output excluded, no p002 files staged, staged source
contains no known local secret values, local feature commit and concrete PR description.
Verification: inspect staged paths and secret-exclusion checks; validate lockfile has no
local workspace links. Where practical test a clean install to address prior cached
dependency portability limitations.

Risks/dependencies: registry availability and configured Git identity. No remote writes
or service migrations. Rollback: revise/uncommit the local commit before publishing;
preserve all source and user files. No destructive reset/cleanup.

## 2. Implementation

- Initialized local Git branch feature/p004-s1-auth and configured origin as the
  documented https://github.com/cangkulsand/subject-advisors.git.
- Added README.md and docs/p004-pr.md with local run instructions and concrete PR summary.
- Generated package-lock.json from npm registry metadata in an isolated ignored directory;
  308 lock entries, no local file links. The lockfile matches the existing exact dependencies.
- Performed a fresh npm ci in that directory, installing 204 packages from the lockfile.
- Added a current lockfile note to the handoff and local guide; historical cache-only
  limitations in earlier records remain as evidence of earlier validation.
- Explicitly staged only P004 modules, migration, local preview/tests, auth docs and minimal
  root tooling. The unrelated p002 directory and original user reference/setup docs are untracked.
- No provider/data/schema changes and no remote push.

## 3. Review

- Fresh install: npm ci --no-audit --no-fund using the generated lockfile — PASS.
  npm emitted an existing ESLint 9 support warning; no unrelated tool upgrade was made.
- Clean-directory npm run typecheck, lint, build and build:local — PASS.
- Clean-directory npm test — 47 passed, 5 optional live DB tests skipped without credentials.
- Clean-directory npm run test:ui — 11 mocked Clerk/API browser checks passed.
- Earlier live Neon validation: 5 tests passed. Earlier actual HTTP regression: 10 passed.
- User reported Gmail/graduate behavior and all four manual logout/role/idempotency cases passed.
- Git ignore checks confirm .env.local, .dev.vars, node_modules, .wrangler, dist-auth and
  .npm-auth-cache are excluded.
- Staged-value scan: no local Clerk secret, database URL/password or unexpected secret-key
  pattern found; no p002 or generated dependency/output paths staged.
- git diff --cached --check found one trailing blank line in auth.test.ts; removed it without changing test behavior. The final whitespace check passed.
- Scope review: P004 only, with shared local tooling listed in the handoff.
- Review outcome: PASS — SELF-REVIEW. Human peer review pending.
- Remote has no refs; a foundation/integration base branch is needed for a conventional PR.

## 4. Changelog

- Date / ID / owner / UC: 2026-10-24 / S1-P004-008-github-handoff / P004 / UC01, UC02.
- Type: Chore, Docs.
- Added: portable package lock, P004 README, prepared PR description and local Git branch.
- Shared impact: root lockfile/README supplement the existing P004 tooling.
- Verification: fresh install and all clean-source checks pass; secret/scope checks pass.
- Final status: READY_FOR_REVIEW. Local feature commit prepared; publication and human review
  remain separate. No P001/P002/P003 work was included.
