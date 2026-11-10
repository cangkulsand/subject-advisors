# S2-P004-019 — Picks API: pick counts, pickers and pick withdrawal on removal

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 / UC23 simplified offering flow, task 3 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: the decisions API (S2-P004-018) reports no pick counts and withdraws nothing. The coordinator needs to see how many students picked each approved subject, who they are, and removing an approved subject must withdraw the picks of that scope and record that they were withdrawn so students can later be told.

Approach:
- `pickCounts(scope)` and a new `pickers(scope, subjectId)` on the decisions repository. A pick counts for a scope when `semester_offering.semester_id` is the target semester, the student's `student_profile.learning_centre_id` is the centre, and the student's `curriculum.programme_id` is the programme.
- `decide` withdraws picks when an APPROVED subject is changed (to REMOVED or back to PENDING): one SQL statement counts, deletes and records the withdrawals, so the audit `affected_picks`, the deleted rows and the `offering_pick_withdrawal` rows agree.
- New route `GET offering-decisions/{subjectId}/pickers`; personal data, `Cache-Control: no-store`, scope-checked. Matric number comes from the database; sign-in email through the existing `portalContacts` lookup (same merge as the subject student list).

Acceptance (plan Review Focus 3 is Task 6, not here): removing an approved subject reports the real `affectedPicks`, deletes only picks of that programme + centre + semester + subject, keeps `offering_pick_withdrawal` rows, and a stale removal withdraws nothing.

Out of scope: student offerings page and the pick-time approval check (Task 6), coordinator UI (Tasks 4-5), migration 0009 (unchanged, not applied). Rollback: revert the route, repository methods and the `decide` statement; the Task 1 tables are untouched.

## 2. Implementation

- **Shared:** `offering-decisions.ts` gains `DecisionPicker { studentId, studentName, matricNo, email }` and `DecisionPickers { scope, subjectId, subjectCode, subjectName, pickCount, emailsAvailable, pickers }`.
- **API:** `decisions-contracts.ts` (`PickerRow`, `pickers()`), `decisions-repository.ts` (`pickCounts`, `pickers`, new `decide` statement), `decisions-routes.ts` (pickers handler; `DECISION_ROUTE` is now `/^offering-decisions(?:\/(audit)|\/([1-9]\d*)\/pickers)?$/`), `decisions-testing.ts` (in-memory picks, `seedPicks`, withdrawal records), `errors.ts` (new `OFFERING_DECISION_NOT_FOUND`, 404).
- **Endpoints (COORDINATOR only, `isScopeAssigned` on every call):**
  - `GET /api/coordinator/offering-decisions/{subjectId}/pickers?programmeId&learningCentreId&targetSemesterId` returns `{ data: DecisionPickers }`, `Cache-Control: no-store`; pickers sorted by name then student id; `matricNo` from `student_profile.matric_no` (falls back to the live contact), `email` from the live lookup, `emailsAvailable` false when that lookup fails. Errors: 400 bad or extra query parameters, 403 `SCOPE_NOT_ASSIGNED`, 404 `OFFERING_DECISION_NOT_FOUND` (the subject has no decision row in the scope), 405 other methods.
  - `GET offering-decisions` now fills `pickCounts` (`[{ subjectId, pickCount }]`, absent when 0).
  - `POST offering-decisions` now returns the real `affectedPicks`; the audit entry carries the same number.
- **Withdrawal (SQL, inside the existing `decide` transaction):** after the advisory lock, the stale guard and the decision upsert/delete, and only when `expectedStatus` is `APPROVED`, one statement runs: CTE `scoped` selects `semester_offering` rows joined to `student_profile` (centre), `curriculum` (programme) and `curriculum_subject` (subject) with `semester_id = target`; CTE `a` inserts the audit row with `affected_picks = count(scoped)`; CTE `gone` deletes exactly the `scoped` rows (`DELETE ... USING scoped`); CTE `w` inserts one `offering_pick_withdrawal(audit_id, student_id, semester_id, subject_id)` per deleted row; the final select returns the audit id and `count(w)`. All CTEs of one statement share a snapshot. Any other transition keeps the previous audit-only insert (`affected_picks` 0). A stale `expectedStatus` aborts at the guard before any of this runs, so nothing is withdrawn.
- **Tests:** `decisions-routes.test.ts` +9 (pick counts, pickers order/matric/email, email lookup failure, unknown subject 404, scope/method/parameter checks, removal withdraws and reports, approved to pending withdraws, zero picks, stale removal withdraws nothing); `repository.database.test.ts` +1 PostgreSQL case (scoped picks removed, other subject / other centre / later semester kept, withdrawal row and audit count); skips without `FORECASTING_TEST_DATABASE_URL`.
- **OpenAPI:** `docs/api/forecasting-uc20.openapi.json` adds the pickers path, `SubjectIdPath` parameter, `DecisionPicker`, `DecisionPickers`, envelope and responses; the decide description documents withdrawal.
- **Deviations from the plan:** (1) shared types are named `DecisionPicker` / `DecisionPickers`, not `OfferingPicker(s)`, because `OfferingPicker` already exists in `confirmed-offerings.ts` and in the OpenAPI schemas (old flow, removed in Task 8). (2) The unknown-subject pickers error is the new code `OFFERING_DECISION_NOT_FOUND` instead of reusing the 422 `DECISION_SUBJECT_NOT_FOUND` (Task 2 review note). (3) The withdrawal statement is also used for APPROVED to PENDING, not only to REMOVED, since a pending subject is not shown to students either.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1417 tests passed, 63 skipped (database suites skip without credentials)
- `node tools/coordinator/test-ui.mjs`: 52 coordinator browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed

Not verified: the SQL (`pickCounts`, `pickers`, withdrawal statement) and the new PostgreSQL test were not run against a database (no credentials used; migration 0009 is not applied). Run with `FORECASTING_TEST_DATABASE_URL` after applying 0009. Known follow-up for Task 6: the student pick endpoint must refuse unapproved subjects, otherwise a pick written between the coordinator's page load and the removal is still caught by the delete, but a pick written after removal would not be.

## 4. Changelog

- 2026-11-10 - Type: Added. Coordinator pickers endpoint (`offering-decisions/{subjectId}/pickers`), per-subject `pickCounts` in the decision set, and withdrawal of student picks (with immutable withdrawal records and the count in the audit) when an approved subject is removed or set back to pending. Compatibility: additive; `affectedPicks` and `pickCounts` were previously always 0 / empty. Outstanding: apply migration 0009 and run the database test. Status: READY_FOR_REVIEW.
