# S3-P004-032 — Live coordinator forecast (no snapshot step)

- **Status:** READY_FOR_REVIEW on `feature/live-forecast` (2026-11-21); not merged or deployed (owner: "dont deploy yet")
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
| `npm test` | 1917 passed, 67 skipped |
| `npm run test:ui:coordinator` | 59 PASS (the updated checks failed on the old page first) |
| `npm run test:ui:admin` | 58 PASS |
| `npm run test:ui:integration` | 75 PASS (mocked) |
| Read-only Neon check | `catalogueInputs` returns the same curricula as `engineInputs` for snapshot 2 (SECJ, KL) |

- **Outcome:** PASS — SELF-REVIEW; whole-branch review and human peer review pending.

## 4. Changelog

- **Type:** Changed.
- The Class Offering Forecast now shows live student data: it is calculated from the students in the system each time the page opens or Refresh is pressed, with no snapshot step. Data Imports is no longer in the coordinator menu.
- **Compatibility:** no migration. Existing snapshots, runs and audit rows stay. The run and import endpoints are unchanged and still used by the (URL-only) Data Imports page.
- **Outstanding:** whole-branch review; merge and deploy when the owner says so; apply the SRS amendment to the .docx and update the UC20/UC23 diagrams.
