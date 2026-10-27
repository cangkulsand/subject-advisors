# S1-P001-005 — Student records table integration

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up (authorized P001 scope)
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator reviewed the P001 implementation minis; human peer review pending

## 1. Plan

### Objective / problem

Integrate the reviewed native subject table into the student records page so
each signed-in student sees all subjects for their resolved curriculum and can
record one current outcome per subject without losing existing record data.

### Scope and requirements

- In scope: `RecordsPage` integration, separate optional grade/remarks editor,
  automatic Taken/Exempted saves, same-row updates, undated clear/Undo, and
  focused P001 plus shared-router UI coverage.
- Out of scope: API implementation (completed separately), schema/migrations,
  live DB access/writes, PDF upload, semester configuration/offerings, other
  owners, commits/pushes, and private repositories.
- Product decisions: Taken saves `COMPLETED`; Exempted saves `EXEMPTED` with full
  configured subject credits. Grade and remarks are optional and can be edited
  later. Both outcomes autosave and keep one current row per student/subject;
  new rows are undated. Updates preserve row identity and existing grade/remarks.
  Checkbox clicks never open a modal or prompt. Unticking an undated saved row
  deletes it and presents inline Undo. Dated records and legacy partial-credit
  exemptions cannot be cleared because their semester/credit values cannot be
  faithfully restored. Multiple legacy rows remain read-only.
  This final full-credit, optional-details decision supersedes the earlier
  interim zero-credit exemption/explanation requirement described in preliminary
  P001 notes.
  The table labels each checkbox column once in its header; row controls retain
  subject-specific accessible names and 44px hit areas without repeating visible
  labels. Elective subgroups will use the reviewed server-provided requirement
  metadata from the configured catalogue (including the verified Pilih counts);
  UI wiring is pending the API agent's final grouped contract.

### Current behavior and intended behavior

- Current RecordsPage remains an attempt form with subject/semester/status/grade
  dropdowns and a saved-attempt list. The reviewed table component and API
  changes now exist but are not yet integrated.
- Intended page groups all configured subjects in accessible Core, Computer
  Science Electives (E1/E2), Elective Umum (U1/U2), and conditional Other tabs,
  each with native table sections. Configured requirement subgroups do not block
  truthful historical entries.
  Blank initial checkboxes,
  mutually exclusive controls, automatic save behavior, truthful legacy status
  handling, and optional details in a separate native modal are preserved
  across tab switches.

### Proposed implementation

- Expected files: `apps/web/src/features/records/RecordsPage.tsx`,
  `apps/web/src/features/records/SubjectRecordsTable.tsx` and its scoped CSS
  for status/actions and an eye-icon Details action, `tools/p001/test-ui.mjs`,
  `tools/integration/test-ui.mjs`, and `docs/p001-sprint1-handoff.md`; update
  this record with actual results. Reuse `SubjectRecordsTable` and the existing
  `AcademicClient`, including DELETE support.
- Load records and curriculum subjects through existing reads. Match each
  subject to zero/one/multiple saved rows: none is blank; one maps exact status;
  multiple is read-only and clearly flagged. Do not infer COMPLETED from FAILED
  or WITHDRAWN or choose/merge/delete a legacy row.
- Group using the existing `subject_category` metadata: Core, Computer Science
  Electives, Elective Umum, and conditional Other tabs; uncoded or unknown
  categories remain visible in Other. Use semantic
  `tablist`, `tab`, `tabpanel` roles with Arrow/Home/End keyboard movement and
  stable per-tab counts. Keep selection/details/dirty state mounted or otherwise
  preserved while changing tabs. Consume the reviewed category metadata contract
  from the independent API mini-task without editing profile/repository files.
- Details is an accessible native `<dialog>` opened only from a per-subject
  eye-icon button. Native modal behavior keeps
  focus in the dialog and makes the page background inert. The dialog has a
  labeled heading, Close button, Escape handling, focus restoration, and
  confirmation before discarding dirty detail edits. Failed saves retain it.
