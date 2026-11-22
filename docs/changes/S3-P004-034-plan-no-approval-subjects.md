# S3-P004-034 — Graduation plan: projects and industrial training need no approval; clearer Move dialog

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

Owner request (2026-11-22): the Move dialog was confusing. A Normal-semester subject listed every Short semester as "Runs only in Normal semesters" (and the reverse), moving and the what-ifs shared one radio list, and the main button changed between "Move here" and "Apply".

New Move dialog:
- **Move to:** only semesters of a type the subject runs in (a Normal subject never sees Semester 3; a Short subject sees only Semester 3), without its current semester. Each is a button in the board's semester colour (Semester 1, 2, 3), and one click moves the subject.
- Semesters of the right type that the subject cannot go to (full, not set up, prerequisite) are folded under "N semesters not available", each with its reason.
- **What if…:** postpone, fail, withdraw and replace are separate buttons, applied in one click.
- If nothing is available: "This subject can't move to another semester right now. You can still try a what-if below."

Out of scope: the student Semester offerings page, the coordinator forecast and drag and drop (which still greys out semesters a card cannot go to).

## 2. Implementation

- `apps/api/src/modules/planning/repository.ts`:
  - the subject query reads `s.include_in_offering_forecast`, and `PlanningRows.subjects` gains `inOfferingForecast`;
  - `approvedFirst` adds every subject with `inOfferingForecast` false to the approved subjects. It stays `null` when the coordinator has no decisions for the next semester, which already allows everything.
- Drag and drop, "Move…" and the automatic plan all read `approvedFirst`, so all three now allow these subjects.
- `packages/shared/src/planning/placement.ts`: `PlacementTarget` gains `fits` (the semester type is one the subject runs in).
- `apps/web/src/features/planning/PlanBoard.tsx` (`MoveDialog`) and `planning-page.css`: the new dialog described above.
- `tools/integration/test-ui.mjs`: the Move… checks click buttons instead of radio + "Move here"/"Apply"; a new check covers the type filtering, the colours and the readability guard.
- `packages/shared/src/planning/engine.ts`: the plan note for the first semester now reads "<semester> uses only the subjects your coordinator approved. Projects and industrial training need no approval."

## 3. Verification

| Check | Result |
| --- | --- |
| New tests in `planning.test.ts` (RED, then GREEN) | a project subject is allowed in the first semester with no decision; the repository reads the flag |
| `npm test` | 1920 passed, 67 skipped |
| `npm run test:ui:integration` | 76 PASS (mocked) |
| `npm run test:ui:coordinator` | PASS |
| `npm run typecheck`, `npm run lint` | PASS |
