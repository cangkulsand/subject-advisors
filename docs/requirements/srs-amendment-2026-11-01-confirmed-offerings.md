# SRS/SDD v2.0 amendment — Coordinator-confirmed offerings (2026-11-01)

- **Source decision:** Product owner, 2026-11-01. Change record: [S2-P004-006](../changes/S2-P004-006-confirmed-offerings-rule.md).
- **Target document:** `UTMSPACE_SRS_SDD_v2.0_Formatted_Technical_Diagram_Titles (2).docx` (24 October 2026). The `.docx` has **not** been edited; the owner applies this amendment to it.
- **Reading guide:** each item lists the affected SRS item, a short quote of the **old** text and the **new replacement** text. Section numbers follow the document's own headings.

## The rule in one paragraph

After importing the snapshot and running the UC20 forecast, the Academic Coordinator
**confirms** which subjects will be offered per programme + learning centre + target
semester. The confirmation is a deliberate, audited coordinator action (actor, time, reason)
and is what students see, labelled **"Confirmed by coordinator"**. The student profile records
programme, curriculum, learning centre and current semester; programme, curriculum and
learning centre are locked after setup. The semester offerings page targets the **next
semester after the system current semester** (advanced by the System Administrator, not by
students) and lists only the confirmed
subjects for the student's programme + learning centre + that semester; if nothing is
confirmed it shows "Offerings not yet confirmed by the coordinator" and the student cannot
pick. Students **pick** from the confirmed list. Coordinators see, per subject, the pick **count and the list of students who picked it**
(within their assignment only) side by side with the forecast, ordered by seniority as a display aid; this is display only and never an input to
the forecast calculation. The latest confirmation for a programme + centre + semester is
authoritative. Nothing is official registration or a guaranteed timetable.

## Amendments

### A1. Section 1.1 / overview — summary paragraph

- **Old:** "Academic Coordinators provide independent academic data to forecast class demand and review proposed sections."
- **New:** "Academic Coordinators provide independent academic data to forecast class demand, review proposed sections and confirm the subjects offered for each programme and learning centre in the next semester. Students pick the subjects they intend to take from the coordinator-confirmed list. All planning outputs remain advisory, not official registration or graduation decisions."

### A2. Section 1.2 — scope (in scope)

- **Old:** "Student-reported current-semester offerings, eligibility and plan selection."
- **New:** "Coordinator-confirmed next-semester offerings per programme and learning centre, student picks from the confirmed list, eligibility and plan selection."
- **Add (in scope):** "Learning centre recorded in the student profile; programme, curriculum and learning centre locked after profile setup. Coordinator confirmation and withdrawal of offered subjects (audited). Student pick counts and pickers (names) for assigned coordinators."

### A3. Section 1.2 — scope (out of scope)

- **Old:** "…or automatic publication of institutionally official class offerings."
- **New:** "…or automatic publication of offerings or institutionally official class offerings. A coordinator confirmation is a deliberate in-system decision that students see as 'Confirmed by coordinator'; it is not official registration and not a guaranteed timetable."
- **Old (out of scope):** "Guaranteed future subject offerings or guaranteed graduation dates." — **keep**; add: "A confirmed offering is not a guaranteed class or timetable."

### A4. Section 2 (actors) — Part-Time Student and Academic Coordinator

- **Old (Coordinator):** "Authorized planning user who provides independent external academic data, reviews data quality, generates class offerings, and records exceptional-offering decisions…"
- **New (Coordinator):** "…reviews data quality, generates forecasts, records exceptional-offering decisions, confirms and withdraws the subjects offered per programme, learning centre and target semester, and views which students picked each subject, within their assignment."
- **Old (Student):** "maintains self-reported academic records, checks subject eligibility…"
- **New (Student):** "maintains self-reported academic records, picks subjects from the coordinator-confirmed offerings for the next semester, checks subject eligibility…"

### A5. UC03 Manage Academic Profile (and FR-A3 profile fields)

- **Old (FR-A3):** "…create, view, and update their academic profiles, including employment commitments, weekly working hours, and available study time."
- **New (FR-A3):** "…create, view, and update their academic profiles, including employment commitments, weekly working hours and available study time. Profile setup records the programme, curriculum, learning centre and current semester. After setup the student cannot change the programme, curriculum or learning centre."
- **Add business rule (UC03):** "The learning centre is selected from the configured learning centres. Programme, curriculum and learning centre are locked once the profile is set up; a save that changes them is rejected. Corrections and a later profile-setup redesign are future items."

### A6. FR-C1 (UC08)

