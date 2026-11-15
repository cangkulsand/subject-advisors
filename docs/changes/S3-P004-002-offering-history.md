# S3-P004-002 — Coordinator Offering History page

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-15
- **Sprint:** Sprint 3
- **Owner:** P004 (M6)
- **Related UC / FR:** UC23 / FR-H13–H14 ("past semesters' decisions and picks are kept for a future Offering History page"); SDD Sprint 3 "Add an Offering History page for past semesters"
- **Branch / PR:** `feature/s3-offering-history`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Coordinators look back at past semesters: which subjects they approved or removed and how many students picked each.
Owner decisions (2026-11-15): coordinators only; read-only; reuse the existing coordinator APIs (no cross-semester
comparison). Spec `docs/superpowers/specs/2026-11-15-offering-history-design.md`. The SRS/SDD document is not updated.

## 2. Implementation

- `/coordinator/history` "Offering History", coordinator menu under Forecast planning after Class Offering Forecast;
  overview quick link added.
- `OfferingHistoryPage.tsx`: programme / learning centre / semester selectors limited to the coordinator's
  `assignedScopes` (none → the existing "not assigned" message); semesters = those whose `selectionClosesAt` is set
  and past, newest first (`closedSemesters`). Table: subject, credits, Approved / Removed, picked-by count (`—` for
  removed, `0` when nobody picked) and "View students" (existing `SubjectPickersDialog`; picker lists kept in memory
  only and cleared on scope change). Loading, error with Try again, and both empty states.
- `offering-history.ts` helpers `closedSemesters`, `historyRows` (+ tests).
- Frontend only: reuses `context()`, `GET /api/coordinator/offering-decisions` (already accepts any semester, returns
  `editable:false` for past ones, enforces scope) and the pickers endpoint. No API, contract or database change.
- Tests: `tools/coordinator/test-ui.mjs` gained history checks and now honours `PLAYWRIGHT_CHANNEL`;
  `tools/admin/test-ui.mjs` coordinator quick-link count updated (4 → 5).

## 3. Review

- typecheck, lint, build, check:cloudflare pass; `npm test` 1652 passed (65 skipped).
- `PLAYWRIGHT_CHANNEL=chrome`: coordinator UI 54, integration UI 48, admin UI 50 — all passed.
- Review round: assigned-scope fallback removed (no unassigned combinations offered); count / "View students" spacing.

Not verified: against live data (mocks only). Non-goals: comparison across semesters, admin access, the Decision
Audit placeholder, counts of picks withdrawn by removals.

## 4. Changelog

- 2026-11-15 - Type: Added. Coordinator Offering History page (`/coordinator/history`), read-only, frontend only. Outstanding: human peer review.
