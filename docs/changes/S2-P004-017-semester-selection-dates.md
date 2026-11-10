# S2-P004-017 — Migration 0009, shared selection phase and admin semester selection dates

- **Status:** MERGED to `main` (2026-11-11); human peer review pending
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4 (admin Academic Semesters is an admin-module change)
- **Related UC / FR:** UC20 / UC23 simplified offering flow, task 1 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: the new coordinator flow needs admin-set selection dates per semester, a learning centre on the student profile, per-scope offering decisions with an append-only audit and pick withdrawals. This task lays the data and admin foundation only.

Approach:
- Migration `0009_simplified_offering_flow.sql` (additive): `academic_semester.selection_opens_at/selection_closes_at` plus window CHECK; `student_profile.learning_centre_id` (index; backfilled to the KL centre per product owner answer 2); tables `offering_decision`, `offering_decision_audit` (immutable), `offering_pick_withdrawal` (immutable). 0007 tables untouched.
- `db/checks/014_simplified_offering_flow.sql`, `verify` list in `tools/db/cli.mjs`, manifest and `tools/db/migrations.test.mjs`.
- Shared pure `selectionPhase(window, now)` (`PLANNING` / `OPEN` / `CLOSED`).
- Admin semester contract, validators, repository, OpenAPI and Semesters page gain `selectionOpensAt` / `selectionClosesAt`.

Acceptance: a close time without an open time, or not after it, is rejected (400 / `INVALID_REQUEST`); dates round-trip as UTC ISO; admin page edits and shows them; all suites below pass.

Out of scope: everything coordinator-facing and student-facing (Tasks 2-8). Migration is not applied to any database by the implementer. Rollback: the migration is additive; drop the new tables/columns before any data depends on them.

## 2. Implementation

- **Migration `db/migrations/0009_simplified_offering_flow.sql`** (additive; not applied to any database): `academic_semester.selection_opens_at/selection_closes_at` (nullable timestamptz) with `academic_semester_selection_window_rule`; `student_profile.learning_centre_id` (nullable FK, partial index) backfilled to the `KL` centre for every existing row (product owner answer 2); tables `offering_decision` (unique per programme + centre + semester + subject, status APPROVED/REMOVED, no row = Pending), `offering_decision_audit` and `offering_pick_withdrawal` (both immutable through `db_immutable` row and truncate triggers); `REVOKE ALL ... FROM PUBLIC`. 0007 tables are untouched.
- **DB tooling:** `manifest.json` (0009); `db/engineering-extensions.json` (0009 tables and 3 columns, required by the schema review gate); `db/checks/014_simplified_offering_flow.sql` plus the `verify` list in `tools/db/cli.mjs` and the check list in `tools/db/review.mjs`; `tools/db/migrations.test.mjs` (versions to 0009, new `0009 follows the exact 0008 prefix and stays additive`, 0008 test pinned to the first nine entries, extension column count 21 to 24).
- **Existing exact-inventory checks updated for the new columns:** `db/checks/001_schema_verification.sql` (student_profile +2, academic_semester +2 more) and `db/checks/004_profile_current_semester.sql` (student_profile 11 columns, 3 foreign keys). Without this `db:verify` would fail after 0009 is applied.
- **Shared:** `packages/shared/src/forecasting/selection-window.ts` (+ test, exported from the forecasting index): `selectionPhase`. `packages/shared/src/admin/academic-setup.ts` (+ test): `AcademicSemester` and `SemesterFields` gain `selectionOpensAt/selectionClosesAt`; ISO date-time or null validation; `'selectionClosesAt requires selectionOpensAt.'` and `'selectionClosesAt must be after selectionOpensAt.'` in `validateMergedSemester`, and the pair check in the request validator when both keys are supplied. The two fields are optional on create (absent means not scheduled).
- **API:** `academic-repository.ts` selects the two columns as UTC ISO text, inserts them on create and patches them through `semesterFields`; `academic-routes.test.ts` (PATCH row, 400 for a closing time before the opening time or a non-date); `academic-repository.database.test.ts` (new round-trip and rejection test; skips without `ACADEMIC_TEST_DATABASE_URL`); `docs/api/admin-academic-setup.openapi.json`.
- **Web:** `academic-ui.tsx` exports `toLocalInput` / `localToIso`; `SemestersPage.tsx` has "Selection opens" / "Selection closes" datetime-local fields, a "Selection" table column ("Not scheduled" or `opens to closes`) and the hint line; `academic-client.ts` decoder validates the new fields (and `academic-client.test.ts` fixtures).
- **Browser harness:** `tools/admin/academic-fixtures.mjs` (null selection fields), `tools/admin/test-ui.mjs` (new check, PATCH body asserted as ISO).
- **Deviation:** the plan's Step 9 asked `updateAcademicSemester` to read the stored row and run `validateMergedSemester` first. That breaks the existing, deliberate contract (`academic-repository.test.ts`: PATCH makes no read query and an empty patch throws synchronously; routes test "atomic repository validation"). The window is instead enforced atomically in PostgreSQL by `academic_semester_selection_window_rule` (23514 maps to `INVALID_REQUEST`), the same way the other merged semester invariants are, and `validateMergedSemester` stays available for callers that hold the row.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings); `npm run lint:db`: pass
- `npm test`: 68 files passed, 5 skipped; 1393 tests passed, 60 skipped (database suites skip without credentials)
- `npm run test:db-tooling`: 23 tests, 23 pass, 0 fail
- `node tools/admin/test-ui.mjs`: 45 administration browser checks passed (new selection-dates check included; `assertReadable` runs after every check)

Not verified: migration 0009, `db/checks/014`, the edited 001/004 checks and the PostgreSQL repository test were not run against a database (no credentials used, migration not applied).

**Applied to the development database (2026-11-10).**
- The UKM network blocks Postgres port 5432, so `tools/db/cli.mjs` could not connect (`ECONNRESET`). The user ran the same CLI logic through a temporary wrapper. The only change in the wrapper is the connection: it uses the Neon WebSocket driver over port 443. Target validation, the migration checksum and the `migration_meta.schema_migrations` record are unchanged.
- `status` showed pending `0009` only. `migrate` applied `0009`.
- The first `verify` runs exposed two pre-0009 count checks that had not been updated. The review fixed both:
  - `db/checks/001_schema_verification.sql`: source-table foreign keys 44 → 45 (`student_profile.learning_centre_id`);
  - `db/checks/005_multi_role_access.sql`: public tables 36 → 39 (the three 0009 tables).
- `verify` then passed: schema verification, admin user management, UC20, academic setup and all 12 `014_simplified_offering_flow.sql` checks.
- Neon project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, PostgreSQL 18.
- `npm run test:db-tooling` passes 23/23 after the check fixes.
- Follow-up (user request): `tools/db/cli.mjs` gains `--websocket` (Neon targets only), which runs the same commands over the Neon WebSocket driver. It replaces the temporary wrapper. A check-script error now also reports the check file and its message. Documented in `docs/database/migrations.md`.

## 4. Changelog

- 2026-11-10 - Type: Added. Migration 0009 (selection window on semesters, student learning centre backfilled to KL, offering decisions with immutable audit, pick withdrawals), shared `selectionPhase`, and admin Academic Semesters "Selection opens" / "Selection closes". Compatibility: additive; existing development confirmation data is not migrated; 0007 tables stay unused. Outstanding: apply 0009 with `npm run db:migrate` and run `npm run db:verify`; Tasks 2-8 consume these objects. Status: MERGED.
