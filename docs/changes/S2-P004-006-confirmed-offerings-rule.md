# S2-P004-006 — Confirmed offerings rule (contracts and specification update)

- **Status:** DONE for the contract/specification update (documents, OpenAPI, shared types and tests); implementation packages are PLANNED, owned as listed in section 1
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4 (coordinating); affected owners P001, P002, P003 (wording only), P004
- **Related UC / FR:** UC08, UC20, UC23 (interaction only), FR-C1, FR-C4, FR-H7, FR-H9, FR-H14 (see the SRS amendment)
- **Branch / PR:** `docs/s2-confirmed-offerings-rule`; no PR
- **Reviewer:** Pending (human review of the product-owner rule transcription requested)
- **Supersedes in part:** S1-P002-* (student-reported offerings), S2-P004-001, S2-P004-002, S2-P004-003 where they say "does not publish official semester offerings", "independent of student portal participation" or "student-reported offerings". Those records are historical and are not rewritten.

## 1. Plan

### Objective / problem

The product owner changed the system scope on 2026-11-01. Every programmer must pick up
the new rule from the contracts and specifications before implementing further work. This
change updates documents, the OpenAPI contract, additive shared TypeScript contracts and
their tests. It does **not** implement API handlers, database migrations or UI behaviour;
those are specified precisely below as planned work for the owning programmer.

### The rule (authoritative, product owner decision 2026-11-01)

1. **Coordinator confirms offerings.** After importing the snapshot and running the UC20
   forecast, the Academic Coordinator **confirms** which subjects (classes) will be offered,
   **per programme + learning centre + target semester**. Confirmation is a deliberate
   coordinator action (never automatic), audited (actor, time, reason), and it is what
   students see.
   - Minimal lifecycle: `CONFIRM` (a set of subjects, adds or re-confirms), `WITHDRAW`
     (one or more subjects). A subject row is `CONFIRMED` or `WITHDRAWN`; both transitions
     append an audit entry. Re-confirming a withdrawn subject is allowed.
   - **Pick deadline (decided 2026-11-01, OP10).** Confirming sets a pick DEADLINE for the programme + centre + semester. This replaces the current Google Form practice (coordinator publishes the subject list, students fill the form before a date). Students can pick or change picks only until the deadline; afterwards picks are closed (read-only). The coordinator may change the deadline (audited, `SET_DEADLINE`).
   - Relation to forecast status: confirmation is a **new step after review**. It is allowed
     from a `FINALIZED` forecast run for the same programme + centre + semester (the run it
     is based on is recorded as provenance). Finalization itself remains advisory and
     publishes nothing. The **latest confirmation state** for programme + centre + semester
     is authoritative. Excluded subjects (FYP, Industrial Training, `include_in_offering_forecast = false`)
     cannot be confirmed.
   - The latest confirmation state is authoritative (product owner confirmed). UC23 versioning interaction is **decided (OP1)**: A new forecast run/version NEVER changes, invalidates or requires re-confirmation of offerings already confirmed. The forecast is a guide only. The confirmation keeps a reference to the forecast run it was based on (provenance only). The coordinator changes offerings only by explicitly confirming or withdrawing. Optional display aid: when a newer forecast exists for the same programme + centre + semester, the coordinator view may show an informational "newer forecast available" notice with no automatic effect.
2. **Student profile gains a learning centre.** Profile setup records programme, curriculum
   and learning centre (plus the existing current semester). Once set up, the student
   **cannot** change programme, curriculum or learning centre themselves (locked). Changing
   profile setup later is a known future redesign; only the lock is specified now.
   A System Admin can correct these fields when a student chose wrongly (admin-only, reason required, audited; OP5 decided).
3. **Semester offerings page changes meaning.** UC08 is no longer student-reported. The page
   shows **only subjects confirmed by the coordinator** for the student's programme +
   learning centre + the target semester (previously: curriculum subjects the student had
   not taken). Students **pick** the subjects they intend to take from that confirmed
   list; a pick can only be a currently confirmed subject. Existing display aids
   (prerequisite display) stay where still relevant.
