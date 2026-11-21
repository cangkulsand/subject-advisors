# Live Coordinator Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coordinator Forecast page calculates the forecast live from current database students on every load, with no snapshot step, and the coordinator menu no longer shows Data Imports.

**Architecture:** A new read-only API route `GET /api/coordinator/forecast-live` reuses the system-student selection (`repository.systemStudents` + `buildSystemSnapshot`) and the run engine (`runForecastEngine`), but builds the engine input in memory and stores nothing. A sibling route returns the students behind one subject (`subjectStudentOutcomes`). The web Forecast page swaps "snapshot → generateRun → getRun" for one live read; decisions, picks, audit and Offering History are untouched (`offering_decision` is keyed by scope, not snapshot).

**Tech Stack:** TypeScript (strict), Cloudflare Worker API, React + Vite, Vitest, Neon PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-21-live-forecast-design.md`

## Global Constraints

- Live data only, for database students. Nothing is written to the database when the page is read.
- The engine (`packages/shared/src/forecasting/engine/`) is not changed.
- Target semester = the next Normal semester, from the existing `resolveTarget(deps)` (S3-P004-031).
- Coordinator only, scope-checked with `deps.scopes.isScopeAssigned` (unassigned = `SCOPE_NOT_ASSIGNED`, like the other coordinator reads).
- Live responses are private and `no-store` (use `authJson`, as the existing coordinator reads do).
- Decisions from the live page send `importBatchId: null` (already accepted by `decisions-routes.ts:37`).
- Snapshot/CSV code, tables and routes stay in place; only the coordinator UI stops using them. CSV import stays hidden (S3-P004-020).
- Copy: page line "Live student data · calculated <time>"; empty state "No students in this programme and learning centre yet."
- Change record `docs/changes/S3-P004-032-live-forecast.md` with Plan / Implementation / Review / Changelog (`docs/implementationguide.md`). No AI co-author trailer in commits. Never stage `docs/System Documents/`.
- UI follows `docs/themeguide.md` 5.1 (readability guard) and the shared table toolbar.

## Review Focus

1. A scope with zero database students → `200` with `studentsInScope: 0` and `subjects: []`, not `SYSTEM_SNAPSHOT_EMPTY`; the page shows the empty-state copy. (Task 2 test.)
2. A subject decided earlier that is no longer in the live result (e.g. removed from the curriculum) still appears with its decision and "—" counts, exactly as `buildRows` does today for "not in snapshot". (Task 3 test.)
3. Students dialog numbers equal the table numbers for the same load (same engine input). (Task 2 test: summary.counted === subject.supportedEligibleCount.)
4. No target semester configured → existing `TARGET_SEMESTER_UNAVAILABLE` error, page shows the Panel error. (Task 2 test.)
5. Refresh after a student adds a record changes the count (no client cache across Refresh). (Task 3 test: Refresh calls `getLiveForecast` again.)

---

### Task 1: Shared live types and in-memory engine input

**Files:**
- Create: `packages/shared/src/forecasting/live.ts`
- Modify: `packages/shared/src/forecasting/index.ts` (export it)
- Create: `apps/api/src/modules/forecasting/live-input.ts`
- Modify: `apps/api/src/modules/forecasting/runs-repository.ts` (extract catalogue part of `engineInputs`)
- Modify: `apps/api/src/modules/forecasting/runs-contracts.ts` (add `catalogueInputs` to the repository interface)
- Test: `apps/api/src/modules/forecasting/live-input.test.ts`

**Interfaces:**
- Produces (shared `live.ts`):
  - `type LiveSubject = Pick<RunSubject, 'subjectId' | 'subjectCode' | 'subjectName' | 'creditHours' | 'classType' | 'excluded' | 'semesterTypeExcluded' | 'supportedEligibleCount' | 'uncertainStudentCount' | 'nearGraduationCount' | 'breakdown'>`
  - `interface LiveForecast { programmeId: number; learningCentreId: number; targetSemesterId: number; calculatedAt: string; studentsInScope: number; subjects: LiveSubject[] }`
  - `type LiveSubjectStudents = Omit<RunSubjectStudents, 'forecastRunId' | 'catalogueMatchesRun'>`
- Produces (API `live-input.ts`): `engineStudentsOf(built: BuiltSystemSnapshot): EngineStudent[]` — maps `built.students`/`built.records` to `EngineStudent` (records grouped by `externalReference`, fields as in `runs-repository.ts:82-92`).
- Produces (repository): `catalogueInputs(scope: ForecastScope, curriculumIds: number[]): Promise<Omit<EngineInputRows, 'snapshot'>>` — the curriculum/subject/link/rule/requirement/semester/capacity queries from `engineInputs`, filtered by `curriculum_id = ANY($n)` instead of the import-batch subquery. `engineInputs` calls it with the batch's distinct curriculum ids, so its behaviour is unchanged.

- [ ] **Step 1: Write the failing test** `engineStudentsOf groups records per student and keeps history completeness`: two students (`PORTAL-1` with 2 records COMPLETE, `PORTAL-2` with none UNKNOWN) → `[{ externalReference: 'PORTAL-1', records: [2 items], historyCompleteness: 'COMPLETE', cohortStatus: 'ACTIVE' }, { externalReference: 'PORTAL-2', records: [], historyCompleteness: 'UNKNOWN' }]`.
- [ ] **Step 2: Run** `npx vitest run --config vitest.auth.config.ts apps/api/src/modules/forecasting/live-input.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `live.ts`, `engineStudentsOf`, and the `catalogueInputs` extraction.
- [ ] **Step 4: Run** the new test plus `apps/api/src/modules/forecasting/repository.database.test.ts` and `runs-routes.test.ts` → PASS (engineInputs unchanged).
- [ ] **Step 5: Commit** `feat(coordinator): live forecast types and in-memory engine input (S3-P004-032)`.