- **Old:** "The system shall allow students to identify and select subjects offered by UTMSPACE during the current semester registration period from the available curriculum subject list."
- **New:** "The system shall show students the subjects the Academic Coordinator has confirmed as offered for the student's programme and learning centre in the next semester (the semester after the system current semester), and shall allow students to pick the subjects they intend to take from that confirmed list only. If no offering has been confirmed, the system shall show 'Offerings not yet confirmed by the coordinator' and shall not allow picking."

### A7. FR-C4 (UC10)

- **Old:** "…create and modify a proposed semester subject selection using eligible subjects from the current semester offering list."
- **New:** "…create and modify a proposed semester subject selection using eligible subjects from the coordinator-confirmed offering list for the next semester."

### A8. UC08 — rename and rewrite ("Enter Semester Subject Offerings")

- **Old name:** "Enter Semester Subject Offerings". **New name:** "Pick Semester Subjects from Confirmed Offerings".
- **Old brief description:** "Allows students to identify and select subjects offered by UTMSPACE during the current semester registration period…"
- **New brief description:** "Shows the subjects confirmed by the Academic Coordinator for the student's programme and learning centre in the next semester and lets the student pick the subjects they intend to take. The picks are used for eligibility validation, recommendation processing and, as counts and a list of pickers, as a decision aid for coordinators."
- **Old extension point:** "Future integration with official semester subject offering information, where available." — **New:** "Future integration with official semester subject offering information, where available (confirmed offerings are not official)."
- **Old precondition 3:** "The relevant programme curriculum and subject list must be available." — **New adds:** "The academic profile includes programme, curriculum, learning centre and current semester; the next semester is configured."
- **Old normal flow (steps 2–8):** student sees the subject catalogue for the programme and curriculum, "refers to UTMSPACE registration information and selects the subjects reported as offered", confirms a "student-reported offering list".
- **New normal flow:**
  1. Student opens the Semester Offerings page.
  2. System determines the target semester: the semester after the system current semester managed by the System Administrator (Semester 3 remains the Short Semester).
  3. System retrieves the offerings the coordinator confirmed for the student's programme, learning centre and that semester.
  4. System displays the confirmed subjects labelled "Confirmed by coordinator", with prerequisite information where available.
  5. Student picks the subjects they intend to take.
  6. System validates that each pick is currently confirmed and not duplicated.
  7. System saves the picks for the target semester and displays them.
- **New exception flow (replaces items 1–2):** "1. If no offerings are confirmed for the programme, learning centre and next semester, the system shows 'Offerings not yet confirmed by the coordinator' and does not allow picking. 2. If a picked subject is not (or no longer) confirmed, the system rejects it and reloads the confirmed list. 3. If no next semester is configured, the system shows that there is nothing to pick yet." Items on removing or correcting picks, cancelling and database failure are kept.
- **Old postcondition:** "The student-reported semester subject offering list is successfully recorded…" — **New:** "The student's picks for the next semester are saved and available for eligibility validation, subject recommendations and pick counts and pickers."
- **Old business rules 2, 6, 8:** "Subject offerings shall be identified by students based on information published during the current registration period." / "Student-reported offerings shall not be presented as officially verified university information." / "Subjects entered as offered shall remain student-reported…"
- **New business rules 2, 6, 8:** "2. Offerings are those confirmed by the Academic Coordinator for the student's programme, learning centre and next semester; students do not report offerings. 6. Confirmed offerings shall be presented as 'Confirmed by coordinator' and shall not be presented as official registration or a guaranteed timetable. 8. A pick may only be a currently confirmed subject." Business rules 1 (curriculum), 3, 4, 5 and 7 are kept; rule 3 refers to the target (next) semester.

### A9. UC09 and UC10 — preconditions and flow wording

- **Old (UC10 precondition 2 / BR1 / flow 3):** "The current semester offering list must be available." / "Students shall select subjects from the current semester offering list." / "displays the currently offered subjects".
- **New:** "The coordinator-confirmed offering list for the student's next semester must be available." / "Students shall select subjects from the coordinator-confirmed offering list for the next semester." / "displays the confirmed offered subjects".
- **Old (UC11 recommendations flow 2):** "…applicable curriculum, reported current offerings and configured study limits." — **New:** "…applicable curriculum, coordinator-confirmed offerings for the next semester and configured study limits."
- **UC09:** wherever "reported offerings" or "current offerings" are inputs to eligibility, read "coordinator-confirmed offerings for the next semester". Eligibility rules are unchanged.

### A10. FR-H7

- **Old:** "…It shall not cancel or publish offerings automatically."
- **New:** "…It shall not cancel, confirm or publish offerings automatically. Offerings become visible to students only through a deliberate, audited coordinator confirmation."

