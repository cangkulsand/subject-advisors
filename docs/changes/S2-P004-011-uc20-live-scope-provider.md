# S2-P004-011 — UC20 forecasting uses live, DB-backed coordinator scopes

- **Status:** MERGED to `main` (2026-11-02)
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20; follows [S2-P004-007](S2-P004-007-uc20-forecast-and-confirmation-build.md) (interim scope) and [S2-P004-008](S2-P004-008-admin-academic-setup.md) (admin academic setup, migration 0008).
- **Branch / PR:** `feature/p004-s2-uc20-live-scope` (from `main` e5265ab); no PR
- **Reviewer:** Coordinator review
- **Approval:** user approved 2026-11-02.

## 1. Plan

### Objective

Replace the temporary hardcoded `ScopeProvider` (`apps/api/src/config/interim-scope.ts`) with a provider backed by the migration 0008 tables, now that Package A is merged and applied on Neon development.

### Rules

1. Coordinator scopes come from live `coordinator_assignment` rows (unended; active programme, faculty and centre; ACTIVE account with the COORDINATOR role) through the existing `AcademicScopeReader`. No SQL is duplicated. Every `isScopeAssigned` check on every read and mutation stays; there is no cache of any kind, so a revocation applies on the next request.
2. Programmes and centres listed are only those in the caller's live assignments (active centres), with names and codes from the database.
3. Current semester = `academic_semester.is_current`; target = the next semester (unchanged logic). When none is marked, the context reports `currentSemesterId`/`targetSemesterId` null and no target semesters, nothing crashes, scoped mutations return the existing `409 TARGET_SEMESTER_UNAVAILABLE`.
4. `studentLearningCentreId` stays the interim default (KL, id 1) behind the provider until Package B (migration 0009); marked TODO. No columns added.
5. `importAliases` keep the current constants, moved to `apps/api/src/config/import-aliases.ts`.
6. SYSTEM_ADMIN-only accounts still get no coordinator access (routes require COORDINATOR); role rules unchanged.

### Design

- `ScopeProvider` moves to `forecasting/scope-provider.ts`. `listScopes` now takes the Clerk user id and returns only that user's live scopes (the old per-scope `isScopeAssigned` filtering in `routes.ts` is gone).
- `createDbScopeProvider(source)` composes `AcademicScopeReader` (assignments, current semester, active centres) with `listProgrammeFaculties()` for programme codes and names. It is built in `createForecastingHandler` from the same Neon `query`/`transaction` primitives via `createAcademicSetupRepository`. The interim provider is deleted; tests use `scope-provider.test-support.ts`.
- UI: the shared `ScopeFields` (Data Imports, Class Offering Forecast, Offering Decisions) shows the two empty states.

## 2. Implementation

- **API:** new `apps/api/src/modules/forecasting/scope-provider.ts`, `scope-provider.test-support.ts` (test fake, `assignedTo(...)` helper), `apps/api/src/config/import-aliases.ts`; changed `forecasting/index.ts`, `contracts.ts`, `routes.ts` (`forecastContext` and `formatContext` use `listScopes(actor)`); deleted `config/interim-scope.ts` and its test.
- **Web:** `apps/web/src/features/coordinator/coordinator-ui.tsx` notices: "You are not assigned to any programme and learning centre yet. Ask a system administrator to assign you in Coordinator Assignments." and "No current semester is set. Ask a system administrator to set it in Academic Semesters." (the old "No target semester is configured yet" message stays when a current semester exists but no next one).
- **Tools:** `tools/coordinator/fixtures.mjs` (`noAssignments`, `noCurrentSemester` state flags), `tools/coordinator/test-ui.mjs` (6 new checks, 6 screenshots).
- **Docs:** `docs/api/forecasting-uc20.openapi.json` (forecast-context description), `docs/sprint/02/p004/package-1-contracts.md` (alias config name), `docs/sprint/02/handoff-academic-setup-and-profile.md`. Earlier change records keep their historical mentions of `interim-scope.ts`.
- **Error codes:** no new code; `TARGET_SEMESTER_UNAVAILABLE` (409) already existed (it was not listed in the OpenAPI before either).
- **Operational prerequisite:** before deploying, an administrator must mark the current semester (Academic Semesters) and create coordinator assignments (Coordinator Assignments). Otherwise every coordinator sees the empty state.

## 3. Review

- **Tests added:** `scope-provider.test.ts` (mapping from fake reader rows, empty assignment reads nothing else, inactive centre or unknown programme dropped, no caching of assignment/semester, interim student centre and aliases); `routes.test.ts` (no-assignment context and 403 for a programme, listing for the verified actor only, revocation applies at once to context, upload, list; existing no-current-semester and denied-scope tests kept); the existing offering, run, system and combined snapshot tests still assert the 403 path.
- **Results (local):** `npm run typecheck` pass; `npm run lint` pass (0 warnings); `npm test` 1333 passed / 59 skipped (67 files passed, 5 skipped); `npm run test:integration` 9/9; `npm run test:ui:coordinator` 47 checks pass; `npm run test:ui:admin` 44 checks pass; `node tools/integration/test-ui.mjs --installed` 35 pass; `npm run build:cloudflare` built (public test key via env only).
- **Screenshots (viewed):** `.wrangler/coordinator-review/imports-no-assignments-desktop.png`, `forecasts-no-assignments-desktop.png` (warning banner with the assignment message, empty programme select, disabled centre select, no actions; target semester still shown), `decisions-no-current-semester-desktop.png` (banner with the semester message, target "Not configured"). The other three (`decisions-no-assignments`, `imports-no-current-semester`, `forecasts-no-current-semester`) are produced by the same component and asserted by the checks.
- **Skipped:** real-database provider test. The embedded PostgreSQL binary used by `tools/admin/test-academic-database.mjs` is not installed here, and no Neon access was used. Live SQL behaviour is covered by the existing `academic-repository.database.test.ts` (gated).
- **Known limitation:** the provider fetches all programmes (`listProgrammeFaculties`) to resolve names; small table, acceptable until a per-id lookup is needed.

## 4. Changelog

- **Changed.** UC20 coordinator scopes, current semester and learning centres are read live from the administrator's academic setup (coordinator assignments, current semester, active centres). A coordinator only sees and acts on assigned programme x centre scopes; revocations apply on the next request.
- **Added.** Empty states for a coordinator without assignments and for no current semester on Data Imports, Class Offering Forecast and Offering Decisions.
- **Removed.** `apps/api/src/config/interim-scope.ts`; import aliases now live in `apps/api/src/config/import-aliases.ts`.
- **Unchanged.** Student learning centre defaults to KL until Package B (migration 0009).

- 2026-11-02 — Coordinator review: verified diff and SQL scope conditions; hid the leftover "Choose a scope" prompt when the coordinator has no assignments (Data Imports, Class Offering Forecast, Offering Decisions) with a UI assertion. Dev admin setup confirmed read-only before merge: current semester 2026/2027 S1, faculty FC with SECJ and SECRH, live assignments SECJ-KL and SECRH-KL. Rechecked: typecheck, lint, 1333 unit tests, integration 9/9, coordinator UI 47, admin UI 44, integration UI 35, build PASS. Merged to `main`. Status: MERGED.
