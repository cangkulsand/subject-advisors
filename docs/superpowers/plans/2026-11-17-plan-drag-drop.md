# Graduation plan drag and drop + saved what-if — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/student/plan`, students drag subjects between semesters. A drop pins the subject there and the engine re-plans the rest around it. Semesters are coloured by number and have icons. The student's single what-if is saved to `simulation_scenario` / `simulation_subject`.

**Architecture:** The shared pure engine gains a `PLACE` change kind with pinned semesters, plus a whole-list validator (`placement.ts`) that both the browser and the API run. A shared mapper (`saved.ts`) turns changes into `simulation_subject` rows and back. The planning API module gets GET/PUT/DELETE `/api/planning/scenario`. PUT re-validates before a single batched transaction. The web page swaps the per-semester tables for coloured semester panels with subject cards. SortableJS moves the cards; every drop is reverted in the DOM so React stays the owner. A "Move…" menu does the same without dragging. Changes auto-save through a queue.

**Tech Stack:** TypeScript, React 18, Cloudflare Worker + Neon (`sql.transaction` batches), vitest, Playwright UI harness, SortableJS.

**Spec:** `docs/superpowers/specs/2026-11-17-plan-drag-drop-design.md`

## Global Constraints

- **Branch:** `feature/s3-plan-drag-drop`; change record `docs/changes/S3-P004-010-plan-drag-drop.md`.
- **Commits:** no AI co-author trailer (owner decision S3-INT-001).
- **Scope:** write only `simulation_scenario` and `simulation_subject`; never `academic_record` (UC15 BR1). No migration.
- **Scenario:** one per student, `scenario_name = 'My plan'`, `description` null, `source_plan_id` null. At most 60 changes.
- **Baseline unchanged:** `planBaseline`, `planningAnalysis` and recommendations behave exactly as before. All existing engine tests pass untouched.
- **Configured semester:** an exact row in `input.limits` (with `semesterId`). Never derive it from `limitsFor(...).configured`.
- **Refusal copy, exact strings:**
  - `You can only plan from {firstLabel} onwards.`
  - `This semester is not set up yet.`
  - `Runs only in Normal semesters.` / `Runs only in Short semesters.`
  - `Not approved by your coordinator for {label}.`
  - `{label} is already full with subjects you placed there.`
  - `{code} is placed in {label} and needs this subject first.`
  - `Needs {code} first, and there is no room to fit it in an earlier semester.`
  - For a form change that breaks a pin: `{code} is placed in {label} and needs this subject first. Remove that move first.`
- **Other UI copy:**
  - stale notice: `Some saved changes no longer apply and were removed.`
  - save status: `Saving…`, `Saved`, `Not saved` plus a `Try again` button
  - unconfigured drop zone: `This semester is not set up yet`
  - trailing zone: `Drop here to move a subject later`
- **Typography:** tokens from `apps/web/src/app/typography.css`. Run the readability guard (`assertReadable`) in the new UI checks at 1440 and 375 widths.
- **Colour:** semester colours are not status colours (green/amber/red/blue). Header text on the tint must be ≥ 4.5:1. The label and icon always say the semester too, so colour is never the only signal.
- **Merging:** this repo is primary; integration-lead files (router, `prepare.mjs`, `test-ui.mjs`) are edited in place.

## Review Focus

1. **Stale saved rows after an admin programme change.** The subjects belong to another curriculum. Load must drop them, show the notice and save once. The API PUT must never 500 on them. Test in Task 5 (web loader) and Task 4 (PUT 23514 → 422).
2. **The current semester moves past a pinned semester.** The pin must be dropped on load, not crash `semesterIndex`. Test in Task 2 (`cleanChanges`).
3. **A save fails or two saves race.** The latest list wins, the status shows `Not saved`, and `Try again` resends the latest list. Test in Task 5 (`SaveQueue`).
4. **A drop SortableJS doesn't report as a move** (dropped back on its own list, or outside any list). Nothing must change and no save must happen. Test in Task 6 (Playwright drag back to the same semester → no PUT).
5. **The student has no calendar (`start === null`).** No drag and no "Move…" are offered, and the page still renders. Test in Task 6.

