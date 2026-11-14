# S2-P004-025 — Department level in the admin Academic Setup (Faculty → Department → Programme)

- **Status:** MERGED to `main` (2026-11-14); human peer review pending
- **Date:** 2026-11-11
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4 (admin academic setup), delivering the Department part of P001's UC25 / FR-B9
- **Related UC / FR:** UC25 / FR-B9 (P001); admin academic setup S2-P004-008
- **Branch / PR:** `feature/s2-department-programme-lock` (also handed off as ZIP); merged via `feature/s2-continue` into `main` on 2026-11-14; no PR
- **Reviewer:** Pending

## 1. Plan

Problem: P001 needs a Department level between faculty and programme. The admin Academic Setup only knew Faculty and Programme (`programme.faculty_id`).

Product owner decisions applied:
- Department has code, name, active flag and exactly one faculty. SYSTEM_ADMIN creates, edits and deactivates/reactivates it with the same rules as faculties (soft deactivation, required reason, append-only audit).
- Programmes are linked to a department (nullable during setup). Assigning a department sets `programme.faculty_id` to that department's faculty in the same statement. `programme.faculty_id` stays, so coordinator scope (faculty + programme + learning centre) is unchanged.
- The database guarantees that a programme with a department always has its department's faculty, including when a department moves to another faculty. Decision: moving a department that still has programmes is **rejected** (not cascaded) with `DEPARTMENT_HAS_PROGRAMMES`.
- Assigning an inactive department is rejected (`REFERENCE_INACTIVE`), like inactive faculties.
- The admin UI and API assign programmes by department; the direct programme→faculty assignment (`PATCH /programmes/{id}/faculty`, Faculties page table) is replaced. Existing programmes with a faculty but no department keep that faculty until a department is assigned. No department data is invented or seeded.

Out of scope: the P001 student-facing use of Department, seeding, applying migration 0010 anywhere. Rollback: additive; drop `programme.department_id`, the new triggers/functions and `department` before any data depends on them (and restore the 0008 audit function and `academic_programme_audit` trigger).

## 2. Implementation

