# S1-INT-021 — Publish curriculum cache and synchronize production repository

- **Status:** IN_PROGRESS
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 integration
- **Owner:** FOUNDATION / integration
- **Related UC / FR:** Publication of S1-FOUNDATION-005 supporting P001 UC03/UC04; no new product requirement
- **Branch / PR:** Local preparation on `feature-redis-caching`; no PR
- **Reviewer:** Coordinator review pending at publication gates; no human peer review claimed

## 1. Plan

### Objective / problem
Commit the completed and coordinator-reviewed S1-FOUNDATION-005 implementation in the development repository, then—only after coordinator review—integrate it into development `main` and synchronize the separate production GitHub repository while preserving its remote history and application code.

### Scope and requirements
- In scope: make a local feature-branch commit from the exact 10 reviewed S1-FOUNDATION-005 paths plus this record; fetch both repositories' configured `origin` without pruning; compare local and remote histories, merge bases, unique commits, and tree/path differences; return commit and sync evidence for coordinator review.
- Subsequent gated work, not part of mini-task 1: coordinator-reviewed normal merge of fetched production `origin/main` into the reviewed development feature, then fast-forward/push development and production `main` only after verifying the resulting tree/history and conflicts. This preserves GitHub PR #1 history and the current development application code.
- Out of scope: merge or push in mini-task 1; edits in the production worktree; deployment, activation, provider provisioning, actual environment/secrets, database writes/migrations, force operations, history rewriting, or touching the separate `ui/shared-main-template` worktree.
- User explicitly requested commit, merge to main, and production-repository sync. That request authorizes those publication actions in later gates; it does not authorize deployment or production data/configuration changes.

### Current behavior and intended behavior
The development worktree is on `feature-redis-caching` at `40e3e2d406fd661a3d8987f8211426806c5ee2d5`, matching local and remote-tracking `main`, with only the reviewed 10 implementation paths modified/untracked. The production worktree is clean on local `main` at `9001d09003c143e959601423aac8f83f20cce325`, while its remote-tracking `origin/main` is `d65af1cbbf659432ea235dd1eb0f83d99a2ca375`; it is stale and reported ahead four/behind one before fetch. Fetch both origins and preserve/inspect all remote history before proposing any production sync.

### Proposed implementation
- Mini-task 1 expected files: the 10 reviewed S1-FOUNDATION-005 paths plus `docs/changes/S1-INT-021-publish-curriculum-cache-sync-production.md`.
- Mini-task 1 actions: finish this plan, update S1-FOUNDATION-005 metadata to publication-in-progress without changing its reviewed implementation, fetch both origins, inspect graph/tree/path differences, stage only the explicit 11 development paths, check the staged diff and secret-path exclusion, then commit on `feature-redis-caching` with `feat: cache curriculum subject options (S1-FOUNDATION-005)`.
- No database, HTTP, or runtime interface change beyond the already-reviewed implementation. The production repo remains read-only except normal fetch/remote-tracking ref updates in this stage.
- After local commit, coordinator reviews the actual commit and the proposed non-destructive sync order before any merge or push.

### Acceptance criteria
- [x] This plan and the publication-in-progress metadata are written before fetch/staging/commit actions.
- [x] Both configured origins are fetched without pruning; the resulting graph, merge bases, unique commits, tree changes, and touched paths are recorded.
- [x] Only the exact 10 reviewed implementation paths and this record are staged/committed; no `.dev.vars`, `.env*`, generated output, credentials, or unrelated files are included.
- [x] Cached path list and cached diff pass inspection and `git diff --cached --check`; resulting commit hash, message, parent, branch, and file list are verified and included in the coordinator handoff.
- [x] Production sync advice preserves current remote history and application changes; no production file or local branch/commit is changed in mini-task 1.
- [x] No merge, push, deployment, activation, provider operation, or database/environment write occurs before coordinator review of the commit and sync plan.

### Verification plan
- Read both repositories' `AGENTS.md` and applicable implementation/publication workflow records.
- `git fetch origin` separately in development and production worktrees.
- Compare `HEAD`, local `main`, fetched `origin/main`, merge bases, graph, ahead/behind counts, unique commit summaries, and tree/path diffs; inspect any merge commit and conflicts anticipated.
- Stage the explicit whitelist only; inspect `git diff --cached --name-only`, `git diff --cached --check`, staged content for secrets, then commit and verify full commit ID, parent, and file list.
- No runtime tests are planned for this publication-only mini-task; the reviewed change's verification is in S1-FOUNDATION-005. Do not merge/push until the coordinator's commit/sync review passes.