---

### Task 1: Engine — `PLACE` change kind with pinned semesters

**Files:**
- Modify: `packages/shared/src/planning/contracts.ts`
- Modify: `packages/shared/src/planning/engine.ts`
- Test: `packages/shared/src/planning/engine.test.ts` (append a `describe('PLACE')`)

**Interfaces:**
- Produces:
  - `ScenarioChangeKind` = `'POSTPONE' | 'FAIL' | 'WITHDRAW' | 'REPLACE' | 'PLACE'`;
  - `ScenarioChange` gains `semester?: SemesterRef`. It is required for PLACE. FAIL and WITHDRAW may also carry it, meaning "the retake or re-take is pinned there".
  - `SemesterLimit` gains `semesterId: number`.
  - `PlannedSubject` gains `pinned: boolean`.
  - `export function semesterIndex(start: SemesterRef | null, target: SemesterRef): number | null`, exported from `semesters.ts`. It gives the 0-based offset from `start`, or null when `start` is null or the target is before `start`.

- [ ] **Step 1: Write failing tests** in `engine.test.ts`, using the existing `input()` fixture (start 2026/2027 S2). Change the fixture's `limits` entries to include `semesterId` (21, 22):
  - `semesterIndex({2026/2027,2}, {2027/2028,1})` is `2`; `semesterIndex(start, {2026/2027,1})` is `null`; with no start it is `null`.
  - **PLACE later:** `planScenario(input(), [{kind:'PLACE', curriculumSubjectId:4, semester:{academicYear:'2027/2028', semesterNo:2}}])`. SECB1013 sits in the semester labelled `2027/2028 – Semester 2`, with `pinned: true` and `change: 'PLACE'`, and appears in no other semester.
  - **PLACE earlier:** in the test, use `planBaseline` to find the first subject with no prerequisites and `semesterTypes: ['NORMAL']` placed at index ≥ 2, and assert one exists (if none does, add an extra Core subject `SECB2013`, id 11, to a local fixture). Pin it to `2026/2027 – Semester 2` (index 0). Expect it at index 0 with `pinned: true`, and the plan status stays `PLANNED`.
  - **Pins count toward limits:** pin three 3-credit subjects into index 0, with limit 3 subjects / 10 credits. No unpinned subject is in index 0.
  - **Prerequisite deadline:** pin SECA2013 (id 2) to index 2. SECA1013 (id 1) must be at index 0, even when three other Core/elective subjects would otherwise fill index 0 first by critical-path order.
  - **FAIL plus retake pin:** `[{kind:'FAIL', curriculumSubjectId:4, semester:{2027/2028,2}}]`. There is a failed attempt `SECB1013*` in the baseline semester and the retake is at `2027/2028 – Semester 2`.
  - **No-op:** `planScenario(input(), [])` deep-equals `planBaseline(input())`, and `pinned` is false everywhere.

- [ ] **Step 2: Run and confirm the new tests fail**
  - Run: `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts packages/shared/src/planning/engine.test.ts`
  - Expected: FAIL (`semesterIndex` is not exported; PLACE is ignored).