- **Migration `db/migrations/0010_department.sql`** (additive, not applied anywhere): table `department` (`department_code` unique, name, `faculty_id` NOT NULL FK RESTRICT, `is_active`); nullable `programme.department_id` FK RESTRICT. `db_academic_setup_audit()` is replaced (adds `department` and also audits programme `department_id` changes, one row per programme change) and `academic_programme_audit` is recreated on `faculty_id, department_id`. `db_academic_department_guard()` (BEFORE INSERT/UPDATE OF faculty_id on `department`): the faculty must be active; a department with programmes cannot move faculty (it first takes `FOR UPDATE` on its own row so concurrent programme links, which hold `FOR SHARE`, finish before the programme check). `db_academic_programme_department_guard()` (BEFORE INSERT/UPDATE OF department_id, faculty_id on `programme`): the department must exist, be active when newly assigned, and `programme.faculty_id` must equal the department faculty (`PROGRAMME_FACULTY_MISMATCH`). Context, audit and delete-rejection triggers mirror `faculty`. `REVOKE ALL` / `REVOKE EXECUTE` from PUBLIC. Errors use `RAISE EXCEPTION ... ERRCODE='23514'` (no cast guards).
- **DB tooling:** `manifest.json` (0010, checksum computed by the loader), `db/engineering-extensions.json` (0010 entry; required by the schema review gate), `db/checks/015_department.sql` (new, 15 structural assertions) added to `tools/db/cli.mjs` verify and `tools/db/review.mjs`; `db/checks/001_schema_verification.sql` (source FK count 45 → 46 for `programme.department_id`, programme column inventory +1) and `db/checks/005_multi_role_access.sql` (public tables 39 → 40); `tools/db/migrations.test.mjs` (versions to 0010, extension columns 25, new `0010 follows the exact 0009 prefix ...` test, 0009 test made position-independent).
- **Shared:** `packages/shared/src/admin/academic-setup.ts` (+ test): `Department`, `CreateDepartmentRequest`, `UpdateDepartmentRequest`, `SetProgrammeDepartmentRequest` and validators; `ProgrammeFaculty` gains `departmentId` / `department`; `SetProgrammeFacultyRequest` removed; error code `DEPARTMENT_HAS_PROGRAMMES`.
- **API:** `academic-contracts.ts`, `academic-repository.ts` (`listDepartments`, `createDepartment`, `updateDepartment`, `setProgrammeDepartment`; the programme faculty is derived in the same UPDATE; clearing the department clears the faculty only if the programme had a department, so a legacy faculty-only programme is not wiped), `academic-routes.ts` (`GET|POST /departments`, `PATCH /departments/{id}`, `PATCH /programmes/{id}/department`; `/programmes/{id}/faculty` removed), `academic-errors.ts` (409 message). Tests: `academic-routes.test.ts`, `academic-repository.test.ts`, `scope-provider.test.ts` (type), `academic-repository.database.test.ts` (new department cases; skips without `ACADEMIC_TEST_DATABASE_URL`).
- **Web:** new Departments page `DepartmentsPage.tsx` at `/admin/departments` (menu entry under Academic setup): departments table (add/edit/deactivate/reactivate with reason) and a "Programme departments" table with an Assign department dialog that previews the derived faculty. The programme table moved out of `ReferenceSetupPage.tsx` (Faculties). `academic-client.ts` (+ test) gains `departments`, `createDepartment`, `updateDepartment`, `setProgrammeDepartment`; response decoder validates department fields.
- **Browser harness:** `tools/admin/academic-fixtures.mjs` (departments, derived faculty, rules), `tools/admin/academic-ui-checks.mjs` (Departments loading/failure/empty/forbidden, department create/edit/move-rejected/deactivate checks, programme→department assignment check replacing the old programme-faculty check). The shared table toolbar is not needed: these tables have no search, filter or sort.
- **Concurrency harness:** `tools/admin/academic-database-races.mjs` gains department link/move/deactivation races; `tools/admin/test-academic-database.mjs` runs `015_department.sql`. Neither was run.
- **Docs:** `docs/api/admin-academic-setup.openapi.json` (department paths/schemas, programme department fields, error code; the file was re-serialized with standard 2-space JSON, so its diff is large), `docs/database/data-contracts.md`, `docs/database/migrations.md`, `README.md`.
- **Design notes:** department code is globally unique (like faculty code). Faculty deactivation does not cascade to departments or programmes (same as today). A faculty-only legacy programme cannot have its faculty cleared through the UI any more (assign a department instead).

## 3. Review

- `npm.cmd run typecheck`: pass
- `npm.cmd run lint`: pass (0 warnings); `npm.cmd run lint:db`: pass
- `npm.cmd test`: 68 files passed, 5 skipped; 1438 tests passed, 58 skipped (database suites skip without credentials)
- `npm.cmd run test:db-tooling`: 24 tests, 24 pass, 0 fail
- `npm.cmd run test:ui:admin`: 47 administration browser checks passed
- `npm.cmd run test:ui:coordinator`: 47 coordinator browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed

Not verified: migration 0010 was not applied to any database. `db/checks/015`, the edited 001/005 checks, the PL/pgSQL guards, the PostgreSQL repository tests and the race harness were not executed (no database was used); they are only parsed by the static schema review and type-checked. Reviewers should run `db:migrate` then `db:verify` on a disposable database before applying to shared development (0010 must follow 0009 in the applied prefix).

## 4. Changelog

- 2026-11-11 - Type: Added. Department level between faculty and programme in the admin Academic Setup (migration 0010, `/api/admin/academic-setup/departments`, `/admin/departments`); programmes are assigned by department and their faculty follows from it, enforced in PostgreSQL. Delivers the Department part of P001's UC25 / FR-B9. Compatibility: additive; existing programme faculty links are kept until a department is assigned; the endpoint `PATCH /programmes/{id}/faculty` and `setProgrammeFaculty` were removed in favour of `.../department`. Outstanding: apply and verify 0010 on a database.
- 2026-11-14 - Merged: `feature/s2-continue` into `main` (merge commit 4d7c0b8) together with S2-P004-025/026 and S2-P001-003/004. Checks before merge: typecheck, lint, unit tests (1480 passed, 63 skipped). Status: MERGED; human peer review pending.