### Risk / assumptions / rollback
- Risks: production remote contains a GitHub PR merge absent from its stale local clone; a careless reset, force push, or ours strategy could discard that history or production code. Mitigation: fetch first, do not rewrite refs or edit production files, and present graph/tree evidence before any integration. Production `node_modules/@upstash/redis` is absent; after the source tree is synchronized, reconcile local installed packages from the committed lockfile (`npm install --ignore-scripts --no-audit --no-fund`), verify the lockfile remains unchanged, and run required checks before declaring the checkout ready. This dependency reconciliation is not a package/lockfile change and is deferred to a coordinator-reviewed stage.
- Assumptions: the reviewed 10-file implementation remains unchanged since its 459-pass/13-skip full test run, integration 7/7, builds, dry-run, and coordinator AI review. Current user instruction authorizes later commit/merge/push/sync gates.
- Rollback: before any push, the new local feature commit can be reverted under coordinator direction. Preserve all remote commits; no force push or reset is in scope.

## 2. Implementation

- **Status:** IN_PROGRESS — local commit prepared; coordinator review required before integration
- **Files actually committed:** Exactly the 10 reviewed S1-FOUNDATION-005 paths plus this INT-021 record. The 005 record was updated to publication-in-progress; reviewed runtime code was unchanged after final review.
- **Summary:** Fetched both configured origins normally without pruning. DEV feature `HEAD`, local `main`, and `origin/main` were at `40e3e2d406fd661a3d8987f8211426806c5ee2d5`; the feature commit's parent is that base. Production local `main` is `9001d09003c143e959601423aac8f83f20cce325`, `origin/main` is `d65af1cbbf659432ea235dd1eb0f83d99a2ca375`, merge base is `a836b2fbf3f76b14d24a5726073aa2826ed4fbec`, and branch count is ahead 4/behind 1. Created the local `feature-redis-caching` commit with subject `feat: cache curriculum subject options (S1-FOUNDATION-005)` and parent `40e3e2d406fd661a3d8987f8211426806c5ee2d5`; full commit ID is supplied to the coordinator, avoiding a self-reference in this record. The commit has exactly the approved 11 paths and the worktree is clean. No merge, push, production file edit, or deployment performed.
- **Decisions / deviations from plan:** None.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** PASS — fetched both origins without pruning; branch ancestry and production divergence inspected; exact 11-path whitelist staged; `.dev.vars.example` contains blank credentials; actual `.dev.vars`, `.env*`, generated files, and unrelated work were excluded; staged check and post-commit check passed; worktree is clean; no remote or database write occurred.
- **Test evidence:** No runtime tests planned for this metadata/publication-preparation task; prior implementation checks are recorded in S1-FOUNDATION-005.
- **Manual checks:** Read development implementation/merge guidance plus production S1-INT-018/019 sync records. Confirmed INT-021 was unused. Fetches completed in both worktrees. Production local-only commits are `9001d09` (INT-019 receipt), `4ed9549` (history alignment merge, parents `a7b01f0` and `67113cd`), `a7b01f0` (INT-018 receipt), and `67113cd` (UI-only template). Production remote-only commit is GitHub PR #1 merge `d65af1c` with parents `7d4cde7` and `a836b2f`. `git diff --name-status origin/main main` shows `A` for `docs/changes/S1-INT-018-merge-staff-workspaces-main.md` and `docs/changes/S1-INT-019-sync-development-workspace.md`: these receipt docs exist only in local `main` and are absent from remote `origin/main`; coordinator confirms runtime application content is otherwise identical. The source development commit object is not present in the production object database; no cross-repo merge or file edit was attempted. Recommended order: normal-merge fetched production `origin/main` into the reviewed DEV feature (checking any doc-path conflicts), then fast-forward/push both mains only after review; this preserves the remote PR #1 merge and current development application tree. Production's `node_modules` is an ordinary directory, contains no installed `@upstash/redis`, and is not a junction. Post-sync local package reconciliation from the lockfile and verification are a later reviewed gate; they must leave manifests/lockfile unchanged and preserve actual environment files and the separate `ui/shared-main-template` worktree.
- **Defects found and fixes:** None.
- **Review outcome:** PASS — SELF-REVIEW; coordinator review of the amended local commit and production sync strategy pending.
- **Human reviewer / approval:** Pending; no human peer review claimed.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Chore / Docs
- **Added / Changed / Fixed / Removed:** Added a staged plan for local commit preparation and later gated development-main/production-repository synchronization.
- **Affected routes / tables / consumers:** None.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Normal `git fetch origin` succeeded in each repo; refs, merge bases, unique commit lists, status, and production tree differences were inspected. Exact 11-path staged list, `git diff --cached --check`, commit subject/parent/file list, clean worktree, and `git show --check` passed. Full commit hash was sent to the coordinator.
- **Outstanding blockers / follow-up:** Mini-task 1 remains limited to local reviewed commit and preflight report; coordinator review is required before merge/push or production sync.
- **Final status:** IN_PROGRESS
