# S2-P004-023 — Profile learning centre, lock during selection, live centre in forecasting

- **Status:** MERGED to `main` (2026-11-11); human peer review pending
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4, on P001's profile module (cross-module change; the P001 owner should review)
- **Related UC / FR:** P001 academic profile; UC20 simplified offering flow, task 7 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`; design section 5.5; follows [S2-P004-016](S2-P004-016-mandatory-matric-number.md) (same page, same pattern)
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review, then the P001 owner

## 1. Plan

Problem: student profiles had no learning centre, so the forecast counted every portal student under Kuala Lumpur (`DEFAULT_STUDENT_CENTRE_ID`) and the student offerings page (S2-P004-022) had to show `NO_LEARNING_CENTRE`. The centre decides which coordinator's approvals a student sees and the forecast scope of "students in the system" snapshots, so it must be a real profile field.

Decisions (product owner and user, 2026-11-10):
- The student picks the centre on the profile page from the active learning centres. It is required, exactly like the matric number. Existing students were set to Kuala Lumpur by migration 0009 (column `student_profile.learning_centre_id`, applied to the development database).
- Students without a centre are left out of system snapshots and counted under "other centre".
- Lock: from the moment selection opens for the next semester until the admin moves the current semester forward, a student who already has a centre cannot change it (409 `PROFILE_CENTRE_LOCKED`). A student without a centre can always set one. The page shows why the field is locked.

Approach: extend the P001 profile module (contracts, validation, repository, completeness reader) and `ProfilePage.tsx`; replace the forecasting default with a live read of the profile centre. No database change in this task (0009 already has the column). Rollback: revert the files below; no data change.

## 2. Implementation

- **`apps/api/src/modules/profile/contracts.ts`:** `ProfileInput.learningCentreId: number`; `Profile.learningCentreId: number | null` and `Profile.learningCentreLocked: boolean`; `LearningCentreOption` and `ProfileOptions.learningCentres`.
- **`validation.ts`:** `profileInput` requires `learningCentreId` (`400 INVALID_INPUT`, "Learning centre must be a positive integer ID."); the field is allowed in the request body.
- **`repository.ts`:**
  - `find` returns the centre and the lock. The lock is computed only for a profile that has a centre: one extra read of the next semester's window (the semester after the admin current semester, `(academic_year, semester_no)` ordering) and `selectionPhase(window, now) !== 'PLANNING'` from the shared function, so OPEN and CLOSED are both locked until the admin moves the current semester forward. No next semester, no window, or no opening time means not locked. `createProfileRepository` takes an optional `now` for tests.
  - `save` reads the saved centre first; a different centre while locked throws `409 PROFILE_CENTRE_LOCKED` ("Your learning centre is locked while subject selection for the next semester is open. It unlocks when the next semester starts.") before any write. The upsert joins `learning_centre` (`is_active`, or the student's own saved centre) and stores `learning_centre_id`; when no row comes back, the centre is probed first and answers `400 INVALID_LEARNING_CENTRE` ("Select an available learning centre."), then the existing semester and curriculum probes. The saved profile returns `learningCentreLocked`.
  - `options` returns `learningCentres` (active centres ordered by code, plus the student's saved centre even if it was deactivated so the select can show it). It is a plain live query, not cached, in all three branches.
  - `createProfileReader`: a profile without a centre is `SETUP_REQUIRED` (so `/api/me` sends existing students without one to the profile and the student-only routes answer the same 403 as for a missing matric number).
- **Forecasting (`apps/api/src/modules/forecasting`):** `createDbScopeProvider(source, studentCentre)` now takes a reader; `studentLearningCentreId` calls it. `index.ts` passes `SELECT learning_centre_id FROM public.student_profile WHERE student_id = $1` (null when none). `DEFAULT_STUDENT_CENTRE_ID` and its TODO are deleted. `system-snapshot.ts` `CENTRE_NOTE` now reads "Students are counted under the learning centre saved in their profile. Students without a learning centre are excluded (counted under other centre)." The counting code is unchanged; it already excludes a null centre (`otherCentre`). OpenAPI description of `centreNote` updated (`docs/api/forecasting-uc20.openapi.json`); the coordinator fixture and browser check use the new text.
- **Web (`ProfilePage.tsx`):** required `Learning centre` select in "Programme and identity" (centre names, from `options.learningCentres`); `learningCentreLocked` disables it and shows "Locked while subject selection for the next semester is open. It unlocks when the next semester starts." (linked with `aria-describedby`); a saved profile with no centre shows "Add your learning centre to continue using the student pages."; Save requires a centre and sends `learningCentreId`; the lock state follows the saved response. `RecordsPage.tsx` only gained the new empty default in its options state.
- **Tests:**
  - `profile.test.ts`: `profileInput requires learningCentreId`, `stateFor is SETUP_REQUIRED without a learning centre`.
  - `repository.test.ts`: `find returns learningCentreId and learningCentreLocked from the next semester window` (open, closed, planned, no window), no window query without a centre, window SQL, `lock allows the first centre and blocks a change while selection is open`, same-centre save while locked, change before selection opens, `save rejects an inactive centre with INVALID_LEARNING_CENTRE`, `options lists active learning centres`. Existing option query-count expectations (+1 live centre query) and fixtures updated; `index.test.ts` likewise.
  - `scope-provider.test.ts`: `studentLearningCentreId reads the profile centre and returns null when unset`. `system-snapshot.test.ts`: `students without a centre are excluded and counted under otherCentre`.
  - Browser `tools/p001/test-ui.mjs` (+5): setup requires a centre and sends it; saved profile without a centre asks for it; saved centre changeable outside the lock (screenshots); locked centre disabled with explanation, other fields still save (screenshots); a server 409 keeps the draft. Both layouts run `assertReadable`. `tools/integration/test-ui.mjs` (setup picks the centre, options mock has `learningCentres`), `tools/pathway/test-ui.mjs` (mock shape), `tools/p001/test-db.mjs` (synthetic centre in the fixture).
- **Screenshots** (`.wrangler/p001-review/`): `profile-centre-desktop.png`, `profile-centre-mobile.png` (375px), `profile-centre-locked-desktop.png`, `profile-centre-locked-mobile.png` (375px).
- **Deviations:** (a) a student whose saved centre was deactivated can still save other profile fields with it unchanged (the active check applies to a different centre); otherwise every edit would fail until the admin reactivated the centre. (b) The lock query runs only for a profile that has a centre, and `save` returns the same `learningCentreLocked` flag so the page keeps the lock after saving. (c) The database check `db/checks/004_profile_current_semester.sql` was already changed for 0009 in Task 1; nothing further needed.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1459 tests passed, 64 skipped (database suites skip without credentials)
- `node tools/p001/test-ui.mjs`: 48 passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed
- `node tools/offerings/test-ui.mjs`: 54 passed
- `node tools/coordinator/test-ui.mjs`: 61 passed
- `node tools/auth/test-ui.mjs`: 12 passed
- `node tools/pathway/test-ui.mjs`: 9 passed
- Screenshots opened: profile locked, desktop and 375px.

Not verified: the SQL against a real PostgreSQL (the lock and window queries, the centre join and `options` query were checked through mocks only; `tools/p001/test-db.mjs` was updated but not run because it needs database credentials), and the pages against the real API (mocked fixtures).

## 4. Changelog

- 2026-11-10 - Type: Changed. Students now choose their learning centre in their profile (required, from the active centres). Students without one are asked to add it; the forecast counts "students in the system" under the centre saved in the profile instead of assuming Kuala Lumpur, and leaves out students without a centre. From the moment selection opens for the next semester until the admin moves the current semester forward, a student's centre cannot be changed (the page explains why). Compatibility: `PUT /api/profile` now requires `learningCentreId`; `GET /api/profile` adds `learningCentreId` and `learningCentreLocked`; `GET /api/profile/options` adds `learningCentres`; new errors `PROFILE_CENTRE_LOCKED` (409) and `INVALID_LEARNING_CENTRE` (400); existing students without a centre become `SETUP_REQUIRED`. Cross-module (P001 profile). Status: MERGED.
