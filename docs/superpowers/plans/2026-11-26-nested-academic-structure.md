# Nested Academic Structure (S3-P004-038) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin Faculties, Departments and Programmes pages with one drill-down screen, Faculty → Department → Programme → Curriculum. Each level shows only the children of its parent, and reused codes give plain messages.

**Architecture:**
- **Data:** the browser loads the four existing setup lists (faculties, departments, programmes, curricula) once.
- **Levels:** it resolves the current level from the address `/admin/faculties[/{f}[/departments/{d}[/programmes/{p}]]]` with pure helpers, then renders one level component.
- **API:** the only change is mapping unique-constraint violations to five new error codes. No database change.

**Tech Stack:** React 18 + TypeScript (apps/web), Cloudflare Worker API (apps/api), shared contracts (packages/shared), Vitest, Playwright UI scripts (tools/admin).

**Spec:** `docs/superpowers/specs/2026-11-26-nested-academic-structure-design.md`

## Global Constraints

- **Branch:** `feature/nested-setup`.
- **Commits:** no AI co-author trailer. Stage explicit paths only; never stage `docs/System Documents/`.
- **UI readability:** follow "Typography and readability (mandatory)" in `docs/themeguide.md`. UI checks run the readability guard (`tools/ui/readability.mjs`), as the admin checks already do.
- **Layout:** 375px with no horizontal page scroll, light and dark.
- **Shared toolbar:** not used. These tables have no search, filter or sort controls; navigation is the filter (spec, "Calls settled").
- **No database or migration change.** Reads use the existing endpoints with inactive records included.
- **Duplicate check:** exact match after trimming; the database `UNIQUE` columns are case-sensitive.
- **Menu and title:** the menu label and page title are both "Academic Structure"; the menu link points to `/admin/faculties` with the `faculty` icon.
- **Breadcrumb:** the root crumb is "Faculties" and later crumbs use record codes, separated by `›`.

## Review Focus

