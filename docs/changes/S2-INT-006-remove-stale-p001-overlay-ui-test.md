# S2-INT-006 — Remove the stale P001 overlay browser test

- **Status:** MERGED to `main` (2026-11-15); human peer review pending
- **Date:** 2026-11-15
- **Sprint:** Sprint 2
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** committed directly to `main` on 2026-11-15; no PR
- **Reviewer:** P001 (author of the removed harness)

## 1. Plan

`tools/p001-sprint2/test-ui.mjs` ran its own overlay bundle (`tools/p001-sprint2/testing/main.tsx`). Its admin curriculum checks have failed since S2-INT-002 because `/admin/curriculum` moved to the UC24 action workspace (S2-P003-006) and then the admin theme (S2-INT-005). Those pages are covered by `tools/p001-sprint2/test-uc24-ui.mjs`, and `/student/progress` is covered inside the real `StudentShell` by `tools/integration/test-ui.mjs` (S2-P001-006). Remove the stale harness and keep its progress-only checks that were not already covered elsewhere.

## 2. Implementation

- Deleted `tools/p001-sprint2/test-ui.mjs` and `tools/p001-sprint2/testing/main.tsx` (used only by that harness).
- `tools/integration/test-ui.mjs`: the progress mock accepts `progress` and `progressFail`; three checks moved from the removed harness: subject filter (Remaining), failure with retry and no fabricated totals, incomplete credit configuration with no percentage.
- `p001-sprint2-handoff-manifest.json`: the two deleted files removed from `files` (31 → 29).
- `docs/p001-sprint2-handoff.md`: notes the removal.
- No product code, API or database change.

## 3. Review

- `PLAYWRIGHT_CHANNEL=chrome node tools/integration/test-ui.mjs`: 40 passed (was 37).

## 4. Changelog

- 2026-11-15 - Type: Removed. Stale P001 overlay browser test and its bundle entry; its unique progress checks moved to the integration UI harness. Compatibility: test tooling only. Status: MERGED; human peer review pending.
