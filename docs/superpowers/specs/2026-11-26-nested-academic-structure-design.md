# Nested academic structure screens (S3-P004-038) — Design

- **Date:** 2026-11-26 · **Owner:** P004, building Aisa's (P001) review item, to be handed to her afterwards
- **Source:** Academic System Project Review, 21 Nov 2026: "Nest setup screens as Faculty → Department → Program → Curriculum. Show only the records under the selected parent and replace technical duplicate-code errors with plain language."
- **Branch:** `feature/nested-setup`

## Intent

A System Admin should see the academic structure the way the university runs it. You pick a faculty and see only its
departments, pick a department and see only its programmes, pick a programme and see only its curricula. Today
Faculties, Departments and Programmes are three separate menu pages that each list everything, and the Programmes page
lists every curriculum of every programme. Dr. Adila also asked that a reused code give a plain message. Today it shows
"The change conflicts with the current state. Reload and retry."

## Goals

1. **One drill-down screen** replaces the Faculties, Departments and Programmes menu pages: Faculty → Department → Programme → Curriculum.
2. **Each level shows only the children** of the selected parent.
3. **"Add" at a level fills in the parent:** adding a department under FC never asks for the faculty.
4. **Plain duplicate messages:** reusing a code names the code and the record that already has it.

## Non-goals