4. **Student picks feed coordinators (reversed 2026-11-01: names are visible).** Per subject, per
   programme + learning centre + semester, coordinators see the pick count **and the list of
   students who picked it**: name plus the identifying/seniority fields the profile and records
   already hold. This replaces the old process in which the coordinator imported names and
   untaken subjects from the student management system, and it supports prioritising senior
   students so they can graduate as fast as possible. Only students whose profile programme +
   learning centre fall within the coordinator's assignment are shown (403 `SCOPE_NOT_ASSIGNED`
   otherwise; admin access follows the existing admin rules). **No small-number suppression**
   (OP4 decided). Students never see other students' picks. The list is ordered by seniority
   (OP16 decided) as a display aid; the coordinator decides and there is no automatic allocation.
   This partially reverses the old UC20 rule "independent of student portal participation":
   the forecast import still comes from the coordinator snapshot; the picks and pickers are an
   additional demand signal. **Decided:** the coordinator view shows the forecast and the pick
   counts/pickers **side by side**; the forecast exists to help the coordinator decide which
   subjects to make available next semester. Pick data is display only and **not an input to the
   forecast calculation** (any version).
   - **Fields shown and where they come from.** Exist today: `student_profile.student_name`,
     `student_profile.matric_no` (nullable), `student_profile.current_semester_id`, and credits
     completed (derived: sum of `academic_record.recognized_credits` for COMPLETED/EXEMPTED
     records, via the records API). **Missing, planned addition (P001):** an intake semester
     (`student_profile.intake_semester_id`); no intake field exists on `student_profile` today.
     The internal `student_profile.student_id` identifies the row; the Clerk user ID is never
     returned.
   - **Seniority (OP16 decided).** Credits completed toward the student's curriculum, highest
     first. Tie-break: earliest intake / current semester (earliest intake first; where intake is
     not yet recorded the later current semester, i.e. further along, ranks higher). Helper:
     This is the display-aid policy **version 1**, kept in ONE shared helper (single source of truth)
     and **revisable**: a later change needs a new change record plus an update to the shared helper.
     It needs no database migration because the ordering is computed and never stored.
     Helper: `SENIORITY_POLICY_VERSION`, `compareBySeniority` / `sortPickers` in `packages/shared/src/forecasting/confirmed-offerings.ts`.
5. **Wording.** Students see these as **"Confirmed by coordinator"** offerings. The UI and
   API must not claim official/institutional registration or a guaranteed timetable (BR8
   updated in the SRS amendment). Shared constants: `CONFIRMED_OFFERING_LABEL`,
   `CONFIRMED_OFFERING_NOTICE`.
