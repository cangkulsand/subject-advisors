# S2-P004-015 — UC20 student list shows the portal student's matric number or sign-in email

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-04
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 forecast review; follows [S2-P004-014](S2-P004-014-uc20-subject-level-counts.md).
- **Branch / PR:** `feature/p004-s2-uc20-student-matric` (from `main` 31a3c63); no PR
- **Reviewer:** Coordinator review

## 1. Plan

The student popup showed `PORTAL-<student_id>` for students who entered their records in the portal. That is an internal record number, which coordinators did not understand. `student_profile.matric_no` is optional and not unique, so it is often empty. User decisions (2026-11-04): show the sign-in email for now; then make the matric number mandatory on the profile ([S2-P004-016](S2-P004-016-mandatory-matric-number.md)) and show it first. The CSV `eMail` column stays unread (decision of 2026-11-02 kept).

## 2. Implementation

- **API:**
  - `ForecastingDependencies.portalContacts` (optional), built in `forecasting/index.ts`. It reads `student_profile.matric_no` and `clerk_user_id` by `student_id`, then the primary Clerk email through the existing admin identity lookup, in pages of 100. If Clerk fails, the matric numbers are still returned with `emailsAvailable: false`.
  - `GET /api/forecast-runs/{id}/subjects/{subjectId}/students` adds `matricNo` and `email` to each student. Both are set only for `PORTAL-<id>` references, read live and never stored. The response also gains `emailsAvailable`. A failed lookup returns the list without emails, with `emailsAvailable: false`.
  - `createForecastingHandler` now also takes `CLERK_SECRET_KEY` (already in `AuthBindings`).
- **Shared types:** `RunSubjectStudent = SubjectStudentOutcome & { matricNo, email }` and `RunSubjectStudents.emailsAvailable`. OpenAPI updated.
- **Web (`SubjectStudentsDialog.tsx`):**
  - The second line under the name is the profile matric number, then the sign-in email, then the reference. CSV students keep their matric.
  - Search also matches the matric number and email; the placeholder is "Search name, matric or email".
  - When emails are unavailable, a note says portal students show their portal reference.
  - The Student info tip text is updated.
- **Privacy:** the email is shown only to a coordinator with access to the run's scope (same checks as the run detail). The response stays `no-store`, and the page keeps it only in its in-memory cache (cachingguide rule 9).
- **Tests:**
  - API: matric number and email added for portal students only; matric numbers survive a Clerk failure; a failed lookup keeps the list.
  - Browser: matric shown and searchable; email when there is no matric; reference when there is neither; a check for the unavailable note.
  - Mock: students after 050 are portal students (051 with a matric number).

## 3. Review

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm test` — 67 files, 1377 tests passed
- `node tools/coordinator/test-ui.mjs` — PASS 52 coordinator browser checks
- `node tools/integration/test-ui.mjs --installed` — 35 passed

Not verified: the live Clerk lookup and the `student_profile` query against the dev database (tests mock both).

## 4. Changelog

- 2026-11-04 — Type: Added. The subject student list shows the profile matric number of portal students, or their sign-in email (live, display only), instead of `PORTAL-<id>`. Compatibility: additive response fields; no migration; the forecasting handler reads `CLERK_SECRET_KEY`. Status: READY_FOR_REVIEW.
