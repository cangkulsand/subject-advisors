# S3-P004-038 — Nested academic structure screens

- **Status:** READY_FOR_REVIEW (branch `feature/nested-setup`; not merged or deployed)
- **Date:** 2026-11-26
- **Sprint:** Sprint 3
- **Owner:** P004, building P001's (Aisa) review item; to be handed over to Aisa
- **Related UC / FR:** M7 academic setup (UC25 admin programmes); review of 21 Nov 2026
- **Branch / PR:** `feature/nested-setup`; no PR
- **Design:** `docs/superpowers/specs/2026-11-26-nested-academic-structure-design.md`
- **Plan:** `docs/superpowers/plans/2026-11-26-nested-academic-structure.md`
- **Reviewer:** Pending

## 1. Plan

The 21 November review asked to "nest setup screens as Faculty → Department → Program → Curriculum. Show only the
records under the selected parent and replace technical duplicate-code errors with plain language."

**Before this change:**
- **Three flat pages:** Faculties, Departments and Programmes were three menu pages that each listed everything.
- **Every curriculum on one page:** the Programmes page listed all curricula of all programmes.
- **Unclear duplicate error:** a reused code showed "The change conflicts with the current state. Reload and retry."

**Owner decision (2026-11-26):** one drill-down page with a breadcrumb, chosen over parent filters on the three pages.

**Out of scope:**
- **Subjects screen:** Subjects & Prerequisites (P001's screen) is unchanged.
- **Other pages unchanged:** learning centres, coordinator assignments and semesters.
- **Other people's items:** coordinator faculty scope and subject removal.

## 2. Implementation

**API** (`apps/api/src/modules/admin/academic-errors.ts`, `packages/shared/src/admin/academic-setup.ts`):
- **Reused codes:** a reused code now returns 409 with a plain message, by unique constraint:

| Constraint | Code |
| --- | --- |
| `faculty_faculty_code_key` | `FACULTY_CODE_TAKEN` |
| `department_department_code_key` | `DEPARTMENT_CODE_TAKEN` |
| `programme_programme_code_key` | `PROGRAMME_CODE_TAKEN` |
| `learning_centre_centre_code_key` | `CENTRE_CODE_TAKEN` |
| `curriculum_rule_1` | `CURRICULUM_VERSION_TAKEN` |

- **Other conflicts:** any other unique violation stays `CONFLICT`.
- **Unchanged:** no database change; reads are unchanged.

**Helpers** (`apps/web/src/features/admin/academic-structure.ts`, pure):
- **Addresses:** reads and builds `/admin/faculties[/{f}[/departments/{d}[/programmes/{p}]]]`.
- **Levels:** `resolveStructure` returns only the open parent's children. A child under a different parent is "missing", never shown under the wrong parent.
- **Counts and orphans:** child counts, and the list of programmes with no department.
- **Reused codes:** the lookup is an exact match after trimming, because the unique columns are case-sensitive.
- **Move error:** the plain message for a blocked move.

**Page** (`AcademicStructurePage.tsx`, `StructureDialogs.tsx`):
- **Menu and redirects:** **Academic Structure** replaces three menu links. `/admin/departments` and `/admin/programmes` redirect to `/admin/faculties`.
- **Each level:** breadcrumb (Faculties › FC › SECJ › SECRH), the open record's summary with Edit and Deactivate/Reactivate, then its children's table with counts.
- **Add:** fills in the parent. Under an inactive parent it is disabled, with "Reactivate this … to add …".
- **Moving a department:** a department's Edit still changes its faculty, and when it is the open record the page follows it to its new address.
- **Move:**
  - The old "Department" action becomes **Move**.
  - Choices: active departments of active faculties, with no "None".
  - Result: "Moved X to Y.", or the page follows the open programme.
  - A live coordinator assignment that blocks a move to another faculty reads: "X has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty."
- **No-department list:** programmes with no department are listed on the Faculties page with Move.
- **Not-found page:** an out-of-date or mismatched address shows "This record is not here any more." with a link back.
- **Duplicate check before saving:** faculty, department, programme and centre codes, and the curriculum version within its programme, e.g. "DOTHER is already used by Fictional other department. Choose a different code."
- **Learning Centres page:** `ReferenceSetupPage` now serves learning centres only and uses the same duplicate check. `DepartmentsPage.tsx` and `ProgrammesPage.tsx` were removed.

**Tests:**
- **Helper unit tests:** `academic-structure.test.ts`.
- **API mapping tests:** `academic-repository.test.ts`.
- **Admin browser checks** (`tools/admin/academic-ui-checks.mjs`): 8 new, replacing the old department/programme page checks.
- **Layout checks:** at 320, 375 and 768px for every level.
- **Local filter:** `ADMIN_CHECK=<text>` runs only the matching admin checks locally.

**API docs:** `docs/api/admin-academic-setup.openapi.json` lists the new codes.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2087 passed, 67 skipped |
| `npm run test:db-tooling` | 31 PASS |
| `npm run test:ui:admin` | 69 PASS (8 new Academic Structure checks) |
| `npm run test:ui:integration` | 81 PASS |

- **Outcome:** PASS — SELF-REVIEW plus a whole-branch review (see the review section below once done); P001 review pending.
- **Known, pre-existing:** the reason counter (`<small>`) in setup dialogs renders at 11.67px, under the readability guard's 12px. It was not changed here.

## 4. Handover to Aisa

**Where things live:**
- **Page:** `AcademicStructurePage.tsx`, which holds the levels, breadcrumb, summary and no-department list.
- **Dialogs:** `StructureDialogs.tsx`, which holds every add, edit and deactivate dialog plus `ProgrammeMoveDialog`.
- **Rules:** `academic-structure.ts`, the pure rules, with unit tests.

**Data and tests:**
- **Data loading:** the page reads the four existing lists once and filters in the browser, which is fine at today's size: 4 faculties, 4 departments, 4 programmes.
- **Browser checks:** the drill-down checks are in `tools/admin/academic-ui-checks.mjs` ("academic structure: …").

**Still open:**
- **Batch correction:** batch correction of programme and intake.
- **Subjects screen:** nesting Subjects & Prerequisites under the curriculum level. Today each curriculum links to it.
- **Faculty scope:** coordinator faculty scope (Idham).

## 5. Changelog

- **Date:** 2026-11-26 · **Type:** Changed · **Owner:** P004 (for P001)
- **Actual changes:** admins set up the academic structure on one drill-down page: Faculty → Department → Programme → Curriculum. Each level shows only its parent's records, programmes move between departments, and reused codes give plain messages.
- **Compatibility/impact:**
  - **Old addresses:** `/admin/departments` and `/admin/programmes` redirect.
  - **Menu:** it has one Academic Structure link instead of three.
  - **API:** 5 new 409 error codes replace `CONFLICT` for reused codes.
  - **Unchanged:** no migration.
- **Status:** READY_FOR_REVIEW
