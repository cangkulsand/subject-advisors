# S3-P004-032 — Live coordinator forecast (no snapshot step)

- **Status:** Merged to main and pushed to dev and prod (2026-11-21); prod bundle verified; signed-in coordinator check and human peer review pending
- **Date:** 2026-11-21
- **Sprint:** Sprint 3
- **Owner:** P004 (M6 coordinator forecast)
- **Related UC / FR:** UC20 class offering forecast, UC23 offering decisions; SRS amendment [srs-amendment-2026-11-21-live-forecast.md](../requirements/srs-amendment-2026-11-21-live-forecast.md)
- **Branch / PR:** `feature/live-forecast`; no PR
- **Reviewer:** Pending
- **Design / plan:** [design](../superpowers/specs/2026-11-21-live-forecast-design.md), [plan](../superpowers/plans/2026-11-21-live-forecast.md)

## 1. Plan

The lecturer said the forecast does not need a snapshot step. The owner chose a live forecast: when a coordinator opens Class Offering Forecast, it is calculated from the students in the system at that moment. Nothing is stored. The CSV import keeps its snapshot design and stays hidden (S3-P004-020).

- **In scope:** a live read endpoint; the students dialog from the same calculation; the Forecast page without the snapshot field; Data Imports out of the coordinator menu.
- **Out of scope:** the engine rules, the student Semester offerings page, decisions, picks, the selection window and Offering History (all unchanged). No table or migration is removed.
- **Accepted trade-off:** the exact numbers behind a decision are no longer saved with it.

## 2. Implementation

- **Shared:** `packages/shared/src/forecasting/live.ts` adds `LiveForecast`, `LiveSubject` and `LiveSubjectStudents` (subsets of the run shapes).
- **API:**
  - `live-input.ts`: `engineStudentsOf` turns the system-snapshot selection into engine students in memory.
  - `runs-repository.ts`: the catalogue part of `engineInputs` is now `catalogueInputs(scope, curriculumIds)`, shared by stored and live forecasts. The SQL filters by `curriculum_id = ANY($n)` instead of the import-batch subquery; `engineInputs` is otherwise unchanged.
  - `live-routes.ts`: `GET /api/coordinator/forecast-live?programmeId&learningCentreId` and `GET /api/coordinator/forecast-live/subjects/{subjectId}/students?…`. Coordinator only, scope-checked, next Normal semester (S3-P004-031), `no-store`. A scope with no students returns `studentsInScope: 0` and no subjects.
- **Web:**
  - `client.ts`: `getLiveForecast`, `getLiveSubjectStudents`.
  - `ForecastsPage.tsx`: no snapshot field, no "Go to Data Imports" step, no `?snapshot=` handling. Shows "Live student data · calculated <time>"; Refresh recalculates; decisions send `importBatchId: null`. A decided subject missing from the live forecast is marked "not in the forecast". The audit table keeps its Snapshot column (older entries keep their number).
  - `SubjectStudentsDialog.tsx`: takes a loader; the "recomputed with the current curriculum" note is gone (a live list always uses the current curriculum).
  - `CoordinatorRoutes.tsx`: Data Imports left the menu (and so the Overview quick links). `/coordinator/imports` still opens by URL.
- **Tests:** `live-input.test.ts`, `live-routes.test.ts` (8), `client.test.ts` (+2); `tools/coordinator` fixture serves `forecast-live`; UI tests updated for the live page, the empty scope, Refresh and the menu; admin and integration menu checks updated.
- **Docs:** README row, `docs/database/data-contracts.md` note, SRS amendment.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | PASS |
| `npm test` | 1918 passed, 67 skipped |
| `npm run test:ui:coordinator` | 64 PASS (the updated and new checks failed before each change) |
| `npm run test:ui:admin` | 58 PASS |
| `npm run test:ui:integration` | 75 PASS (mocked) |
| Read-only Neon check | `catalogueInputs` returns the same curricula as `engineInputs` for snapshot 2 (SECJ, KL) |

- **Whole-branch review (fresh reviewer, 2026-11-21):** no Critical. One Important fixed: the students dialog is a second live read, so its count could differ from the table if a record changed in between; the dialog now says "Student data changed since this page was calculated. Refresh the page to update the numbers." (UI test RED then GREEN). Minor findings then fixed at the owner's request: (1) no next Normal semester shows "No next Normal semester is configured yet…" and no misleading scope prompt (Forecast and Data Imports); (2) if the server's target semester differs from the page's, the page asks for a reload and hides the decisions; (3) the live read skips the snapshot fingerprint and reads the catalogue once (`catalogueInputs`), about 15 subrequests; (4) Overview and separation-note copy, a stale comment and `docs/cloudflare-deployment.md`; (5) no students but earlier decisions shows the note above the decided subjects.
- **Outcome:** PASS — SELF-REVIEW plus fresh-reviewer pass; human peer review pending.

## 4. Changelog

- **Type:** Changed.
- The Class Offering Forecast now shows live student data: it is calculated from the students in the system each time the page opens or Refresh is pressed, with no snapshot step. Data Imports is no longer in the coordinator menu.
- **Compatibility:** no migration. Existing snapshots, runs and audit rows stay. The run and import endpoints are unchanged and still used by the (URL-only) Data Imports page.
- **Outstanding:** a signed-in coordinator check on prod; apply the SRS amendment to the .docx and update the UC20/UC23 diagrams.
