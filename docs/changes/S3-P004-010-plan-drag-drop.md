# S3-P004-010 — Graduation plan: drag and drop with a saved what-if

- **Status:** MERGED to main (fast-forward, 53400ef) and deployed to dev and prod on 2026-11-17
- **Date:** 2026-11-17
- **Sprint:** Sprint 3
- **Owner:** M5 / P003 (Harraz); built by P004, to be handed over as files
- **Related UC / FR:** UC14–UC16 (graduation plan, what-if, compare); builds on S3-P004-004
- **Branch / PR:** `feature/s3-plan-drag-drop`; no PR
- **Design / plan:** `docs/superpowers/specs/2026-11-17-plan-drag-drop-design.md`,
  `docs/superpowers/plans/2026-11-17-plan-drag-drop.md`
- **Reviewer:** Pending

## 1. Plan

The project owner asked for a more interactive `/student/plan`:
- drag a subject to another semester;
- colour the semesters by number (Semester 1, 2 and 3 each have a colour, repeating every year);
- add relevant icons;
- save the student's what-if in the unused `simulation_scenario` / `simulation_subject` tables, one per student.

Owner decisions:
- a drop **pins** the subject there and the engine re-plans the rest (UC15 "recheck and reschedule"), and drops the
  rules don't allow are refused with the reason;
- the drag library is SortableJS (the library behind the FlyonUI page the owner pointed at).

## 2. Implementation

**Engine** (`packages/shared/src/planning`):
- New change kind `PLACE` with a target `semester`. A FAIL or WITHDRAW may also carry a `semester`: the retake is
  pinned there.
- Pinned subjects are placed first in their semester and count toward its limits. Their prerequisites get deadlines,
  so they are placed in time.
- `SemesterLimit.semesterId` and `PlannedSubject.pinned` were added, plus `semesterIndex`.
- The baseline is unchanged: every earlier engine and recommendation test passes untouched.

**Checks** (`placement.ts`):
- `checkPlacement` refuses a move, in this order, when the target is:
  - before the first planned semester;
  - not set up by the admin;
  - the wrong Normal/Short type;
  - not approved by the coordinator (first semester);
  - full with placed subjects;
  - at or after a placed subject that needs this one;
  - a semester with no room left for a prerequisite.
- `checkChange`: a form change that breaks a placed subject is refused ("… Remove that move first.").
- `validateChanges`: the whole-list check, which the API reuses.
- `cleanChanges`: drops saved changes that no longer apply.
- `placementTargets`: the list behind the "Move…" menu.
- One change per subject (`withChange`).

**Saving** (`saved.ts`, `apps/api/src/modules/planning/scenario.ts`, `routes.ts`):
- `GET/PUT/DELETE /api/planning/scenario`, students only, own scenario only.
- PUT checks the body shape and that each subject is in the curriculum and not passed, and each semester is set up. It
  then re-runs `validateChanges` and replaces the rows in one transaction:
  1. lock the `student_profile` row;
  2. create the scenario if it is missing;
  3. delete its rows;
  4. insert the new rows in order.
- Invalid lists return 422 `SCENARIO_INVALID` and write nothing.
- DELETE returns `200 {data:null}`, because the shared browser client needs a JSON body.
- Row mapping is documented in `docs/database/data-contracts.md`. A swap is a REPLACE row followed by a REPLACEMENT row.
- No migration. The SQL was checked against Neon with `EXPLAIN` only; nothing was written.

**Page** (`apps/web/src/features/planning`):
- `PlanBoard` groups the semesters by academic year: three columns on wide screens, stacked on phones.
- Each semester panel has a 3px accent and a tinted header by semester number (teal, violet, ochre), plus the type
  text and icon ("Normal semester" / "Short semester").
- Subject cards show a grip handle, and badges with icons: placed by you, can't move, notes.
- "Move…" opens a dialog listing every semester with refused ones disabled and their reasons, for keyboard and screen
  readers.
- Drag uses SortableJS in pointer mode (mouse, pen, touch). Each dropped card is put back in the DOM before React
  updates, and panels that would refuse are dimmed while dragging.
- Saving is automatic and queued (latest list wins), with the status "Saving… / Saved / Not saved — Try again".
  Reset deletes the saved what-if.
- On load, stale changes are removed with the notice "Some saved changes no longer apply and were removed." and saved
  once.
- "Your plan" (baseline) and plans without a calendar are read-only.
- New dependency: `sortablejs` 1.15.6 (+ `@types/sortablejs` 1.15.8, dev).

## 3. Review

- typecheck, lint and check:cloudflare pass.
- `npm test`: 1765 passed (65 skipped). New tests:
  - engine PLACE: 7;
  - placement: 24 (5 from the final review);
  - saved mapping: 11;
  - scenario API and repository: 16;
  - save queue and view: 5.
- `PLAYWRIGHT_CHANNEL=chrome`:
  - integration UI 67 passed (8 new checks):
    - colours and type at 1440 and 375;
    - Move… saves and survives a reload;
    - a refused move by menu and by mouse drag;
    - a drag between semesters, including a drop back on its own semester;
    - Reset and a failed save with Try again;
    - stale-change notice;
    - read-only views;
  - admin UI 50 and coordinator UI 54 passed.
- Final whole-branch review by a fresh reviewer (verdict: merge with fixes). Fixed, each with a failing test first:
  - a first-semester pin the coordinator did not approve was accepted by the API and kept on load;
  - removing or replacing a swap left a move of its replacement behind, with a misleading "already full" reason;
  - a retake moved on or before its failed / withdrawn attempt got the wrong reason;
  - a stale retake semester dropped the whole fail / withdraw instead of only the move;
  - focus now returns to the subject's Move… button after the dialog closes.
- Deferred (minor):
  - a 422 after an admin programme change while the page is open keeps showing "Not saved" until a reload;
  - refusal reasons on disabled options in the Move dialog;
  - semesters that aren't set up are only dimmed while dragging;
  - the target list is not memoised;
  - a pin far past nine empty semesters.
- Not verified: against live Neon data with a real student session (SQL `EXPLAIN` only), or on a real touch device.

## 4. Changelog

- 2026-11-17 - Type: Added. Graduation plan: drag a subject to another semester or use Move… (the plan re-plans
  around it; refused moves say why). Semesters are coloured by number, with icons. The student's what-if is saved
  (`GET/PUT/DELETE /api/planning/scenario`, `simulation_scenario` / `simulation_subject`); stale saved changes are
  removed on load. No migration. Outstanding: owner review and merge; human peer review; hand-over to P003.

## 5. Hand-over (after merge)

- **To Harraz (M5):**
  - the shared engine and new modules: `packages/shared/src/planning/{contracts,engine,semesters,placement,saved,index}.ts`
    and their tests;
  - the API module: `apps/api/src/modules/planning/*`;
  - the web feature: `apps/web/src/features/planning/*`;
  - the `package.json` dependency lines.
- **Stays with P004 (integration):**
  - `apps/api/src/integration/router.ts` (scenario path);
  - `tools/integration/test-ui.mjs`;
  - the docs.