- New outcomes POST with `semesterId: null`; changing one row PUTs the same
  `recordId` and keeps its subject/semester identity. Retain saved grade/remarks
  unless explicitly edited in the separate details modal. COMPLETED and EXEMPTED
  submit null recognized credits for server derivation of full subject credits.
- Clearing an unsaved selection is local. Unticking an undated saved outcome
  DELETEs the exact row and offers Undo by recreating its status/grade/remarks.
  A dated legacy row or partial-credit exemption is retained with an inline
  message because current POST semantics cannot restore its old metadata.
- Partial saves update successful rows and clearly report remaining failures;
  dispatch `p001:records-changed` after successful mutations. Existing cache
  invalidation remains in `AcademicClient`.

### APIs / database / cross-programmer impacts

- Consume `GET /api/academic-records`, `POST /api/academic-records`,
  `PUT /api/academic-records/:recordId`, and `DELETE /api/academic-records/:id`.
  DELETE returns `{recordId, subjectId}`. No API/schema changes are planned.
- Preserve raw statuses for P003 consumers; do not add statuses or project old
  FAILED/WITHDRAWN outcomes as Taken. Existing unique constraints and API guards
  remain authoritative for writes; legacy duplicates are protected in the UI.

### Acceptance criteria

- [x] All configured subjects appear in native table(s), with one active category
  table at a time and Elective split into configured requirement sections; no subject dropdown,
  status dropdown or grade column/input appears in the main table.
- [x] Core, Computer Science Electives, and Elective Umum tabs use curriculum
  category metadata, with E1/E2/U1/U2 headings generated from API metadata;
  unknown subjects remain reachable under Other. Tabs support keyboard movement
  and switching preserves pending choices.
- [x] Details opens only from a 44px eye-icon action in a native accessible modal;
  focus is managed, Escape/Close confirms dirty discard, and failure retains the
  draft while success closes and restores focus.
- [x] No saved row starts unchecked; one saved COMPLETED row shows Taken,
  EXEMPTED shows Exempted, and FAILED/WITHDRAWN show their actual status without
  being converted or deleted.
- [x] New Taken and Exempted choices autosave as undated, private records and do
  not create a second row. Later status changes PUT the same ID.
- [x] Grade/remarks editing is optional and separate from the table. Both
  COMPLETED and EXEMPTED use full subject credits; the student cannot edit credits.
- [x] Unsaved clears are local. Unticking a saved undated row deletes it and
  offers Undo. Dated and partial-credit legacy rows cannot be cleared here.
  Multiple legacy rows remain untouched/read-only.
- [x] Errors retain unsaved drafts and truthfully identify
  persisted versus unsaved changes; cache invalidates after successful writes.
- [x] Shared-router dirty guards, keyboard controls, responsive local scrolling
  and two-student isolation are covered by mocked UI checks.

### Verification plan

- `node tools/p001/test-ui.mjs`: 34 PASS. Mocked-browser cases cover profile
  routing, one-row autosave/reload/PUT/DELETE/Undo, rollback, optional
  grade/remarks details, modal discard/failure, legacy statuses/duplicates,
  two-student isolation, keyboard navigation, and responsive scrolling.
- `node tools/integration/test-ui.mjs`: 19 PASS, including dirty-guard routing,
  shared navigation, cache persistence, access checks and responsive shell.
- `node node_modules/typescript/bin/tsc -p tsconfig.p001.json`: PASS.
- Focused ESLint for RecordsPage, SubjectRecordsTable and affected UI harnesses:
  PASS (0 warnings).
- `vite build --config vite.p001.config.ts`: PASS; P001 Worker esbuild bundle:
  PASS.
- Mocked DEMO screenshots are at `.wrangler/p001-review/records-desktop.png`
  and `.wrangler/p001-review/records-mobile.png`; both were visually inspected.
