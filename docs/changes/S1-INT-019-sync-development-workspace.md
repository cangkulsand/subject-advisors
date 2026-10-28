# S1-INT-019 — Synchronize Development Workspace

- **Status:** PLANNED — coordinator-authorized local integration
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 integration
- **Owner:** INT / Integration
- **Related UC / FR:** N/A — repository history synchronization
- **Branch / PR:** `main` / local only, no PR or push
- **Reviewer:** Coordinator review pending after execution

## 1. Plan

### Objective / problem
Advance DEV (`D:\sharhan\development\subject advisors`) to the explicitly reviewed SOURCE application tree (`D:\sharhan\development\production\subject advisors`) while preserving both DEV local history and its fetched `origin/main` history. Keep the SOURCE application tree byte-for-byte identical to reviewed local commit `a7b01f09cf4dd270833d145a72027ea5a402392b`.

### Scope and requirements
- In scope: create a local two-parent history integration commit on SOURCE `main` using SOURCE's reviewed tree as the merge result; fast-forward DEV `main` to that exact commit using a local-path fetch.
- Keep the DEV template commit `67113cdae8dab0965c7bd65b643a6734d3e4b15d` in the second-parent history, but do not copy its stale UI template tree over reviewed SOURCE files. Coordinator reviewed that this commit changes 14 UI/template files and authorized preserving its history while retaining SOURCE files.
- Out of scope: push/fetch remote changes during execution, alter remotes or tracking config, reset/rebase/force-update branches, overwrite/delete/stash local paths, install dependencies, stop/start runtimes, deploy, or write to the database/schema.

### Proposed implementation
- Record this plan before creating backup refs or changing branches.
- Reconfirm SOURCE `main=a7b01f09cf4dd270833d145a72027ea5a402392b`, DEV `main=0ccac62c14e563fd5ba461a5002f48e71d99069c`, and DEV `origin/main=67113cdae8dab0965c7bd65b643a6734d3e4b15d`.
- Create named recoverable refs to those three commits. Check for Git processes/index locks; do not remove a lock file.
- On SOURCE `main`, create a no-fast-forward merge commit using strategy `ours` with DEV `origin/main` as second parent; stage only this record and commit the resulting history integration. The result tree must differ from reviewed SOURCE commit only by this record.
- Fetch SOURCE's local `main` path into DEV without changing remotes/config, verify the fetched commit, then `git merge --ff-only FETCH_HEAD` on DEV.
- Preserve DEV `.dev.zip`, `p002/`, `.env.local`, `.dev.vars`, ignored caches and `node_modules`; preserve both repositories' remotes and all remote refs.

### APIs / database / dependencies
No API, schema, migration, or data change. Coordinator independently verified the shared Neon project/branch/database, migration hashes 0–4, role/audit tables, and protected owner state. Both workspaces already have matching locked dependency versions; no install is planned.

### Acceptance criteria
- [ ] Named backup refs point to original SOURCE, DEV local, and DEV origin commits.
- [ ] SOURCE integration commit has parents `a7b01f0` and `67113cd` in that order, with only this plan record changed relative to `a7b01f0`.
- [ ] DEV `main` fast-forwards to the exact SOURCE integration commit, with both original DEV commits ancestors.
- [ ] SOURCE and DEV tracked trees match except for this record's progress/status text; no application file from the old template tree replaces SOURCE content.
- [ ] DEV `.dev.zip`, non-generated `p002/` files, env files, ignored caches and `node_modules` remain unchanged; DEV's two preexisting untracked entries remain.
- [ ] No push, deployment, database write, install, or runtime switch occurs.

### Verification plan
Use `git status`, `git rev-parse`, `git show -s --format=%P`, `git merge-base --is-ancestor`, `git diff-tree`, and `git diff` to confirm commit identities, parents, fast-forward ancestry, and tracked-tree difference. Compare protected file hashes and environment-file hashes privately; report only match booleans and counts, never secret values/fingerprints.

### Risks / rollback
The `ours` merge intentionally retains the old template commit only as ancestry, not as the resulting application files. Named backup refs keep original local commit tips reachable. If the actual merge result or post-commit tree differs from this plan, stop before DEV update and report it; no reset/rebase is authorized. The SOURCE remote tip is outside scope and will not be fetched or changed.

## 2. Implementation

- **Status:** NOT STARTED
- **Files actually changed:** This record only (plan revision)
- **Summary:** Plan revised before Git ref/branch mutations per coordinator decision.
- **Decisions / deviations from plan:** Preserve reviewed SOURCE local application tree while recording DEV `67113cd` as second parent; no remote-state reconciliation.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** Pending execution
- **Test evidence:** Not run; repository history operation only, no tests requested at this stage
- **Manual checks:** Current refs and worktree state confirmed before mutation; details to record after execution
- **Defects found and fixes:** None
- **Review outcome:** PENDING COORDINATOR REVIEW
- **Human reviewer / approval:** Coordinator authorized the history policy; post-execution review pending

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Chore
- **Added / Changed / Fixed / Removed:** Revised plan for local history integration and DEV fast-forward; no code change planned.
- **Affected routes / tables / consumers:** None
- **Breaking changes / migration steps:** None
- **Verification summary:** Preflight confirmed ancestry, preserved target untracked paths, same DB identity, and matching dependency locks. DEV origin's 14-file UI-only template commit is retained as history while SOURCE's reviewed app tree remains authoritative.
- **Outstanding blockers / follow-up:** Execution and post-execution coordinator review.
- **Final status:** PLANNED

## Preflight evidence

- SOURCE local `main`: `a7b01f09cf4dd270833d145a72027ea5a402392b`.
- DEV local `main`: `0ccac62c14e563fd5ba461a5002f48e71d99069c`.
- DEV `origin/main`: `67113cdae8dab0965c7bd65b643a6734d3e4b15d` (14-file UI-only template change, coordinator reviewed).
- DEV untracked paths are `.dev.zip` and `p002/`; exact tracked-path collision count with SOURCE tree is zero. These paths must remain untouched.
- Source and DEV `.dev.vars` database URLs compared equal; both use Clerk test-mode publishable keys. No connection values or fingerprints are recorded.
- Both package lockfiles have 323 packages and zero version-entry differences; checked installed versions match.
- Existing process on 8787 references SOURCE; 5173 owner workspace was indeterminate. Runtime state will not be changed.
- The earlier SOURCE remote fetch stalled; SOURCE origin is outside this local-only plan and will not be consulted or updated.