### A11. FR-H9 and new FR-H15 / FR-H16 (UC20)

- **FR-H9 old:** "The system shall allow coordinators to record and revise offering decisions while a forecast is Draft or Under Review. …"
- **FR-H9 new (append):** "Confirming the offered subjects is a separate step that follows review and is allowed from a Finalized forecast (see FR-H15)."
- **New FR-H15:** "After reviewing the forecast, the Academic Coordinator shall confirm the subjects offered for a programme, learning centre and target semester, and shall be able to withdraw a confirmed subject or re-confirm a withdrawn subject. Each action shall record the actor, timestamp and reason in an append-only audit trail. The latest confirmation for a programme, learning centre and target semester is authoritative. Excluded subjects (FYP1, FYP2, Industrial Training) cannot be confirmed."
- **New FR-H16:** "For the programme, learning centre and target semester within their assignment, the system shall show the Academic Coordinator, side by side with the forecast, the number of students who picked each subject and the list of those students (name, student number, current semester, credits completed, and intake once recorded), ordered by seniority as a display aid. Seniority is credits completed toward the student's curriculum, highest first, with the earliest intake / current semester as tie-break. The coordinator decides; there is no automatic allocation. Students shall not see other students' picks. Pick data is not an input to the forecast calculation."
- **FR-H14 (statuses):** unchanged. Add note: "Finalized forecasts remain read-only; confirmations are recorded separately and do not alter a Finalized forecast."

### A12. UC20 — flow, postcondition, business rules

- **Old normal flow ends:** "10. Coordinator reviews, adjusts and records de[cisions]…" — **New:** keep steps 1–10 and add: "11. After the forecast is Finalized, the Coordinator opens Offering Decisions, views the forecast beside the student pick counts and the pickers, and confirms the subjects to offer for the programme, learning centre and target semester, entering a reason. 12. System records the confirmation with actor and time. 13. The Coordinator may later withdraw or re-confirm subjects, each time with a reason."
- **Old postcondition (last sentence):** "No official offerings are automatically published."
- **New:** "No offerings are published automatically. Subjects become visible to students only after the Coordinator's audited confirmation, shown as 'Confirmed by coordinator'."
- **Old BR1:** "M6 uses coordinator-provided snapshots independently of student portal participation."
- **New BR1:** "The forecast is calculated from the coordinator-provided snapshot only; student portal data is not an input to the calculation. The students who picked each subject (name and profile/record fields) are shown to the assigned coordinator beside the forecast as a decision aid, ordered by seniority."
- **Old BR8:** "An authorized coordinator decision does not constitute official semester offering approval unless institutional policy permits it."
- **New BR8:** "A coordinator confirmation is the offering list shown to students as 'Confirmed by coordinator'. It does not constitute official registration or a guaranteed timetable, and does not constitute official semester offering approval unless institutional policy permits it."
- **Old BR10 (end):** "Finalized results and decisions are read-only; later changes require a new forecast version."
- **New BR10 (append):** "Confirmations are not part of the Finalized forecast and may be revised by the coordinator with an audited reason. A new forecast run or version (UC23) never changes, invalidates or requires re-confirmation of an existing confirmation; the forecast is a guide only and the confirmation keeps a reference to its source forecast run for provenance. The coordinator changes offerings only by explicitly confirming or withdrawing. The coordinator view may show an informational 'newer forecast available' notice with no automatic effect."

### A13. Non-functional / assumptions and constraints (Section 1 end, 3.1, 4.x)

- **Old:** "Current offerings are manually reported by students; actual future offerings are not confirmed and projections are theoretical."
- **New:** "Offerings shown to students are those confirmed by the Academic Coordinator; they are not official registration and not a guaranteed timetable. Student picks are intentions, not registrations. Projections remain theoretical."
- **Old (3.1):** "…keeps coordinator data separate from student-reported records." — **New:** "…keeps coordinator imported cohort data separate from student records; the student-derived data coordinators see are the picks and the pickers' name, student number, semester and credits completed, only within their assignment."
- **Old (3.1):** "The student portal cannot confirm future offerings or graduation dates." — **New:** "The student portal cannot confirm future offerings or graduation dates; only the Academic Coordinator confirms offerings."
- **Old (7.x data labelling):** "label student-reported, coordinator-provided and synthetic test data" — **New:** "label student-reported (academic records and picks), coordinator-confirmed and coordinator-provided and synthetic test data".
- **Old (M6 description, Section 4/5):** "Coordinator decisions are stored but do not publish official offerings." — **New:** "Coordinator forecast decisions are stored but do not publish offerings; a separate audited confirmation makes selected subjects visible to students as 'Confirmed by coordinator'."

