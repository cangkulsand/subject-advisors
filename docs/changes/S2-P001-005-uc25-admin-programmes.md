# S2-P001-005 — Admin Programmes and Curriculums (UC25 / FR-B9)

- **Status:** MERGED to `main` (2026-11-14); human peer review pending
- **Date:** 2026-11-14
- **Sprint:** Sprint 2
- **Owner:** P001 (UC25 / FR-B9); built by P004
- **Related UC / FR:** UC25 / FR-B9 (P001); builds on [S2-P004-025](S2-P004-025-department-hierarchy.md) (department level) and admin academic setup S2-P004-008; spec `docs/superpowers/specs/2026-11-14-uc25-admin-programmes-design.md`, plan `docs/superpowers/plans/2026-11-14-uc25-admin-programmes.md`
- **Branch / PR:** `feature/s2-uc25-admin-programmes`; merged into `main` on 2026-11-14 (merge commit f2926dd); no PR
- **Reviewer:** Pending

## 1. Plan

Problem: the admin could only list programmes and assign their department; programmes and curriculum versions could not be created, edited or retired from the application.

Decisions:
- A new admin **Programmes** page manages programmes and their curriculum versions: create, edit, deactivate/reactivate. Department assignment moves from the Departments page to this page.
- Deactivate only; no hard delete (records and picks reference programmes and curricula).
- A curriculum's programme is fixed after creation.
- A new programme needs an active department; legacy programmes without a department stay valid.
- Curriculum reactivation under an inactive programme is not blocked: the database guard fires only on insert or a programme change. Creating a curriculum under an inactive programme is rejected (`REFERENCE_INACTIVE`).
- Every change made under an admin actor context is audited in the append-only `academic_setup_audit_log`; importer writes without actor context stay unaudited.
- A CONFLICT (duplicate code or version) shows the generic catalogue message "The change conflicts with the current state. Reload and retry."

Out of scope: hard delete, moving a curriculum to another programme, subject-structure editing (the Programmes page links to the existing Curriculum page).

Rollback: revert the code; 0012 only sets NULL curriculum status to ACTIVE and replaces the audit/guard function bodies, so restore the 0010/0011 function bodies if needed. Audit rows stay (append-only).

## 2. Implementation

- **Migration `db/migrations/0012_programme_curriculum_admin.sql`** (no table or column added): sets NULL `curriculum.status` to ACTIVE; `db_academic_setup_audit()` now audits programme and curriculum INSERT/UPDATE made under an admin actor context (no context: unaudited, as for the importer); a guard rejects creating a curriculum under a programme whose status is not ACTIVE (`REFERENCE_INACTIVE`; NULL counts as ACTIVE). Static check `db/checks/017_programme_curriculum_admin.sql`; `manifest.json`, `db/engineering-extensions.json`, `tools/db/cli.mjs`, `tools/db/review.mjs`; `tools/db/migrations.test.mjs` (0012 test, 0011 test located by version).
- **Shared (`packages/shared/src/admin/academic-setup.ts`):** `Curriculum`, `ProgrammeFaculty.level/isActive`, create/update request types and four validators (create programme requires `level` and `departmentId`; update programme rejects `departmentId`; update curriculum rejects `programmeId`).
- **Admin API (`apps/api/src/modules/admin/`):** `POST /programmes`, `PATCH /programmes/{id}`, `GET`/`POST /curricula`, `PATCH /curricula/{id}` (contracts, repository, routes). Programme create is a single CTE statement (department must be active); updates use the shared patch helper with a read-back.
- **Admin web:** new `ProgrammesPage` (programme table with level, department, status; curriculum versions table; create/edit/deactivate dialogs sending only changed fields; link to the Curriculum page, which accepts `?curriculum=`); programme-department section removed from `DepartmentsPage`; nav item, route and title; `client.ts` methods and strict decoders.
- **Browser checks (`tools/admin/academic-fixtures.mjs`, `academic-ui-checks.mjs`):** fixtures for programmes and curricula (incl. a legacy programme, 409 CONFLICT, REFERENCE_INACTIVE); the programme-department check moved to `/admin/programmes`; new Programmes check with screenshots at 1440 and 375; Programmes added to loading/empty/forbidden route checks.
- **Docs:** `README.md` Sprint 2 table, `docs/database/migrations.md`.
- **Tests added:** validators (shared), routes and repository unit tests (API), client decoders (web), gated `academic-repository.database.test.ts` cases (not run, see Review).

## 3. Review

Evidence from the final verification on `feature/s2-uc25-admin-programmes`:

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 6 skipped; 1591 tests passed, 65 skipped (database suites skip without credentials)
- `npm run test:integration`: 11 tests, 11 pass, 0 fail (no database access)
- `npm run test:db-tooling`: 26 tests, 26 pass, 0 fail
- `npm run build`: pass
- `npm run check:cloudflare`: pass (wrangler dry run, nothing deployed or written)
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:admin`: PASS 50 administration browser checks (passed on 3 of 4 runs in this verification; the failed run stopped at the known flaky semesters check, `.admin-semester-current-row` count at `academic-ui-checks.mjs:156`, unchanged code; the responsive-navigation wait at `test-ui.mjs:282` is the other known flaky check)

Database evidence: migration 0012 was applied to the shared Neon development database on 2026-11-14; `db:verify` 45 checks PASS, 0 FAIL, pending []. A rollback-only controller smoke on that database passed 4/4: writes without actor context succeed with no audit row (importer path); with context, programme INSERT and UPDATE and curriculum INSERT are audited; a curriculum under an inactive programme raises `REFERENCE_INACTIVE`. No rows were left behind.

Not verified: the gated repository tests in `academic-repository.database.test.ts` were written but not run, because they need a loopback `utm_db_foundation_*_test` database through `ACADEMIC_TEST_DATABASE_URL`, which was not available. The controller smoke covers the trigger behaviour but not the repository SQL end to end. Curriculum reactivation under an inactive programme is not blocked (see Plan).

## 4. Changelog

- 2026-11-14 - Merged: `feature/s2-uc25-admin-programmes` into `main` (merge commit f2926dd). Checks before merge: typecheck, lint, unit tests (1591 passed, 65 skipped), integration 11/11, db-tooling 26/26, build, check:cloudflare, admin UI checks (50). Migration 0012 already applied to the Neon dev database. Status: MERGED; human peer review pending.
- 2026-11-14 - Type: Added. System Administrators manage programmes and curriculum versions on a new Programmes page (`/admin/programmes`): create, edit, deactivate and reactivate (no hard delete); a new programme needs an active department and department assignment moves here from the Departments page. API: `POST /api/admin/academic-setup/programmes`, `PATCH /api/admin/academic-setup/programmes/{id}`, `GET`/`POST /api/admin/academic-setup/curricula`, `PATCH /api/admin/academic-setup/curricula/{id}`. Changes made by an admin are recorded in the append-only academic audit; creating a curriculum under an inactive programme is rejected (migration 0012). Delivers P001's UC25 / FR-B9 programme maintenance. Compatibility: additive; NULL curriculum status becomes ACTIVE; `ProgrammeFaculty` gains `level` and `isActive`. Outstanding: run the gated repository database tests on a disposable database; human peer review.