1. **Stale address after a move:** a department or programme moved while its old address is open, or opened from history, must show the not-found message and never another parent's data. *Test: Task 2 `resolveStructure` mismatch cases; Task 3 UI "mismatched address".*
2. **Editing a record with its own code unchanged:** Save must not report the record as a duplicate of itself. *Test: Task 2 `findCodeOwner` with `exceptId`; Task 4 UI edit-unchanged-code.*
3. **Inactive parent:** its Add button is disabled with the note, but its children still list and open. *Test: Task 3 UI.*
4. **Programme with no department:** reachable only through the orphan notice on the Faculties page. Moving it into a department clears the notice. *Test: Task 4 UI with fixture `LEGACY`.*
5. **Moving a department to another faculty from its own page:** the browser goes to the new address. *Test: Task 3 UI.*

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/shared/src/admin/academic-setup.ts` | add 5 error codes to `ACADEMIC_SETUP_ERROR_CODES` |
| `apps/api/src/modules/admin/academic-errors.ts` | catalogue messages; map 23505 by constraint |
| `apps/api/src/modules/admin/academic-repository.test.ts` | mapping tests |
| `docs/api/admin-academic-setup.openapi.json` | error code enum |
| `apps/web/src/features/admin/academic-structure.ts` (new) | pure helpers: address parse/build, resolve level, counts, orphans, duplicate lookup, messages |
| `apps/web/src/features/admin/academic-structure.test.ts` (new) | unit tests for the helpers |
| `apps/web/src/features/admin/AcademicStructurePage.tsx` (new) | load data, breadcrumb, not-found, choose the level |
| `apps/web/src/features/admin/StructureLevels.tsx` (new) | `FacultiesLevel`, `FacultyLevel`, `DepartmentLevel`, `ProgrammeLevel`, `ProgrammeMoveDialog` |
| `apps/web/src/features/admin/AdminRoutes.tsx`, `AdminShell.tsx` | routes, redirects, menu |
| `apps/web/src/features/admin/ReferenceSetupPage.tsx` | drop the faculty branch (centres only); use the duplicate check |
| `apps/web/src/features/admin/DepartmentsPage.tsx`, `ProgrammesPage.tsx` | delete |
| `apps/web/src/features/admin/admin.css` | breadcrumb, summary, orphan notice styles |
| `tools/admin/academic-fixtures.mjs` | duplicate failures return the new codes |
| `tools/admin/academic-ui-checks.mjs`, `tools/admin/test-ui.mjs` | rewrite the department/programme checks for the drill-down |
| `docs/changes/S3-P004-038-nested-academic-structure.md`, `README.md` | change record, row |

---

### Task 1: Plain duplicate-code errors in the API

**Files:**
- Modify: `packages/shared/src/admin/academic-setup.ts:4-8`, `apps/api/src/modules/admin/academic-errors.ts`
- Test: `apps/api/src/modules/admin/academic-repository.test.ts`
- Docs: `docs/api/admin-academic-setup.openapi.json` (edit the error-code enum in place; do not re-serialise the file)

**Interfaces:**
- Produces: the codes `FACULTY_CODE_TAKEN`, `DEPARTMENT_CODE_TAKEN`, `PROGRAMME_CODE_TAKEN`, `CENTRE_CODE_TAKEN` and `CURRICULUM_VERSION_TAKEN` (all 409) in `AcademicSetupErrorCode`.

- [ ] **Step 1: Write the failing test.** Extend the existing `it.each` table at `academic-repository.test.ts:8-9`:
```ts
['23505', 'faculty_faculty_code_key', 'FACULTY_CODE_TAKEN'],
['23505', 'department_department_code_key', 'DEPARTMENT_CODE_TAKEN'],
['23505', 'programme_programme_code_key', 'PROGRAMME_CODE_TAKEN'],
['23505', 'learning_centre_centre_code_key', 'CENTRE_CODE_TAKEN'],
['23505', 'curriculum_rule_1', 'CURRICULUM_VERSION_TAKEN'],
['23505', 'some_other_key', 'CONFLICT'],
```
  - Replace the existing `faculty_faculty_code_key → CONFLICT` row and the `department_department_code_key` assertion at line 68.
  - Add one test that `mapAcademicDatabaseError({ code: '23505', constraint: 'programme_programme_code_key' })` has `status` 409 and `message` exactly "Another programme already uses this code. Choose a different code."
- [ ] **Step 2: Run it and see it fail.** `npx vitest run apps/api/src/modules/admin/academic-repository.test.ts` → FAIL (code is `CONFLICT`).
- [ ] **Step 3: Implement.**
  - Add the five codes to `ACADEMIC_SETUP_ERROR_CODES`.
  - In `academic-errors.ts`, add catalogue entries (status 409) with the spec's exact messages:
    - `FACULTY_CODE_TAKEN`: "Another faculty already uses this code. Choose a different code."
    - `DEPARTMENT_CODE_TAKEN`: "Another department already uses this code. Choose a different code."
    - `PROGRAMME_CODE_TAKEN`: "Another programme already uses this code. Choose a different code."
    - `CENTRE_CODE_TAKEN`: "Another learning centre already uses this code. Choose a different code."
    - `CURRICULUM_VERSION_TAKEN`: "This programme already has a curriculum with this version. Choose a different version."
  - Replace the 23505 branch with a `Record<string, AcademicSetupErrorCode>` lookup on `value.constraint`. Keep `coordinator_assignment_one_live_scope_idx → ASSIGNMENT_ACTIVE`; anything else falls back to `CONFLICT`.
  - Add the five codes to the OpenAPI error enum or enums wherever `DEPARTMENT_HAS_PROGRAMMES` appears.
- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run apps/api/src/modules/admin` → PASS. Then `npm run typecheck` → no errors. A switch over `AcademicSetupErrorCode` elsewhere may need the new members.
- [ ] **Step 5: Commit.** `git add packages/shared/src/admin/academic-setup.ts apps/api/src/modules/admin/academic-errors.ts apps/api/src/modules/admin/academic-repository.test.ts docs/api/admin-academic-setup.openapi.json && git commit -m "feat(admin): plain messages for reused faculty, department, programme, centre codes and curriculum versions (S3-P004-038)"`