- [ ] **Step 3: Implement**
  - `semesterIndex` in `semesters.ts`: step `semesterAt` from start, guarded by `SEMESTER_GUARD`-like 60 steps.
  - `Constraints.pinned: Map<number, number>`, copied in `copy()`.
  - In `plan()`, at each index, after failed attempts, place that index's pinned subjects (with `pinned: true`). They count toward `subjects.length` and `credits`. Skip pinned subjects in the normal fill except at their own index. A pinned subject whose prerequisites aren't met at its index is not placed there and falls through to the normal fill without `pinned`, so the validator can detect it.
  - **Deadlines:** for each pin, walk prerequisites recursively and set `deadline(id) = min(existing, pinIndex - 1 - depthFromPin)`. Sort `order` by `deadline` ascending first (undefined last), then by the existing comparator.
  - In `planScenario`, the `PLACE` kind uses `semesterIndex(input.start, change.semester)`; if it's null, ignore the change. Set `next.pinned`, delete any `notBefore` for that subject, and set `changeOf` to `'PLACE'`. For FAIL/WITHDRAW with `semester`, apply the existing logic, then also pin the retake (`changeOf` stays FAIL/WITHDRAW). REPLACE is unchanged.
  - The existing `toPlanned` gets `pinned: constraints.pinned.get(id) === index` (pass the index in).
  - `toPlanningInput` in `apps/api/src/modules/planning/repository.ts` maps `semesterId` into `limits` (one line). Update the `toMatchObject`/`limits` expectations in `planning.test.ts` if needed.

- [ ] **Step 4: Run the engine and planning tests**
  - Run: `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts packages/shared/src/planning apps/api/src/modules/planning packages/shared/src/recommendations`
  - Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**
  - `git checkout -b feature/s3-plan-drag-drop` (first task only)
  - `git commit -am "feat(shared): PLACE scenario change pins a subject to a semester (S3-P004-010)"`, after `git add` of the touched files.

### Task 2: Placement validator and stale cleanup

**Files:**
- Create: `packages/shared/src/planning/placement.ts` (export from `index.ts`)
- Test: `packages/shared/src/planning/placement.test.ts`

**Interfaces:**
- Consumes: Task 1 (`planScenario`, `semesterIndex`, `PlannedSubject.pinned`).
- Produces:
  - `type Check = { ok: true; changes: ScenarioChange[]; plan: GraduationPlan } | { ok: false; reason: string }`
  - `withChange(changes: ScenarioChange[], change: ScenarioChange): ScenarioChange[]` applies the replacement rules from the spec:
    - PLACE on a subject with FAIL or WITHDRAW sets that change's `semester`, keeping its position;
    - PLACE on a subject with POSTPONE or PLACE removes the old change and appends;
    - a form change on a subject removes its old PLACE/POSTPONE/FAIL/WITHDRAW and appends;
    - a REPLACE of the same original subject replaces the earlier REPLACE.
  - `validateChanges(input: PlanningInput, changes: ScenarioChange[]): Check`
  - `checkPlacement(input, changes, curriculumSubjectId: number, target: SemesterRef): Check`
  - `checkChange(input, changes, change: ScenarioChange): Check`: the form path, `withChange` plus `validateChanges`. A pin broken by it gives the "Remove that move first." copy.
  - `placementTargets(input, plan: GraduationPlan, changes, curriculumSubjectId): { semester: SemesterRef; label: string; ok: boolean; reason: string | null }[]` lists every configured semester from start to the last plan semester + 1, for the "Move…" menu.
  - `cleanChanges(input, changes): { changes: ScenarioChange[]; dropped: number }`:
    - drop changes whose subject is unknown or passed, or whose `semester` is not configured or `semesterIndex` is null;
    - then, while `validateChanges` fails, drop the last change.