- **No database or migration change:** the data is already a hierarchy (`department.faculty_id`, `programme.department_id`/`faculty_id`, `curriculum.programme_id`).
- **Curriculum subjects:** the Subjects & Prerequisites screen (menu label; page title "Curriculum & Prerequisites", `/admin/curriculum`, P001's `p001-sprint2` code) is unchanged; each curriculum row links to it as today.
- **Other pages unchanged:** Learning Centres, Coordinator Assignments and Academic Semesters are not part of the hierarchy.
- **Out of scope:** coordinator faculty scope (Idham's item) and subject removal (Harraz's item).

## Anti-goals

- An admin loses an action they have today: edit, deactivate/reactivate, move a department to another faculty, move a programme to another department, add or edit a curriculum, or see "Students by intake".
- A record becomes unreachable, e.g. an inactive faculty's departments, or a programme with no department.
- The page breaks at 375px or fails the readability guard.

## Approaches considered

1. **One drill-down page with a breadcrumb (chosen by the owner).** It is the most literal reading of "nest", the address keeps your place, and Add can fill in the parent.
2. Keep the three pages and add parent filter dropdowns. Less work, but it filters rather than nests, which is a weaker answer to the review.
3. Four side-by-side columns (Finder style). Rejected: unusable at 375px.

## Design

### Addresses and menu

| Level | Address | Shows |
| --- | --- | --- |
| Faculties | `/admin/faculties` | all faculties |
| Faculty | `/admin/faculties/{facultyId}` | the faculty and its departments |
| Department | `/admin/faculties/{f}/departments/{departmentId}` | the department and its programmes |
| Programme | `/admin/faculties/{f}/departments/{d}/programmes/{programmeId}` | the programme and its curricula |

- **Menu:** the Academic setup group's three links (Faculties, Departments, Programmes) become one link, **Academic Structure** (faculty icon), active for every address above.
- **Old addresses:** `/admin/departments` and `/admin/programmes` redirect (replace) to `/admin/faculties`, so bookmarks still work.
- **Page title:** "Academic Structure". The breadcrumb under the heading reads `Faculties › FC › SECJ › SECRH`. Each part is a link except the current one, and it uses the record codes; the names show in the level's summary.
- **Bad addresses:** an unknown id, or a child that is not under the given parent (e.g. a stale address after a move), shows "This record is not here any more." with a link to Faculties. It never shows another parent's data.

### Each level

All lists come from the existing endpoints (`faculties`, `departments`, `programmes`, `curricula`) with inactive records included. Filtering happens in the browser; the data is small (4 faculties, 4 departments, 4 programmes today). No API change for reads.

- **Faculties (root):** table Code · Name · Departments (count, e.g. "2 departments") · Status · Actions (Edit, Deactivate/Reactivate). The code is a link that opens the level. Page action: **Add faculty**.
- **Faculty:** a summary line (code, name, status) with its Edit and Deactivate/Reactivate actions, then a **Departments** table: Code · Name · Programmes (count) · Status · Actions (Edit, Deactivate/Reactivate). Action: **Add department**, with no faculty field; the faculty is the current one.
- **Department:** summary with actions, then a **Programmes** table: Code · Name · Curricula (count) · Status · Actions (Edit, Move, Deactivate/Reactivate). Action: **Add programme**, with no department field.
- **Programme:** summary with actions, then the **Curriculums** table with today's columns (Version, Total credits, Effective year, Status, Subjects link, Students by intake, Actions). Action: **Add curriculum**, with no programme field.

**Moving records:**
- **Department to another faculty:** the department's Edit keeps its Faculty field. The existing rule still applies: a department with programmes cannot move (`DEPARTMENT_HAS_PROGRAMMES`).
- **Programme to another department:** the existing **Department** action is renamed **Move**. Choosing "None" is removed, because a programme without a department would drop out of the hierarchy. Every programme has a department today.
  - **API unchanged (builder's call, settled after the builder check):** removing "None" is a browser-only change. `PATCH /programmes/{id}/department` still accepts `departmentId: null` (shared validator and repository). The orphan notice below covers a programme cleared through the API.
  - **Choices offered:** active departments whose faculty is also active. An inactive faculty makes the database reject the move with `REFERENCE_INACTIVE`, so its departments are not offered.
  - **Known failure, plain wording (browser only, no new API code):**
    - **The block:** moving to a department in another faculty changes `programme.faculty_id`. The database blocks that while the programme has a live coordinator assignment, and returns `ASSIGNMENT_ACTIVE`.
    - **The wording:** in the Move dialog that error reads "<code> has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty."
    - **Other errors:** shown as today.
- **After a move:** if the moved record's own page is open, go to its new address. If it was moved from the parent's list, show "Moved SECJ to <new parent name>." and the row leaves the list.

**Inactive records:**
- They stay listed with an Inactive pill and can still be opened.
- Under an inactive parent the Add button is disabled, with the note "Reactivate this <faculty|department|programme> to add <children>." This matches today's forms, which only offer active parents.

**Orphans:**
- A programme with no department is not reachable through the hierarchy. The Faculties page shows a notice, "N programmes have no department", listing each one with a **Move** action. If every programme has a department, nothing shows.
- A department always has a faculty (NOT NULL), so it cannot be orphaned.

### Plain duplicate messages

**API:** `mapAcademicDatabaseError` maps 23505 by constraint name to new codes instead of `CONFLICT`. Messages are fixed, with no driver text:

| Constraint | Code | Message |
| --- | --- | --- |
| `faculty_faculty_code_key` | `FACULTY_CODE_TAKEN` | "Another faculty already uses this code. Choose a different code." |
| `department_department_code_key` | `DEPARTMENT_CODE_TAKEN` | "Another department already uses this code. Choose a different code." |
| `programme_programme_code_key` | `PROGRAMME_CODE_TAKEN` | "Another programme already uses this code. Choose a different code." |
| `learning_centre_centre_code_key` | `CENTRE_CODE_TAKEN` | "Another learning centre already uses this code. Choose a different code." |
| `curriculum_rule_1` | `CURRICULUM_VERSION_TAKEN` | "This programme already has a curriculum with this version. Choose a different version." |

- **Status and constraint names:** all of these are 409. The builder confirms the exact constraint names in the migrations (`programme` and `learning_centre` are created in `0001_initial_schema.sql`).
- **Unknown 23505:** stays `CONFLICT`.
- **Shared codes:** added to `ACADEMIC_SETUP_ERROR_CODES` and to `docs/api/admin-academic-setup.openapi.json`.

**Browser, before sending:**
- **Scope of the check:** the Save handler checks the loaded lists, inactive records included, by exact match after trimming, as the database does: the `UNIQUE` columns are case-sensitive, so "fc" and "FC" are different codes. Faculty, department, programme and centre codes are unique across the whole table; a curriculum version only within its programme.
- **When it matches another record**, the form shows, for example, "FC is already used by Faculty of Computing (inactive). Choose a different code." and nothing is sent.
- **Fallback:** the server message covers a race.


### Tests

- **API unit tests:** each constraint maps to its code; an unknown 23505 stays `CONFLICT`.
- **Web unit tests:** a helper that filters children and resolves an address into faculty, department and programme (or not found), plus the duplicate lookup.
- **`tools/admin/test-ui.mjs`:**
  - **Drill-down:** root → faculty → department → programme shows only that parent's children, the breadcrumb navigates back, and refresh and the Back button keep the place.
  - **Add:** Add department under a faculty sends that `facultyId` without asking.
  - **Moves:** a programme Move updates the lists.
  - **Errors and edge cases:** a duplicate code shows the plain message and sends no request; old addresses redirect; a stale or mismatched address shows not-found.
  - **Layout:** 375px with no horizontal scroll, light and dark, readability guard. The existing checks that visit `faculties`, `departments` and `programmes` are updated.

### Docs

- **Change record:** `docs/changes/S3-P004-038-nested-academic-structure.md`.
- **README:** a row.
- **API docs:** the OpenAPI error codes.
- **Handover:** a short note to Aisa in the change record.

## Calls settled after the builder check

- **Table toolbar not needed:** the AGENTS.md table-toolbar rule covers tables with search, filter or sort controls. These levels have none, because choosing a parent is navigation. The three current setup pages don't use the toolbar either.
- **Exact-match duplicate check:** codes are compared exactly after trimming, because the unique columns are case-sensitive.
- **Move:** the API still accepts a null department; Move offers only active departments in active faculties; the coordinator-assignment block gets a plain message in the browser.

## Left to the builder

- **Component split:** e.g. one `AcademicStructurePage` with a level component per depth, reusing `SetupCard`, `SetupTable`, `SetupForm` and `ReasonDialog`.
- **Wording** of empty states, e.g. "No departments in this faculty yet."
- **Summary layout:** a small description list or a single line.