### Task 2: Structure helpers

**Files:**
- Create: `apps/web/src/features/admin/academic-structure.ts`, `apps/web/src/features/admin/academic-structure.test.ts`

**Interfaces:**
- Consumes: `Faculty`, `Department`, `ProgrammeFaculty`, `Curriculum`, `LearningCentre` from `packages/shared/src/admin/academic-setup`, and `AdminApiError` from `./client`.
- Produces:
```ts
export type StructureAddress =
  | { level: 'faculties' }
  | { level: 'faculty'; facultyId: number }
  | { level: 'department'; facultyId: number; departmentId: number }
  | { level: 'programme'; facultyId: number; departmentId: number; programmeId: number };
export type StructureData = { faculties: Faculty[]; departments: Department[]; programmes: ProgrammeFaculty[]; curricula: Curriculum[] };
export type ResolvedStructure =
  | { level: 'faculties' }
  | { level: 'faculty'; faculty: Faculty; departments: Department[] }
  | { level: 'department'; faculty: Faculty; department: Department; programmes: ProgrammeFaculty[] }
  | { level: 'programme'; faculty: Faculty; department: Department; programme: ProgrammeFaculty; curricula: Curriculum[] }
  | { level: 'missing' };
export function parseStructurePath(pathname: string): StructureAddress | null; // null = not a structure path
export function structurePath(address: StructureAddress): string;
export function resolveStructure(address: StructureAddress, data: StructureData): ResolvedStructure;
export function departmentCount(facultyId: number, data: StructureData): number;
export function programmeCount(departmentId: number, data: StructureData): number;
export function curriculumCount(programmeId: number, data: StructureData): number;
export function orphanProgrammes(data: StructureData): ProgrammeFaculty[];
export type CodeOwner = { name: string; isActive: boolean };
export function findCodeOwner(kind: 'faculty' | 'department' | 'programme' | 'centre', code: string, rows: { faculties?: Faculty[]; departments?: Department[]; programmes?: ProgrammeFaculty[]; centres?: LearningCentre[] }, exceptId?: number): CodeOwner | null;
export function duplicateCodeMessage(code: string, owner: CodeOwner): string;
export function curriculumVersionTaken(programmeId: number, version: string, curricula: Curriculum[], exceptId?: number): boolean;
export function moveErrorText(error: unknown, programmeCode: string): string;
export function countLabel(count: number, one: string, many: string): string; // "1 programme", "2 programmes", "No programmes"
```

- [ ] **Step 1: Write the failing tests** in `academic-structure.test.ts`. Use a fixture with:
  - Faculties: FC (1, active) and OLD (2, inactive).
  - Departments: SECJ (1, faculty 1), ECRH (2, faculty 1), X (3, faculty 2).
  - Programmes: SECJ (1, dept 1), SECRH (2, dept 2), LEG (3, department null).
  - Curricula: (10, programme 2, "V1") and (11, programme 2, "V2").

  Assertions:
  - **`parseStructurePath`:**
    - `'/admin/faculties'` → `{level:'faculties'}`; a trailing slash gives the same.
    - `'/admin/faculties/1'` → faculty 1.
    - `'/admin/faculties/1/departments/2/programmes/2'` → programme level with all three ids.
    - `'/admin/faculties/x'`, `'/admin/faculties/1/programmes/2'`, `'/admin/faculties/0'` and `'/admin/faculties/1/departments'` → `null`. Ids must be positive integers ≤ 2147483647.
    - `'/admin/departments'` → `null`.
  - **`structurePath`:** round-trips every level above.
  - **`resolveStructure`:**
    - Faculty 1 → departments `[SECJ, ECRH]`, inactive included.
    - Department 2 under faculty 1 → programmes `[SECRH]`.
    - Programme 2 under 1/2 → curricula `[10, 11]`.
    - **Mismatches resolve to `{level:'missing'}`:** department 3 under faculty 1, programme 2 under department 1, and unknown faculty 9.
  - **`orphanProgrammes`:** → `[LEG]`.
  - **Counts:** `departmentCount(1)` = 2, `programmeCount(1)` = 1, `curriculumCount(2)` = 2.
  - **`countLabel`:** `(0,'programme','programmes')` → "No programmes"; `(1, …)` → "1 programme"; `(2, …)` → "2 programmes".
  - **`findCodeOwner`:**
    - `('faculty','OLD', …)` → `{name: <OLD's name>, isActive:false}`.
    - `('faculty','old', …)` → `null` (case-sensitive).
    - `('faculty',' FC ', …)` → FC (trimmed).
    - `('faculty','FC', …, 1)` → `null` (the record itself).
  - **`duplicateCodeMessage('FC', {name:'Faculty of Computing', isActive:false})`** → "FC is already used by Faculty of Computing (inactive). Choose a different code." When active, the " (inactive)" part is left out.
  - **`curriculumVersionTaken`:** `(2,'V1',…)` → true; `(2,'V1',…,10)` → false; `(1,'V1',…)` → false.
  - **`moveErrorText`:**
    - `new AdminApiError(409,'ASSIGNMENT_ACTIVE','x')` with `'SECJ'` → "SECJ has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty."
    - Any other `AdminApiError` → its message.
    - A non-API error → "The change could not be completed. Please retry." (the existing `errorText` fallback).
