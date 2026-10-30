# S1-INT-027 - Theme publication and production sync

- **Status:** IN_PROGRESS
- **Date:** 2026-10-30
- **Sprint:** Sprint 1 integration follow-up
- **Owner:** INT / integration
- **Related UC / FR:** Publication of reviewed INT025/INT026 presentation work; no new product behavior
- **Reviewer:** AI source review passed; human review pending

## 1. Plan

### Objective / problem
Publish the reviewed public, student, admin, coordinator, and auth theme changes from DEV to the production repository through an auditable DEV commit, normal pushes, and a fast-forward-only production sync.

### Scope and requirements
- Phase A: verify both repository origins and matching `main` baselines, stage only the reviewed INT025/INT026 allowlist plus this receipt, inspect the staged diff, and create one commit on DEV `main`.
- Phase B, separately authorized after review: fast-forward PROD `main` to that commit, make the approved production assets-only build ready, and push both normal branch refs. Do not force push.
- Include the intentional prior user edit removing the landing workspace/about sections. Preserve existing change records' READY_FOR_REVIEW and human-pending status; their historical implementation notes that no commit/push had occurred at that time remain unchanged. No human approval is claimed.
- Explicitly exclude runtime settings, credentials, environment files, dependency changes, database operations, deployment commands, and live config changes.

### Proposed implementation
- Expected DEV paths: the 16 reviewed modified paths plus `docs/changes/S1-INT-025-public-landing-theme.md`, `docs/changes/S1-INT-026-role-aware-application-palette.md`, and this record. Stage no other paths.
- Verify the exact parent is `a2080cbbba357d340645fecc5e83eb16472e4210`, both local/remote main baselines and ancestry, exact staged allowlist, staged diff whitespace, and exclusion of secret/config files before committing.
- Commit on DEV `main` with a descriptive S1-INT-025/026 theme message. No PROD branch movement, push, or deployment in Phase A.

### API / data / migration and shared impacts
No API, database, migration, runtime configuration, dependency, or access-control impact. Phase B will use the production repository's reviewed assets-only build readiness; it will not deploy or edit live settings.

### Acceptance criteria and verification
- Both configured origins match the expected development and production repositories; fetched remote `main` refs equal the expected baseline before local mutation.
- DEV `main` is at the reviewed baseline with no concurrent changes before staging; changes are descendants of the verified baseline.
- Exactly the 18 reviewed INT025/INT026 paths plus this new record are staged; no secret/runtime files are staged; cached diff check passes.
- Commit has the verified baseline as its sole parent and contains only the allowlisted paths.
- This Phase A record reports commit/tree/parent and staged paths truthfully. Stop for coordinator review before Phase B.

### Risks, assumptions, rollback
- User explicitly authorized commit, push, production sync. This mini-task performs only the DEV commit; root review gates the later PROD fast-forward and normal pushes.
- Preserve the documented 3.89:1 contrast of the exact requested `#B88B96` inactive navigation color on burgundy; do not silently alter it during publication.
- Human review remains pending; AI/coordinator review is not human approval.
- No reset, rebase, force push, cleanup, secrets, runtime config, DB operation, or deployment command. Roll back a local unpublished commit only with explicit coordinator direction; do not rewrite shared history.

## 2. Implementation

- **Status:** IN_PROGRESS
- **Files actually changed:** This publication record; reviewed INT025/INT026 source remains untouched.
- **Remote verification:** DEV `origin` is `https://github.com/cangkulsand/subject-advisors.git`; PROD `origin` is `https://github.com/cangkulsand/subject-advisors-prod.git`. Both local `main`, fetched `FETCH_HEAD`, and `refs/remotes/origin/main` equal `a2080cbbba357d340645fecc5e83eb16472e4210`. `git merge-base --is-ancestor a2080... FETCH_HEAD` returned 0 in both repositories. PROD working tree is clean. DEV is on `main` at the verified baseline with the exact reviewed 16 modified theme/code/test/doc paths and the two INT025/INT026 records; this new record is the only additional path.
- **Summary:** Remotes and ancestry match the reviewed plan. Fetches were read-only with respect to source branches; no remote branch moved. Exactly the planned 19 paths are staged; commit verification remains next.
- **Deviations:** None.

## 3. Review

- **Self-review:** Root's source review passed; human review pending. Remote baselines and ancestry pass. Staged allowlist is exactly 19 expected paths; no environment, credential, key, or secret-named file is staged. Commit parent/object verification remains pending.
- **Verification:** In DEV and PROD, `git fetch origin main` passed; local `main`, `FETCH_HEAD`, and `refs/remotes/origin/main` equal `a2080cbbba357d340645fecc5e83eb16472e4210`; ancestry checks returned 0; PROD is clean. In DEV, cached path allowlist comparison passed (19 expected, 19 actual, no missing/extra path, no secret/config filename) and `git diff --cached --check` passed.
- **Human reviewer / approval:** Pending; no approval claimed.

## 4. Changelog

- **Date:** 2026-10-30
- **Type:** Chore / publication
- **Added / changed:** Publication record created before Git mutations. Phase A will create a DEV commit for reviewed INT025/INT026 work only.
- **Affected routes / tables / consumers:** None; presentation source only.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Pending.
- **Outstanding:** Phase B (PROD fast-forward, assets-only build readiness and normal pushes) is explicitly held for coordinator review/authorization; human peer review remains pending.
- **Final status:** IN_PROGRESS