6. **Semester (decided, OP11).** Profile setup still records the student's **current** semester
   (unchanged, the student's own value). The target semester for offerings is the **next semester after the system current semester**, which the System Administrator advances through the Academic Semesters module (admin-managed, not by students). Today `academic_semester` has no current-semester flag (only `student_profile.current_semester_id`, migration 0003); a planned admin-managed current-semester marker is a P004/admin follow-up. The student's profile current semester stays the student's own setup value and does not drive the offerings target.
   The offerings page targets that next semester: it checks whether the coordinator has
   confirmed offerings for the student's programme + learning centre + target semester. If
   nothing is confirmed it shows **"Offerings not yet confirmed by the coordinator"** and the
   student **cannot pick**. Picks are only for that semester. `nextSemesterAfter(currentId,
   semesters)` stays as the pure helper; it is given the system current semester ID.
7. **Limits and passed subjects (decided, OP12).** Picks respect `academic_semester.max_subjects`
   and `max_credits` (data model A.08, D07), enforced on save by the server (422
   `PICK_LIMIT_EXCEEDED`); the page shows the remaining allowance. Subjects the student has
   already passed (COMPLETED or EXEMPTED) are hidden from the list and rejected on save
   (`ALREADY_PASSED`). Prerequisites stay a display aid; UC09 owns eligibility.
8. **Coordinator scope (decided, OP13).** Coordinators are ASSIGNED, admin-managed, to faculty,
   degree (programme) and learning centre. A coordinator confirms offerings, sets deadlines and
   sees pick counts and pickers only within their assignments (403 `SCOPE_NOT_ASSIGNED` otherwise). This
   changes the earlier UC20 statement that any active coordinator may choose any programme or
   centre; the coordinator-assignment model is a dependency.
9. **Cycle end (decided).** For now the cycle ENDS when students have picked and the coordinator
   sees how many students picked each subject. No class-section creation from picks, no
   registration, no timetable.
10. **Capacity (decided, OP14).** Two class types: LAB and non-lab (LECTURE). Maximum per class:
   LAB 35, LECTURE 45. Optimal class size 25 (`breakEvenTarget`). These replace the earlier
   example values 40 / 30 / 35. The coordinator view shows, per subject, the implied number of
   classes (`ceil(picks / maximum)`) and the comparison with optimal 25 as a display aid only.
11. **Reference data (decided).** Profile setup adds learning-centre selection. Learning centres,
   degrees (programmes), faculties and the subjects of each degree are maintained by the System
   Administrator in a separate future admin module (out of scope here; dependency).
12. **Environment.** Planned migrations target the development database (Neon development branch)
   only. The production database is out of scope.

### Scope and requirements

- **In scope (this change, DONE):** this record; `docs/requirements/srs-amendment-2026-11-01-confirmed-offerings.md`;
  edits to the UC20 plan and Package 1 contracts, the offerings docs, database docs, theme
  guide wording rules, caching guide, implementation guide, and short "superseded in part"
  notes on historical records; PLANNED operations in `docs/api/forecasting-uc20.openapi.json`;
  additive shared types, constants, small pure validators and unit tests.
- **Out of scope:** API handlers, DB migrations, UI, cache code, any edit to the SRS `.docx`,
  any rewrite of historical S1 records, UC23 design, admin correction of locked profile
  fields, timetabling, class-section creation from picks, registration, the separate admin reference-data module, the production database.

### Planned implementation (NOT done; per owner)

**Data model sketch (additive; migration ordering below)**

| Table | Owner | Sketch |
| --- | --- | --- |
| `student_profile` (alter) | P001 | add `learning_centre_id INTEGER NULL REFERENCES learning_centre`; NULL only for legacy profiles; application enforces NOT NULL for new setups; lock enforced server-side |
| `confirmed_offering` (new) | P004 | `confirmed_offering_id` PK; `programme_id`, `learning_centre_id`, `target_semester_id`, `subject_id` (FK each); `status` CONFIRMED/WITHDRAWN; `forecast_run_id` NULL FK (provenance); `confirmed_by`, `confirmed_at`, `updated_at`, `revision`; unique `(programme_id, learning_centre_id, target_semester_id, subject_id)` |
| `offering_confirmation` (new, scope header) | P004 | one row per `(programme_id, learning_centre_id, target_semester_id)`; `pick_deadline TIMESTAMPTZ NOT NULL`; `revision`; `updated_by`, `updated_at`. Holds the pick deadline and the set revision |
| `confirmed_offering_audit` (new, append-only) | P004 | `audit_id`; scope columns; `subject_id` (NULL for deadline changes); `action` CONFIRM/WITHDRAW/SET_DEADLINE; before/after deadline; `recorded_by`, `recorded_at`, `reason`; `before_status`, `after_status`; no UPDATE/DELETE (same protection pattern as `forecast_decision_audit_log`) |
| `student_profile` (alter, 2nd) | P001 | planned `intake_semester_id INTEGER NULL REFERENCES academic_semester` (intake is not stored today); used for the seniority tie-break and shown to assigned coordinators |
| `student_offering_pick` (new) | P002 | `pick_id`; `student_id` FK `student_profile`; `confirmed_offering_id` FK `confirmed_offering`; `created_at`; unique `(student_id, confirmed_offering_id)`. The FK makes "pick only confirmed subjects" a database invariant |
| `semester_offering` (existing) | P002 | **deprecated, retained read-only**. Legacy rows are student-reported, not picks; they are not migrated and not counted (OP6) |
| `forecast_run` (existing) | P004 | **REQUIRED dependency, decided (OP8):** gains `programme_id` (UC20 Package 2); confirmation joins on programme + centre + semester |
| `academic_semester` (alter) | P004 / admin | planned admin-managed current-semester marker (e.g. `is_current`, at most one true) advanced by the System Admin Academic Semesters module; target = next semester after it. `max_subjects` / `max_credits` already exist and are enforced on picks. `student_profile.current_semester_id` stays the student's own setup value |
| `coordinator_assignment` (new, admin-managed) | P004 / admin | `(coordinator user, faculty_id, programme_id, learning_centre_id)` unique; all coordinator operations check it server-side; needs a `faculty` reference (future admin reference-data module) |

**Migration ordering:** (1) P001 `student_profile.learning_centre_id` and (2) P004
`confirmed_offering` + audit are independent and can proceed in parallel after
UC20 Package 2 adds `forecast_run.programme_id`; (3) P002 `student_offering_pick` needs (2);
(4) coordinator pick-count read needs (1) and (3). All migrations additive and reversible;
no backfill of invented centres.

**Planned API (summary; details in OpenAPI and `docs/offerings/integration.md`)**

| Operation | Owner |
| --- | --- |
| `GET /api/coordinator/confirmed-offerings?programmeId&learningCentreId&targetSemesterId` | P004 |
| `POST /api/coordinator/confirmed-offerings` (confirm set; `Idempotency-Key`, `baseRevision`) | P004 |
| `POST /api/coordinator/confirmed-offerings/withdrawals` (withdraw; same protections) | P004 |
| `POST /api/coordinator/confirmed-offerings/pick-deadline` (change deadline; audited) | P004 |
| `GET /api/coordinator/confirmed-offerings/audit?...` | P004 |
| `GET /api/coordinator/offering-pick-counts?programmeId&learningCentreId&targetSemesterId` (counts plus pickers per subject, `sort=seniority\|name`; assigned scope only) | P004 read; data from P002 + P001 profile + records |
| `GET /api/semester-offerings` (new meaning: confirmed offerings for my profile + target semester + my picks) | P002 |
| `PUT /api/semester-offerings` (save my picks; body shape unchanged: `semesterId`, `curriculumSubjectIds`) | P002 |
| Error codes: `SCOPE_NOT_ASSIGNED` (403), `PICKS_CLOSED` (409), `PICK_LIMIT_EXCEEDED` (422), `ALREADY_PASSED` (422), `OFFERING_NOT_CONFIRMED` (409) | all |
| Profile read/save gain `learningCentreId`; save rejects changes to locked fields with `409 PROFILE_SETUP_LOCKED` | P001 |

**Planned UI**

- P004: the placeholder "Offering Decisions" page at `/coordinator/decisions`
  (`apps/web/src/features/coordinator/CoordinatorRoutes.tsx`) becomes the confirmation
  screen: choose an assigned programme/centre/semester, pick from the FINALIZED run's subjects, confirm
  with a reason and a pick deadline, change the deadline or withdraw with a reason, see audit and
  student pick counts (with implied classes vs optimal 25) beside the forecast.
- P001: learning-centre select in profile setup; programme/curriculum/centre read-only with
  a "locked after setup" note once saved.
- P002: `OfferingsPage.tsx` and `display-filter.ts` list confirmed offerings (label
  "Confirmed by coordinator"), allow picking until the deadline (then read-only "picks closed"),
  show the remaining subject/credit allowance, hide already-passed subjects, keep prerequisite
  display; remove the student-reported confirmation checkbox and wording.
- P003: wording only (Semester Planner no longer says "student-reported offerings").

**Code that will need change later (do not touch in this change):**
`apps/api/src/modules/offerings/context.ts`, `repository.ts`, `validation.ts`, `routes.ts`;
`apps/web/src/features/offerings/OfferingsPage.tsx`, `display-filter.ts`, `response.ts`;
`apps/api/src/modules/profile/*`; `apps/web/src/features/profile/ProfilePage.tsx`;
`apps/web/src/features/coordinator/CoordinatorRoutes.tsx`; caching marker
`p002-context-v5-curriculum-prerequisite-details`.

**Caching:** bump the UC08 marker (suggested `p002-context-v6-confirmed-offerings`) in the
P002 package. Confirm/withdraw responses are `no-store`; coordinator-side caches are cleared
on success. The student's five-minute snapshot may briefly lag a confirmation change, so
`PUT` always validates against current server confirmation and a stale pick returns
`409 OFFERING_NOT_CONFIRMED` after which the page refreshes (details in `cachingguide.md`).

### Decisions and open points

**Decided 2026-11-01 (product owner; closed):**

| ID | Decision |
| --- | --- |
| OP1 | A new forecast run/version NEVER changes, invalidates or requires re-confirmation of offerings already confirmed. The forecast is a guide only. The confirmation keeps a reference to the forecast run it was based on (provenance only). The coordinator changes offerings only by explicitly confirming or withdrawing. Optional display aid: when a newer forecast exists for the same programme + centre + semester, the coordinator view may show an informational "newer forecast available" notice with no automatic effect. |
| OP2, OP11 | Target semester = next semester after the **system** current semester, advanced by the System Admin Academic Semesters module (not by students). A planned admin-managed current-semester marker on `academic_semester` is a P004/admin follow-up (today only `student_profile.current_semester_id` exists). The profile current semester remains the student's own setup value. If nothing is confirmed: "Offerings not yet confirmed by the coordinator", no picking. If no later semester exists: neutral "no next semester" state |
| OP3 | Pick counts are shown side by side with the forecast, display only, never a forecast input. For now the cycle ENDS when students have picked and the coordinator sees the counts: no class sections from picks, no registration, no timetable |
| OP6 | Legacy `semester_offering` rows: read-only, kept, not migrated, not counted |
| OP8 | Confirmation requires a FINALIZED run for the same scope; `forecast_run.programme_id` (UC20 Package 2) is a required dependency |
| OP10 | Coordinator sets a pick DEADLINE when confirming (replaces the Google Form practice). Picks/changes only until the deadline, then read-only. Coordinator may change the deadline (audited). Student page has an OPEN/CLOSED pick window state |
| OP12 | Picks respect `academic_semester.max_subjects` / `max_credits` (enforced on save, stable error code, remaining allowance shown). Already-passed subjects hidden and rejected. Prerequisites display only (UC09 owns eligibility) |
| OP13 | Coordinators are assigned (admin-managed) to faculty + programme + learning centre and act only within them. Supersedes "any active coordinator". Learning centres, degrees, faculties and degree subjects are maintained by the System Admin in a separate future admin module (out of scope; dependency) |
| OP14 | Two class types, LAB and non-lab (LECTURE). Max per class: LAB 35, LECTURE 45. Optimal 25 (`breakEvenTarget`). Replaces the examples 40 / 30 / 35. Coordinator pick counts show implied classes `ceil(picks / max)` vs optimal 25 as a display aid |
| OP15 | UC10 alignment overlap acknowledged; the product owner will align UC10 themself. Owner-assigned follow-up, not a blocker |
| Environment | Planned migrations target the development database (Neon development branch). Production database out of scope |
| OP4 | Decided 2026-11-01: coordinators see WHO picked each subject (name plus profile/records fields) for their assigned programme + centre; no small-number suppression; students never see others' picks; no automatic allocation (the coordinator decides) |
| OP16 | Decided 2026-11-01: seniority = credits completed toward the student's curriculum, highest first; tie-break earliest intake / current semester. Display aid for the coordinator. Intake is not stored today: planned addition `student_profile.intake_semester_id` (P001) |
| OP5 | Decided 2026-11-01: a System Admin can correct a student's locked programme, curriculum or learning centre when the student chose wrongly (admin-only, reason required, audited). Students still cannot change them. Existing profiles without a centre may set the centre once. Built with the future admin reference-data/profile module; the later profile-setup redesign stays future work |
| OP7 | Decided 2026-11-01: picks on a subject the coordinator later withdraws are kept stored but excluded from the student's list and from coordinator counts; the student sees a "no longer offered" notice |
| OP9 | Decided 2026-11-01: counted students are those whose profile programme + learning centre match the confirmation scope and who picked for the target semester |

**Still open:** none from the product owner answers of 2026-11-01. Planned additions (not open points): intake semester on the profile, coordinator-assignment model, admin-managed current-semester marker, admin reference-data module.

### Acceptance criteria (this change)

- [x] Every document listed in the task states the new rule or carries a "superseded in part" pointer.
- [x] SRS amendment lists each affected SRS item with old text and replacement text; the `.docx` is untouched.
- [x] OpenAPI contains PLANNED coordinator confirmation, withdrawal, listing, audit and pick-count operations; no text still says "No offering is published" without qualification; JSON parses.
- [x] Shared types/constants/validators are additive; old exports remain (deprecated); tests added and passing.
- [x] No handler, migration, UI or cache behaviour changed.

### Verification plan

`npm run typecheck`, `npm run lint`, `npm test`, and a Node `JSON.parse` of the OpenAPI file.

### Risk / assumptions / rollback

- **Environment:** planned migrations target the development database (Neon development branch) only; production is out of scope. No database was touched in this change.
- **Dependencies (planned, not built here):** coordinator-assignment model; admin-managed current-semester marker (Academic Semesters module); `faculty` and admin-maintained reference data (learning centres, degrees, faculties, degree subjects) in a separate future admin module; `forecast_run.programme_id`.
- **Risks:** programmers may implement from stale historical records; mitigated by dated
  "superseded in part" notes. Picker lists expose student names to coordinators (decided), so the server-side assignment check (`SCOPE_NOT_ASSIGNED`), `no-store` responses and no logging/shared caching of picker data are critical.
- **Assumptions:** the rule text and the product owner answers of 2026-11-01 are authoritative; proposed lifecycle details
  (WITHDRAWN status, re-confirmation, audit tables) are engineering proposals pending review.
- **Rollback:** revert the documentation/contract commit; no data or runtime change exists.

### Decided 2026-11-02 (Normal/Short offering rule and excluded subjects)

The Normal/Short semester rule from [S1-P002-006](S1-P002-006-guided-offerings.md) (lines 23 and 44) is now
an **official offering rule**, no longer display-only. It is stored as data in `subject_semester_rule`
(one NORMAL or SHORT row per `curriculum_subject`; loaded in Neon development by the coordinator, then adjusted
below). The stored rows are the single source of truth; no subject-specific code exists.

- **Short semester (semester 3):** subjects worth 2 credits OR category Elective U1/U2, EXCEPT Project I
  (SECJ3032 / SECR3032). **Normal semesters (1/2):** all other subjects plus Project I. So the 2-credit Core
  university subjects (UHLB1112, UHLB2122, UHLB3132, UHIS1022, UHMS1182, UHMT1012, UHIT2302, UBSS1032, UKXQ2022)
  are Short-only (confirmed by the product owner).
- **Explicit additions to the S1-P002-006 rule:** SECD3761 "Seminar Keusahawanan Teknologi Maklumat" (1 credit) is
  **Short-only** (SHORT rows in both curricula). **Paired lecture/lab subjects run in Normal semesters**, overriding
  the 2-credit Short rule: SECR2242 Computer Networks (2) + SECR2941 Computer Networks Lab (1), and SECR3242
  Internetworking Technology (2) + SECR3941 Internetworking Technology (Lab) (1); all four rows are NORMAL.
- **Never forecast or confirmed** (`include_in_offering_forecast = false`, shown under "Excluded subjects"):
  Projek Sarjana Muda 1 and 2 and Latihan Industri (SECJ3032, SECJ4134, SECJ4114, SECJ4118, SECR3032, SECR4134,
  SECR4114, SECR4118) and UKQT3001 "Pengalaman Pembelajaran Luar Kurikulum" (1 credit, never offered in Normal or
  Short semesters). Because Project I is excluded from the forecast, its Normal-only rule matters only to the
  student page.
- **UC20 effect:** a subject whose rows exclude the target semester type is "Not offered in this semester type":
  no demand, no sections, not in totals, listed with "Runs only in Short semesters" / "Runs only in Normal
  semesters", and cannot be confirmed (422 `SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE`). A subject with no rule rows stays
  unrestricted. Built in S2-P004-007 MT7 (engine `uc20-engine-1.1.0`).
- **P002 follow-up (not changed here):** the student offerings page should later read `subject_semester_rule`
  instead of its hardcoded predicate in `apps/web/src/features/offerings/display-filter.ts`, so the student and
  coordinator views cannot diverge.
- **Follow-up:** pair-aware confirmation (a hint when only one subject of a lecture/lab pair is selected) is not built.

### Decided 2026-11-02 (MT8: data source is the students in the system)

Product owner decisions that **replace** the old UC20 rule "never query student profiles/options to populate UC20 / independent of student portal participation" and every BR1-style statement of it (this file's "independent of student portal participation" line above, SRS A12 BR1, uc20-plan section 1 and 3, package-1-contracts):

1. **Main source.** The Coordinator builds the forecast from the CURRENT STUDENTS IN THE SYSTEM ("Use students in the system"). A CSV upload stays as the fallback. A forecast uses exactly one source (one import snapshot).
2. **Records are complete history.** Student-entered academic records count as COMPLETE history, labelled "student-entered". Students with no academic record at all have UNKNOWN history and count as uncertain.
3. **Old rule replaced.** The forecast may read `student_profile` and `academic_record` (read-only) through the system-students snapshot. The snapshot is frozen like a CSV one; the student tables are never written. The pick data (pickers beside the forecast) remains display only and is still not an input of the calculation.

Interim limitation: `student_profile` has no learning centre yet, so the `ScopeProvider` returns KL for every student and all students count under KL until the profile learning centre lands.

## 2. Implementation

- **Status:** Complete for contracts/specifications. No handler, migration or UI implemented.
- **Files actually changed:**
  - New: `docs/changes/S2-P004-006-confirmed-offerings-rule.md` (this record);
    `docs/requirements/srs-amendment-2026-11-01-confirmed-offerings.md`;
    `packages/shared/src/forecasting/confirmed-offerings.ts` and `.test.ts`;
    `packages/shared/src/offerings/confirmed-offerings.ts` and `.test.ts`;
    `packages/shared/src/profile/profile-setup.ts` and `.test.ts`.
  - Second round (2026-11-01, product owner answers OP10-OP15) edited the same files plus the shared types: pick deadline, admin-managed semester, limits/passed subjects, coordinator assignment, class sizes and implied classes.
  - Edited: `docs/sprint/02/p004/uc20-plan.md`; `docs/sprint/02/p004/package-1-contracts.md`;
    `docs/api/forecasting-uc20.openapi.json`; `packages/shared/src/forecasting/index.ts`;
    `packages/shared/src/offerings/offerings.ts`; `docs/offerings/README.md`, `integration.md`,
    `acceptance.md`; `docs/databaseimplementation.md`; `docs/database/data-contracts.md`;
    `docs/database/schema-decisions.md`; `docs/implementationguide.md`; `docs/themeguide.md`;
    `docs/cachingguide.md`; one-line notes at the top of `docs/changes/S2-P004-001`, `002`, `003`.
- **Summary:** see section 1. The SRS `.docx` was not edited.
- **Decisions / deviations from plan:** `OFFERING_NOTICE` kept and marked `@deprecated`
  (new constants added) because the legacy page text is hard-coded in the web feature and
  demo; changing the constant is left to the P002 package. A small shared
  `packages/shared/src/profile/` module was added because no shared profile contract existed
  (the profile contract lives in `apps/api/src/modules/profile/contracts.ts`, which was not touched).
- **Migrations / env / shared contracts:** none run. Shared contracts additive only.

## 3. Review

- **Self-review checklist:** scope limited to documents, OpenAPI, shared contract types and tests; historical records only received a one-line note; no secrets, `.env`/`.dev.vars` files or databases touched.
- **Test evidence:** `npm run typecheck` pass; `npm run lint` pass; `npm test` 727 passed / 27 skipped (was 702 / 27; 25 new tests in three new shared test files); `node -e "JSON.parse(...)"` on the OpenAPI file ok; direct ESLint on `packages/shared/src` ok.
- **Manual checks:** OpenAPI parsed with Node `JSON.parse`.
- **Defects found and fixes:** none recorded.
- **Review outcome:** PASS — SELF-REVIEW (human peer review pending)
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Docs, Added (contract types), Tests
- **Added / Changed / Fixed / Removed:** new rule documented across specs; PLANNED confirmation/pick-count operations added to the UC20 OpenAPI; additive shared types (`ConfirmedOffering`, confirm/withdraw requests, pick counts, student confirmed-offering list item and pick validation, profile learning-centre lock) with tests; student-reported items marked `@deprecated`.
- **Affected routes / tables / consumers:** none implemented. Planned: `confirmed_offering`, `confirmed_offering_audit`, `student_offering_pick`, `student_profile.learning_centre_id`; `/api/coordinator/confirmed-offerings*`, `/api/coordinator/offering-pick-counts`, `/api/semester-offerings`.
- **Breaking changes / migration steps:** none now. The later P002 package changes the meaning of `GET /api/semester-offerings`; the P001 package makes profile centre/lock changes.
- **Verification summary:** typecheck, lint and full test run passed (727 passed / 27 skipped); OpenAPI JSON parses. No database, live service or browser check was run.
- **Outstanding blockers / follow-up:** all open points decided (OP1–OP16). Owner implementation packages: UC20 forecast + confirmation build (S2-P004-007, in progress), admin academic setup (S2-P004-008) and profile learning centre + lock (S2-P001-001) with ready-to-run prompts in `docs/sprint/02/handoff-academic-setup-and-profile.md`, P002 confirmed-offerings page + picks; human peer review.
- **Final status:** READY_FOR_REVIEW (contracts/specs); implementation PLANNED