- [ ] **Step 2: Run them and see them fail.** `npx vitest run apps/web/src/features/admin/academic-structure.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the signatures above in `academic-structure.ts`. Use `errorText` from `./AdminUserManagement` for the fallback. Order children as the API returns them.
- [ ] **Step 4: Run them and see them pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add apps/web/src/features/admin/academic-structure.ts apps/web/src/features/admin/academic-structure.test.ts && git commit -m "feat(admin): helpers for the nested academic structure (S3-P004-038)"`

### Task 3: Drill-down page, routes and menu

**Files:**
- Create: `apps/web/src/features/admin/AcademicStructurePage.tsx`, `apps/web/src/features/admin/StructureLevels.tsx`
- Modify: `AdminRoutes.tsx`, `AdminShell.tsx:8`, `ReferenceSetupPage.tsx`, `admin.css`
- Delete: `DepartmentsPage.tsx`, `ProgrammesPage.tsx`, after moving their forms into the levels
- Test: `tools/admin/academic-ui-checks.mjs`, `tools/admin/test-ui.mjs`

**Interfaces:**
- Consumes: Task 2 helpers; `SetupCard`, `SetupTable`, `SetupForm`, `StatusPill`, `useSetupRead` and `checked` from `./academic-ui`; `ReasonDialog` from `./AdminUserManagement`; `curriculumIntakeLines` from `./intake-labels`; `AppLink` and `navigateApp` from `../../app/navigation`.
- Produces: `export function AcademicStructurePage({ client, pathname }: { client: AcademicSetupClient; pathname: string })`. Each level takes `{ client; data: StructureData; resolved; onSaved: (message: string) => void }`. The level components are exported from `StructureLevels.tsx`. Task 4 adds `ProgrammeMoveDialog` and the orphan notice into these levels.

**Page behaviour (from the spec):**
- **Page:** one `SetupCard`, title "Academic Structure". The description per level:
  - Root: "Faculties own departments; departments own programmes; programmes own curricula."
  - Faculty: "Departments in <faculty name>."
  - Department: "Programmes in <department name>."
  - Programme: "Curricula of <programme name>."
- **Page action:** Add faculty / Add department / Add programme / Add curriculum.
- **Breadcrumb:** under the heading: `<nav aria-label="Academic structure path">` with `AppLink` crumbs; the current crumb is plain text with `aria-current="page"`.
- **Summary:** below the root, a `<dl className="admin-structure-summary">` shows Code, Name and Status, with Edit and Deactivate/Reactivate buttons for the current record. Their accessible names follow the existing pattern, e.g. "Edit FC".
- **Tables:**
  - Root: Code (link), Name, Departments, Status, Actions.
  - Faculty: Code (link), Name, Programmes, Status, Actions (Edit, Deactivate/Reactivate).
  - Department: Code (link), Name, Curricula, Status, Actions (Edit, Move, Deactivate/Reactivate). Move is a placeholder until Task 4; in this task, keep today's department-assign dialog under the name Move.
  - Programme: today's Curriculums table, unchanged.
