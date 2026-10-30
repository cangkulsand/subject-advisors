# S1-INT-023 — Publish reviewed feature to development and production main

- **Status:** MERGED
- **Date:** 2026-10-30
- **Sprint:** Sprint 1 integration follow-up
- **Owner:** INT / integration
- **Related UC / FR:** Publish reviewed S1-INT-022 and related offerings/records changes; no new product requirement
- **Branch / PR:** `main` in DEV and PROD; code publication commit `73872d8`; this record is a separate documentation-only closeout following code publication
- **Reviewer:** Coordinator review PASS for integration and code publication; human peer review pending

## 1. Plan

### Objective / problem
Complete the user's request to merge `main`, synchronize the production repository, and push the reviewed feature changes while preserving both repositories' existing histories.

### Scope and requirements
- In scope: promote the already reviewed feature branch to DEV local `main`; synchronize the resulting source to PROD local `main`; publish the code commit on both remotes with normal Git operations after exact ancestry and tree checks. Record the code-publication evidence here, then commit only this documentation closeout, fast-forward PROD to that receipt commit, push both branches normally, and verify final refs/worktree states.
- Out of scope: code changes, deployment, production configuration/data/provider operations, history rewriting, reset/clean/rebase, force push, or changing unrelated worktrees.

### Starting state and proposed integration
- DEV worktree is clean on `feature-offerings-prerequisites` at `c74b49b42235e6241b6cf5aab092b302b0e896ab`; fetched `origin/main` is `73872d8` and already contains that feature commit via a GitHub merge commit. DEV local `main` is `a2df0d0`, two commits behind `origin/main`.
- PROD worktree is clean on `main` at `a2df0d0`; fetched PROD `origin/main` is also `a2df0d0`.
- After review, fast-forward DEV local `main` to its already-published `origin/main`. The fetched graph shows PROD `main` (`a2df0d0`) is an ancestor of DEV `origin/main` (`73872d8`), so fast-forward PROD local `main` directly to that commit after fetch/ancestry confirmation. No merge commit is needed. Do not overwrite either remote history.

### Expected files / interfaces
- This change record only. No runtime source, APIs, database, dependencies, or environment changes are planned.
- No deployment or service writes.

### Acceptance criteria
- [x] DEV local `main` was advanced to the reviewed feature merge commit `73872d8`.
- [x] PROD local `main` contains both its existing history and the reviewed DEV main tree through a verified fast-forward.
- [x] Both remote `main` refs point to the intended verified integration commit after normal push.
- [x] No unrelated worktree or file is modified; no force/history-rewriting operation is used.
- [x] Change record reports actual commands/results and keeps human review pending unless a named human approves.

### Verification plan
- Recheck both worktrees/refs; verify ancestry, parent lists, tree IDs, and focused diff summaries before any branch movement. Use `git merge --ff-only` for DEV and PROD only after proving ancestor relationships.
- Inspect live local dev route chain: HTTP `/` -> actual Vite `/main.tsx` -> imported timestamped AppRoutes module; confirm landing route import is served and obsolete root copy is absent.
- In PROD, run `npm.cmd run typecheck`, `npm.cmd run build:cloudflare` (static assets only), `node tools/landing/test-ui.mjs`, and `npm.cmd run test:ui`; remove `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` from check child environments. Reuse recorded S1-INT-022 and related feature verification for unrelated suites.
- Run real headless Playwright against the already-running DEV public `/` route; assert heading/image/old-copy checks, record console/page errors and failed requests, and save `.wrangler/landing-review/live-local-landing.png`.
- Before each push, fetch and verify remote tip; push normally, then verify `ls-remote` and worktree state.

### Risks / assumptions / rollback
- DEV `origin/main` already has a GitHub PR merge absent from local `main`; a fast-forward is required, not a new feature merge.
- PROD `main` is an ancestor of the reviewed DEV merge, so fast-forward-only preserves the existing history and no new merge commit is needed.
- Roll back source changes only with a reviewed revert commit; do not rewrite shared history.
- No peer approval is inferred from this request or prior AI review.

## 2. Implementation