- [ ] **Step 1: Write failing tests** using a fixture like `engine.test.ts`, with `limits` configured for 2026/2027 S2 through 2028/2029 S3 (ids 21…28) and start 2026/2027 S2:
  - each of the seven `checkPlacement` refusals returns exactly the Global Constraints string. Cases:
    - target 2026/2027 S1 → `You can only plan from 2026/2027 – Semester 2 onwards.`
    - 2029/2030 S1 → `This semester is not set up yet.`
    - SECB1013 (Normal) into 2026/2027 S3 → `Runs only in Normal semesters.`
    - `approvedFirst: [1]`, SECB1013 into index 0 → `Not approved by your coordinator for 2026/2027 – Semester 2.`
    - three pins fill index 0, a fourth → `2026/2027 – Semester 2 is already full with subjects you placed there.`
    - SECA2013 pinned at 2027/2028 S1, then SECA1013 to 2027/2028 S2 → `SECA2013 is placed in 2027/2028 – Semester 1 and needs this subject first.`
    - SECA3013 to index 0 with A1 and A2 unpassed → `Needs SECA2013 first, and there is no room to fit it in an earlier semester.` (the nearest unmet prerequisite).
  - an accepted move returns `ok: true` with the subject at the target in `plan`;
  - dropping onto the baseline semester removes the pin (`changes` holds no PLACE for it);
  - `withChange`: FAIL then PLACE keeps one FAIL with `semester`; POSTPONE then PLACE leaves one PLACE; PLACE then POSTPONE leaves one POSTPONE;
  - `checkChange` POSTPONE on SECA1013 while SECA2013 is pinned right after it → `SECA2013 is placed in 2027/2028 – Semester 1 and needs this subject first. Remove that move first.`
  - `cleanChanges`:
    - start moved to 2027/2028 S2 with a pin at 2027/2028 S1 → `dropped: 1`;
    - unknown subject id 999 → dropped;
    - passed subject → dropped;
    - valid list → unchanged with `dropped: 0`.
  - `placementTargets` marks Short semesters `ok: false` with `Runs only in Normal semesters.` for SECB1013.

- [ ] **Step 2: Run, expect FAIL** (module missing).
  - Run: `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts packages/shared/src/planning/placement.test.ts`

- [ ] **Step 3: Implement `placement.ts`.**
  - Do the cheap checks 1–6 (spec order) before running `planScenario`, then check 7 on the result.
  - `validateChanges` runs `planScenario` and checks that, for every change with a `semester`, the subject's non-failed card sits at `semesterIndex` and each unpassed prerequisite is at a lower index. Its reason uses the check-7 copy, or the check-6 copy when a pinned dependent is at or before the subject.
  - A "Needs {code}" reason names the first unmet prerequisite by subject code order.

- [ ] **Step 4: Run, expect PASS** (same command plus the Task 1 command).

- [ ] **Step 5: Commit**
  - `feat(shared): placement checks and stale-change cleanup for the plan (S3-P004-010)`

### Task 3: Saved-change mapping

**Files:**
- Create: `packages/shared/src/planning/saved.ts` (export from `index.ts`)
- Test: `packages/shared/src/planning/saved.test.ts`

**Interfaces:**
- Produces:
  - `SavedChange = { kind: ScenarioChangeKind; curriculumSubjectId: number; semesterId?: number; replacementId?: number }`
  - `SavedScenario = { changes: SavedChange[]; savedAt: string }`
  - `ScenarioRow = { curriculumSubjectId: number; changeType: 'PLACE'|'POSTPONE'|'FAIL'|'WITHDRAW'|'REPLACE'|'REPLACEMENT'; proposedSemesterId: number | null; hypotheticalStatus: 'FAILED'|'WITHDRAWN'|null }`
  - `toRows(changes: SavedChange[]): ScenarioRow[]`
    - The spec's table applies. REPLACE is followed straight by REPLACEMENT.
    - A later PLACE of a replacement subject is folded into its REPLACEMENT row's `proposedSemesterId`.
  - `fromRows(rows: ScenarioRow[]): SavedChange[]` is the inverse. REPLACE pairs with the next REPLACEMENT, and a REPLACEMENT with a semester becomes REPLACE followed by PLACE. A REPLACE without a following REPLACEMENT is dropped.
  - `toSaved(input, changes: ScenarioChange[]): SavedChange[]` and `fromSaved(input, saved: SavedChange[]): ScenarioChange[]` map `SemesterRef` to and from `semesterId` through `input.limits`. Unknown semester ids are kept as a change with `semester: { academicYear: '', semesterNo: 0 }`, so `cleanChanges` drops them.
  - `validateSavedBody(body: unknown): { ok: true; value: SavedChange[] } | { ok: false; error: string }` checks:
    - the body is an object with only the `changes` key, holding an array of ≤ 60 entries;
    - kinds are known and ids are positive int32;
    - `semesterId` is required for PLACE and allowed only for PLACE/FAIL/WITHDRAW;
    - `replacementId` is required for REPLACE and allowed only for REPLACE;
    - each subject appears in at most one change, except that a subject may also appear as a PLACE straight after it was a REPLACE's `replacementId`.