### A14. Data design (Section 5): entities

- **SemesterOffering (old):** "Student-reported list of subjects offered in a particular academic semester." (`created_at`: "Date/time the reported offering was created"; `student_id`: "Student who reported the offering").
- **SemesterOffering (new, planned):** superseded by three new entities (ConfirmedOffering, ConfirmedOfferingAudit, StudentOfferingPick); SemesterOffering is retained as deprecated.
  - **ConfirmedOffering:** `confirmed_offering_id`, `programme_id`, `learning_centre_id`, `target_semester_id`, `subject_id`, `status` (CONFIRMED/WITHDRAWN), `forecast_run_id` (nullable provenance), `confirmed_by`, `confirmed_at`, `updated_at`, `revision`. Unique on programme + centre + semester + subject. Plus an append-only **ConfirmedOfferingAudit** (actor, time, reason, before/after status).
  - **StudentOfferingPick:** `pick_id`, `student_id`, `confirmed_offering_id` (FK, so only confirmed subjects can be picked), `created_at`; unique `(student_id, confirmed_offering_id)`.
  - The legacy `semester_offering` table is deprecated and read-only; legacy rows are not picks.
- **StudentProfile (old):** "Student academic identity, curriculum and self-reported study availability."
- **StudentProfile (new):** "Student academic identity, curriculum, learning centre (locked after setup) and self-reported study availability." New field `learning_centre_id` INTEGER; FK to LearningCentre; NULL only for legacy profiles.
- **LearningCentre (old):** "Academic learning centre identifier and code for independent coordinator cohorts." — **New:** "Academic learning centre identifier and code for coordinator cohorts, student profiles and confirmed offerings."
- **UC20 forecast entities:** the forecast is scoped by programme + learning centre + target semester (already planned in UC20 Package 2).

### A15. Traceability

Update the use-case-to-requirement matrix so that UC08 traces to FR-C1, FR-C4 (UC10) and the new FR-H15/FR-H16 trace to UC20; UC03 traces to the learning-centre addition to FR-A3.

## A16. Second-round decisions (product owner, 2026-11-01)

### A16.1 Pick deadline (UC08, UC20, new FR-H17)
- **New FR-H17:** "When confirming offerings for a programme, learning centre and target semester, the Academic Coordinator shall set a pick deadline. Students may pick or change picks only until the deadline; after it picks are closed and read-only. The Coordinator may change the deadline; the change is audited with actor, time and reason."
- **UC08 normal flow step 5-6 (add):** "Students may pick and change picks until the coordinator's deadline. After the deadline the page shows the picks read-only and states that picking is closed."
- **UC20 flow step 11 (add):** "…entering a reason and a pick deadline." This replaces the current practice of publishing a subject list and collecting answers by Google Form before a date.

### A16.2 System current semester (UC08, Academic Semesters)
- **Old (A8 above):** target semester derived from the profile current semester.
- **New:** "The target semester for offerings is the next semester after the system current semester. The System Administrator advances the system current semester in the Academic Semesters module; students do not. The student profile current semester remains the student's own setup value." Planned data: an admin-managed current-semester marker on the semester configuration (the data model has none today; only the student profile holds a current semester).

### A16.3 Cycle scope (UC08, UC20)
- **Add to UC20 and UC08 scope:** "For now the cycle ends when students have picked and the Coordinator sees how many students picked each subject. The system does not create class sections from picks, does not register students and does not produce a timetable."

### A16.4 Limits and passed subjects (UC08 business rules)
- **Add BR9:** "Picks shall respect the configured per-semester limits (maximum number of subjects and maximum credits). The server enforces them on save and the page shows the remaining allowance."
- **Add BR10:** "Subjects the student has already passed (completed or exempted) are not shown in the list and cannot be picked."
- **Add BR11:** "Prerequisites are displayed as an aid. Eligibility is determined by UC09."

### A16.5 Coordinator assignment (Actors, UC20 precondition 1, FR-H15/H16/H17)
- **Old (Actors):** "Authorized planning user who provides independent external academic data…" (any authorized coordinator).
- **New:** "…Each Academic Coordinator is assigned by the System Administrator to a faculty, degree (programme) and learning centre, and may provide data, view forecasts, confirm offerings, set deadlines and see pick counts and the students who picked only within those assignments."
- **UC20 precondition 1 (add):** "The coordinator is assigned to the selected programme and learning centre."
- **Exception flow 7 (extend):** "Unauthorized coordinator, or a programme/learning centre outside the coordinator's assignment: deny access."
- **Dependency:** an admin-managed coordinator-assignment model (planned).

