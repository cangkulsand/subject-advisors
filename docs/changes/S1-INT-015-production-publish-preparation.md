# S1-INT-015 — Production repository publication preparation

- **Status:** IN_PROGRESS
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** INT / Integration preparation
- **Related UC / FR:** Session changes across P001, P002, P004 and FOUNDATION
- **Branch / PR:** `main` / direct publication requested by user; commit and push held for coordinator review of the staged diff
- **Reviewer:** Pending coordinator review

## 1. Plan

### Objective / problem
Prepare the completed, user-authorized session changes for a clean, reviewable publication to the verified production repository without committing generated artifacts or secrets.

### Scope and requirements
- In scope: inspect all current changes and repository target, remove only task-generated disposable artifacts that are verified within this workspace, perform final repository checks, stage the intended completed changes explicitly, and report the staged diff for coordinator review.
- Preserve all existing user edits, reviewed session features, migrations/reference data, change records, ignored development configuration, and running local services.
- Out of scope for this preparation mini-task: changing feature behavior, database/provider writes, schema edits, force-push, reset/rebase/amend, deploy, or commit/push before coordinator review.

### Proposed implementation
- Expected changes: this preparation record; minimal corrections to stale coordinator-review statuses in prior change records; explicit staging of authorized session files after final review. A narrow ignore rule is in scope only if a verified recurring debug artifact requires it.
- APIs / database / interfaces: none. Frozen migration checksums for `0000`–`0003` must remain unchanged; no database operations are planned.
- Repository target: verify existing `origin` and current branch/remote state using Git metadata only; do not expose credentials.

### Acceptance criteria
- [ ] Only verified disposable task artifacts are removed; no environment, cache, dev-server, history, migration, or handoff files are removed by guess.
- [ ] No secret values are printed or staged; blank examples only.
- [ ] Frozen migration files and recorded hashes are unchanged.
- [ ] Historical change records reflect actual coordinator review and moved functionality without rewriting their history.
- [ ] Applicable integrated and owner checks pass, with actual results recorded.
- [ ] The intended file set and staged diff are ready for coordinator review; no commit or push occurs in this mini-task.

### Verification plan
- Inspect `git status`, diff summaries, tracked/untracked paths, repository identity and remote tracking state.
- Run the repo's integrated test/type/lint/build checks plus relevant P001/P002/P004 and database static/tooling checks; no live database tests.
- Run secret/path audits that report filenames or pass/fail only, inspect migration hashes, and run `git diff --check`.

### Risk / assumptions / rollback
- User explicitly authorized publication to the verified production repository and `main`; coordinator requires staged-diff review before the separate commit/push step.
- Existing `.env.local`, `.dev.vars`, `.wrangler`, local server state and other ignored files are preserved. Cleanup will be limited to a clearly verified generated debug log, if present.
- Staging is reversible; no destructive Git operation is planned.

## 2. Implementation

- **Status:** NOT STARTED
- **Files actually changed:** This record only
- **Summary:** Pending audit and verification
- **Decisions / deviations from plan:** None
- **Migrations / env / shared contracts:** No changes planned

## 3. Review

- **Self-review checklist:** Pending
- **Test evidence:** Not yet run
- **Manual checks:** Not yet run
- **Defects found and fixes:** None
- **Review outcome:** PENDING
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** Pending
- **Type:** Chore / Docs
- **Added / Changed / Fixed / Removed:** Pending
- **Affected routes / tables / consumers:** None planned
- **Breaking changes / migration steps:** None
- **Verification summary:** Pending
- **Outstanding blockers / follow-up:** Coordinator staged-diff review must occur before commit/push.
- **Final status:** IN_PROGRESS