- [ ] **Step 1: Write failing tests:**
  - round-trip `fromRows(toRows(x))` for:
    - PLACE;
    - FAIL with a semester and FAIL without;
    - WITHDRAW, POSTPONE;
    - REPLACE (5 → 6);
    - REPLACE (5 → 6) followed later by PLACE 6 → returns `[REPLACE 5→6, PLACE 6]`;
  - `toRows` gives `hypotheticalStatus` `'FAILED'` and `'WITHDRAWN'`;
  - `toRows` never repeats a `curriculumSubjectId`;
  - `validateSavedBody` refuses: unknown key, 61 changes, PLACE without `semesterId`, POSTPONE with `semesterId`, a duplicate subject, an id of `0` or `2147483648`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**
  - `feat(shared): map saved plan changes to simulation rows (S3-P004-010)`

### Task 4: API — `/api/planning/scenario` GET, PUT, DELETE

**Files:**
- Create: `apps/api/src/modules/planning/scenario.ts` (repository functions)
- Modify: `apps/api/src/modules/planning/routes.ts`
- Modify: `apps/api/src/modules/planning/index.ts`
- Modify: `apps/api/src/integration/router.ts`, so the path check matches `/api/planning/input` or `/api/planning/scenario`
- Modify: `tools/integration/prepare.mjs`, only if the import or export needs it
- Test: `apps/api/src/modules/planning/scenario.test.ts`
- Docs: `docs/database/data-contracts.md`, where the planning line says what is now written; `README.md` line 102

**Interfaces:**
- Consumes: Task 2 (`validateChanges`) and Task 3 (`toRows`, `fromRows`, `fromSaved`, `validateSavedBody`, `SavedScenario`).
- Produces:
  - `PLANNING_SCENARIO_PATH = '/api/planning/scenario'`
  - `ScenarioRepository { read(clerkUserId): Promise<SavedScenario | null>; replace(clerkUserId, rows: ScenarioRow[]): Promise<SavedScenario>; remove(clerkUserId): Promise<void> }`
  - `PlanningDependencies` gains `scenarios: ScenarioRepository`.
  - Responses:
    - GET → `{ data: SavedScenario | null }`
    - PUT → `{ data: SavedScenario }`
    - DELETE → 204
    - invalid → 422 `{ error: { code: 'SCENARIO_INVALID', message } }`
    - wrong method → 405 with `Allow: GET, PUT, DELETE`

- [ ] **Step 1: Write failing tests** with fake `Database` / repository objects, in the style of `planning.test.ts`:
  - GET with no scenario → `{data:null}`; with rows → the changes come back in id order;
  - PUT with a valid PLACE calls `replace` once with `toRows(...)` and returns 200;
  - PUT returns 422 `SCENARIO_INVALID` and does not call `replace` for:
    - a bad body;
    - a subject not in the curriculum;
    - a passed subject;
    - an unconfigured `semesterId`;
    - a PLACE that `validateChanges` refuses (with its reason text);
  - `replace` throwing `{code:'23514'}` → 422 `SCENARIO_INVALID`;
  - DELETE → 204, and `remove` is called;
  - PATCH → 405 with `Allow`;
  - a COORDINATOR token → 403 (reuse the auth fakes from `planning.test.ts`);
  - `replace` SQL: one `db.transaction` call whose commands, in order:
    1. lock `student_profile` `FOR UPDATE`;
    2. insert the scenario `WHERE NOT EXISTS`;
    3. delete `simulation_subject` for that scenario;
    4. insert the rows from `jsonb_to_recordset($2::jsonb) WITH ORDINALITY … ORDER BY ord`;
    5. select the result.
  - Assert the command count and that each SQL text contains `FOR UPDATE`, `NOT EXISTS`, `DELETE FROM public.simulation_subject`, `ORDER BY`.
  - `remove` deletes `simulation_subject` before `simulation_scenario` in one transaction.

