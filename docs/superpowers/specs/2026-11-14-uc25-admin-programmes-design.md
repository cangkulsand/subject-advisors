# UC25 admin Programmes and Curriculums — design

- Date: 2026-11-14
- Change record: S2-P001-005 (UC25 / FR-B9, owner P001, built by P004)
- Approved by the project owner in conversation on 2026-11-14

## Intent

UC25 (SRS v2.3 §2.2.25) asks for admin maintenance of the Faculty → Department →
Programme → Curriculum → CurriculumSubject → Subject skeleton. Faculties
(S2-P004-008), departments (S2-P004-025) and curriculum subjects (UC24,
S2-P003-005/006) have screens. Programmes and curriculum versions exist only as
seeded data (SECJ, SECRH, one curriculum each). This change adds the missing
admin screen so the whole chain is maintainable in the app.

## Goals

- `/admin/programmes` page, in the "Academic setup" menu after Departments.
- Programmes: list, add, edit (code, name, level, department), deactivate/reactivate.
  Faculty is shown, derived from the department. The "Programme departments"
  section moves here from the Departments page.
- Curriculums: list (programme, version, total credits, effective year, status,
  subject count), add, edit, deactivate/reactivate, and a "Subjects" link that opens
  UC24 `/admin/curriculum` for that curriculum.
- Data: keep all current rows. Migration 0012 sets the one curriculum with a NULL
  status to `ACTIVE` (`UPDATE ... WHERE status IS NULL`); nothing else changes.

## Non-goals

- Hard delete (SRS allows it for unreferenced rows; omitted to match faculty and
  department, which only deactivate).
- New schema columns, constraints or seeded institutional data.
- Subject creation/maintenance (UC24 / UC06 own it).

## Anti-goals

- Deactivating a programme or curriculum must never move, clear or break students
  already on it (SRS UC25 business rule 5). It only stops new assignments, which
  0011 already enforces (`coalesce(upper(status),'ACTIVE')='ACTIVE'`).
- No invented institutional records.

## Constraints

- Follow the existing admin academic-setup pattern: `SetupCard` / `SetupTable` /
  `SetupForm`, required reason, audited writes, `SYSTEM_ADMIN` only,
  `apps/web/src/app/typography.css` tokens and `assertReadable` in UI tests.
- Statuses written by this screen: `ACTIVE` / `INACTIVE`.
- Migration 0012 goes through `db/migrations/manifest.json` and the gated runner;
  0000–0011 are not edited.

## Approaches

1. **One Programmes page with two tables (chosen).** Programmes and their
   curriculum versions sit together, mirroring how Departments holds the
   department table plus programme assignments.
2. Separate `/admin/programmes` and `/admin/curricula` pages: more navigation for
   two small tables.
3. Extend UC24 `/admin/curriculum` with programme/curriculum editing: mixes P003's
   subject workspace with structure maintenance.

## Decided calls

- Editing a curriculum's total credits is allowed with a reason and an audit entry
  (corrections), even when students are on it.
- A programme needs an active department when created; existing programmes without
  one stay valid.
- Left to the builder: API route shapes (follow `academic-routes.ts`), error codes
  (reuse `academic-errors.ts` where they fit), test layout.
