# S3-P004-008 — Academic progress counts exemptions saved without remarks

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P001 (M1, UC05 progress); built by P004, to be handed to P001 as files
- **Related UC / FR:** UC05 academic progress; UC13 graduation check (uses the same calculation)
- **Branch / PR:** `feature/s3-progress-exemptions`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Follow-up to S3-P004-007. `calculateProgress` only accepted an EXEMPTED record with remarks, but the Subject records page
(also P001) saves Exempted immediately and says remarks can be added later. Such exemptions were excluded from earned
credits, the subject stayed "remaining", and a "records excluded" warning showed. 19 records on the dev/prod database
(14 of 24 on SECJ). Owner decision (2026-11-16): align progress with the Subject records page and the Graduation plan.

## 2. Implementation

- `apps/api/src/modules/p001-sprint2/progress.ts`: an EXEMPTED record is valid when its credits are between 0 and the
  subject's credits; remarks are no longer required. COMPLETED, FAILED and WITHDRAWN rules unchanged; missing or
  impossible credits are still excluded with the warning.
- `apps/api/src/modules/p001-sprint2/sprint2.test.ts`: exemptions with no or blank remarks count, no warning.
- Graduation check (UC13) uses `calculateProgress`, so it counts these credits too. No API, contract, database or page change.

## 3. Review

- typecheck, lint, check:cloudflare pass; `npm test` 1698 passed (65 skipped); integration UI 59 passed.
- Checked against the database with the real query and calculation (read-only, counts only): 19 of 19 exemptions
  without remarks are now counted.
- `tools/p001/test-ui.mjs` not run on this machine (bundled browser not installed; same on `main`).

## 4. Changelog

- 2026-11-16 - Type: Fixed. Academic progress and the Graduation check count exemptions saved without remarks.
  Outstanding: human peer review; P001 confirmation.
