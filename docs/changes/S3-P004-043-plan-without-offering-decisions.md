# S3-P004-043: Hotfix, the graduation plan no longer depends on offering decisions

- **Status:** merged to `main` and deployed to dev and prod on 2026-11-28. No migration.
- **Owner:** P004, at the owner's request. The graduation plan is Harraz's module (M5), so this goes in his handover.

## Problem

The owner, testing as a student, could see SECJ3323 Software Design and Architecture in Semester Offerings, but not in the graduation plan.

Two rules worked together to hide it:
- **First semester:** the plan allowed only coordinator-approved subjects. SECJ3323 was approved for SECJ at KL for 2026/2027 S2.
- **Electives:** the plan adds only as many electives as each group needs. It ranks them by how many subjects they unlock and then by code, so other Elective E1 subjects took the slots.

## Change (owner, 2026-11-28: "for now remove offering dependencies, allow student to plan accordingly")

- **Repository** (`apps/api/src/modules/planning/repository.ts`): `load()` no longer reads `offering_decision`. `approvedFirst` is always null, so the next semester can hold any subject the student plans.
- **Kept for later:** the planner's approval support (`toPlanningInput`, `engine.ts`, `placement.ts`) is unchanged and still tested. Turning it back on means restoring the decision query.
- **Note under the plan:** "<semester> does not check the coordinator's offering decisions, so you may plan any subject. See Semester Offerings for what is offered next semester."
- **Unchanged:** Semester Offerings still shows only approved subjects.

## Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2158 passed, 67 skipped |
| `npm run test:ui:integration` | 81 PASS |

## Rollback

Restore the `offering_decision` query in `load()` and the previous note text (`git revert` of this change).
