# UC08 integration contract

## Planned contract: coordinator-confirmed offerings (S2-P004-006, product owner 2026-11-01)

> Planned work for P002 (with P001 and P004). The sections after this one describe the
> current, legacy student-reported implementation and stay in force until the P002
> package replaces them. Shared types: `packages/shared/src/offerings/confirmed-offerings.ts`.
> Coordinator operations: `docs/api/forecasting-uc20.openapi.json`.

**Rule for students.** UC08 is no longer student-reported. The page shows only the subjects the
Academic Coordinator confirmed for the student's programme + learning centre + the **target
semester**. Students pick the subjects they intend to take from that list, until the
coordinator's pick deadline. Wording: "Confirmed by coordinator"; never official registration or
a guaranteed timetable. For now the cycle ends with the picks and the coordinator's counts: no
class sections, registration or timetable.

- **Profile prerequisites.** The profile records programme, curriculum, learning centre and
  current semester. Programme, curriculum and learning centre are locked after setup (P001).
  The server derives all of them from the verified user, never from the request.
- **Target semester (decided).** The target semester for offerings is the **next semester after the system current semester**, which the System Administrator advances through the Academic Semesters module (admin-managed, not by students). Today `academic_semester` has no current-semester flag (only `student_profile.current_semester_id`, migration 0003); a planned admin-managed current-semester marker is a P004/admin follow-up. The student's profile current semester stays the student's own setup value and does not drive the offerings target.
  `nextSemesterAfter(systemCurrentSemesterId, semesters)` (academic order: year, then semester
  1, 2, 3) stays the pure helper. If none follows, the page shows a neutral "no next
  semester" state. `?semesterId=` is accepted only when it equals the computed target.
- **GET /api/semester-offerings** (new meaning, `ConfirmedOfferingsPageData`):
  - `status: CONFIRMED`: `targetSemester`, `confirmationRevision`, `pickDeadline`,
    `pickWindow` (`OPEN` or `CLOSED`), `allowance` (max/picked/remaining subjects and credits
    from `academic_semester.max_subjects` / `max_credits`), `offerings[]`
    (`ConfirmedOfferingListItem`: code, name, credit hours, prerequisite display aid, `picked`).
    When `CLOSED` the picks are read-only and the page says picking is closed.
  - `status: NOT_YET_CONFIRMED`: nothing is confirmed for programme + centre + target
    semester. Show "Offerings not yet confirmed by the coordinator"; no picking.
  - `status: NO_NEXT_SEMESTER`: no later semester configured.
  - Only `CONFIRMED` (not `WITHDRAWN`) subjects are listed, and subjects the student already
    passed (COMPLETED or EXEMPTED) are hidden (`hideAlreadyPassed`). The latest confirmation
    for the scope is authoritative.
- **PUT /api/semester-offerings** (save my picks). Body unchanged in shape:
  `{"semesterId":"201","curriculumSubjectIds":["101"]}`. The server rejects: a semester that is
  not the computed target; duplicates; subjects not currently confirmed for the student's
  programme + centre (409 `OFFERING_NOT_CONFIRMED`, the page reloads); subjects already passed
  (422 `ALREADY_PASSED`); a selection over `max_subjects` or `max_credits` (422
  `PICK_LIMIT_EXCEEDED`); any save after the deadline (409 `PICKS_CLOSED`). An empty array clears
  picks while the window is open. Replacement is transactional and idempotent. Helpers:
  `validateOfferingPicks`, `pickAllowance`, `isPickWindowOpen`.
- **Storage (planned, development database only).** New `student_offering_pick (student_id,
  confirmed_offering_id)`; the FK to `confirmed_offering` makes "only confirmed subjects" a
  database invariant. Legacy `semester_offering` is read-only: kept, not migrated, not counted.
- **Coordinator counts.** Picks feed `GET /api/coordinator/offering-pick-counts` as per-subject
  counts plus the list of pickers (name, matric number, current semester, credits completed; intake once recorded), ordered by seniority (credits completed highest first, then earliest intake / current semester; display aid), with implied classes (`ceil(picks / max)`, LAB 35, LECTURE 45) vs
  optimal 25 as a display aid. Shown beside the forecast; never a forecast input. Coordinators
  see counts and pickers only within their assignments (403 `SCOPE_NOT_ASSIGNED`); students never see other students' picks.
- **Dependencies.** Admin-managed current-semester marker (Academic Semesters module);
  coordinator assignments; admin reference data (learning centres, degrees, faculties, degree
  subjects) in a future admin module; `student_profile.learning_centre_id` (P001).
- **UC10.** Overlap with UC10 selection is acknowledged; the product owner will align UC10
  themself (owner-assigned follow-up, not a blocker).
- **Caching.** Bump the UC08 cache marker (suggested `p002-context-v6-confirmed-offerings`).
  See `docs/cachingguide.md` item 8.
- **Code to change in the P002 package (not changed yet):** `apps/api/src/modules/offerings/`
  (`context.ts`, `repository.ts`, `validation.ts`, `routes.ts`),
  `apps/web/src/features/offerings/` (`OfferingsPage.tsx`, `display-filter.ts`,
  `response.ts`). Remove the "student-reported" confirmation checkbox and wording.

## Legacy implementation (student-reported; superseded in part)

GET/PUT /api/semester-offerings reuses P004's authorize middleware, requiring an
active STUDENT and completed profile. Identity is resolved from the verified Clerk
session, never from ownership fields in request bodies.

- The completed profile supplies its required `currentSemesterId`. GET without a query
  returns that period's saved selection and the profile-selected ID with curriculum
  subjects/configured semester metadata. Optional `?semesterId=` is accepted only when
  it matches the saved profile choice; other periods are rejected.
- PUT JSON: {"semesterId":"201","curriculumSubjectIds":["101"]}. Empty arrays clear
  the saved set; IDs are positive INTEGER decimal strings (numeric input normalizes).
- Duplicate/foreign/invalid IDs are rejected. Replacement is transactional and
  idempotent, locking the student's profile and rechecking its current semester before
  reconciliation. A stale or mismatched period is rejected before any replacement.
  A failure rolls back the replacement. Previously saved periods remain intact when
  the student changes the profile choice, and become active again if selected later.
- Responses use the existing {data: ...}/{error: {code,message}} envelopes.

API entry: apps/api/src/modules/offerings/index.ts exports createOfferingHandler.
Supply createOfferingHandler(env, { profiles: realP001ProfileReader }) and register
its handler in the real shared Worker router. The optional contextFor override
must resolve the verified user's own profile/curriculum. The default context reader
consumes programme, curriculum, subject, curriculum_subject, academic_semester and
student_profile; repository storage uses the existing semester_offering table.
Canonical keys are INTEGER, not UUID. Do not recreate any tables.

Web entry: apps/web/src/features/offerings/StudentOfferingsRoute.tsx. Mount it at
/student/offerings inside the shared Clerk provider/shell. Its existing P004 gate
requires STUDENT/profile completion; drafts reset on user/session changes. The year and
semester dropdowns live in required academic-profile setup; Offerings displays the
saved current period and links back to edit the profile choice.

The baseline currently has an auth-only preview, not a shared academic router or
P001 profile service. Those owners must provide/mount their services before real
student persistence can be accepted. The independent dev:offerings demo remains
explicitly fictional. No complete-profile fallback or production identity mock exists.
Backend bindings reuse DATABASE_URL and existing Clerk settings; obtain them privately.

Boundaries still requiring live integration: production per-request connection
adapter/Workers lifecycle, real Clerk sessions, public membership-trigger behavior,
competing-session saves, approved reference data and human peer acceptance.
