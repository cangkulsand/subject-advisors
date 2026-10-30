# S1-INT-028 — P003 pathway integration candidate

- **Status:** READY_FOR_REVIEW — implementation and local checks complete; human peer review pending
- **Owner:** INT (integration)
- **Sprint / use cases:** Sprint 1, UC17 / FR-G1 and FR-G2; P003 pathway merge only
- **Candidate branch:** `feature/p003-uc17-pathway`
- **Source tip:** `e758168bee2e1809258987728b25c84bf12e3ae6`
- **Target tip:** `c0318f2219ef8d0b2e3876afb27ba5fd51b43a72`
- **Prepared:** 2026-10-30
- **Reviewer:** Human peer review pending

## 1. Plan

- **Problem / requested outcome:** Prepare a reviewable integration candidate merging the confirmed P003 UC17 source tip with `origin/main`, preserving the published main theme and P003 behavior.
- **Current / intended behavior:** Main contains the published shell/theme and pathway scaffold; source contains the read-only graph API and interactive pathway. Integrate both, resolve only directly related issues, and leave the candidate on `feature/p003-uc17-pathway` without commit or push.
- **Approach / expected files:** Create this trace record first; merge `origin/main` using `--no-ff --no-commit`; preserve the source feature and main theme. Validate shared shell wiring, DB contract, lock consistency, unit tests/builds and UI regression. A correctness defect was confirmed for multiple dated/undated attempts on a subject: query order is unspecified, while the adapter chose an arbitrary last attempt and any successful historical attempt unlocked dependents. Root coordinator authorized alignment with P001's `RecordsPage` and `recorded-credit-summary.ts` ambiguity behavior: multiple saved attempts mean `UNKNOWN` with null grade/recognized credits, and do not satisfy mandatory prerequisites; a unique attempt retains existing behavior. Regression tests cover COMPLETED+FAILED, EXEMPTED+WITHDRAWN, and multiple successful attempts in both orders. No DB schema or public API shape changes.
- **API/data/migration/cross-programmer impacts:** UC17 reads the student's curriculum, prerequisites and records. SQL was checked against `db/migrations/0001_initial_schema.sql`, including `academic_record` status, nullable semester, `record_id`, and `created_at`; no migration is required. Main-theme changes overlap shared shell and other owner styles; their changes are preserved.
- **Acceptance / verification:** exact tips remain unchanged; candidate merges without unresolved conflicts; manifest and lock are consistent; pathway SQL matches checked-in schema; typecheck, lint, tests, integration preparation, asset builds, Cloudflare dry-run (if applicable), and browser regression are recorded below. Final diff remains reviewable and uncommitted.
- **Risks / assumptions / rollback:** No canonical selected outcome for repeated attempts exists, so ambiguity remains `UNKNOWN` until P001/user reconciliation; deciding a canonical latest attempt is follow-up. Source merge remains reversible via `git merge --abort` before commit. No generated artifact should be included.
- **Out of scope:** P001/P002/P004 feature work, DB/schema changes, hypothetical scheduling, UI framework rewrite, dependency upgrades/refactors, commit, push, deploy, production checkout, credentials, live services, and DB commands.
- **Planned next phase, pending coordinator review and not performed in this mini-task:** after candidate approval, create a normal two-parent merge commit preserving both `e758168` and `c0318f2`; recheck remote tips; push the feature branch normally; fast-forward local `main` to the reviewed candidate and push `origin/main` normally. No rewrite, squash, force push, branch deletion, or production push is planned.

## 2. Implementation