- **Empty states:** "No faculties configured.", "No departments in this faculty yet.", "No programmes in this department yet.", "No curricula for this programme yet."
- **Add forms:** no parent field; the parent id comes from the resolved level. Under an inactive parent the Add button is disabled. Below the heading: `<p role="note">Reactivate this faculty to add departments.</p>`, with department/programmes and programme/curricula likewise.
- **Department Edit:** keeps the Faculty field. After a successful faculty change while on that department's page, `navigateApp(structurePath(newAddress), { replace: true })`.
- **Not found:** `{level:'missing'}` shows `<p role="alert">This record is not here any more.</p>` and a link "Back to Faculties" (`/admin/faculties`).
- **After every save:** refresh the data and show the success line ("Academic setup saved.").
- **Routes:**
  - In `AdminRoutes.tsx`, any pathname for which `parseStructurePath` is not null renders `<AcademicStructurePage client={academic} pathname={pathname}/>` with title "Academic Structure".
  - `/admin/departments` and `/admin/programmes` render a `Redirect` that calls `navigateApp('/admin/faculties', { replace: true })` in an effect.
  - A path under `/admin/faculties/` that `parseStructurePath` rejects falls through to the existing "Page not found".
- **Menu:** in `AdminShell.tsx`, replace the Faculties, Departments and Programmes links with `{ href: '/admin/faculties', label: 'Academic Structure', icon: 'faculty' }`, in the Faculties position. Update the comment's page count ("seven" → "five").
- **`ReferenceSetupPage`:** remove the `kind` prop and the faculty branch; it serves centres only.

- [ ] **Step 1: Write the failing UI checks.** In `tools/admin/academic-ui-checks.mjs`:
  - **`routes` table:** drop `departments` and `programmes`, and change the `faculties` entry to title "Academic Structure", opener "Add faculty".
  - **Faculty create/edit check:** move it out of the centres/faculties loop into the drill-down check below.
  - **Delete** the "department: …" and "programme department: …" checks and the "programmes: create/edit/…" check. Replace them with these checks, using fixture data TEST faculty 1 → DEPT 1 → TEST programme 1 → curricula, and OTHER 2 → DOTHER 2:
    1. **`'academic structure: drill down shows only each parent\'s children, breadcrumb and history keep the place'`**
       - At `/admin/faculties`, the table has rows TEST and OTHER, and the TEST row shows "1 department".
       - Click the link `TEST` → URL `/admin/faculties/1`. The Departments table has DEPT and not DOTHER.
       - Click `DEPT` → `/admin/faculties/1/departments/1`. Programmes has TEST and not LEGACY.
       - Click `TEST` → `/admin/faculties/1/departments/1/programmes/1`. The Curriculums table has the rows of programme 1 only; the existing "Students by intake" assertions move here.
       - Breadcrumb texts are `['Faculties','TEST','DEPT','TEST']`. `page.goBack()` returns to the department level; `page.reload()` keeps the programme level.
       - Click the crumb "Faculties" → root.
    2. **`'academic structure: add at each level sends the parent without asking'`**
       - At faculty 1, open Add department: the dialog has no "Faculty" field. Save `NEWD` → body `{ departmentCode:'NEWD', departmentName:…, facultyId:1, reason }`, and the row appears.
       - At department 1, Add programme has no "Department" field and its body has `departmentId: 1`.
       - At programme 1, Add curriculum has no "Programme" field and its body has `programmeId: 1`.
       - Add faculty at the root still works, as in the old faculty check: focus, Escape, reason required, server failure kept in the dialog, edit, deactivate and reactivate.
    3. **`'academic structure: inactive parent disables add with a note; children still open'`**
       - Set faculty 1 inactive in the fixture. At faculty 1, the Add department button is disabled, the note "Reactivate this faculty to add departments." shows, and the DEPT link still opens.
    4. **`'academic structure: department moved to another faculty from its page follows it; mismatched and unknown addresses show not found'`**
       - Add department NEWD under faculty 1, open it, then Edit → Faculty `2` → Save. The URL becomes `/admin/faculties/2/departments/<id>`.
       - Go to `/admin/faculties/1/departments/2` (DOTHER belongs to faculty 2) → the alert "This record is not here any more." and a "Back to Faculties" link. No DOTHER data shows.
       - `/admin/faculties/99` → the same alert.
    5. **`'academic structure: old addresses redirect and the menu has one Academic Structure link'`**
       - `/admin/departments` and `/admin/programmes` end at `/admin/faculties`.
       - The navigation has the link "Academic Structure" and no "Departments" or "Programmes" links.
       - On `/admin/faculties/1/departments/1` the "Academic Structure" link has `aria-current="page"`.
  - **Responsive check** (`academic pages single card …`): add the levels `faculties/1`, `faculties/1/departments/1` and `faculties/1/departments/1/programmes/1` as `[path, 'Academic Structure', opener]` entries, so each gets the 320, 375 and 768 assertions.
  - **`test-ui.mjs:318`:** replace `'departments', 'programmes'` with `'faculties/1', 'faculties/1/departments/1', 'faculties/1/departments/1/programmes/1'`. Line 323's screenshot path becomes `/admin/faculties/1/departments/1/programmes/1`.
