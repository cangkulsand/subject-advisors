# S2-P004-016 — Matric number is mandatory on the student profile

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-04
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4, on P001's profile module (cross-module change; P001 owner to review)
- **Related UC / FR:** P001 academic profile; UC20 forecast student list ([S2-P004-015](S2-P004-015-uc20-student-list-email.md))
- **Branch / PR:** `feature/p004-s2-uc20-student-matric` (with S2-P004-015); no PR
- **Reviewer:** Coordinator review

## 1. Plan

User decision (2026-11-04): coordinators identify portal students by matric number in the forecast student list, so every student profile must have one. There is no database change: `student_profile.matric_no` stays nullable and non-unique, so existing rows stay valid and a mistyped number cannot lock another student out.

## 2. Implementation

- **API (`apps/api/src/modules/profile/validation.ts`):** `matricNumber()` makes `matricNo` required. It removes spaces, upper-cases, and accepts 4-30 letters or digits (for example A22EC0001 or SX230001ECJHF04). Other input returns `400 INVALID_INPUT` with a "Matric number ..." message.
- **Profile completeness (`profile/repository.ts`, `createProfileReader`):** a profile without a matric number is `SETUP_REQUIRED`. Existing students without one land on `/student/setup` at their next sign-in. Routes that require a complete profile (records, offerings, pathway) answer `403 PROFILE_SETUP_REQUIRED` until the student saves a matric number.
- **Web (`apps/web/src/features/profile/ProfilePage.tsx`):** the label is now "Matric number" (no longer optional). The field is required, with a browser pattern, `autoCapitalize="characters"` and a help line saying coordinators use it. The page sends the normalised value. A saved profile without a matric number shows "Add your matric number to continue using the student pages."
- **Tests:**
  - `profile.test.ts`: normalisation, rejections, completeness without matric.
  - `tools/p001/test-ui.mjs`: setup fills the matric and checks the normalised value; new check for a legacy profile without matric.
  - `tools/integration/test-ui.mjs`: setup fills the matric.
  - `tools/p001/test-db.mjs`: fixture input.

## 3. Review

- `npm run typecheck`, `npm run lint` — pass
- `npm test` — 67 files, 1377 tests passed
- Browser suites:
  - P001: 43 passed
  - Integration: 35 passed
  - Auth: 12 passed
  - Offerings: 37 passed
  - Pathway: 9 passed
  - Admin: 44 passed
  - Coordinator: 52 passed
- Screenshot opened: profile desktop with the required Matric number field.

Not verified against the dev database (DB tests skip without credentials).

## 4. Changelog

- 2026-11-04 — Type: Changed. The student profile requires a matric number (normalised, 4-30 letters or digits); profiles without one count as incomplete and send the student back to setup. Compatibility: no migration. Existing students without a matric number must add it before using the student pages. Outstanding: P001 owner review; uniqueness is not enforced. Status: READY_FOR_REVIEW.