- [ ] **Step 2: Run, expect FAIL.**
  - Run: `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/planning`

- [ ] **Step 3: Implement.**
  - The scenario is found by `MIN(scenario_id)` for the student.
  - `savedAt` is `now()` from the final select on PUT, and the scenario's latest `simulation_subject.created_at` (or the scenario `created_at`) on GET.
  - The PUT handler, in order:
    1. `authorize` as a STUDENT with `requireProfile`;
    2. `validateSavedBody`;
    3. `repository.load`;
    4. check every subject is in `input.subjects` and not in `input.passed`;
    5. `fromSaved`;
    6. `validateChanges`;
    7. `replace`.
  - DB errors go through `databaseError`, except 23514, which becomes 422.

- [ ] **Step 4: Run, expect PASS**, then the full set: `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 5: Update the two docs lines and commit**
  - `feat(api): save the student's what-if plan (GET/PUT/DELETE /api/planning/scenario) (S3-P004-010)`

### Task 5: Web client, save queue and loader

**Files:**
- Modify: `apps/web/src/features/planning/client.ts`
- Create: `apps/web/src/features/planning/save-queue.ts`
- Modify: `apps/web/src/features/planning/plan-view.ts`
- Test:
  - `apps/web/src/features/planning/save-queue.test.ts`
  - `apps/web/src/features/planning/plan-view.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 (`cleanChanges`) and Task 3 (`toSaved`, `fromSaved`, `SavedScenario`).
- Produces:
  - `PlanningClient` keeps `load` and adds:
    - `loadScenario(signal?): Promise<SavedScenario | null>`
    - `saveScenario(changes: SavedChange[]): Promise<SavedScenario>` (PUT JSON)
    - `clearScenario(): Promise<void>` (DELETE)
  - `RecommendationsPage` keeps using `load` only.
  - `type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'`
  - `class SaveQueue`:
    - `constructor(send: (changes: SavedChange[] | null) => Promise<void>, onStatus: (s: SaveStatus) => void)`; `null` means DELETE;
    - `push(changes: SavedChange[] | null): void`;
    - `retry(): void`.
    - One request runs at a time. When it finishes, it sends only the latest pending value. If the request fails and nothing is pending, the status is `'failed'`. `retry()` resends the last value.
  - `restoreChanges(input, saved: SavedScenario | null): { changes: ScenarioChange[]; dropped: number }` is `fromSaved` then `cleanChanges`.
  - `CHANGE_LABEL` gains `PLACE: 'Move to another semester'`.
  - `describeChange` covers PLACE (`Move {code} to {label}`) and FAIL/WITHDRAW with a semester (`… , retaken in {label}`).
  - `subjectNote` covers a pinned subject: `Placed here by you`.

- [ ] **Step 1: Write failing tests:**
  - SaveQueue:
    - two quick pushes with a slow send → `send` is called twice, the second time with the latest value only (three pushes → two calls);
    - a failing send → status sequence `saving, failed`;
    - `retry` → `saving, saved`.
  - `restoreChanges` with a row for unknown subject 999 → `dropped: 1`.
  - `describeChange` for PLACE.
  - `subjectNote` for a pinned subject.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**
  - `feat(web): planning scenario client, save queue and restore (S3-P004-010)`

### Task 6: Page — semester panels, icons, drag and drop, "Move…", saving

