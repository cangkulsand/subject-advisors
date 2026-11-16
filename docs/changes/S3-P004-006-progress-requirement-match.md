# S3-P004-006 — Academic progress matches requirement groups like the planner

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P001 (M1, UC05 progress); built by P004, to be handed to P001 as files
- **Related UC / FR:** UC05 academic progress; UC13 graduation check (uses the same calculation)
- **Branch / PR:** `feature/s3-progress-requirement-match`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Found in the S3-P004-004 review: requirement types are stored as `ELECTIVE_E1` (the reference import writes the
category upper-cased with spaces turned into underscores), while curriculum subjects carry the category `Elective E1`.
`calculateProgress` compared them after upper-casing only, so such groups matched no subject and showed as
**unassessed** on Academic progress, while the Graduation plan matched them. Fix: compare with the same rule as the
planning engine (upper case, spaces and underscores alike).

## 2. Implementation

- `apps/api/src/modules/p001-sprint2/progress.ts`: `requirementKey()` (local; same rule as
  `normaliseRequirementType` in `packages/shared/src/planning`), used for the requirement type and the subject category.
  `COMPULSORY` still matches compulsory subjects. No other behaviour change.
- `apps/api/src/modules/p001-sprint2/sprint2.test.ts`: one test (`ELECTIVE_E1` and ` elective  e1 ` both match
  `Elective E1`, MET, no "no matching classification" warning).
- No API, contract, database or UI change. Graduation check (UC13) uses `calculateProgress`, so it gets the same fix.

## 3. Review

- typecheck, lint pass; `npm test` 1696 passed (65 skipped); integration UI 59 passed (includes the Academic progress
  page with mocks).
- Not run: `tools/p001/test-ui.mjs` — on this machine its bundled Chromium is not installed and it does not honour
  `PLAYWRIGHT_CHANNEL`; it fails the same way on `main` before this change.
- Not verified against live Neon data: students whose groups showed "unassessed" should now see MET / OUTSTANDING.

## 4. Changelog

- 2026-11-16 - Type: Fixed. Academic progress (and the Graduation check) match requirement types such as
  `ELECTIVE_E1` to categories such as `Elective E1`. Outstanding: human peer review; P001 confirmation.
