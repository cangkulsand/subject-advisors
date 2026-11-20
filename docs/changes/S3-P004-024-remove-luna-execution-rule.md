# S3-P004-024 — Remove the `gpt-6-luna` execution rule from AGENTS.md

- **Status:** On main and pushed to dev and prod (2026-11-20) (docs only)
- **Date:** 2026-11-20
- **Sprint:** Sprint 3
- **Owner:** P004 (project instructions)
- **Related UC / FR:** N/A
- **Branch / PR:** main / not created
- **Reviewer:** Pending

## 1. Plan

The owner no longer wants project tasks handed to another model. The global Codex delegation rule was removed from the owner's personal `CLAUDE.md`. The project rule in `AGENTS.md` that sends task execution to `gpt-6-luna` (S0-FOUNDATION-001) is removed as well, because its fallback pointed to that deleted global rule.

## 2. Implementation

`AGENTS.md` "Project execution": four bullets removed:

- the rule that delegates execution to `gpt-6-luna`;
- the rule that the coordinator reviews each Luna mini-task;
- the note that the rule does not change the main model;
- the note about passing context through a model override.

The remaining rules stay: scope and `docs/implementationguide.md`, typography, the table toolbar, and merging code from other members.

## 3. Verification

Docs only. The other project docs were searched for `luna` / `gpt-6` (`CLAUDE.md`, `README.md`, `docs/implementationguide.md`) and nothing else needed changing. Older change notes that mention Luna stay as history.

## 4. Changelog

- Project tasks are no longer delegated to `gpt-6-luna`; the agent working in the session does the work and its own review.
