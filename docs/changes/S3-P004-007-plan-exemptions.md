# S3-P004-007 — Graduation plan counts exemptions saved without remarks

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P003 (M5); built by P004 (fix to S3-P004-004)
- **Related UC / FR:** UC14 projected pathway
- **Branch / PR:** `fix/s3-plan-exemptions`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Reported on prod (2026-11-16) by a SECJ student: `/student/plan` listed subjects the student had marked Exempted.
Root cause: the S3-P004-004 review round copied the UC05 progress rule "an EXEMPTED record needs remarks", but the
Subject records page saves Exempted immediately without remarks ("You can add a grade or remarks later"). On the dev
database (shared by prod), 19 EXEMPTED records have no remarks (14 of 24 on SECJ); the plan treated all of them as not
passed. Not the cause: the records themselves (all in the student's curriculum, full credits) or the deployment (the
prod bundle has the plan page).

## 2. Implementation

- `apps/api/src/modules/planning/repository.ts` `countsAsPassed`: EXEMPTED counts when its credits are between 0 and
  the subject's credits; remarks are not required. COMPLETED still needs the full credits; FAILED / WITHDRAWN never count.
- `apps/api/src/modules/planning/planning.test.ts`: exemption without remarks counts; exemption with impossible
  credits does not.

## 3. Review

- typecheck, lint, check:cloudflare pass; `npm test` 1697 passed (65 skipped); integration UI 59 passed.
- Checked against the database with the real repository code (read-only, counts only): 19 of 19 exemptions without
  remarks are now counted as passed.
- Open for P001: Academic progress (UC05) and the Graduation check (UC13) still require remarks on exemptions, so for
  these students they count fewer credits than the plan. Aligning them is a P001 decision.

## 4. Changelog

- 2026-11-16 - Type: Fixed. Graduation plan and Recommendations count exemptions saved without remarks as passed.
  Outstanding: human peer review.
