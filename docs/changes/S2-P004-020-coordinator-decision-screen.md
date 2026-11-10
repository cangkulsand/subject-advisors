# S2-P004-020 — Coordinator screen: snapshot picker, decisions table, audit

- **Status:** MERGED to `main` (2026-11-11); human peer review pending
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 simplified offering flow, task 4 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md` (product owner answer 3: no semester picker)
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: the Class Offering Forecast page is a review workflow (draft, under review, finalized, a decision dialog with a reason per subject). The simplified flow needs one screen where the coordinator looks at the forecast of a chosen student data snapshot and sets each subject to Pending, Approved or Removed with one click.

Approach:
- Rewrite `ForecastsPage.tsx` on top of the offering decisions API (S2-P004-018 / 019). The semester is always `context.targetSemesterId` (the next semester): no semester select, no `semester` URL parameter, no "past semester" note. URL state is `programmeId`, `learningCentreId` and `snapshot` (import batch id; default the newest accepted snapshot). The old `run` parameter is no longer read.
- The forecast of the chosen snapshot is created on demand through the existing idempotent `POST forecast-runs`; the run id lives in page state, never in the URL.
- Table: Subject (name; code and class type under it) | Not taken yet | Eligible to take (with the existing View students popup) | Action (existing radio dropdown, no helper text: Pending / Approved / Removed). Sorted by eligible to take, highest first. One click applies the change: no dialog, no reason, a toast after every change.
- Removed subjects move to the existing side table with Add back (returns to Pending). Decisions carry across snapshots; decided subjects absent from the chosen snapshot are listed and marked "not in this snapshot".
- Shared table toolbar (tabs All / Pending / Approved, class type and uncertain filters, sort, search, clear). Info tips kept and rewritten for the new columns. Status line and the planning warning as pinned by the plan.

Out of scope (Task 5): live selection toasts with affected-student counts, the locked/closed behaviour beyond a read-only status pill, the Picked column and the pickers dialog. Old `DecisionsPage`, the old client methods and the old review/finalize fixtures stay until Task 8. Rollback: revert the page, client, help, CSS and fixture changes; the API is untouched.

## 2. Implementation

- **`apps/web/src/features/coordinator/ForecastsPage.tsx`** (rewritten): `ForecastsPage` (scope card) and `Forecast` (snapshot select, status line, subjects card, audit card, `ToastStack` via `useToastNotifications`). Kept `RadioMenu`; new `ActionMenu`, `RemovedSubjects`, `SubjectTable`, `AuditTable`. Rows merge `run.subjects` (not excluded, not semester-type excluded) with `set.decisions`; decided subjects missing from the run are appended with "—" counts. "Not taken yet" = `breakdown.inCurriculum - breakdown.alreadyPassed` ("—" without a breakdown). Writes: `client.decide` with the row's current status as `expectedStatus` and the chosen snapshot id; afterwards the set and the audit reload. Toasts: `X approved.`, `X removed.`, `X added back.` (and `X set back to pending.` for Approved to Pending). `DECISION_STALE` shows the warning toast "This subject was changed by someone else; reloaded." and reloads; `SEMESTER_READ_ONLY` / `SELECTION_CLOSED` show the server message and reload; other errors show an error toast. When the set is not editable the Action cell is a status pill and Add back is hidden.
- **Status line** (`role="status"`): "Selection not scheduled" / "Selection opens …" / "Selection open until …" / "Selection open" / "Selection closed …", then " · N subjects still pending". In PLANNING with pending subjects a second status shows "N subjects still pending; they won't be shown to students unless approved." (singular "1 subject still pending; it won't be shown…").
- **`client.ts`**: new `getDecisions`, `decide(DecideOfferingRequest)` (POST, `Idempotency-Key`, no `If-Match`, scope reduced to the three ids), `listDecisionAudit`; response guards `decisionSet` / `decideResult`. The old run-decision method `decide(forecastRunId, …)` is renamed `decideRun` (still used only by its unit test; removed with the old flow in Task 8). `client.test.ts` gains 4 tests (decode, missing `phase` / lists rejected, exact body and headers, `DECISION_STALE` and audit paging) and uses `decideRun`.
- **`coordinator-help.tsx`**: new `snapshot`, `notTakenYet`, `eligible`, `action` texts (as pinned by the plan); `counted` / `uncertain` reworded from "potential demand" to "eligible"; unused old keys (`subjects`, `demand`, `belowMinimum`, `quality`, `awaiting`) removed. `SubjectStudentsDialog.tsx`: the fact label "Potential demand (counted)" is now "Eligible to take (counted)".
- **`coordinator.css`**: right-aligned count columns for `.coordinator-decisions`, `.coordinator-phase`, `.coordinator-snapshot-field`, muted pill spacing. **`CoordinatorRoutes.tsx`**: page description "Look at the forecast for a student data snapshot and decide which subjects are offered." **`ImportsPage.tsx`**: after "Generate forecast" the page opens the new screen with `snapshot=<id>` instead of `run=<id>` (the Generate button itself stays until Task 8).
- **`tools/coordinator/fixtures.mjs`**: state options `phase` (`planning` / `open` / `closed`), `scheduled`, `secondImport`, `staleDecision`; `decisions`, `decisionAudit`, `picks`; seed `decided` (decisions 101 approved, 102 removed, 107 "SECJ2203 Software Engineering" approved but not in the run); routes `offering-decisions` GET / POST (409 `DECISION_STALE`, `SELECTION_CLOSED`, `SEMESTER_READ_ONLY`, 422 `SUBJECT_EXCLUDED`), `/audit`, `/{id}/pickers`; `forecast-context` returns `semesters`; run subjects carry a `breakdown`.
- **`tools/coordinator/test-ui.mjs`**: removed the old run-detail checks that no longer apply (forecast list and detail, paging and finalize jump, search/sort with finalize, start review, finalize, finalized read-only, 412 reload, run audit paging) and the finalize steps of the mobile check; added 12 checks for the new screen (newest snapshot pre-selected and sorted, one-click actions with toast / audit / no dialog, Add back, status line and pending warning, scheduled / open / closed phases, carry-over and "not in this snapshot", toolbar tabs and filters and sort and search, `DECISION_STALE`, failed save, no-snapshot state); adapted the imports checks that opened the old run page, the info tip check, the View students checks, the service-error check, the 320 / 375 mobile overflow check (now with the action menu). `assertReadable` runs in every check.
- **Screenshots** (`.wrangler/coordinator-review/`): `forecast-decisions-desktop.png`, `forecast-decisions-removed-desktop.png`, `forecast-decisions-carry-over-desktop.png`, `forecast-decisions-menu-open-desktop.png`, `forecast-mobile.png` (375 px, full page), `forecast-system-desktop.png`, `forecast-combined-desktop.png`, `forecast-info-tip-desktop.png`.
- **Deviations from the plan:** (1) the plan names the sort option "Eligible to take"; sort labels are "Eligible to take", "Subject name", "Subject code" (the longer "(high to low)" text made the toolbar overflow by 1 px at 320 px). (2) The old run-decision client method was renamed to `decideRun` so the new `decide` can use the plan's name. (3) `DecisionsPage` still links to `forecasts?run=2` in its "newer forecast" note; the parameter is now ignored, so the link opens the new screen. It disappears with the page in Task 8.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1421 tests passed, 63 skipped (database suites skip without credentials)
- `node tools/coordinator/test-ui.mjs`: 55 coordinator browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed
- `node tools/admin/test-ui.mjs`: 45 administration browser checks passed

Not verified: the screen against the real API and database (the browser checks use the mocked fixtures that mirror the Task 2 / 3 contract; migration 0009 is not applied). The live toast for removing a subject that students already picked ("withdrawn, N students will see a note") is Task 5.

## 4. Changelog

- 2026-11-10 - Type: Changed. Class Offering Forecast is now one decisions screen: pick a student data snapshot, see "Not taken yet" and "Eligible to take" per subject, and set each subject to Pending, Approved or Removed with one click (toast, audit history, no dialog, no reason); removed subjects can be added back; decisions carry across snapshots. The review, finalize and "Potential demand" wording is gone from this screen. Compatibility: the `run` URL parameter of `/coordinator/forecasts` is no longer read; the old Offering Decisions page and its API are unchanged until Task 8. Outstanding: Task 5 (open/closed behaviour, Picked column, pickers dialog). Status: MERGED.
