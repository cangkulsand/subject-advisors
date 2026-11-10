# S2-P004-022 — Student offerings: approved subjects for the next semester, selection window, withdrawal note

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4 (cross-module change to the P002 offerings module; the P002 owner should review)
- **Related UC / FR:** UC08 student offerings under the UC20 simplified offering flow, task 6 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`; design section 5.4
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review, then the P002 owner

## 1. Plan

Problem: `/student/offerings` still lists the whole curriculum, follows the semester the student chose in the profile, and has no selection window. Coordinators now approve subjects per programme + learning centre + semester (Tasks 2 to 5), so the student page must show only approved subjects for the next semester, honour the admin selection dates, keep the pick limits, and tell a student when a coordinator withdrew a subject they had picked.

Approach (P002 files, additive where possible):
- API: the context reader targets the semester after the admin current semester and ignores `student_profile.current_semester_id`; it reads the learning centre, the target window and limits, the approved decisions and the student's withdrawals. `subjects` is the approved subset of the curriculum, only while the window is OPEN or CLOSED. The route gates PUT by window state, approved set and limits; the repository repeats every check in its transaction.
- Web: state cards for no next semester, no learning centre, not scheduled and not open; OPEN keeps select/review/saved with a live limit counter and blocks picks beyond a limit; CLOSED is read-only; a withdrawal note list; cache marker bumped to `p002-context-v6-approved-offerings`.
- Product owner answer 1 applies: pick limits (`max_subjects`, `max_credits` of the target semester) stay and are enforced on the page and on the server (409 `PICK_LIMIT_EXCEEDED`).

Out of scope: the learning centre field on the profile (Task 7; until then a profile without a centre shows `NO_LEARNING_CENTRE`), removing the old flow (Task 8), applying migration 0009. Rollback: revert the P002 module, shared type, doc and fixture changes listed below; no data change.

## 2. Implementation

- **`packages/shared/src/offerings/offerings.ts`** (additive): `OfferingWindowStatus`, `OfferingWindow`, `OfferingPickLimits`, `WithdrawnOffering`, `pickLimitMessage()`; `OfferingContext` gains optional `window`, `limits`, `prerequisiteCatalogue`; `OfferingPageData` gains `withdrawnSubjects`. `currentSemesterId` now carries the target semester.
- **`apps/api/src/modules/offerings/context.ts`**: profile query adds `learning_centre_id`, `programme_id`, centre name; semesters query adds `is_current`, limits and the two window dates; target from `nextSemesterAfter`; `window.status` from `selectionPhase` (NO_NEXT_SEMESTER, NO_LEARNING_CENTRE, NOT_SCHEDULED, NOT_OPEN, OPEN, CLOSED); approved subject ids from `offering_decision`; withdrawals from `offering_pick_withdrawal` (one per subject, newest first). The `PROFILE_SETUP_REQUIRED` / `PROFILE_SEMESTER_*` checks tied to the profile semester are removed; the final recheck now compares curriculum and learning centre (409 `PROFILE_CHANGED`). `contracts.ts`: `StudentOfferingContext` gains window, withdrawals, programme and centre ids; `OfferingScope` gains `programmeId`, `learningCentreId`. New `messages.ts` holds the error texts.
- **`routes.ts`**: `semesterId` (query or body) must equal the target (409 `SEMESTER_NOT_TARGET`); PUT 409 `PICKS_NOT_OPEN` / `PICKS_CLOSED` / `OFFERING_NOT_APPROVED` / `PICK_LIMIT_EXCEEDED` from the fresh context; GET returns `window`, `limits`, `prerequisiteCatalogue`, `withdrawnSubjects` and only picks that are still offered; no student, programme or centre ids are exposed.
- **`repository.ts` `replace` (one transaction):** (1) profile row `FOR UPDATE`, curriculum and learning centre must still match; (2) all `academic_semester` rows `FOR SHARE`, target must still be the next semester after the current one, then `selectionPhase` with the transaction's semester dates gives `PICKS_CLOSED` / `PICKS_NOT_OPEN`; (3) the existing curriculum subject check (400 `SUBJECT_OUTSIDE_CURRICULUM`); (4) approved set: curriculum subjects joined to `offering_decision` `APPROVED` for programme + centre + target, `FOR SHARE OF d`, count must equal the pick count else `OFFERING_NOT_APPROVED`; (5) limits from the locked semester row and the picked subjects' `credit_hours` else `PICK_LIMIT_EXCEEDED`; (6) the existing reconcile (DELETE then INSERT) and read. The decision-row share lock makes a coordinator removal wait for a saving student and then delete that pick, and makes a student who starts after the removal fail the approved check.
- **Web:** `response.ts` decodes the optional `window`, `limits`, `prerequisiteCatalogue`, `withdrawnSubjects`; `client.ts` marker `p002-context-v6-approved-offerings`; `OfferingsPage.tsx` states, counter (`N of max subjects · N of max credits`), limit block with the API message, hint "Picks can be changed until ...", confirmation text "I confirm these are my picks for ... A pick is not a registration.", banner "Your picks were saved.", CLOSED banner "Selection closed on ... Your picks are read-only." (no Edit/Review), withdrawal list "Withdrawn by the coordinator", local OPEN/CLOSED recompute while a snapshot ages, cache clear and reload on 409 `PICKS_CLOSED` / `PICKS_NOT_OPEN` / `OFFERING_NOT_APPROVED` / `SEMESTER_NOT_TARGET`; `offerings.css` adds the new blocks and fixes two sub-12px/14px type sizes (`small`, prerequisite labels) that the readability guard now catches.
- **Tests:** `context.test.ts`, `routes.test.ts`, `repository.test.ts` (window and approved-set recheck, target recheck, limits, centre change), `database.test.ts` (temp-table fixture extended with the 0009 shapes; skipped without `OFFERINGS_TEST_DATABASE_URL`), `response.test.ts`, `client.test.ts` (marker). Browser: `tools/offerings/test-ui.mjs` (16 window-state checks at 1280 and 375, stale-save reload, the readability guard on the real page harness, updated copy), `tools/integration/test-ui.mjs` mock gains `window`; harness `ui-harness.tsx` scenarios, `rich-fixtures.ts` and `tools/offerings/demo/fixtures.ts` carry an OPEN window.
- **Docs:** `docs/offerings/integration.md` (new "Current contract" section), `docs/cachingguide.md` item 8 (marker name only).
- **Screenshots** (`dist-offerings/review/`, desktop and 375px): `window-not-open-*`, `window-not-scheduled-*`, `window-open-dates-*`, `window-limits-*` (open with counter), `window-closed-*`, `window-withdrawn-*`, `window-no-centre-*`, `window-no-next-*`.
- **Deviations:** (a) the approved subjects are filtered from the whole-curriculum read, and the whole list is returned as `prerequisiteCatalogue`, so prerequisite display still resolves names for subjects that are not offered (a single join would have degraded them to "unavailable"); (b) the withdrawal query excludes subjects that are APPROVED again for the student's programme + centre + target semester, so the note never shows next to the subject in the offered list (review fix; test `re-approved subject hides the note`, database test extended, withdrawn fixture now uses DEMO999 which is not offered); (c) the page has no semester selector and never reads the profile semester.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1446 tests passed, 64 skipped (database suites skip without credentials)
- `npm run typecheck:offerings`, `npm run lint:offerings`: pass; `npm run test:offerings`: 14 files passed, 1 skipped; 193 tests passed, 9 skipped
- `node tools/offerings/test-ui.mjs`: 54 browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed
- `node tools/coordinator/test-ui.mjs`: 61 coordinator browser checks passed
- `node tools/p001/test-ui.mjs`: 43 passed

Not verified: the SQL against a real PostgreSQL (the offerings database suite needs `OFFERINGS_TEST_DATABASE_URL`; migration 0009 is applied to the development database but this task ran no database query), and the page against the real API (mocked fixtures).

## 4. Changelog

- 2026-11-10 - Type: Changed. The student offerings page now always works on the next semester, lists only the subjects the coordinator approved for the student's programme and learning centre, opens and closes picking with the admin selection dates, keeps the maximum subjects and credits, and shows a note when a coordinator withdrew a subject the student had picked. A student without a learning centre is asked to choose one in the profile. Compatibility: additive response fields (`window`, `limits`, `prerequisiteCatalogue`, `withdrawnSubjects`); `currentSemesterId` now means the target semester; new PUT errors `PICKS_NOT_OPEN`, `OFFERING_NOT_APPROVED`, `SEMESTER_NOT_TARGET`, `PROFILE_CHANGED`; cache marker bumped. Cross-module (P002). Status: READY_FOR_REVIEW.
