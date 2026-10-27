# S2-NOTE-001 — Student records and offerings follow-up

- Status: PLANNING NOTE ONLY
- Date: 2026-10-26
- Suggested sprint: Sprint 2; confirm during sprint planning
- Suggested owner: P001 for profile and academic records; P002 for semester
  offerings; coordinate shared page routing with the integration lead
- Implementation: Not started and not authorized by this note

## 1. Plan

Capture the user's next-work ideas so they can be scoped and assigned later. Do
not treat this note as approval to implement them. Sprint specifications and
approved academic policy remain authoritative when work is selected.

### Proposed follow-up

1. **Programme and resolved-curriculum changes.** Students select their programme
   only; do not expose curriculum selection in the student interface. After a
   student saves a changed programme, resolve the applicable internal curriculum
   using an approved deterministic rule, then refresh the curriculum-scoped subject
   choices used by academic records and make the offerings menu usable for that
   curriculum. Preserve existing saved records safely; determine how to handle
   entries that do not belong to the newly selected programme's resolved curriculum
   before coding.

2. **Record subject outcomes.** Present all subjects applicable to the resolved
   curriculum in a clear, responsive table. For each subject, let the student
   select **Taken** or **Exempted** as mutually exclusive choices; neither is
   selected by default. Let the student save or cancel changes as suitable. Keep
   the existing self-reported status and credit rules, remarks/exemption details,
   ownership checks, and server-side validation. Grade editing is a later, separate
   step outside the main subject table. Define the mobile table interaction and
   safe persistence details during feature planning.

3. **PDF-assisted record entry.** Explore letting a student upload a transcript
   PDF and extracting candidate subject codes, names, statuses, grades or credits
   into a reviewable draft. **Whether to use AI is undecided.** Compare ordinary
   text extraction/OCR with an AI-assisted extraction option using representative
   document types before choosing. Require the student to review and confirm every
   draft row before saving. Treat the information as student-reported; never imply
   that the upload verifies official university records. Assess privacy, handling
   and retention of uploaded documents, extraction errors, subject matching,
   duplicate detection, cost and failure recovery before implementation.

4. **Semester offerings setup.** The “No academic years configured” selector
   message means the offerings request returned an empty configured-semesters
   list, so it has no academic year or semester choices to display. The current
   UI reads years from those returned semester rows. At the last recorded check,
   the development database had zero `academic_semester` rows. Verify the current
   development database when this work is picked up. Configure approved academic
   year/semester reference rows through the existing development reference-data
   workflow; do not invent a calendar or change production data. Improve the
   empty state to explain that setup is required and direct the maintainer to the
   correct configuration process, while continuing to prevent misleading saves.

### Questions to settle before implementation

- What should happen to existing academic records when the student changes to a
  curriculum that does not contain one of their recorded subjects?
- Which PDF formats/document layouts and fields are in scope, and is OCR sufficient?
- What document privacy/retention rules apply? Is any external AI service allowed?
- Which approved academic years and semester numbers should exist in the selected
  development catalogue?

### Dated clarification — 2026-10-26

- Students select their programme only; curriculum choices are not exposed in the
  student interface. Curriculum remains an internal programme-version and
  subject/prerequisite mapping. Programme-only selection therefore needs a
  deterministic, approved internal rule to resolve the applicable curriculum;
  do not choose an arbitrary first/default version when multiple versions apply.
- Academic records are presented as a table of all subjects applicable to the
  resolved curriculum, not a subject dropdown. For each subject, the student may
  select **Taken** or **Exempted** (mutually exclusive); neither is selected by
  default. Neither selected means no outcome has been reported yet, not a new
  database status. Retain the existing status and credit rules, and settle how
  **Taken** maps to the existing record status during implementation if needed.
- Grade editing is a later, separate step outside the main subject table. Keep
  remarks and exemption details available under the existing record rules; decide
  their exact interaction and persistence with the feature plan. Persist only
  validated, owner-scoped changes through the existing safe write path; do not
  invent academic policy or schema statuses in this planning note.

### Out of scope for this note

No application UI, API, OCR/AI integration, file upload/storage, database migration,
seed, production change, or feature implementation. No assumption that AI is needed.

## 2. Implementation

- Added this planning note only.
- No source code, API, schema, database, environment, or provider configuration
  was changed. No ZIP, commit, or push was requested.

## 3. Review

- Documentation-only review; runtime behavior and live database were not rechecked.
- Existing UI copy and offerings data contract indicate the selector is empty when
  the API returns no semesters. The latest recorded development inventory showed
  zero `academic_semester` rows; verify again before future implementation.
- P001, P002 and product/academic stakeholders should confirm ownership, policy,
  PDF data handling, and field scope when planning the sprint.

## 4. Changelog

2026-10-26: Recorded the requested follow-up: curriculum changes should refresh
records/offerings choices; academic records should support row-level editing; PDF
upload should be explored as a reviewed extraction draft with AI undecided; and
the semester empty-state meaning/configuration requirement is documented. Planning
only; no implementation started.

2026-10-26: Clarified programme-only selection with an approved internal
curriculum-resolution rule, table-based subject outcome selection, blank initial
outcomes, and separate later grade editing. Planning only; no application or
database changes made.

## 5. Dated implementation clarification — 2026-10-27

The user subsequently authorized the programme/profile and subject-records work
for implementation in the current P001 session. That bounded scope is implemented
and documented in `S1-P001-002` through `S1-P001-010`, including the programme-only
profile, internal curriculum resolution, configured Core/CS E1/E2/Umum U1/U2/Other
tables, Taken/Exempted autosave, optional grade/remarks modal, safe clear/Undo,
full configured credits, academic cache behavior, and accessible five-second toast.
This does not revise the original dated planning history above; it records the later
authorization and implementation status. The S1-INT-012 session record describes
the separately user-authorized production publication, which has not yet occurred.

PDF transcript upload/extraction (including any AI use) and semester-offering
configuration remain future work; neither was included in this P001 implementation
or authorized as part of the current publication. No schema migration or live
database write was made for this scope.