- No database test or live DB access is planned.

### Risks / assumptions / rollback

- Legacy subjects with multiple records cannot be safely represented by one
  checkbox. Show a reconciliation notice, disable mutation for those subjects,
  and preserve all rows.
- Undo recreates undated records with a new ID and preserved outcome, grade and
  remarks. The UI blocks clearing dated rows and legacy partial-credit exemptions
  because current POST semantics cannot restore their old semester/credit values.
- Roll back only the RecordsPage/UI test changes. No migration or production
  data rollback is involved.

## 2. Implementation

- **Status:** IMPLEMENTED; coordinator reviewed
- **Files changed for this mini-task:** `apps/web/src/features/records/RecordsPage.tsx`,
  `apps/web/src/features/records/SubjectRecordsTable.tsx`,
  `apps/web/src/features/records/subject-records-table.css`,
  `tools/p001/test-ui.mjs`, `tools/integration/test-ui.mjs`,
  `docs/p001-sprint1-handoff.md`, and this change record.
- **Summary:** Replaced attempt-entry UI with one current outcome per student and
  subject; Taken/Exempted checkbox changes autosave without opening a modal.
  The optional eye modal edits grade/remarks, and undated clears offer Undo.
  Legacy statuses and duplicates remain intact. Core,
  Computer Science Electives, Elective Umum requirement subgroups and Other use
  the accepted metadata contract.
- **Decisions / deviations from plan:** Implemented latest user steering:
  checkboxes autosave and never open a modal/prompt; there is no Action column;
  Exempted uses full configured subject credits and details are optional. Dated
  and partial-credit legacy rows cannot be cleared because Undo cannot faithfully
  restore their metadata.
- **Migrations / env / shared contracts:** None in this mini-task. Consumes the
  separately reviewed P001-007 `subjectGroups`, `subjectCategory`, and
  `isCompulsory` contract. No live database access/writes.

## 3. Review

- **Self-review checklist:** Passed; coordinator reviewed this implementation
  and the related P001 minis. Human peer review pending.
- **Test evidence:** The initial P001 and integration checks are listed above.
  Final session checks: latest `node tools/p001/test-ui.mjs` PASS, 34 mocked
  browser checks including the toast behavior added in S1-P001-010. The
  integration browser suite passed 24 checks before the toast update. Root unit
  suite PASS (260 passed, 13 optional database checks skipped); generator suite
  PASS (6); root typecheck/lint and API/frontend builds passed as reported by the
  implementation workers. A first toast-focused P001 run transiently failed an
  existing Exempted checkbox click; an immediate rerun passed all 34 checks.
  `git diff --check` passes with only LF-to-CRLF notices. No live database test
  or write was performed.
- **Manual checks:** Inspected generated mocked desktop and mobile screenshots;
  no real student data was used. Real-account acceptance remains pending.
- **Defects found and fixes:** None reported yet.
- **Review outcome:** PASS — SELF-REVIEW; coordinator review accepted. Human peer
  review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-27
- **Type:** Changed; Tests
- **Added / Changed / Fixed / Removed:** Replaced the attempt-entry page with
  curriculum-grouped subject outcome tables, checkbox autosave, optional modal
  details, and safe clear/Undo. Related toast presentation is tracked in
  S1-P001-010.
- **Affected routes / tables / consumers:** Expected P001 records page; API
  routes/contracts are consumed unchanged.
- **Breaking changes / migration steps:** None planned.
- **Verification summary:** P001 browser suite 34 PASS including toast behavior;
  integration browser suite 24 PASS before toast; root unit 260 PASS / 13
  optional DB skips; generator 6 PASS; reported typecheck/lint/build checks
  passed; `git diff --check` passed.
- **Outstanding blockers / follow-up:** None known for this bounded UI task;
  legacy duplicates stay read-only for future reconciliation.
- **Final status:** READY_FOR_REVIEW — coordinator-reviewed; human peer review
  pending.