- [ ] **Step 2: Run them and see them fail.** `npm run test:ui:admin` → FAIL at the first new check (no "Academic Structure" heading).
- [ ] **Step 3: Implement** the page, levels, routes, menu and styles as described above.
  - **Styles in `admin.css`:** breadcrumb as an inline list with `›` separators; the summary `dl` as a two-column grid that collapses to one column under 600px. Use only the type tokens from `typography.css`.
- [ ] **Step 4: Run the checks and see them pass.** `npm run test:ui:admin` → `PASS … administration browser checks`, with every check passing. Then `npm run typecheck && npm run lint && npm test` → no errors.
- [ ] **Step 5: Commit.** `git add` the created, modified and deleted files listed above, then `git commit -m "feat(admin): Academic Structure drill-down replaces the Faculties, Departments and Programmes pages (S3-P004-038)"`

### Task 4: Move, orphans and plain duplicate messages in the browser

**Files:**
- Modify: `apps/web/src/features/admin/StructureLevels.tsx`, `ReferenceSetupPage.tsx`, `tools/admin/academic-fixtures.mjs`
- Test: `tools/admin/academic-ui-checks.mjs`

**Interfaces:**
- Consumes: Task 2 helpers (`findCodeOwner`, `duplicateCodeMessage`, `curriculumVersionTaken`, `moveErrorText`, `orphanProgrammes`) and Task 3's levels.
- Produces: `ProgrammeMoveDialog({ client, programme, data, onClose, onSaved })`.

**Behaviour:**
- **Move dialog:**
  - Title "Move programme · <code>"; the select is labelled "Department".
  - It offers only departments where `d.isActive` and the department's faculty is active, labelled `<department name> · <faculty name>`, with no "None" option.
  - The note keeps today's text "Faculty will be set to <faculty name>."
  - It sends `setProgrammeDepartment(id, { departmentId, reason })`.
  - On error it shows `moveErrorText(error, code)` inside the dialog.
  - On success the message is "Moved <code> to <department name>." If the moved programme's own page is open, it goes to the new address instead.
- **Orphan notice:** on the Faculties root, when `orphanProgrammes(data).length > 0`, a `<section aria-label="Programmes with no department">` above the table:
  - Text "<n> programme(s) have no department. Move each one into a department so it appears in the structure."
  - A list of `<code> · <name>`, each with a Move button (accessible name "Move <code>") that opens `ProgrammeMoveDialog`.
