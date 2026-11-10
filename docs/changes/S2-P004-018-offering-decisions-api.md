# S2-P004-018 — Offering decisions API

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 / UC23 simplified offering flow, task 2 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: the coordinator decides each subject once per programme + learning centre + semester as Pending / Approved / Removed. The server needs endpoints to read and change those decisions, an audit of every change, and the rules that lock decisions to the next semester and to the admin-set selection window.

Approach:
- Shared contract `packages/shared/src/forecasting/offering-decisions.ts`; `SemesterOption` gains the optional selection window; `ForecastContext` gains `semesters`.
- New coordinator routes in `apps/api/src/modules/forecasting/` on the Task 1 tables: `GET offering-decisions`, `POST offering-decisions`, `GET offering-decisions/audit`.
- `semester-window.ts` resolves the semester live (current semester, admin dates, server clock) for phase and "is the next semester".
- Stale-change protection through `expectedStatus` with a transaction-level advisory lock and a guard statement; no row exists to lock while a subject is Pending.
- Product owner answer 3: no semester picker; the API rejects decisions for any semester other than the next one (`SEMESTER_READ_ONLY`).

Acceptance (plan Review Focus 2): a decision for a semester that is not the next one, or after selection closed, returns 409 and writes no audit row. A stale `expectedStatus` returns 409 and writes nothing. Existing suites keep passing.

Out of scope: pick counts, pickers and withdrawal of picks (Task 3; `pickCounts` is `[]` and `affectedPicks` is 0), all coordinator and student UI (Tasks 4-8). Migration 0009 is not changed and not applied. Rollback: remove the routes and wiring; the data tables are untouched by this task.

## 2. Implementation

- **Shared:** `offering-decisions.ts` (status list, `OfferingDecision`, `OfferingDecisionSet`, `DecideOfferingRequest`, `DecideOfferingResult`, `OfferingDecisionAuditEntry`), exported from the forecasting index. `contracts.ts`: `SemesterOption.selectionOpensAt/selectionClosesAt` (optional), `ForecastContext.semesters` (optional). Migration 0009 and `selection-window.ts` from Task 1 are unchanged.
- **API contracts and routes:** `decisions-contracts.ts` (`OfferingDecisionsRepository`: `get`, `decide`, `listAudit`, `pickCounts`), `decisions-routes.ts` (`DECISION_ROUTE`, `handleDecisionRoute`), `semester-window.ts` (`resolveSemesterWindow`), `routes.ts` (dispatch and `forecast-context` now returns `semesters`), `contracts.ts` (`ForecastingDependencies.decisions`), `index.ts` (wiring).
- **Endpoints (COORDINATOR only, scope checked with `isScopeAssigned` on every call, `Cache-Control: no-store`):**
  - `GET /api/coordinator/offering-decisions?programmeId&learningCentreId&targetSemesterId` returns `{ data: OfferingDecisionSet }`: `scope`, `semester` (with window), `phase`, `asOf`, `editable` (next semester and phase not CLOSED), `decisions` (stored rows only; no entry is Pending), `pickCounts` (`[]`).
  - `POST /api/coordinator/offering-decisions` body `{ scope, subjectId, status, expectedStatus, importBatchId }` (exactly these keys, `importBatchId` may be null; optional `Idempotency-Key` length-checked) returns `{ data: { subjectId, beforeStatus, afterStatus, affectedPicks, phase } }`. `status === expectedStatus` is a 200 no-op with no write and no audit.
  - `GET /api/coordinator/offering-decisions/audit?...&limit&cursor` returns `{ data: { items, nextCursor? } }`, newest first, keyset by `auditId`.
  - Errors: 400 invalid body or query; 403 `SCOPE_NOT_ASSIGNED`; 404 `SCOPE_NOT_FOUND` (unknown semester or programme), 404 `IMPORT_NOT_FOUND` (`importBatchId` not an ACCEPTED batch of the scope); 409 `SEMESTER_READ_ONLY`, `SELECTION_CLOSED`, `DECISION_STALE`, `DECISION_CONFLICT`; 422 `DECISION_SUBJECT_NOT_FOUND` (subject not in the programme catalogue), `SUBJECT_EXCLUDED` (`includeInOfferingForecast` false); 500 `DECISION_FAILED`.
