# S0-FOUNDATION-002 — Plan, implementation, review, and changelog policy

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-09
- **Sprint:** N/A (foundation project instructions)
- **Owner:** FOUNDATION
- **Related UC / FR:** N/A
- **Branch / PR:** main / not created
- **Reviewer:** Coordinator and GPT-6.1 Sol AI reviews passed on 2026-11-09; human approval pending.

## 1. Plan

### Objective / problem
Expand project-root instructions so every repository change follows the implementation guide's Plan → Implementation → Review → Changelog workflow, with practical safeguards for database work and development-to-production repository synchronization.

### Scope and requirements
- In scope: concise project-root `AGENTS.md` policy and this individual change record.
- Out of scope: application behavior, database/schema/data changes, dependencies, commits, pushes, deployment, production repository synchronization, and global Codex configuration.

### Proposed implementation
- Expected files: `AGENTS.md`; `docs/changes/S0-FOUNDATION-002-plan-implement-review-policy.md`.
- APIs / database / interfaces: N/A; documentation only.
- Dependencies / shared-file impact: N/A; root agent guidance for future task execution.

### Acceptance criteria
- [x] Project instructions require Plan → Implementation → Review → Changelog and a per-change record before implementation edits.
- [x] Instructions require reading project guides and inspecting actual code, database structure, dependencies, and affected consumers before changes.
- [x] Instructions cover approved-plan scope, database safety, focused implementation, review evidence, reporting, and when approval is required.
- [x] Model roles distinguish GPT-6.1 Sol architecture/planning/technical decisions/final review from Luna approved-plan implementation, with GPT-6.1 Sol handling development-to-production repository synchronization execution and final review.
- [x] Existing Luna coordination review rules and mandatory UI readability/table-toolbar rules are retained without a blanket Luna-only execution rule.
- [x] Only the two planned files are changed; unrelated working-tree files are preserved.

### Verification plan
- Inspect final diff and Git status.
- Run `git diff --check` and inspect the new record and `git diff -- AGENTS.md`.
- No application tests: documentation-only change.

### Risk / assumptions / rollback
- Risks: Ambiguous model routing or overbroad operational permission could be mistaken for authorization to alter production; wording will explicitly limit sync guidance to task-specific authorization and require explicit approval for destructive or production actions.
- Assumptions / blockers: GPT-6.1 Sol is available as `gpt-6.1-sol`; task-specific model overrides continue to take precedence.
- Rollback: Revert the two documentation files if the user requests it.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `AGENTS.md`; `docs/changes/S0-FOUNDATION-002-plan-implement-review-policy.md`.
- **Summary:** Added project-level workflow, model routing, database/operational safety, review/reporting guidance, and preserved mandatory UI requirements. The plan was recorded before editing `AGENTS.md`.
- **Decisions / deviations from plan:** None.
- **Migrations / env / shared contracts:** N/A.

## 3. Review

- **Self-review checklist:** Scope limited to the two planned files; mandatory UI rules and Luna mini-task review retained; no Luna-only blanket rule; sync authorization boundaries explicit. Coordinator reviewed the actual changes after each Luna mini-task and passed the corrected wording; GPT-6.1 Sol completed final AI review with no substantive findings.
- **Test evidence:** Luna, the coordinator, and GPT-6.1 Sol each ran `git diff --check` with no whitespace errors (Git emitted only a line-ending normalization warning for `AGENTS.md`). GPT-6.1 Sol separately checked the new, untracked record for trailing whitespace; passed. No application tests run; documentation-only change.
- **Manual checks:** Inspected `git diff -- AGENTS.md`, the complete new change record, and `git status --short`; unrelated untracked files remain untouched.
- **Defects found and fixes:** Coordinator review requested precise migration-test wording and clarified that an explicitly requested repository sync should proceed autonomously while protecting uncommitted work and production-only configuration. Updated `AGENTS.md` accordingly.
- **Review outcome:** PASS — SELF-REVIEW; coordinator and GPT-6.1 Sol final AI review completed. Human approval pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-09
- **Type:** Docs
- **Added / Changed / Fixed / Removed:** Updated project execution instructions covering model roles, workflow gates, database safeguards, review, reporting, and repository synchronization safeguards. Coordinator wording clarifications now explicitly require migration tests before deployment and allow routine operations within an explicitly requested sync while protecting uncommitted work and production-only configuration.
- **Affected routes / tables / consumers:** Project task execution guidance only.
- **Breaking changes / migration steps:** None.
- **Verification summary:** `git diff --check` and the new record's trailing-whitespace check passed; final diff, new record, and Git status inspected. Coordinator and GPT-6.1 Sol final AI reviews passed. No application tests run (documentation-only).
- **Outstanding blockers / follow-up:** No implementation blockers; human peer approval remains pending.
- **Final status:** READY_FOR_REVIEW