- Checked out local tracking branch `feature/p003-uc17-pathway` from `origin/feature/p003-uc17-pathway` at `e758168bee2e1809258987728b25c84bf12e3ae6` after confirming `origin/main` was `c0318f2219ef8d0b2e3876afb27ba5fd51b43a72` and local `main` was clean at that same target tip.
- Merged `origin/main` using `git merge --no-ff --no-commit origin/main`; Git reported automatic merge success with no textual conflicts. Candidate remains in the index/worktree; no merge commit exists.
- Preserved P003's pathway API, adapter, UI, dependency manifest/lock and generated integration registration, plus main's published palette/theme and shared-shell changes.
- Updated `apps/api/src/modules/pathway/adapter.ts` so more than one saved record for a subject produces `UNKNOWN` and null record details, and cannot satisfy prerequisite checks. Added order-independent combinations to `apps/api/src/modules/pathway/pathway.test.ts`.
- Updated `tools/integration/test-ui.mjs` with a typed-shape, explicitly fictional graph response and UC17 graph/node-details/list-view interaction checks. Replaced stale placeholder expectations with installed pathway route/read-only graph expectations.
- `npm.cmd ci --ignore-scripts` succeeded using the lockfile (220 packages installed, audit reported 0 vulnerabilities); it did not modify package manifest/lock.
- `npm.cmd run build:cloudflare` succeeded using a fictional public test-only Clerk key. `npm.cmd run check:cloudflare` also completed its dry-run path and Wrangler exited with `--dry-run: exiting now`; no deployment occurred.
- Follow-up observations, not expanded here: P003 currently renders an SVG graph instead of React Flow, and its “Fit to view” action resets scale rather than calculating a viewport fit. These were pre-existing source behaviors outside this merge correction.

## 3. Review

- **Self-review outcome:** PASS — SELF-REVIEW. Scope stayed with INT/UC17 integration; human peer review remains pending. No commit or push was created.
- **Commands and outcomes:**
  - `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git rev-parse e758168bee2e1809258987728b25c84bf12e3ae6`: confirmed clean initial main and exact tips before switching; HEAD now remains the source tip while `MERGE_HEAD` is the target tip.
  - `npm.cmd ci --ignore-scripts`: PASS; exact lock install.
  - `npm.cmd run typecheck`: PASS; integration prepare reported P001/P002/P003/admin modules present.
  - `npm.cmd run lint`: PASS; rerun after final UI regression edits.
  - `npm.cmd test`: PASS; 37 test files passed, 2 skipped; 507 tests passed, 13 skipped.
  - `npm.cmd run test:integration`: PASS; 7/7 prepare tests.
  - `npm.cmd run build:local`: PASS; Vite built local assets.
  - `npm.cmd run build:cloudflare`: PASS; Vite built Cloudflare assets with fictional public test-only key.
  - `npm.cmd run check:cloudflare`: PASS as dry-run; Wrangler read 5 assets, reported total upload size, and exited with `--dry-run: exiting now`. No deployment occurred.
  - `node tools/integration/test-ui.mjs --installed`: PASS; 35 checks, `installedOwnerPages: true`, `clerkAndApi: MOCKED`. Includes UC17 graph fetch, node inspection, accessible list switch, route/setup/role checks and responsive shell checks.
- **Diff review:** Against the source tip, the candidate adds main's theme/publication changes plus this integration record and the narrow adapter/test/mock updates. Against `origin/main`, it carries P003's API/UI, lockfile and integration registration, plus this integration correction. `package.json` and `package-lock.json` have no additional post-merge edits; `npm ci` succeeded. No unresolved merge entries were present. Local build outputs and `node_modules` are ignored/untracked from the reviewed diff.
- **Review limitations/follow-ups:** No live database, official curriculum catalogue or real account was used. Shared UI uses fictional API mocks. Product policy to resolve repeated academic-record attempts remains open. SVG/fit-view observations above remain follow-up items. Human peer review has not occurred.
- **Human peer review:** PENDING.
- **Candidate handoff:** READY_FOR_REVIEW; keep uncommitted for coordinator review.

## 4. Changelog

- 2026-10-30 — Prepared the no-commit P003 + main integration candidate. Corrected ambiguous repeated-attempt status handling without changing DB/API contracts. Added adapter regression cases and an accurate fictional pathway UI fixture with interaction coverage. All recorded local checks passed; human peer review remains pending. No commit, push, merge-to-main or deployment was performed.