- **Gating (decide):** after the scope check the semester is read live; `isNext` compares with `nextSemesterAfter(current)`; not next gives `SEMESTER_READ_ONLY`; phase `CLOSED` (`selectionPhase` with the server clock) gives `SELECTION_CLOSED`. GET never errors on these; it reports `editable: false`.
- **Stale protection (SQL):** one non-interactive transaction: advisory lock on `programme:centre:semester:subject`; a guard statement that casts `'GUARD_DECISION_STALE'` to integer when the stored status (default PENDING) differs from `expectedStatus` (mapped from 22P02 to `DECISION_STALE`); upsert into `offering_decision` for APPROVED/REMOVED or delete for PENDING; insert of the immutable `offering_decision_audit` row (before, after, snapshot, actor, `affected_picks` 0). The actor is the verified Clerk user, never a request value.
- **Errors:** `errors.ts` adds `SEMESTER_READ_ONLY`, `SELECTION_CLOSED`, `DECISION_STALE`, `DECISION_CONFLICT`, `DECISION_FAILED`, `DECISION_GUARD_STALE` and a `decision` mapping context.
- **Repository:** `decisions-repository.ts` (SQL), `decisions-testing.ts` (in-memory test double), `repository.ts` `semesters()` now selects the two selection columns as UTC ISO text.
- **Tests:** `decisions-routes.test.ts` (new, 14 tests: empty GET, approve plus audit and no-op, stale, add back, unknown subject, excluded subject (approve rejected, earlier approval removable), snapshot check, malformed bodies, past semester read-only, closed locks, open stays editable, audit paging, unassigned 403, role and method), `routes.test.ts` (semesters in `forecast-context`), `repository.database.test.ts` (PostgreSQL block; skips without `FORECASTING_TEST_DATABASE_URL`); existing fixtures gained `decisions`.
- **OpenAPI:** `docs/api/forecasting-uc20.openapi.json` adds the three paths, the decision schemas, responses and an "Offering decisions" tag; `SemesterOption` and `ForecastContext` gain the new properties.
- **Deviations from the plan:** none of substance. `pickCounts` and `affectedPicks` are the planned stubs. Old confirmation and run routes are untouched (removed in Task 8).

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1408 tests passed, 62 skipped (database suites skip without credentials)
- `node tools/coordinator/test-ui.mjs`: 52 coordinator browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed
- `npm run test:db-tooling`: 23 tests, 23 pass, 0 fail

Not verified: the SQL repository and the new PostgreSQL test block were not run against a database (no credentials used; migration 0009 is not applied). The statements follow the pattern of the confirmation repository but should be exercised with `FORECASTING_TEST_DATABASE_URL` after applying 0009.

## 4. Changelog

- 2026-11-10 - Type: Added. Coordinator offering decisions API (`offering-decisions` read, decide and audit) with stale-change protection and next-semester and selection-window gating; `forecast-context` lists every semester with its selection window. Compatibility: additive; old confirmation and run routes unchanged; `ForecastingDependencies` gains `decisions`. Outstanding: apply migration 0009 and run the database test; pick counts and withdrawal arrive in Task 3. Status: READY_FOR_REVIEW.
- 2026-11-10 - Type: Fixed. Every decision failed with `DECISION_STALE` against the real database. The stale guard cast the sentinel string alone (`'GUARD_DECISION_STALE'::integer`); PostgreSQL folds such a constant at plan time, so the cast failed before the `CASE` compared statuses. The cast input now includes the current status (`'GUARD_DECISION_STALE:' || status`), as the run guard does. Found in manual testing on the dev database; mock-based tests could not catch it.