- **Duplicate pre-check:** in every create and edit form (faculty, department, programme, centre, and curriculum version), before calling the API:
  - `findCodeOwner(kind, value, rows, editingId)`. On a match, throw `new AdminApiError(409, 'INVALID_REQUEST', duplicateCodeMessage(code.trim(), owner))`; `SetupForm` shows it in the dialog.
  - For a curriculum version, use `curriculumVersionTaken`, with the message "This programme already has curriculum version <v>. Choose a different version."
- **Fixture:** the duplicate branches in `academic-fixtures.mjs` return the new codes and API messages (`FACULTY_CODE_TAKEN` etc.), instead of `CONFLICT`, for the server-fallback check.

- [ ] **Step 1: Write the failing UI checks:**
  1. **`'academic structure: move a programme between departments, plain message when a coordinator assignment blocks it'`**
     - At `/admin/faculties/1/departments/1`, click "Move TEST".
     - The options are `['Choose…', 'Fictional other department · Fictional other faculty']`; there is no None. DEPT is listed only if it is active; set the fixture so DEPT is active and a third inactive department is not offered.
     - Select `2` and Save → the alert "TEST has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty." (the fixture's active assignment).
     - End the fixture assignment, then Save → the row TEST leaves the list, the success text is "Moved TEST to Fictional other department.", and `data.programmes[0].departmentId === 2`.
  2. **`'academic structure: programmes with no department are listed on the root and can be moved in'`**
     - At `/admin/faculties`, the region "Programmes with no department" lists `LEGACY · Fictional legacy programme`.
     - "Move LEGACY" → department `1` → Save. The region is gone, and `/admin/faculties/1/departments/1` lists LEGACY.
  3. **`'academic structure: reused codes give plain messages before sending, own code is not a duplicate, server fallback'`**
     - At faculty 1, Add department with code `DOTHER` → the dialog alert "DOTHER is already used by Fictional other department. Choose a different code." No POST is recorded.
     - With `dother` → it is sent (case-sensitive).
     - Edit DEPT with the code unchanged and a new name → saves.
     - At programme 1, Add curriculum with version `2026` (the existing curriculum) → "This programme already has curriculum version 2026. Choose a different version."
     - Server fallback: set `state.mutationError = { status: 409, code: 'PROGRAMME_CODE_TAKEN', message: 'Another programme already uses this code. Choose a different code.' }`, add programme `NEWP` → that message shows in the dialog.
     - Learning centres: Add centre with an existing centre code → the plain message.
- [ ] **Step 2: Run them and see them fail.** `npm run test:ui:admin` → FAIL at check 1 (no "Move programme" dialog, or the None option is present).
- [ ] **Step 3: Implement** the behaviour above.
- [ ] **Step 4: Run them and see them pass.** `npm run test:ui:admin` → all pass. `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 5: Commit.** `git add apps/web/src/features/admin/StructureLevels.tsx apps/web/src/features/admin/ReferenceSetupPage.tsx tools/admin/academic-fixtures.mjs tools/admin/academic-ui-checks.mjs && git commit -m "feat(admin): move programmes, programmes without a department, plain duplicate messages (S3-P004-038)"`

### Task 5: Docs and full verification

**Files:**
- Create: `docs/changes/S3-P004-038-nested-academic-structure.md`
- Modify: `README.md` (Sprint 3 table row, same format as S3-P004-037)

- [ ] **Step 1: Write the change record** using the sections in `docs/implementationguide.md` (Plan, Implementation, Review, Changelog):
  - **Review:** a table with the real counts from Step 2.
  - **Compatibility:** the old URLs redirect; there are five new API error codes; there is no migration.
  - **Handover to Aisa:** the files, where each level lives, and what is left: the subjects screen is unchanged.
- [ ] **Step 2: Run the full verification.** `npm run typecheck && npm run lint && npm test && npm run test:db-tooling && npm run test:ui:admin && npm run test:ui:integration` → all pass. Record the counts.
- [ ] **Step 3: Commit.** `git add docs/changes/S3-P004-038-nested-academic-structure.md README.md docs/superpowers/plans/2026-11-26-nested-academic-structure.md && git commit -m "docs: S3-P004-038 change record and README row"`
