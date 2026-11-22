# S3-P004-034 — Graduation plan: projects and industrial training need no coordinator approval

- **Status:** On branch, not merged
- **Date:** 2026-11-22
- **Sprint:** Sprint 3
- **Owner:** P004 (graduation plan)
- **Related UC / FR:** graduation plan drag and drop; UC23 offering decisions
- **Branch / PR:** `fix/planning-no-approval-subjects`; no PR
- **Reviewer:** Pending

## 1. Plan

Bug reported by the owner: in the graduation plan, Project I, Project II and Industrial Training could not be placed in the next semester once the coordinator had made any decision. They were refused with "Not approved by your coordinator for <semester>".

Cause: the next semester allowed only subjects with an APPROVED decision. These subjects are marked `subject.include_in_offering_forecast = false`, so they never appear in the coordinator forecast. The API also refuses to approve them (`SUBJECT_EXCLUDED`), so they could never be approved.

Fix: subjects outside the offering forecast need no approval and are always allowed in the next semester. In the current catalogue these are SECJ3032, SECJ4134, SECJ4114, SECJ4118, SECR3032, SECR4134, SECR4114, SECR4118 and UKQT3001.

Out of scope: the student Semester offerings page and the coordinator forecast.

## 2. Implementation

- `apps/api/src/modules/planning/repository.ts`:
  - the subject query reads `s.include_in_offering_forecast`, and `PlanningRows.subjects` gains `inOfferingForecast`;
  - `approvedFirst` adds every subject with `inOfferingForecast` false to the approved subjects. It stays `null` when the coordinator has no decisions for the next semester, which already allows everything.
- Drag and drop, "Move…" and the automatic plan all read `approvedFirst`, so all three now allow these subjects.

## 3. Verification

| Check | Result |
| --- | --- |
| New tests in `planning.test.ts` (RED, then GREEN) | a project subject is allowed in the first semester with no decision; the repository reads the flag |
| `npm test` | 1919 passed, 67 skipped |
| `npm run typecheck`, `npm run lint` | PASS |