### A16.6 Reference data (Section 5, M7)
- **Add (M7 administration):** "The System Administrator maintains learning centres, degrees (programmes), faculties and the subjects of each degree in a separate admin module." Out of scope of this amendment's implementation; listed as a dependency.
- **UC03 (add):** profile setup includes learning-centre selection from the maintained list.

### A16.7 Capacity figures (UC20 BR4)
- **Old BR4:** "Working figures (lecture around 40; lab around 30 with some exceptions to 35; minimum 15; financial break-even around 25) are provisional and administrator-configurable."
- **New BR4:** "Subjects have two class types: LAB and non-lab (lecture). The maximum class size is 35 for LAB and 45 for lecture; the optimal class size is 25 (used as the break-even target). The minimum of 15 remains a provisional, administrator-configurable figure." The coordinator view shows, per subject, the implied number of classes (picks divided by the maximum, rounded up) and its comparison with the optimal size, as a display aid only.

### A16.8 Forecast scope and legacy data
- **Entity ForecastRun (Section 5):** gains a programme reference (already planned in UC20 Package 2); required for confirmation scope.
- **Legacy `semester_offering` rows (SemesterOffering entity):** kept read-only, not migrated, not counted.

### A16.9 UC10 alignment
- The overlap between a student's pick (UC08) and the UC10 semester subject selection is acknowledged. The product owner will align UC10 themself (owner-assigned follow-up, not a blocker).

### A16.9a Forecast versions vs confirmation (OP1, decided)
- A new forecast run/version NEVER changes, invalidates or requires re-confirmation of offerings already confirmed. The forecast is a guide only. The confirmation keeps a reference to the forecast run it was based on (provenance only). The coordinator changes offerings only by explicitly confirming or withdrawing. Optional display aid: when a newer forecast exists for the same programme + centre + semester, the coordinator view may show an informational "newer forecast available" notice with no automatic effect.

### A16.11 Pickers visible to coordinators; seniority (OP4, OP16 decided; reverses "counts only")
- For each subject the coordinator sees the pick count AND the list of students who picked it (name, matric number, current semester, credits completed, and intake once recorded), only for students whose profile programme + learning centre fall within the coordinator's assignment (403 `SCOPE_NOT_ASSIGNED` otherwise). No small-number suppression. Students never see other students' picks.
- Replaces the old process in which the coordinator imported names and untaken subjects from the student management system. Purpose: the coordinator prioritises senior students so they can graduate as fast as possible.
- **Fields:** exist today: student name, matric number (nullable), current semester, credits completed (derived from the records, `recognized_credits` of completed/exempted subjects). **Planned addition:** intake semester on the student profile (not stored today).
- Seniority (decided 2026-11-01, OP16): credits completed toward the student's curriculum, highest first; tie-break the earliest intake, then the current semester. A display aid only: the coordinator decides and nothing is allocated automatically.
- **Old FR-H16 / BR1 / 3.1 wording** ("counts only", "no individual student shall be identified", "no identities") is withdrawn; see A11, A12 and A13 above, which now carry the replacement text.
- The ordering is the display-aid policy, version 1, implemented in ONE shared helper (`SENIORITY_POLICY_VERSION`, `compareBySeniority`, `sortPickers` in `packages/shared/src/forecasting/confirmed-offerings.ts`) and is revisable: a later change needs a new change record plus an update to that helper. It needs no database migration because the ordering is computed and never stored.
- Personal data: access only by assigned coordinators (admin access follows existing admin rules), `no-store` responses, not cached in shared caches or logged.

### A16.10 Environment
- Planned database changes target the development database (Neon development branch). The production database is out of scope of this amendment.

## Open points

None remain from the product owner answers of 2026-11-01. Planned additions (not open points): intake semester on the profile, coordinator-assignment model, admin-managed current-semester marker, admin reference-data module.

Decided by the product owner on 2026-11-01 (closed): coordinators see who picked, no small-number suppression (OP4), seniority definition (OP16); admin correction of locked profile fields, reason required and audited (OP5); picks on a withdrawn subject kept but hidden and not counted (OP7); counted students are those whose programme + centre match and who picked for the target semester (OP9); forecast versions never affect confirmations (OP1); next-semester targeting driven by the
admin-managed system semester with a "not yet confirmed" state; pick counts shown beside the
forecast, display only; latest confirmation authoritative; pick deadline; cycle ends at counts;
per-semester limits and hidden passed subjects; coordinator assignment; reference data in a
future admin module; class sizes LAB 35 / LECTURE 45 / optimal 25; forecast programme scope
required; legacy rows read-only; UC10 follow-up by the owner.
