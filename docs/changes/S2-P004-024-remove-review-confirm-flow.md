# S2-P004-024 — Remove the review, finalize and confirm flow; refresh documentation

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4 (touches P002 shared helper comments and docs, and one help text on the P001 profile page)
- **Related UC / FR:** UC20 simplified offering flow, task 8 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`; design section 6 ("What goes away"); closes the series S2-P004-017 to S2-P004-024
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: the new Class Offering Forecast screen (S2-P004-020/021), the decisions API (S2-P004-018/019), the student offerings page (S2-P004-022) and the profile learning centre (S2-P004-023) replace the old forecast lifecycle. The old pieces were still in the tree and in the navigation: the Offering Decisions page, forecast versions and comparison placeholders, the review / decide / finalize and confirmation APIs, their repositories and tests, and documents that describe the pick deadline and confirmed offerings.

Decisions (product owner, 2026-11-10): the "Decision Audit" navigation placeholder stays, because it becomes the read-only Offering History page next sprint. Nothing here deletes or overwrites past-semester decisions, audit rows, picks or withdrawals. The 0007 tables (`offering_confirmation`, `confirmed_offering` and their audit tables) stay in the database, unused.

Approach: delete code only where nothing imports it any more (checked with the type checker and a search for every exported name); keep what other modules still use (`CoordinatorAssignment`, `isScopeAssigned`, `nextSemesterAfter`, `CONFIRMED_OFFERING_LABEL`, `CONFIRMED_OFFERING_NOTICE`); keep the response shape of the run detail so the page and fixtures stay valid. No database change, no migration, nothing committed. Rollback: revert the files below.

## 2. Implementation

- **Web (`apps/web`)**
  - Deleted `features/coordinator/DecisionsPage.tsx` (and with it the "newer forecast" link).
  - `CoordinatorRoutes.tsx`: navigation is now Workspace (Overview) / Academic data (Data Imports, Data Quality) / Forecast planning (Class Offering Forecast only) / Audit (Decision Audit placeholder, kept). Removed the versions, comparison and decisions entries and pages; the Overview quick links follow (Data Imports and Class Offering Forecast open, Data Quality and Decision Audit are planned). The old routes now show "Page not found".
  - `admin/staff-navigation.tsx`: dropped the `versions`, `compare` and `decisions` icons (no longer referenced).
  - `coordinator/client.ts` (+ `client.test.ts`): removed `listRuns`, `listAudit`, `startReview`, `decideRun`, `finalize`, `getConfirmation`, `listConfirmationAudit`, `pickCounts`, `confirmOfferings`, `withdrawOfferings`, `setPickDeadline` and their decoders and types; their tests are gone, and three tests that used them now use `generateRun`, `getImport` and `listImports`. `generateRun`, `getRun`, `getSubjectStudents`, `getDecisions`, `decide`, `listDecisionAudit` and `getPickers` stay.
  - `coordinator.css`: removed the classes only the deleted page used (pick tools, picker/offerings tables, confirm bar, deadline field, run select, newer-forecast notice, assumption note, head actions, config issue, danger action, row-disabled). The zebra row rule is kept without its `row-disabled` condition.
  - `ImportsPage.tsx`: the "Generate forecast" buttons stay (they create the forecast and open the Class Offering Forecast on that snapshot, `?snapshot=<id>`); only the dialog text, which still promised a draft to "review and finalize", was reworded.
  - `profile/ProfilePage.tsx`: the current-semester help text is now "Your current semester. Offerings always show the next semester." The field itself is unchanged.
- **API (`apps/api/src/modules/forecasting`)**
  - Deleted `runs-decisions.ts`, `offerings-routes.ts`, `offerings-repository.ts`, `offerings-contracts.ts`, `offerings-testing.ts`, `offerings-routes.test.ts`.
  - `runs-routes.ts`: only `POST forecast-runs`, `GET forecast-runs/{id}` and `GET forecast-runs/{id}/subjects/{subjectId}/students` remain; `RUN_ROUTE` is `/^forecast-runs(?:\/([1-9]\d*)(?:\/subjects\/([1-9]\d*)\/students)?)?$/`. The audit, reviews, decisions and finalizations paths no longer match any route (the handler returns no response for them); `GET forecast-runs` is 405.
  - `runs-repository.ts`, `runs-contracts.ts`, `runs-testing.ts`: removed `listRuns`, `listAudit`, `latestVersion`, `startReview`, `applyDecisions`, `finalize`, `DecisionPlan`, `SectionState`, `RunExpectation`, `RunListRow` and the guard SQL. `createRun` (including the `proposed_class_section` rows) and `audit_count` in the revision are unchanged.
  - `runs-view.ts`: removed `newerOf` and `summaryOfList`; `detailOf(rows)` takes no audit and returns `newerForecastAvailable: null`, `audit: []`, `auditTruncated: false`.
  - `routes.ts`, `contracts.ts`, `index.ts`: dropped `OFFERING_ROUTE` and the `offerings` dependency.
  - `errors.ts`: removed the codes that nothing throws any more (`RUN_REVISION_MISMATCH`, `RUN_FINALIZED`, `RUN_STATE_CONFLICT`, `DECISION_INVALID`, `DECISION_REASON_REQUIRED`, `DECISION_DUPLICATE_SUBJECT`, `DECISION_NO_SECTIONS`, `SUBJECT_NOT_CONFIGURED`, `ALLOCATION_*`, `REVIEWS_INCOMPLETE`, `CONFIRMATION_*`, `RUN_NOT_FINALIZED`, `RUN_SCOPE_MISMATCH`, `SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE`, `SUBJECT_NOT_IN_RUN`, `OFFERING_NOT_CONFIRMED`, `PICK_DEADLINE_*`), the `confirmation` database-error context and the revision guard token. Kept: `IF_MATCH_REQUIRED` (subset acceptance still uses it), `SUBJECT_EXCLUDED`, `DECISION_SUBJECT_NOT_FOUND`, `DECISION_STALE`, `DECISION_CONFLICT`, `DECISION_FAILED`, `OFFERING_DECISION_NOT_FOUND`, `SEMESTER_READ_ONLY`, `SELECTION_CLOSED`; the messages of the first two now say "offered" and "not in the catalogue of this programme".
  - Tests: `runs-routes.test.ts` keeps generation, replay, detail (with `ETag`), students behind a subject, access and error mapping, and gains one test that the removed routes are gone; the review, decision and finalization suites are removed. `repository.database.test.ts` lost the review/finalize and confirmation sections (the system and combined snapshot tests now stop at generating the forecast); the other `*.test.ts` files only lost the `offerings` dependency stub.
- **Shared (`packages/shared`)**
  - `forecasting/confirmed-offerings.ts` now holds only `CONFIRMED_OFFERING_LABEL`, `CONFIRMED_OFFERING_NOTICE`, `CoordinatorAssignment`, `SCOPE_NOT_ASSIGNED_ERROR` and `isScopeAssigned`, with a header comment pointing to `forecasting/offering-decisions.ts` and the selection window. `offerings/confirmed-offerings.ts` keeps `nextSemesterAfter` and the re-exported wording. Their tests were reduced to match; `offerings/offerings.ts` comments no longer name removed types. `forecasting/contracts.test.ts` no longer checks the removed OpenAPI schemas and now asserts the removed paths are absent.
  - Left as they are (not in the plan's list, and type-only): the run lifecycle types in `forecasting/runs.ts` (`RunDecision`, `StartRunReviewRequest`, `FinalizeRunRequest`, ...) and the matching request types in `forecasting/contracts.ts`. They have no importer in `apps` any more and can go in a later clean-up.
- **Browser harnesses**
  - `tools/coordinator/fixtures.mjs`: removed `handleConfirmation`, the review/finalize/decide mutation, the run list and the `review` / `finalized` / `confirmed` seeds (and `secondFinalized`, `bulkAudit`, `newer`, `newerConf`). `tools/coordinator/test-ui.mjs`: removed the `decisions:` checks and `mobile: offering decisions ...`; the `review` seed became `run`; the empty-state loop no longer visits `/coordinator/decisions`; new check `the removed review, versions, comparison and offering decisions pages no longer exist` (it also asserts the navigation links).
  - `tools/admin/test-ui.mjs`: the quick-links expectation is now four links (planned: Data Quality, Decision Audit); the workspace-switch check opens `/coordinator/audit`; the two menu-scroll checks use a 300px tall viewport because the shorter menu no longer overflows at 600px.
- **Documents**
  - `docs/api/forecasting-uc20.openapi.json`: removed the paths `forecast-runs` (GET), `.../decisions`, `.../finalizations`, `.../audit`, `.../reviews`, `confirmed-offerings` (all four) and `offering-pick-counts`, the "Offering confirmation" tag and the schemas and responses only they used; rewrote `info.description` as the three-step flow (data, forecast, decide) and updated the generate and read descriptions. The offering-decisions paths are kept.
  - `docs/cachingguide.md`: rule 8 describes the approved-offerings behaviour and the `p002-context-v6-approved-offerings` marker; rule 9 adds the picker list cache (in memory, keyed by subject id because the scope and semester are fixed for the open page; the plan said `semesterId|subjectId`, the code uses the subject id).
  - `docs/database/data-contracts.md`: the P002 note is rewritten for migration 0009 (decisions, audit, withdrawals, selection window, 0007 tables retained and unused); the profile learning centre now belongs to the student on `student_profile.learning_centre_id` (was "remains P001"); the P003 line about the centre lock is updated. `docs/database/schema-decisions.md` D06 and `docs/database/subject-configuration-rules.md` wording (approve instead of confirm).
  - `docs/offerings/integration.md`: the current contract is introduced as the replacement; the planned confirmation contract is now a short "Superseded" section; the legacy section says what still applies.
  - `README.md` Sprint 2 rows; `docs/implementationguide.md` section 2 owner table for P001, P002 and P004.
  - One-line "Superseded by S2-P004-017 to S2-P004-024" notes added to `S2-P004-006`, `S2-P004-007` and `S2-P004-013` (history not rewritten).
- **Kept on purpose:** the "Decision Audit" placeholder and `/coordinator/audit`; the 0007 tables and triggers; `proposed_class_section` writes in `createRun`; `forecast_run.status` (always `DRAFT` now); `forecast_adjustment_audit` (empty from now on, still counted in the run revision); all past-semester decisions, audit rows, picks and withdrawals.
- **Deviations:** the plan named `seed: 'review' | 'finalized' | 'confirmed'` for removal; tests that only needed "a forecast exists" now use the existing `run` seed.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 68 files passed, 5 skipped; 1396 tests passed, 55 skipped (database suites skip without credentials)
- `npm run test:db-tooling`: 23 passed
- `npm run typecheck:offerings`, `npm run lint:offerings`: pass; `npm run test:offerings`: 14 files passed, 1 skipped; 186 tests passed, 9 skipped
- `node tools/coordinator/test-ui.mjs`: 47 passed
- `node tools/admin/test-ui.mjs`: 45 passed
- `node tools/offerings/test-ui.mjs`: 54 passed
- `node tools/p001/test-ui.mjs`: 48 passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed
- `node tools/auth/test-ui.mjs`: 12 passed
- `node tools/pathway/test-ui.mjs`: 9 passed

Not verified: the SQL against a real PostgreSQL (the database test file was edited but skips without credentials, so those edits were only type-checked); the pages against the real API (mocked fixtures). The removed routes were checked through the route tests only.

## 4. Changelog

- 2026-11-10 - Type: Removed / Docs. The old coordinator flow is gone: the Offering Decisions page, the forecast versions and comparison navigation entries, review, decide and finalize on a forecast, offering confirmation with a pick deadline, and the pick-count endpoint. The coordinator now works only on the Class Offering Forecast screen (approve or remove subjects; see S2-P004-020 and S2-P004-021). Compatibility: the API routes `GET forecast-runs`, `forecast-runs/{id}/reviews|decisions|finalizations|audit`, `confirmed-offerings*` and `offering-pick-counts` no longer exist; `POST forecast-runs`, `GET forecast-runs/{id}` and the students-behind-a-subject read are unchanged (the run detail now always has `newerForecastAvailable: null` and an empty `audit`). Database: nothing changed; the 0007 tables (`offering_confirmation`, `confirmed_offering` and their audit tables) are retained and unused, and no past-semester data was deleted or overwritten. Documents refreshed: OpenAPI, caching guide, data contracts, offerings integration, README, implementation guide. Status: READY_FOR_REVIEW.