### Task 2: Live API routes

**Files:**
- Create: `apps/api/src/modules/forecasting/live-routes.ts`
- Modify: `apps/api/src/modules/forecasting/routes.ts` (add to `known` and dispatch, beside `RUN_ROUTE`)
- Test: `apps/api/src/modules/forecasting/live-routes.test.ts` (follow the fake-deps pattern of `runs-routes.test.ts`)

**Interfaces:**
- Consumes: Task 1 `engineStudentsOf`, `catalogueInputs`, `LiveForecast`, `LiveSubjectStudents`; existing `resolveTarget`, `buildSystemSnapshot`, `runForecastEngine`, `subjectStudentOutcomes`, `withContacts` (export it from `runs-routes.ts`).
- Produces:
  - `LIVE_ROUTE = /^forecast-live(?:\/subjects\/([1-9]\d*)\/students)?$/`
  - `handleLiveRoute(route, request, url, deps, actor): Promise<Response | null>`
  - `GET /api/coordinator/forecast-live?programmeId=&learningCentreId=` → `{ data: LiveForecast }`
  - `GET /api/coordinator/forecast-live/subjects/{subjectId}/students?programmeId=&learningCentreId=` → `{ data: LiveSubjectStudents }`; unknown subject → `RUN_SUBJECT_NOT_FOUND`.
- Shared helper inside the file: `liveEngineRequest(deps, actor, programmeId, learningCentreId)` → `{ request: ForecastEngineInput, studentsInScope }` (requireScope → resolveTarget → catalogue → buildSystemSnapshot → catalogueInputs(scope, distinct curriculum ids) → `rejectedRowsByStudent: {}`). With zero students it returns an empty `snapshot.students` and the route returns `subjects: []` without calling `catalogueInputs`.

- [ ] **Step 1: Write the failing tests:**
  - `live forecast returns engine subjects for the assigned scope` — fake deps with 3 students, asserts `studentsInScope === 3`, a subject's `supportedEligibleCount` equals the engine's `supportedDemand`, and `deps.repository.storeImport` / `deps.runs.createRun` were **not** called.
  - `live forecast rejects an unassigned scope` → 403 `SCOPE_NOT_ASSIGNED`.
  - `live forecast with no students returns an empty list` → 200, `studentsInScope: 0`, `subjects: []`.
  - `live forecast without a target semester` → `TARGET_SEMESTER_UNAVAILABLE`.
  - `live students match the table count` → `summary.counted` equals that subject's `supportedEligibleCount` from the forecast route.
  - `live routes are GET only` → POST gives 405 with `Allow: GET`.
  - `live routes reject unknown query parameters` → 400.
