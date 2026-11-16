# S3-P004-002 — Coordinator Offering History page

- **Status:** MERGED to `main` (2026-11-16); human peer review pending
- **Date:** 2026-11-15
- **Sprint:** Sprint 3
- **Owner:** P004 (M6)
- **Related UC / FR:** UC23 / FR-H13–H14 ("past semesters' decisions and picks are kept for a future Offering History page"); SDD Sprint 3 "Add an Offering History page for past semesters"
- **Branch / PR:** `feature/s3-offering-history`; merged into `main` on 2026-11-16 (merge commit eccb909); no PR
- **Reviewer:** Pending

## 1. Plan

Coordinators look back at past semesters: which subjects they approved or removed and how many students picked each.
Owner decisions (2026-11-15): coordinators only; read-only; reuse the existing coordinator APIs (no cross-semester
comparison). Spec `docs/superpowers/specs/2026-11-15-offering-history-design.md`. The SRS/SDD document is not updated.

## 2. Implementation

- `/coordinator/history` "Offering History", coordinator menu under Forecast planning after Class Offering Forecast;
  overview quick link added.
- `OfferingHistoryPage.tsx`: programme / learning centre / semester selectors limited to the coordinator's
  `assignedScopes` (none → the existing "not assigned" message); semesters = those the shared `selectionPhase` rule reports as
  CLOSED (opening and closing time set, closing time reached), newest first (`closedSemesters`). Table: subject, credits, Approved / Removed, picked-by count (`—` for
  removed, `0` when nobody picked) and "View students" (existing `SubjectPickersDialog`; picker lists kept in memory
  only; `History` is remounted per scope so each scope gets a fresh cache and a late response from an old scope
  cannot repopulate it). Loading, error with Try again, and both empty states.
- `offering-history.ts` helpers `closedSemesters`, `historyRows` (+ tests).
- Frontend only: reuses `context()`, `GET /api/coordinator/offering-decisions` (already accepts any semester, returns
  `editable:false` for past ones, enforces scope) and the pickers endpoint. No API, contract or database change.
- Tests: `tools/coordinator/test-ui.mjs` gained history checks and now honours `PLAYWRIGHT_CHANNEL`;
  `tools/admin/test-ui.mjs` coordinator quick-link count updated (4 → 5).

## 3. Review

- typecheck, lint, build, check:cloudflare pass; `npm test` 1652 passed (65 skipped).
- `PLAYWRIGHT_CHANNEL=chrome`: coordinator UI 54, integration UI 48, admin UI 50 — all passed.
- Review round 1: assigned-scope fallback removed (no unassigned combinations offered); count / "View students" spacing.
- Review round 2 (2026-11-16, code review of `main...feature/s3-offering-history`): history screenshots moved from a
  hard-coded local temp path to the suite's `.wrangler/coordinator-review/`; `closedSemesters` now uses the shared
  `selectionPhase` (boundary and no-opening-time cases agree with the server, new unit test); picker cache made
  per-scope by remounting `History`; new `history` sidebar icon so Offering History no longer shares Decision Audit's.
  Not taken: memoising the semester list, de-duplicating fixture semesters, a data-driven coordinator route table
  (refactor outside scope). After round 2: typecheck, lint, build, check:cloudflare pass; `npm test` 1653 passed
  (65 skipped); `PLAYWRIGHT_CHANNEL=chrome` coordinator UI 54, admin UI 50, integration UI 48 all passed.

Not verified: against live data (mocks only). Non-goals: comparison across semesters, admin access, the Decision
Audit placeholder, counts of picks withdrawn by removals.

## 4. Changelog

- 2026-11-15 - Type: Added. Coordinator Offering History page (`/coordinator/history`), read-only, frontend only. Code review fixes 2026-11-16. Merged to `main` 2026-11-16 (eccb909). Outstanding: human peer review.
