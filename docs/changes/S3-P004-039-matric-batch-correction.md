# S3-P004-039 — Matric-number intake, matric lock and batch correction

- **Status:** On branch `feature/batch-correction`; not merged yet; no migration
- **Date:** 2026-11-27
- **Sprint:** Sprint 3
- **Owner:** P004, building P001's (Aisa) review item; to be handed over to Aisa
- **Related UC / FR:**
  - UC03 (profile)
  - M7 / ACL A5 ("Wrong intake or programme for many students")
  - review of 21 Nov 2026
- **Branch / PR:** `feature/batch-correction`; no PR
- **Design:** `docs/superpowers/specs/2026-11-27-matric-intake-batch-correction-design.md`
- **Plan:** `docs/superpowers/plans/2026-11-27-matric-intake-batch-correction.md`
- **Reviewer:** Pending

## 1. Plan

**The review item:** the 21 November review asked for batch correction of programme and intake.

**The data problem:** migration 0016 backfilled every intake year from the curriculum's effective year. In Neon, every SECJ student is 2020 and almost every SECRH student is 2022, while their matric numbers say 2020–2025. Fixing them one account at a time is not workable.

**Owner decisions (2026-11-27):**
- **Picking students:** by pasted matric numbers.
- **Intake at sign-up:** filled from the matric number.
- **Matric lock:** the matric number locks like the programme.
- **Batch rule:** preview, then all at once (option A).
- **Mock fix:** fix the mock intake years with the new screen after deploy. "Prod just the same with dev", so this needs no separate approval.

**Matric format** (confirmed by the owner):
- **Shape:** `SX` + two-digit intake year + serial + programme + mode + two digits.
- **Examples:** `SX232315ECJHF04` and `SX2302ECRHF04` are both 2023.

**Out of scope:**
- Filling the programme from the matric number.
- The F/S mode.
- Batch matric changes.
- Coordinator access.

## 2. Implementation

**Shared** (`packages/shared/src/profile/matric.ts`, `packages/shared/src/admin/batch.ts`):
- `normaliseMatric` and `readMatric`, where `^SX(\d{2})` gives 2000 + yy and the first 4-letter run is the programme code.
- `splitMatricList`, which splits on new lines, commas, semicolons, tabs and spaces, and drops repeats.
- `planBatch`, `batchSummary` and `programmeWarning` (`'S' + code`, with the `SECJH → SECJ` alias).
- Request validators, and the 500-number limit.

**Profile** (`PUT /api/profile`, `ProfilePage.tsx`):
- **Lock:** a saved matric number cannot change (409 `PROFILE_MATRIC_LOCKED`). Both sides are normalised, so a lowercase saved number does not trip the lock. A profile without a number may set it once.
- **In-use check:** any save of a number another profile holds returns 409 `PROFILE_MATRIC_TAKEN`.
- **Page:** typing an SX number fills the intake year with the hint "Filled in from your matric number. Change it if it is wrong.", until the student picks a year by hand.
  - A saved number with no intake fills the intake when the page opens.
  - A saved number is read-only.
  - The examples are now `SX232315ECJHF04`.

**Admin, single change:**
- **Endpoint:** `PATCH /api/admin/users/{id}/matric`.
- **Card:** the Student programme card has a **Matric number** fact and **Change matric number**.
- **Refusals:** 409 `MATRIC_UNCHANGED` and `MATRIC_TAKEN`.
- **Audit:** `student_matric` / `CHANGE_MATRIC_NO`.

**Admin, batch:**
- **Preview** (`POST /api/admin/students/batch/preview`): matches, or the problems not found, used by more than one student, or no account. Suspended and non-student accounts are matches, with a warning.
- **Apply** (`POST /api/admin/students/batch`): one transaction.
  - The rows are locked first.
  - Then the guards run in order: `BATCH_HAS_PROBLEMS`, `BATCH_STALE` (the student, curriculum and intake are compared with the preview), `CURRICULUM_UNAVAILABLE` and `UNCHANGED`.
  - Programme changes go through `db_change_student_programme`. Intake changes write one `student_intake` row each. Students already correct get no row.
- **Page** (`/admin/users/batch`, opened from **Batch correction** on Users & Access):
  1. Paste the numbers and see the count.
  2. **Check**.
  3. The preview table "Students to correct" lists problems first, with **Remove problem numbers**.
  4. Choose the programme and the intake (Keep, Set all to, or From each student's matric number), with a live After column and summary.
  5. **Apply correction** opens a reason dialog.
  6. The result line, then **Start another batch**. A stale preview shows **Check again**.

**Tests:**
- **Unit:** matric reader, batch planning and validators.
- **Profile repository:** lock, taken, and set-once.
- **Admin routes and repository:** matric change; batch preview and apply, including stale, problems and unchanged.
- **Browser:**
  - Profile auto-fill, the read-only matric number, and fill on open (`tools/p001/test-ui.mjs`).
  - The admin matric change, and 6 batch checks including 320, 375 and 768px (`tools/admin/batch-ui-checks.mjs`).

**API docs:** `docs/api/admin-users.openapi.json` has the three new endpoints and their schemas.

**Docs:**
- **ACL amendment:** the batch row is In force, and a matric row is added.
- **`docs/database/data-contracts.md`:** a note on the matric number and batch correction.

## 3. Review

**Dry run on Neon (2026-11-27):**
- **How it was run:** the real repository SQL ran in a transaction forced to roll back by a final failing probe, so nothing was kept.
- **Preview:** 324 SX-form profiles matched, with no problems.
- **From each matric number:** it would write 293 intake audit rows; 31 are already correct.
- **Stale check:** a stale preview was refused.
- **Programme change:** a 2-student change wrote 2 programme audit rows.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2132 passed, 67 skipped |
| `npm run test:ui:admin` | 76 PASS |
| `npm run test:ui:integration` | 81 PASS |
| `node tools/p001/test-ui.mjs` | 62 PASS with one check skipped. That check, "saved grade editing stays outside the table and preserves legacy semester", also fails on `main` (a focus assertion); it is not related to this change. |

**Outcome:** pending the whole-branch review.

## 4. Changelog

- **Date:** 2026-11-27 · **Type:** Added · **Owner:** P004 (for P001)
- **Actual changes:**
  - The intake year is filled from the matric number.
  - The matric number locks after it is first saved, and only an admin can change it, with an audit row.
  - Admins correct the programme and/or intake year of up to 500 students at once by matric number, all or nothing, with one audit row per student.
- **Compatibility/impact:**
  - **Profile:** two new 409s on `PUT /api/profile`.
  - **API:** three new admin endpoints.
  - **Unchanged:** no migration and no schema change.
- **Status:** READY_FOR_REVIEW