- **Status:** Source integration published; this record documents the code-publication snapshot as a separate documentation-only closeout
- **Files actually changed:** This record only; no runtime source. The local DEV screenshot `.wrangler/landing-review/live-local-landing.png` is ignored review output.
- **Summary / commands:** DEV: `git switch main`; `git merge --ff-only origin/main` (`a2df0d0` → `73872d8`). PROD: `git fetch --no-tags 'D:\sharhan\development\subject advisors' main`; `git merge-base --is-ancestor HEAD FETCH_HEAD` passed; `git merge --ff-only FETCH_HEAD` (`a2df0d0` → `73872d8`). Before publication, DEV `origin/main` was verified at `73872d8`, and PROD `origin/main` at expected base `a2df0d0`; both local trees were `fb010a2c611c1b4ada84f7c0f6366ee947c1af04`. Ran `git push origin main` in both repositories: DEV reported `Everything up-to-date`; PROD advanced normally from `a2df0d0` to `73872d8`. Subsequent `git fetch origin`, `git ls-remote origin refs/heads/main`, and local ref checks verified DEV and PROD `main`, `origin/main`, and `ls-remote` all at `73872d8`, tree `fb010a2c611c1b4ada84f7c0f6366ee947c1af04`. Verified prior base `a2df0d0` and feature commit `c74b49b` remain ancestors in both repositories. No force or history rewriting used.
- **Decisions / deviations from plan:** DEV remote already contained feature commit `c74b49b` as ancestor of merge `73872d8`; PROD `a2df0d0` was also an ancestor. Used only fast-forward operations; no new merge commit was needed. Coordinator reviewed A/B/C and approved local integration/readiness and source publication; the user's prior authorization covered publication. Human peer review remains pending.
- **Migrations / env / shared contracts:** None

## 3. Review

- **Self-review checklist:** Passed scope/history review: DEV and PROD local branches were fast-forward-only; both remote pushes were normal. No force/rebase/reset/clean or code commit was used. DEV `git diff --check` passed. At code publication, PROD worktree was clean and DEV contained only this planned receipt as an untracked file. Both local and remote trees matched at `73872d8`. No dependency install, database access, deploy, provider account operation, or private application action occurred.
- **Code publication snapshot:** At publication, DEV and PROD `main`, `origin/main`, and `ls-remote` all resolved to source commit `73872d8`, tree `fb010a2c611c1b4ada84f7c0f6366ee947c1af04`; `a2df0d0` and `c74b49b` were ancestors in both. This is evidence for the code publication only. The documentation-only receipt commit and its final synchronization/push are planned after review and have not occurred.
- **Test evidence:** In PROD, `npm.cmd run typecheck` passed; `npm.cmd run build:cloudflare` passed (Vite client assets only, 137 modules; no Wrangler check/deploy); `node tools/landing/test-ui.mjs` passed 7 checks at widths 300, 320, 375, 768, 1024, 1440 and sign-in CSS isolation; `npm.cmd run test:ui` passed 12 mocked Clerk/API UI checks. `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` were removed from each command's child environment. Reused the prior recorded 484-unit-test, 34 integration UI, and 24 admin UI evidence instead of rerunning unrelated suites. No dependency install was needed.
- **Manual checks:** Live DEV Vite/Playwright check used a fresh headless browser context without test mocks against `http://127.0.0.1:5173/`: HTTP 200, heading `Make your next step clear.`, hero image `naturalWidth` 1452, obsolete signup prompt absent; screenshot `.wrangler/landing-review/live-local-landing.png`. No console errors or page errors. Clerk network probe requests were aborted (`net::ERR_ABORTED`) during normal page load; no sign-in/out or private API action was taken. Listener PIDs 41452 (5173) and 27936 (8787) remained present; no process restarted. Port 8787 returned 404 for `/` and was not used as the app router. DEV `.env.local` and `.dev.vars` SHA-256 before/after equality booleans are both `true`; `.env` was absent before and after. PROD pre-operation hashes were not separately recorded; the fast-forward diff touched none of `.env.local`, `.dev.vars`, or `.env`, so the equality booleans are unverified rather than claimed true.
- **Defects found and fixes:** None
- **Review outcome:** PASS — coordinator review of A/B/C integration and code publication; human peer review pending
- **Human reviewer / approval:** Pending; no human peer approval is claimed

## 4. Changelog

- **Date:** 2026-10-30
- **Type:** Publication / Integration / Docs
- **Added / Changed / Fixed / Removed:** Recorded the plan and fetched evidence, fast-forwarded local DEV and PROD `main` to DEV merge commit `73872d8`, normally pushed `main` to both remotes, and documented readiness plus a real live-router browser check. This record is the separate documentation-only closeout following source publication.
- **Affected routes / tables / consumers:** No changes
- **Breaking changes / migration steps:** None
- **Verification summary:** At the code-publication snapshot, DEV and PROD local `main`, `origin/main`, and remote `ls-remote` were verified at `73872d8`, tree `fb010a2c611c1b4ada84f7c0f6366ee947c1af04`; ancestors `a2df0d0` and `c74b49b` were verified in each. PROD typecheck, asset-only Cloudflare build, landing UI (7), and auth UI (12) passed. Live Vite/Playwright route and image checks passed; Clerk probe requests were aborted, with no page/console errors. DEV environment hash equality booleans are true for `.env.local` and `.dev.vars`; `.env` absent. PROD env paths were absent from the fast-forward diff but pre-operation hashes were not recorded, so equality remains unverified.
- **Outstanding blockers / follow-up:** Human peer review remains pending. After review of this closeout, commit only this record, fast-forward PROD to that documentation commit, push both branches normally, and verify final refs and worktree states. No deployment or provider/database action occurred.
- **Final status:** MERGED — source publication at `73872d8`; documentation-only receipt synchronization is planned after review.
