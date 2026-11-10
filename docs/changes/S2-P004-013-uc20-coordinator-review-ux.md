# S2-P004-013 — UC20 coordinator review screens: subjects table, action menu, add back and student list

- **Status:** MERGED to `main` (2026-11-04); human peer review pending
- **Date:** 2026-11-04
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 forecast review; builds on [S2-P004-007](S2-P004-007-uc20-forecast-and-confirmation-build.md) (history kept as is) and the toolbar of [S2-INT-004](S2-INT-004-shared-table-toolbar.md).
- **Branch / PR:** `feature/p004-s2-uc20-review-ux` (from `main` 7b4b9af); no PR
- **Reviewer:** Coordinator review
- **Superseded by S2-P004-017 to S2-P004-024 (2026-11-10):** the Offering Decisions page, forecast versions and review lifecycle UI described here were replaced by the single Class Offering Forecast decisions screen. See [S2-P004-024](S2-P004-024-remove-review-confirm-flow.md). History below is kept as written.

## 1. Plan

User requests during coordinator UI review (2026-11-03 to 2026-11-04):

- Student data snapshots and Forecasts list use the shared table toolbar; forecast header shows meta chips; status changes through a dropdown.
- Subjects table: class type under the subject name, no Uncertain / Near graduation / Proposed sections columns, action column; "Defer" is shown as "Remove"; removed subjects sit in a side table with **Add back**.
- An added-back subject returns as **Pending** (not Reviewed) and needs a new decision.
- Class splitting is not done in this system: remove Change classes; the coordinator works from potential demand.
- The subject action uses the same radio dropdown as the status menu, without helper text.
- The Quality column opens a **view-only** student list so the coordinator can see who is counted, uncertain, near graduation or not counted.

## 2. Implementation

- **Decision API:** new action `REOPEN` (`RUN_DECISION_ACTIONS` in `packages/shared/src/forecasting/runs.ts`) sets the subject's sections to `PENDING` and clears `reviewed_by` / `reviewed_at` (`runs-decisions.ts`, `runs-repository.ts`, `runs-testing.ts`). The audit constraint already allowed `REOPEN`, so no migration. `REPLACE_ALLOCATION` stays in the API but the UI no longer offers it.
- **Student list API:** `GET /api/forecast-runs/{id}/subjects/{subjectId}/students` (`runs-routes.ts`). It rebuilds per-student outcomes from the run's frozen import snapshot and stored target semester with `subjectStudentOutcomes` (`packages/shared/src/forecasting/engine/subject-students.ts`), which reuses the engine's own evaluation, so tallies equal the forecast counts. Returns `catalogueMatchesRun: false` when the curriculum changed since the run was generated. New error `RUN_SUBJECT_NOT_FOUND` (404). Same access rules as run detail.
- **Web (`apps/web/src/features/coordinator/`):**
  - `ForecastsPage.tsx`: generic `RadioMenu` (fixed popover, repositions on scroll/resize, opens upwards near the bottom) used by `StatusMenu` and the new per-subject `ActionMenu` (Approved / Reviewed / Removed, each confirmed with a reason). Proposed sections column, section sort, Change classes dialog and the row icon buttons removed; capacity flags shown under the demand. Add back sends `REOPEN`. Page description text removed.
  - `SubjectStudentsDialog.tsx` (new): totals, uncertainty reason counts, All / Counted / Uncertain / Near graduation / Not counted tabs, search by matric or name, 20 per page, curriculum-changed note. `ReadOnlyDialog` added to `coordinator-ui.tsx`; `getSubjectStudents` in `client.ts`.
  - `ImportsPage.tsx`: snapshots list on the shared toolbar.
  - `coordinator.css`: side table no longer scrolls sideways (22rem column), action button and student dialog styles.
- **Docs:** `docs/api/forecasting-uc20.openapi.json` (REOPEN, new path), `docs/themeguide.md` toolbar adoption list.
- **Tests:** API route tests for REOPEN and the student list (4), engine tests for `subjectStudentOutcomes` (3, including tallies equal the engine), `tools/coordinator/test-ui.mjs` (action menu, add back to Pending, student dialog filters/search/Escape/error and 320/375px), mock in `tools/coordinator/fixtures.mjs`.

## 3. Review

Coordinator reviewed the diff (the student list was executed by a delegated agent and reviewed before acceptance).

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm test` — 67 files, 1374 tests passed
- `node tools/coordinator/test-ui.mjs` — PASS 50 coordinator browser checks; screenshots opened (action menu, student dialog desktop)
- `node tools/integration/test-ui.mjs --installed` — 35 passed

Not verified: the REOPEN SQL and the student list against a real database (DB tests skip without `FORECASTING_TEST_DATABASE_URL`). Human peer review pending.

## 4. Changelog

- 2026-11-04 — Type: Added/Changed/Removed. Added the `REOPEN` decision (Add back returns a subject to Pending), the view-only subject student list endpoint and dialog, and the subject action dropdown; removed Change classes, the Proposed sections column and per-row icon buttons from the coordinator UI; snapshots and forecasts lists use the shared toolbar. Compatibility: additive API (new enum value and route); no migration or environment change. Outstanding: real-database test of REOPEN and the student list; "Below optimal" flag and forecast-list section counts still follow the system's class split (open question to the product owner). Status: MERGED.
