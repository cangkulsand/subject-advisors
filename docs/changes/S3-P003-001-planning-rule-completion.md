# S3-P003-001 — Planning rule completion (co-requisites, 2-credit types, far-future pins)

- Owner: P003 Sprint 3 (UC14-UC16 planning correctness)
- Status: MERGED to `main` on 2026-11-18 (merge commit fe12c47, branch `p003-sprint3-uc14-uc16`, commit dec5d37); integration lead review and full re-verification passed (see "Integration review" in S3-P003-002)
- Scope: `packages/shared/src/planning`, `apps/api/src/modules/planning`, this record. No UI, no dependencies, no migrations, no P002 changes.

## 1. Plan (2026-11-17)

### Problem

The planning engine reads only MANDATORY links and ignores configured
co-requisites, treats `semesterTypes: []` as "any type" (a 2-credit
subject is then wrongly allowed in Normal semesters), and a pin placed
more than nine empty semesters out is silently dropped by the early
stop. Placement targets stop right after the plan instead of reaching
the latest configured semester.

### Approach

1. `PlanningSubject.corequisites?: number[]` (absent = none);
   `PlanningRows.prerequisites` gains optional `requirementType`
   (undefined = MANDATORY). Repository prerequisite SQL becomes the
   mandated MANDATORY+COREQUISITE join; mapping keeps MANDATORY in
   `prerequisites`, COREQUISITE in `corequisites`, RECOMMENDED excluded.
2. Needed-subject closure pulls unpassed prerequisites and
   co-requisites (including optional co-requisites group selection
   would skip). Scheduling places a subject together with the closure
   of its unpassed/unplaced co-requisites as an atomic bundle: every
   member must satisfy type, notBefore/pin, first-semester approvals,
   subject cap and credit cap (failed attempts included); a member
   requiring another bundle member as MANDATORY rejects the bundle for
   that semester. Co-requisites already passed/placed are satisfied.
   Pin deadlines pull co-requisites to the same index and their
   prerequisites earlier (bounded). Unplanned/placement reasons name
   the actual restriction (absent partner, type, bundle capacity)
   rather than "full".
3. `allowedSemesterTypes(subject)` exported from `semesters.ts`:
   explicit nonempty types are authoritative; empty + 2 credits ->
   `['SHORT']`; otherwise -> `['NORMAL','SHORT']`. Used by the engine,
   unplanned-capacity check and `checkPlacement`. Assumptions explain
   the rule and configured exceptions; the stale "co-requisites not
   checked" assumption is replaced.
4. Early stop fires only when no within-horizon pin/notBefore/failed
   constraint is still waiting; the 60-offset horizon and refusal of
   offset 60 are unchanged. `placementTargets` spans start through
   max(plan length + 1, latest configured future semester), capped at
   60, gaps disabled with "not set up".

### Acceptance

New ordinary vitest cases (red before implementation, green after) for
row/SQL mapping, bundle placement and failures, pin bundles, 2-credit
defaults/exceptions, far pins to offset 59, placementTargets coverage,
determinism and input immutability; existing P002/shared planning
tests unchanged and passing.

## 2. Implementation (2026-11-17)

- `contracts.ts`: added optional `PlanningSubject.corequisites`.
- `semesters.ts`: added `allowedSemesterTypes(subject)` — explicit types
  win; empty + 2 credits -> `['SHORT']`; else `['NORMAL','SHORT']`.
- `repository.ts`: prerequisite SQL now selects `requirement_type` and
  filters `IN ('MANDATORY','COREQUISITE')` (parameter `[curriculumId]`);
  `PlanningRows.prerequisites[].requirementType` optional (undefined =
  MANDATORY); mapping splits rows into `prerequisites`/`corequisites`,
  RECOMMENDED excluded.
- `engine.ts`: needed-subject closure pulls unpassed co-requisites;
  pin deadlines pull co-requisites to the same index and prerequisites
  earlier (bounded); placement builds the unpassed/unplaced co-requisite
  closure and attempts the bundle atomically (type via
  `allowedSemesterTypes`, notBefore/pin, first-semester approvals,
  subject cap and credit cap including failed attempts; a member
  requiring another member as MANDATORY rejects the bundle; a partner
  pinned elsewhere or absent from the curriculum rejects it). Earlier
  placed or passed partners satisfy the link, matching "satisfied by a
  passed subject, an earlier successfully planned subject, or a
  successful subject in the same semester". Early stop now only fires
  when no within-horizon pin/notBefore/failed constraint is pending
  (horizon still 60). Unplanned reasons name the actual restriction
  (absent co-requisite, unplannable partner). Assumptions updated.
- `placement.ts`: `checkPlacement` uses `allowedSemesterTypes` and
  keeps the original direct pinned-subject capacity precheck (the
  shared engine decides the atomic bundle, `validateChanges` decides
  feasibility); `placementReason`/`validateChanges` report an unmet
  co-requisite as such instead of "already full" / "no longer in your
  plan"; `placementTargets` now spans through the latest configured
  semester (gaps disabled, "This semester is not set up yet."), capped
  at 60.
- Tests: new cases across `engine.test.ts`, `placement.test.ts` and
  `planning.test.ts` (the module suites now hold 120 tests; the full
  prescribed targeted set holds 155); `planningAnalysis` untouched
  (P002 path passes).

### Deviation notes

- The "mandatory-plus-co-requisite conflict" case is directional:
  A co-req B + B prereq A deadlocks -> INCOMPLETE. A co-req B + A prereq B
  plans legally (B earlier satisfies both), so the test uses the
  deadlock direction.
- "Bundle exceeds cap" only produces INCOMPLETE with reciprocal links
  (neither member can be placed first); a one-way link is satisfied by
  the partner placed earlier, so the test uses reciprocal links.
- A mid-run typecheck error (test mock arity) was fixed by widening the
  mock signature; no production change.

## 3. Review

- Red run before fixes: `.wrangler/m5-sprint3-review/step1/vitest-red.log`
  (4 failures, all in the new cases).
- Green: `vitest.log` 155/155 across the prescribed targeted set;
  `vitest-planning-rerun.log` 15/15 after the mock-signature fix;
  `typecheck.log` exit 0.
- Lead review round 1 (2026-11-17): removed a speculative bundle
  capacity BFS in `checkPlacement` that double-counted the seed on
  reciprocal links and counted already-placed partners; replaced by the
  shared `coreqReason` used by `placementReason` and `validateChanges`.
  Fixed the reciprocal-pin test to tighten the existing configured row
  (maxSubjects 2 asserted) instead of appending a duplicate; added the
  single-slot earlier-partner move, reciprocal pin-pair refusal,
  mixed-type pair and ordering-invariant cases. Red:
  `step1/review/vitest-red.log` (3 failures); green:
  `step1/review/vitest.log` 120/120; `step1/review/typecheck.log` exit 0.
- Self-review: diff confined to allowed paths; no comments added or
  removed in production files; input immutability and determinism
  covered by tests. Status: READY_FOR_REVIEW (self-review pass).
- Lead review round 2 (2026-11-17): PASS on code and regression evidence; lead review marked passed. Human approval pending.
- Final gate (2026-11-17): covered by `.wrangler/m5-sprint3-review/final/` — full suite 1841 tests, lint/typecheck/build:cloudflare clean, Edge harness 81/81 PASS. See S3-P003-002 for details.

## 4. Changelog

- Added co-requisite enforcement (bundle placement, closure, pins,
  reasons) and the 2-credit Short default / explicit-exception rule to
  the shared planning engine; API reads MANDATORY+COREQUISITE rows;
  placement targets reach the latest configured semester.