**Files:**
- `package.json`, `package-lock.json`: `npm install sortablejs@1.15.6 && npm install -D @types/sortablejs@1.15.8`. Use the pinned versions, or the latest 1.15.x already on the npm registry for over two weeks.
- Create:
  - `apps/web/src/features/planning/icons.tsx`: `GripIcon`, `NormalIcon` (sun), `ShortIcon` (half-sun), `PinIcon`, `LockIcon`, `WarningIcon`, `CheckIcon`, `SpinnerIcon`. Each is inline SVG, `width="1em" height="1em"`, `aria-hidden="true"`, `focusable="false"`, using `currentColor`.
  - `apps/web/src/features/planning/PlanBoard.tsx`: the board (year rows, semester panels, cards, SortableJS wiring, "Move…" menu, live region).
  - `apps/web/src/features/planning/useSortableList.ts`
- Modify:
  - `apps/web/src/features/planning/PlanningPage.tsx`:
    - load input and scenario together, restore, show the stale notice and save once if `dropped > 0`;
    - the `WhatIf` form uses `checkChange` and shows its refusal;
    - `Timeline` is replaced by `PlanBoard`;
    - the toggle wording stays;
    - Reset calls `queue.push(null)`;
    - show the save status near the board.
  - `apps/web/src/features/planning/planning-page.css`
  - `tools/integration/test-ui.mjs`:
    - the mock answers GET, PUT and DELETE `/api/planning/scenario`, keeping `state.scenario` so it persists across `page.reload()`;
    - existing plan checks are adapted from table rows to cards (`[data-subject]` selectors stay);
    - the old assertion `requests.every(GET)` becomes "no write other than `/api/planning/scenario`".
- Test: `tools/integration/test-ui.mjs`. New checks are listed in Step 1.

**Interfaces:**
- Consumes:
  - Task 2: `checkPlacement`, `checkChange`, `placementTargets`
  - Task 5: `SaveQueue`, `restoreChanges`, labels
- Produces:
  - `PlanBoard({ input, plan, changes, editable, onChange })`, where `onChange(next: ScenarioChange[])` is called only with checked lists;
  - `useSortableList(ref, { enabled, onMove: (subjectId: number, toKey: string) => void, onStart?: (subjectId: number) => void })`.

- [ ] **Step 1: Write the failing UI checks** in `test-ui.mjs`, each at widths 1440 and 375 where marked:
  1. **"Plan semesters are coloured by number and show their type" (1440, 375):**
     - each `.planning-semester` has `data-semester-no` 1, 2 or 3;
     - the computed `border-left-color` is equal for equal numbers and different across 1/2/3;
     - Short panels contain the text `Short semester`;
     - `assertReadable` passes;
     - there is no horizontal scroll.
  2. **"Move… pins a subject, re-plans and saves":**
     - open `Move DEMB1013`, choose `2027/2028 – Semester 2`;
     - the card `[data-subject=DEMB1013]` is inside that panel and shows `Placed here by you`;
     - a PUT `/api/planning/scenario` body contains `{kind:'PLACE', curriculumSubjectId:4, semesterId:<fixture id>}`;
     - the status shows `Saved`;
     - after `page.reload()` the card is still there.
  3. **"A refused move explains why":**
     - in the Move… menu for DEMB1013, the Short semester option is disabled, with `Runs only in Normal semesters.` visible;
     - forcing a drop there by drag shows the reason in `role=status`;
     - there is no PUT.
  4. **"Dragging a card moves it" (1440):**
     - `page.locator('[data-subject=DEMB1013] .planning-grip').dragTo(panel 2027/2028 S2)` → same outcome as check 2;
     - dragging a card back onto its own panel sends no PUT;
     - the DOM has exactly one `[data-subject=DEMB1013]`.
  5. **"Reset and save failure":**
     - Reset → DELETE is sent and the board equals the baseline;
     - mock PUT 503 → `Not saved` and `Try again` are visible; clicking it after un-failing the mock → `Saved`.
  6. **"Stale saved changes are removed":** `state.scenario` holds a PLACE for subject 999 → the notice `Some saved changes no longer apply and were removed.` and one PUT without it.
  7. **"Original plan view and no-calendar are read-only":**
     - the `Your plan` toggle → no `.planning-grip` and no `Move` buttons;
     - fixture `start: null` → no grips, and the page renders the plan.
  - The fixture `limits` gain `semesterId` and are configured through 2028/2029 S3.

