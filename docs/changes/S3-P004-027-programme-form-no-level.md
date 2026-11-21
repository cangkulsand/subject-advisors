# S3-P004-027 — Programme forms no longer ask for Level

- **Status:** Merged to main and pushed to dev and prod (2026-11-21)
- **Date:** 2026-11-21
- **Sprint:** Sprint 3
- **Owner:** P004 (admin, on the P001 UC25 Programmes page)
- **Related UC / FR:** UC25 / FR-B9 (S2-P001-005 Programmes page)
- **Branch / PR:** `feature/programme-form-no-level`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner asked to remove the Level field from the programme form. Level is optional and `programme.level` is nullable, so no database, API or contract change is needed.

## 2. Implementation

- **File:** `apps/web/src/features/admin/ProgrammesPage.tsx`.
- **Add programme:** the Level field is gone. Create still sends `level: null`, because `validateCreateProgrammeRequest` requires the key.
- **Edit programme:** the Level field is gone, and the edit never sends `level`. A programme that already has a level keeps it.
- **Not changed:** the Programmes table still shows the Level column, so existing levels stay visible.
- **Tests:** `tools/admin/academic-ui-checks.mjs` now checks that:
  - neither dialog has a Level field;
  - create sends `level: null`;
  - edit bodies have no `level` key;
  - editing the TEST programme keeps its level "Degree".

## 3. Verification

| Check | Result |
| --- | --- |
| typecheck | pass |
| lint | pass |
| `npm test` | 1849 passed, 65 skipped |
| `npm run test:ui:admin` | 52 PASS, including the readability guard |

## 4. Changelog

- The Add and Edit programme forms no longer ask for Level. Existing levels are kept and still shown in the Programmes table.
