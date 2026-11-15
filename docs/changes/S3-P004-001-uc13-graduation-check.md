# S3-P004-001 — Graduation check in the student app (UC13)

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-15
- **Sprint:** Sprint 3
- **Owner:** P003 (UC13); built by P004
- **Related UC / FR:** UC13 graduation check (M5); UC05 earned-credit calculation; UC25 curriculum Total credits
- **Branch / PR:** `feature/s3-uc13-graduation-check`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Problem: students could not see whether they meet graduation requirements. Design: `docs/superpowers/specs/2026-11-15-uc13-graduation-check-design.md`; plan: `docs/superpowers/plans/2026-11-15-uc13-graduation-check.md`.

Decisions:
- Scope is credits only, plus two student-confirmed items (no outstanding fees, MUET), by owner decision on 2026-11-15. Compulsory subjects, FYP and Industrial Training are out of scope.
- Credits met = earned credits (same calculation as UC05) >= the curriculum Total credits. Eligible = credits met AND fees confirmed AND MUET confirmed; otherwise "Not yet eligible" with what is missing; required credits missing or 0 gives "Cannot assess".
- The credit requirement is the curriculum Total credits set on the admin Programmes page (UC25).
- The admin Graduation Requirements placeholder (UC07) was removed by owner decision on 2026-11-15; the credit requirement is the curriculum Total credits on the admin Programmes page (UC25). `/admin/requirements` now behaves like any unknown admin path ("Page not found").
- The SRS/SDD in `docs/System Documents/` was deliberately NOT updated.
- Migration 0013 is NOT yet applied to Neon. Rollback: revert the branch commits and drop the two columns (`ALTER TABLE student_profile DROP COLUMN fees_cleared_confirmed_at, DROP COLUMN muet_confirmed_at`).

## 2. Implementation

- **Database:** `db/migrations/0013_graduation_confirmations.sql` adds nullable `student_profile.fees_cleared_confirmed_at` and `muet_confirmed_at` (timestamptz, no default, no backfill); check `db/checks/018_graduation_confirmations.sql`; manifest and migration tests updated.
- **API (`apps/api/src/modules/graduation/`):** `GET /api/graduation-check` returns required/earned/remaining credits, the confirmations and the verdict. `PUT /api/graduation-check/confirmations` takes `{feesCleared, muet}` booleans (ticking stores the current time, unticking clears it). STUDENT with a completed profile only. An unknown body field returns 400 `INVALID_INPUT`; a missing or non-boolean field returns 400 `VALIDATION_ERROR`. Wired in `apps/api/src/integration/router.ts` and `tools/integration/prepare.mjs`. No OpenAPI file exists for student endpoints in `docs/api/`, so none was added.
- **Web:** `/student/graduation` "Graduation check" page (`apps/web/src/features/graduation/`), menu item after Academic progress, with the note "Based on your recorded subjects and your own confirmations. Not an official UTMSPACE graduation decision."
- **Admin cleanup:** removed the `/admin/requirements` planned page (`AdminRoutes.tsx`), its menu item (`AdminShell.tsx`) and the matching check in `tools/admin/test-ui.mjs`.
- **Tests:** unit tests for the module and client, router tests, migration tests, 48 shared-shell UI checks.
- **Docs:** `README.md` (Sprint 3 section), `docs/database/data-contracts.md`.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 74 files passed, 6 skipped; 1648 tests passed, 65 skipped
- `npm run test:integration`: 11 passed, 0 failed
- `npm run test:db-tooling`: 27 passed, 0 failed
- `npm run build`: pass
- `npm run check:cloudflare`: pass (dry run, 1164.33 KiB upload / 245.87 KiB gzip)
- `PLAYWRIGHT_CHANNEL=chrome node tools/integration/test-ui.mjs`: 48 passed
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`: 57 browser checks passed
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:admin`: 50 administration browser checks passed

Not verified: no database was used (migration 0013 not applied; API behaviour covered by unit tests with fakes); the UI was checked with mocks only.

## 4. Changelog

- 2026-11-15 - Type: Added. Graduation check (UC13): `/student/graduation`, `GET /api/graduation-check`, `PUT /api/graduation-check/confirmations`; migration 0013 adds `student_profile.fees_cleared_confirmed_at` and `muet_confirmed_at`. Compatibility: additive nullable columns; existing endpoints unchanged. Outstanding: apply 0013 to Neon; human peer review; SRS/SDD not updated.
- 2026-11-15 - Removed: admin Graduation Requirements placeholder page and menu item (`/admin/requirements`), by owner decision; the credit requirement is the curriculum Total credits on the admin Programmes page (UC25).