- [ ] **Step 2: Run** `npx vitest run --config vitest.auth.config.ts apps/api/src/modules/forecasting/live-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement** `live-routes.ts` and the dispatch in `routes.ts`.
- [ ] **Step 4: Run** the file → PASS; then `npm run typecheck && npm run lint && npm test` → PASS.
- [ ] **Step 5: Commit** `feat(coordinator): live forecast and live subject students endpoints (S3-P004-032)`.

### Task 3: Forecast page uses the live forecast

**Files:**
- Modify: `apps/web/src/features/coordinator/client.ts` (add `getLiveForecast(scope, signal)`, `getLiveSubjectStudents(scope, subjectId, signal)`; keep the run/import methods)
- Modify: `apps/web/src/features/coordinator/ForecastsPage.tsx`
- Modify: `apps/web/src/features/coordinator/SubjectStudentsDialog.tsx`
- Modify: `apps/web/src/features/coordinator/coordinator-help.tsx` (replace the snapshot help with a "live data" line)
- Modify: `tools/coordinator/fixtures.mjs`, `tools/coordinator/test-ui.mjs`
- Test: `apps/web/src/features/coordinator/client.test.ts`, `tools/coordinator/test-ui.mjs`

**Interfaces:**
- Consumes: Task 2 routes and shared `LiveForecast`, `LiveSubject`, `LiveSubjectStudents`.
- Produces:
  - `buildRows(forecast: LiveForecast, decisions: OfferingDecision[]): SubjectRow[]` with `SubjectRow.run: LiveSubject | null` and `inSnapshot` renamed `inForecast`.
  - `SubjectStudentsDialog` props: `load: (signal: AbortSignal) => Promise<LiveSubjectStudents>` and `cacheKey: string` instead of `forecastRunId`; `Roster` takes `LiveSubjectStudents`.
  - `StudentListCache = Map<string, LiveSubjectStudents>`, cleared on Refresh and scope change.

Page behaviour:
- Remove the snapshot select, the "No student data snapshots yet / Go to Data Imports" block and the `?snapshot=` URL handling.
- `forecast = useRead(signal => client.getLiveForecast(scope, signal), 'live|' + scopeKey)`; Refresh reloads it.
- Under the phase line: "Live student data · calculated <when(calculatedAt)>".
- `studentsInScope === 0` → "No students in this programme and learning centre yet."
- `decide(...)` sends `importBatchId: null`.
- The audit table keeps its "Snapshot" column (old entries have ids; new ones show "—").

- [ ] **Step 1: Write the failing tests:**
  - `client.test.ts`: `getLiveForecast builds the scoped GET URL` → `/api/coordinator/forecast-live?programmeId=5&learningCentreId=1`.
  - `test-ui.mjs`: the Forecast page shows subjects with **no** "Student data snapshot" field and **no** "Go to Data Imports" link; it shows "Live student data"; Refresh triggers a second `forecast-live` request; approving a subject posts `importBatchId: null`; a decided subject missing from the live result shows "—"; zero students shows the empty-state copy; the readability guard passes.
- [ ] **Step 2: Run** `npx vitest run --config vitest.auth.config.ts apps/web/src/features/coordinator/client.test.ts` and `npm run test:ui:coordinator` → FAIL.
- [ ] **Step 3: Implement** the client methods, page and dialog changes, and fixture routes for `forecast-live`.
- [ ] **Step 4: Run** both again → PASS; `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(coordinator): Forecast page reads the live forecast, no snapshot step (S3-P004-032)`.

### Task 4: Remove Data Imports from the coordinator menu, docs and record

**Files:**
- Modify: `apps/web/src/features/coordinator/CoordinatorRoutes.tsx` (drop the "Academic data → Data Imports" menu group; `/coordinator/imports` redirects to `/coordinator/forecasts` with the same scope query)
- Modify: `apps/web/src/features/coordinator/coordinator-ui.tsx` or the Overview, wherever it links to Data Imports (grep `coordinator/imports`)
- Modify: `tools/coordinator/test-ui.mjs`, `tools/integration/test-ui.mjs` (menu assertions)
- Modify: `README.md` (P004 rows), `docs/database/data-contracts.md` (UC20 reads live data; snapshots kept for the hidden CSV path), `docs/requirements/` amendment note `srs-amendment-2026-11-21-live-forecast.md`
- Create: `docs/changes/S3-P004-032-live-forecast.md`

- [ ] **Step 1: Write the failing tests:** coordinator menu has no "Data Imports" link; visiting `/coordinator/imports?programmeId=5&learningCentreId=1` lands on `/coordinator/forecasts?programmeId=5&learningCentreId=1`; no page links to `/coordinator/imports`.
- [ ] **Step 2: Run** `npm run test:ui:coordinator` → FAIL.
- [ ] **Step 3: Implement** the menu change and redirect; write the docs and the change record (all four sections, real command results).
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run test:ui:coordinator && npm run test:ui:integration` → all PASS; record the counts in the change record.
- [ ] **Step 5: Commit** `feat(coordinator): Data Imports leaves the menu; docs for the live forecast (S3-P004-032)`.

### Task 5: Merge and deploy

- [ ] **Step 1:** Fresh whole-branch review; fix findings with new commits.
- [ ] **Step 2:** `git checkout main && git merge --ff-only feature/live-forecast`; push to `origin` (dev) and the prod remote.
- [ ] **Step 3:** Poll the prod bundle until it contains `Live student data` (backtick minification); then sign in as a SECJ/KL coordinator and confirm the Forecast page shows subjects with no snapshot step.
- [ ] **Step 4:** Update the change record status to "Merged to main and pushed to dev and prod (date)"; commit and push.
