# UC08 integration contract

## Current contract: approved subjects and the selection window (S2-P004-022, 2026-11-10)

> This section is the contract for the simplified UC20 flow
> (`docs/superpowers/specs/2026-11-10-uc20-simplified-offering-flow-design.md`); it replaces the
> coordinator-confirmation plan of S2-P004-006 (pick deadline, `confirmed_offering`,
> `student_offering_pick`), which was never built. The coordinator approves subjects per programme +
> learning centre + semester (`offering_decision`), and the admin sets the selection window on the
> semester. Storage stays `semester_offering`.

- **Target semester.** Always the semester after the admin current semester
  (`academic_semester.is_current`, `nextSemesterAfter`). `student_profile.current_semester_id` is
  no longer read. `?semesterId=` and the PUT `semesterId` must equal the target, else 409
  `SEMESTER_NOT_TARGET`. `currentSemesterId` in the response carries the target.
- **GET /api/semester-offerings** returns the existing context plus `window`
  (`status` `NO_NEXT_SEMESTER` / `NO_LEARNING_CENTRE` / `NOT_SCHEDULED` / `NOT_OPEN` / `OPEN` /
  `CLOSED`, `targetSemesterId`, `selectionOpensAt`, `selectionClosesAt`, `learningCentreName`),
  `limits` (`maxSubjects`, `maxCredits` of the target semester), `withdrawnSubjects`
  (coordinator withdrawals of picks the student had made, newest first) and
  `prerequisiteCatalogue` (every curriculum subject without prerequisites, so prerequisites of an
  offered subject can name a subject that is not offered). `subjects` lists only the curriculum
  subjects with an `APPROVED` `offering_decision` for the student's programme + learning centre +
  target semester, and only while the status is `OPEN` or `CLOSED`; otherwise it is `[]`.
  Without a learning centre the status is `NO_LEARNING_CENTRE` (never an empty subject list).
  `selection` lists only picks that are still offered.
- **PUT /api/semester-offerings.** Body unchanged. 409 `PICKS_NOT_OPEN` ("Picking has not opened
  yet.") before the window opens or when the state is `NO_*`; 409 `PICKS_CLOSED` ("Picking is
  closed. The selection period has ended.") after the closing time; 409 `OFFERING_NOT_APPROVED`
  ("A subject you picked is no longer offered. Reload offerings.") for any subject outside the
  approved set; 409 `PICK_LIMIT_EXCEEDED` ("You can pick at most N subjects and M credits for
  this semester.") over `max_subjects` or `max_credits`. The route checks the fresh context; the
  repository repeats the checks in its transaction (see below), which is what makes a stale
  five-minute snapshot harmless.
- **Transaction.** `FOR UPDATE` on the student's profile row (curriculum and learning centre
  must still match), `FOR SHARE` on every `academic_semester` row (so the current semester and the
  dates cannot move mid-save), window and target recheck, the approved-subject query with
  `FOR SHARE OF d` on the `offering_decision` rows (a coordinator removal waits, then deletes the
  pick), the credit and subject limit check, then the reconcile. Any failure rolls everything back.
- **Page.** Cards for `NO_NEXT_SEMESTER`, `NO_LEARNING_CENTRE` (link to `/student/profile`),
  `NOT_SCHEDULED` and `NOT_OPEN`; `OPEN` keeps select/review/saved with a live
  "N of max subjects, N of max credits" counter and blocks a pick beyond a limit with the API
  message; `CLOSED` is read-only. OPEN/CLOSED is recomputed locally from the dates while a cached
  snapshot ages; a 409 `PICKS_CLOSED`, `PICKS_NOT_OPEN`, `OFFERING_NOT_APPROVED` or
  `SEMESTER_NOT_TARGET` on save clears the cache and reloads.
- **Caching.** Marker `p002-context-v6-approved-offerings` (see `docs/cachingguide.md` item 8).

## Superseded: coordinator-confirmed offerings (S2-P004-006)

The plan to confirm offerings from a finalized forecast, with a coordinator-set pick deadline and a
`student_offering_pick` table keyed to `confirmed_offering`, was replaced by the contract above
(S2-P004-017 to S2-P004-024). What changed in plain terms: "confirmed" is now "approved" (a
coordinator click with no reason, audited in `offering_decision_audit`); the pick deadline is the
admin-set selection window (`selection_opens_at` / `selection_closes_at` on `academic_semester`);
picks stay in `semester_offering`; a removed subject withdraws the picks and leaves a note for the
student (`offering_pick_withdrawal`). The 0007 tables (`offering_confirmation`, `confirmed_offering`
and their audit tables) remain in the database, unused. Coordinator operations are in
`docs/api/forecasting-uc20.openapi.json`; the pick count and picker list live on the coordinator
forecast screen (`GET offering-decisions`, `GET offering-decisions/{subjectId}/pickers`).

## Legacy implementation (student-reported; superseded)

The notes below describe the first, student-reported implementation. Authentication, the
envelopes and the PUT body shape still apply; the target semester, the subject list and the
saving rules are the ones in the current contract above.

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
