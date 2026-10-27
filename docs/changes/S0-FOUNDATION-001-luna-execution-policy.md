# S0-FOUNDATION-001 — Global and project task execution preference

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** N/A (project instructions)
- **Owner:** FOUNDATION
- **Related UC / FR:** N/A
- **Branch / PR:** main / not created
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
Record the user's preference that task execution be delegated to `gpt-6-luna`, first captured as project-specific and later extended to global Codex instructions.

### Scope and requirements
- In scope: the global Codex execution rule, aligned project-root guidance, and this change record.
- Out of scope: application changes, tests, commits, pushes, and unrelated repositories or settings.

### Proposed implementation
- Expected files: `C:\Users\mosha\.codex\AGENTS.md`; project `AGENTS.md`; this change record.
- APIs / database / interfaces: N/A.
- Dependencies / shared-file impact: N/A.

### Acceptance criteria
- [x] Project instructions name Luna as the task execution model and the coordinator's permitted role.
- [x] Project instructions require coordinator review after each mini-task, with fixes and re-review before completion or dependent work.
- [x] Global instructions require the coordinator to explain and ask the user before changing execution model if Luna is unavailable or judged unsuitable; no silent switch is allowed.
- [x] Explicit task-specific user model overrides take precedence; the global rule does not change the main chat model or authorize unrelated actions.
- [x] Instructions preserve scope and explain explicit context passing for model overrides.

### Verification plan
- Inspect the final diff and Git status.

### Risk / assumptions / rollback
- Risks: None identified.
- Assumptions / blockers: The initial record treated the preference as checkout-only; the user later extended it globally. The current rule applies across projects under the default Codex global instruction root, subject to task-specific user overrides.
- Rollback: Revert the instruction changes and this record update if the user requests it.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `C:\Users\mosha\.codex\AGENTS.md`; project `AGENTS.md`; this change record.
- **Summary:** Preserved the original project-only instruction history, then added a global Luna execution rule and aligned project guidance. The global rule requires review after every mini-task and asks the user before changing execution models when Luna is unavailable or unsuitable.
- **Decisions / deviations from plan:** None.
- **Migrations / env / shared contracts:** N/A.

## 3. Review

- **Self-review checklist:** Scope limited to requested documentation; unrelated worktree file preserved; wording leaves the user's selected main model unchanged.
- **Test evidence:** Not run; documentation-only change, and tests were not requested.
- **Manual checks:** Reviewed the final diff and Git status.
- **Defects found and fixes:** None.
- **Coordinator content review:** PASS — required global and project guidance present and aligned.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Docs
- **Added / Changed / Fixed / Removed:** Initial record of the project-specific task execution preference and its change record; retained here as history of the original checkout-only scope.
- **Affected routes / tables / consumers:** Project task coordination only.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Final diff and status reviewed; tests not run.
- **Outstanding blockers / follow-up:** Human peer approval pending.
- **Final status:** READY_FOR_REVIEW

- **Date:** 2026-10-26
- **Type:** Docs
- **Added / Changed / Fixed / Removed:** Extended the Luna execution policy to the global Codex instructions at `C:\Users\mosha\.codex\AGENTS.md`; aligned the project `AGENTS.md`; added an ask-before-switching exception for unavailable or unsuitable Luna and preserved task-specific user overrides. The original project-only scope is retained above as history.
- **Affected routes / tables / consumers:** Global and project task coordination.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Coordinator reviewed the instruction contents for required rules and alignment; no application tests run.
- **Outstanding blockers / follow-up:** Human peer approval pending.
- **Final status:** READY_FOR_REVIEW