- [ ] **Step 2: Run and expect the new checks to fail.**
  - Run: `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:integration`

- [ ] **Step 3: Implement**
  - **Layout:**
    - group `plan.semesters` by `academicYear`; add one trailing configured empty semester when `editable`;
    - `@media (min-width: 1024px)` turns a year row into a 3-column grid. Columns follow semester number, so a year that starts at S2 leaves column 1 empty;
    - phones stack the panels.
  - **CSS tokens** on `.planning-page`: `--plan-sem-1-accent/-tint`, `--plan-sem-2-…`, `--plan-sem-3-…`. Muted teal, indigo and ochre that pass 4.5:1 for `--color-heading` on the tint.
  - **Panel:** a 3px left accent, a tinted header, and a `--color-surface` body.
  - **Card:**
    - a grip button (`.planning-grip`, `aria-hidden` on the icon), name, code and credits;
    - badges, each with an icon and text: pinned (`Placed here by you`), locked (`Can't move`), and `subjectNote`;
    - a `Move…` button with the accessible name `Move {code}`. It opens a native `<dialog>` with a radio list built from `placementTargets`, where refused options are disabled and show their reason. Confirming runs `checkPlacement`.
  - **Drag:**
    - `useSortableList` creates `Sortable.create(el, { group: 'plan', sort: false, handle: '.planning-grip', filter: '.planning-locked', animation: 150, delayOnTouchOnly: true, delay: 150, scroll: true })`;
    - in `onEnd`, if `evt.from !== evt.to`, first `evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] ?? null)`, then call `onMove(Number(evt.item.dataset.id), evt.to.dataset.key)`;
    - `onStart` adds `.planning-semester--blocked` to panels that `placementTargets` marks not ok;
    - destroy the instance on cleanup and when `editable` turns false.
  - **Refusals** show in one `<p role="status" className="planning-move-message">` with `WarningIcon`, and the card gets a 1.5s highlight class.
  - **Accepted change:** `setChanges(next)` and `queue.push(toSaved(input, next))`.

- [ ] **Step 4: Run all the checks.**
  - `npm run typecheck && npm run lint && npm test && npm run check:cloudflare`
  - `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:integration`, then the admin and coordinator UI suites (`npm run test:ui:admin`, `npm run test:ui:coordinator`)
  - Expected: all pass. The integration count is 59 plus the new checks.

- [ ] **Step 5: Commit**
  - `feat(web): drag-and-drop graduation plan with coloured semesters and saved what-if (S3-P004-010)`

### Task 7: Change record, docs, hand-over files

**Files:**
- Create: `docs/changes/S3-P004-010-plan-drag-drop.md`. Follow the S3-P004-009 shape: Plan, Implementation, Review, Changelog, verification evidence with test counts, and hand-over list.
- Modify: `docs/changes/S3-P004-004-graduation-plan.md`. Add a line saying the what-if is now saved by S3-P004-010.
- Modify: `README.md` line 102, so the description mentions drag and drop, the saved what-if and the scenario route (if not done in Task 4).

- [ ] **Step 1: Write the record and run the full verification set again.** Paste the counts into the record.

- [ ] **Step 2: Commit**
  - `docs: S3-P004-010 change record (plan drag and drop, saved what-if)`

- [ ] **Step 3: Stop for review.** Merge to main and push to dev and prod only when the owner says so. After the merge, build the Harraz hand-over zip under `C:\Old Pc Drive\E\study\handoff-2026-11-16\`:
  - use `tar.exe -a` from inside the folder, with no `./` prefix;
  - include the planning module files from Tasks 1–6, `package.json` and the lockfile delta note;
  - leave out the router, `prepare.mjs` and `test-ui.mjs`.
