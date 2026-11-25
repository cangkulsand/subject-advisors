# S3-P004-037 — Intake year separate from the curriculum effective year

- **Status:** READY_FOR_REVIEW (branch `feature/intake-year`; migration 0016 not applied; not merged or deployed)
- **Date:** 2026-11-25
- **Sprint:** Sprint 3
- **Owner:** P004, delivering P001's (Aisa) review item; P001 should review the profile changes
- **Related UC / FR:** UC03 (profile, programme), M7 academic setup; review of 21 Nov 2026
- **Branch / PR:** `feature/intake-year`; no PR
- **Plan:** `docs/superpowers/plans/2026-11-24-curriculum-intake-choice.md`
- **Reviewer:** Pending

## 1. Plan

At the 21 November review Dr. Adila asked to "record the student intake year separately from the curriculum
effective year" and to "show how cohorts under the same program code, such as ECRH, can retain different
subjects and credit totals when a new curriculum is introduced." The profile stored only `curriculum_id`; a
programme's curriculum year stood in for the student's intake. Separately, on 2026-11-24 a new student could not
save the profile (Save greyed out) because SECRH had two active curricula and the page could not choose.

Owner decisions (2026-11-25): the student picks the intake year and the curriculum follows; existing students are
backfilled from their curriculum's effective year (each programme has one active curriculum today: SECJ "1" 2020,
SECRH "V1" 2022); cohorts are shown on the admin Programmes page and on the student profile. Out of scope:
reading the year from the matric number; batch correction; coordinator screens.

## 2. Implementation

- **Migration 0016** (`db/migrations/0016_student_intake_year.sql`, additive): `student_profile.intake_year smallint NULL`, CHECK 1990–2200; backfill `intake_year = curriculum.effective_year` where null and the year is in range (never writes `curriculum_id`; idempotent). Check `db/checks/020_student_intake_year.sql`; manifest, engineering extensions, `tools/db/cli.mjs`, `review.mjs`, `tools/admin/test-academic-database.mjs`, `tools/db/migrations.test.mjs` updated. Rollback: `ALTER TABLE public.student_profile DROP COLUMN intake_year;` (and revert the code).
- **Shared rule** (`packages/shared/src/profile/intake.ts`): `curriculumForIntake` picks the newest offered curriculum whose effective year is on or before the intake year; a tie, or none effective by then, lets the student choose; a single offered curriculum always wins. `curriculumLabel` ("V1 (from 2022)"), `intakeYearRange` (last 12 years).
- **Profile API** (`apps/api/src/modules/profile/`): options list curricula with `effectiveYear` and `totalCreditRequired`, only those with subjects, newest first. `PUT /api/profile` needs `intakeYear`: new profile → in range (`400 INVALID_INTAKE_YEAR`) and the curriculum must be allowed by the rule (`400 INVALID_CURRICULUM`); saved intake is locked (`409 PROFILE_INTAKE_LOCKED`); a null intake may be set once. Profile returns `intakeYear`.
- **Profile page** (`apps/web/src/features/profile/`): Programme → Intake year → curriculum shown read-only ("Curriculum: V1 (from 2022) · 131 credits") or a Curriculum select on a tie; saved profile shows "Intake 2022 · Curriculum V1 (from 2022) · 131 credits"; a null intake is asked once. Browser cache keys bumped so old options are not reused.
- **Admin Programmes page**: curricula carry `intakes` (students per intake year); the Curriculums table has a **Students by intake** column ("2022 intake: 225", "Not set: 3", "No students").
- **Admin account page**: `PATCH /api/admin/users/{id}/intake` `{ intakeYear, reason }` (SYSTEM_ADMIN; 404 no account/profile; 409 `UNCHANGED`) updates the intake year and writes `academic_setup_audit_log` (`student_intake`, `CHANGE_INTAKE_YEAR`, before/after) in one transaction; never changes the curriculum. StudentProgrammeCard shows the intake year and **Change intake year**.
- **API docs**: `docs/api/admin-academic-setup.openapi.json`, `docs/api/admin-users.openapi.json`.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2067 passed, 67 skipped |
| `npm run test:db-tooling` | 31 PASS |
| `npm run test:ui:admin` | 66 PASS (3 new) |
| `npm run test:ui:integration` | 81 PASS (setup at 375px, light and dark) |
| `node tools/p001/test-ui.mjs` | 7 new intake checks pass; the script stops at the pre-existing "saved grade editing … focus returns to the details opener" check, which fails the same way on `main` (checked 2026-11-25) |

- Not run: real-database tests of the new SQL (no database connection during development); covered by parse and binding tests.
- **Outcome:** PASS — SELF-REVIEW; peer review pending (P001 for the profile).

## 4. Rollout

1. Owner approves; apply 0016 to Neon (dev and prod share it) **before** deploying — the new code reads `intake_year`.
2. Check: SECJ students have 2020, SECRH students 2022; Programmes page shows "2020 intake: 149" and "2022 intake: 225".
3. Merge to main, push dev and prod.
4. When a new curriculum is introduced (e.g. SECRH V2 effective 2026): load its subjects, set it active; students with intake 2026 get V2, earlier cohorts keep V1 and its 131 credits.

## 5. Changelog

- **Date:** 2026-11-25 · **Type:** Added / Changed · **Owner:** P004 (for P001)
- **Actual changes:** students record their intake year and the curriculum follows it; admins see students per intake on each curriculum and correct an intake year with an audited reason; curricula without subjects are no longer offered at setup.
- **Compatibility/impact:** migration 0016 (additive, must precede the deploy); `PUT /api/profile` requires `intakeYear`; new `PATCH /api/admin/users/{id}/intake`; new error codes `INVALID_INTAKE_YEAR`, `PROFILE_INTAKE_LOCKED`, `UNCHANGED`.
- **Outstanding:** apply 0016; batch correction of programme and intake (separate review item).
- **Status:** READY_FOR_REVIEW
