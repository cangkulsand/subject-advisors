# Intake Year and Curriculum (S3-P004-037) Implementation Plan

> **For agentic workers:** implement task by task, TDD (failing test first), in the order given. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Record each student's **intake year** separately from the curriculum **effective year**, pick the curriculum from the intake year, and show cohorts side by side, so that students under one programme code (e.g. SECRH) keep their own curriculum's subjects and credit total when a newer curriculum is introduced. Also fixes the 2026-11-24 incident where Save stayed greyed out when a programme had more than one active curriculum.

**Source:** Academic System Project Review, 21 Nov 2026 (Aisa's item): "Record the student intake year separately from the curriculum effective year. Show how cohorts under the same program code, such as ECRH, can retain different subjects and credit totals when a new curriculum is introduced." Owner decisions, 2026-11-25: the student picks the intake year and the curriculum follows; existing students are backfilled from their curriculum's effective year (each programme has one active curriculum today); cohorts are shown on the admin Programmes page **and** on the student profile.

**Supersedes** the earlier version of this plan (curriculum choice only, no stored intake year).

## Live data (Neon, read 2026-11-25)

| Programme | Curriculum | Effective year | Status | Credits | Subjects | Students |
| --- | --- | --- | --- | --- | --- | --- |
| SECJ | 1 "1" | 2020 | ACTIVE | 131 | 78 | 149 |
| SECRH | 3 "V1" | 2022 | ACTIVE | 131 | 79 | 225 |
| SECRH | 8 "V2" | 2026 | INACTIVE | 120 | 0 | 0 |
| code_test1_prog | 7 "V1" | 2026 | INACTIVE | 128 | 3 | 0 |

## Design (binding)

1. **Schema (migration 0016, additive):** `student_profile.intake_year smallint NULL` with `CHECK (intake_year IS NULL OR intake_year BETWEEN 1990 AND 2200)`. Backfill in the same migration: `UPDATE student_profile p SET intake_year=c.effective_year FROM curriculum c WHERE c.curriculum_id=p.curriculum_id AND p.intake_year IS NULL AND c.effective_year IS NOT NULL`. It must not touch `curriculum_id` (existing triggers guard it) and must be idempotent. Rollback: `ALTER TABLE public.student_profile DROP COLUMN intake_year;`.
2. **Shared rule** `packages/shared/src/profile/intake.ts` (pure, used by API and web):
   - `curriculumForIntake(curricula: {curriculumId:number; curriculumVersion:string; effectiveYear:number|null}[], intakeYear:number): { curriculumId:number } | { choose: number[] }`. Among the given curricula of ONE programme, take those with `effectiveYear !== null && effectiveYear <= intakeYear`; the one with the greatest `effectiveYear` wins. If two or more share that greatest year → `{ choose: [their ids] }`. If none qualifies (all later or null year) → `{ choose: [all ids] }`. Exactly one curriculum offered → that one.
   - `curriculumLabel(c)` → `"V1 (from 2022)"`, or `"V1"` when `effectiveYear` is null.
   - `intakeYearRange(now: Date)` → `{ min: currentYear - 12, max: currentYear }` (UTC year).
3. **Profile options API** (`GET /api/profile/options`): each `CurriculumOption` gains `effectiveYear: number | null` and `totalCreditRequired: number`; only ACTIVE curricula of ACTIVE programmes **with at least one `curriculum_subject`** are offered, ordered `programme_code, effective_year DESC NULLS LAST, curriculum_version`. The cached shape validator (`isCurriculumOptionRows`, exact keys) is updated; an old cached entry fails validation and reloads (do not bump TTLs).
4. **Profile save API:** `ProfileInput` gains `intakeYear: number`. Saved `Profile` gains `intakeYear: number | null`.
   - **New profile:** `intakeYear` required, integer within `intakeYearRange(now)` else `400 INVALID_INTAKE_YEAR` ("Select your intake year."). The curriculum must have subjects and must be allowed by `curriculumForIntake` for that programme's offered curricula (the winner, or one of `choose`), else `400 INVALID_CURRICULUM` ("Select an available configured curriculum.").
   - **Existing profile:** intake year is locked like the programme. A different `intakeYear` from the saved non-null value → `409 PROFILE_INTAKE_LOCKED` ("Your intake year is set. Contact the admin to change it."). If the saved value is NULL (not backfilled), the student may set it once (any value in range). Re-saving the same values is unaffected; no curriculum re-check for existing profiles.
5. **Profile page (web, `apps/web/src/features/profile/`):**
   - New profile: under Programme, a required **Intake year** select ("Select your intake year", then years max→min). When programme and intake year are both chosen, apply `curriculumForIntake`: a single result is shown as read-only text "Curriculum: V1 (from 2022) · 131 credits"; a `choose` result shows a required **Curriculum** select with those options (`curriculumLabel` + " · N credits") and help text "Choose the curriculum you were admitted under. Only the admin can change it after you save." Changing programme or intake year clears a manual curriculum choice. Save stays disabled until a curriculum is resolved. Remove the old "This programme has multiple active configurations…" line.
   - Saved profile: programme and intake shown read-only as "Intake 2022 · Curriculum V1 · 131 credits" (intake "not set" when null, with the intake select available once). Saved curriculum is kept even if it is no longer offered.
6. **Admin Programmes page:** `GET /api/admin/academic-setup/curricula` rows gain `intakes: { intakeYear: number | null; students: number }[]` (students per intake year on that curriculum, ordered year desc, null last). The Curriculums table gets a **Students by intake** column, e.g. "2022 intake: 225", "Not set: 3", or "No students". Effective year, Total credits and Subjects columns already exist.
7. **Admin account page (StudentProgrammeCard):** shows the intake year; **Change intake year** opens the existing reason-dialog pattern; `PATCH /api/admin/users/{id}/intake` `{ intakeYear, reason }` (SYSTEM_ADMIN, range 1990–2200, unchanged value → 409 `UNCHANGED`), one transaction that updates `intake_year` and writes `academic_setup_audit_log` (`entity_type='student_intake'`, `action='CHANGE_INTAKE_YEAR'`, before/after) using the same trusted audit-context pattern as the programme change. It never changes the curriculum.
8. Not in scope: guessing the intake year from the matric number; batch updates (separate item); coordinator screens.

## Global constraints

- Follow `AGENTS.md` and `docs/implementationguide.md`. UI follows "Typography and readability (mandatory)" in `docs/themeguide.md`; UI tests run `tools/ui/readability.mjs`. 375px with no horizontal scroll, light and dark.
- Commits carry **no** AI co-author trailer. Stage explicit paths only; never stage `docs/System Documents/`.
- Work on branch `feature/intake-year`. Do **not** apply the migration to Neon (dev and prod share it) — the controller asks the owner first.
- Migration tooling to update for 0016 (follow how 0013 `graduation_confirmations` was added): `db/migrations/manifest.json`, `db/engineering-extensions.json`, a new `db/checks/020_student_intake_year.sql`, the `verify` list in `tools/db/cli.mjs`, `tools/db/review.mjs`, `tools/admin/test-academic-database.mjs` if it lists checks, and `tools/db/migrations.test.mjs`.

## Tasks

### Task 1 — Database, shared rule, profile API
- [ ] Failing tests: `packages/shared/src/profile/intake.test.ts` (winner, ties → choose, none ≤ intake → choose all, single curriculum, null years, labels, range); `apps/api/src/modules/profile/repository.test.ts` (options SQL has effective year, total credits, subjects EXISTS, order; validator rejects old shape; new-profile save: missing/out-of-range intake → `INVALID_INTAKE_YEAR`, curriculum not allowed by the rule or without subjects → `INVALID_CURRICULUM`, no INSERT sent; existing profile: different intake → `PROFILE_INTAKE_LOCKED`, NULL intake may be set once, no curriculum probe); route/validation tests for the new `intakeYear` field; migration tests.
- [ ] Implement migration 0016 + tooling, shared rule, contracts, validation, repository (find/save/options return `intakeYear`), fixtures.
- [ ] `npm run typecheck && npm run lint && npm test && npm run test:db-tooling` pass. Commit: `feat(profile): intake year stored separately; curriculum follows the intake year (S3-P004-037)`.

### Task 2 — Profile page
- [ ] Unit tests for any web helpers; UI checks in `tools/p001/test-ui.mjs` (replace the "ambiguous programme blocks setup save" check): intake select required; single winner shown read-only and saved (`writes[0].body` has `curriculumId` and `intakeYear`); tie shows Curriculum select; changing programme/intake clears the manual choice; Cancel clears all; saved profile shows "Intake … · Curriculum … · … credits" read-only; saved profile with NULL intake can set it once; 375px and dark mode readable.
- [ ] Implement. `node tools/p001/test-ui.mjs` and `npm run test:ui:integration` pass. Commit: `feat(profile): students choose their intake year; the curriculum follows (S3-P004-037)`.

### Task 3 — Admin cohorts and intake correction
- [ ] Tests: academic repository/routes for `intakes` on curricula; admin route + repository for `PATCH /api/admin/users/{id}/intake` (auth, validation, unchanged, audit row, never touches curriculum); web client decoders; `tools/admin/test-ui.mjs` checks for the Students by intake column and Change intake year (reason required, success notice), 375px.
- [ ] Implement, update `docs/api/admin-academic-setup.openapi.json` and `docs/api/admin-users.openapi.json`. `npm run test:ui:admin` passes. Commit: `feat(admin): students by intake on curricula; admin corrects a student's intake year (S3-P004-037)`.

### Task 4 — Docs
- [ ] `docs/changes/S3-P004-037-intake-year.md` (Plan, Implementation, Verification table with real counts, Rollout: apply 0016 to Neon before deploying, Changelog); README row; `docs/database/data-contracts.md` if it documents profile options; ACL amendment row "Wrong intake year" in A5 becomes In force (admin corrects with a reason).
