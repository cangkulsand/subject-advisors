# Graduation plan: drag and drop with a saved what-if — design

- **Date:** 2026-11-17
- **Change record:** S3-P004-010 (owner M5 / P003 Harraz; built by P004, to be handed over as files)
- **Builds on:** `2026-11-16-graduation-plan-design.md` (S3-P004-004, UC14–UC16)

## Intent

The `/student/plan` page now works through a form: pick a subject, pick a change, press "Add change". The project
owner wants a more direct page. Students should be able to drag a subject from one semester to another and see the
plan rework itself around the move. The semesters should be easy to tell apart by colour and icon. A student's what-if
should be **saved**, so it is still there next time, and it should use the database tables that were designed for
this and never used (`simulation_scenario`, `simulation_subject`).

What the owner decided in conversation:

- A drag **pins** the subject to the semester it is dropped on. The engine then re-plans every other subject around
  the pin, the same way a "postpone" change re-plans today (UC15: the system rechecks and reschedules). Drops the
  rules do not allow are refused, with the reason.
- The drags are **saved**. Each student has **one** saved scenario.
- It is saved in the unused tables `simulation_scenario` + `simulation_subject`.
- Drag library: **SortableJS**, the library behind the FlyonUI drag-and-drop page the owner pointed at
  (https://flyonui.com/docs/third-party-plugins/drag-and-drop/). The project has no Tailwind or FlyonUI; only
  SortableJS is used, styled with our own CSS and tokens.
- Each semester gets a colour by its semester number: Semester 1, 2 and 3 (Short) each have their own colour, and
  the colours repeat every academic year. Relevant icons are added.

## Goals

1. Drag a subject card to another semester, earlier or later. If the drop is allowed, the subject is pinned there and
   the plan is recalculated. If it isn't allowed, the card goes back and a message says why.
2. The student's changes (pins plus the existing postpone/fail/withdraw/swap) are saved to the database automatically,
   with a visible "Saved" / "Saving…" / "Not saved" status, and come back when the page reloads.
3. "Reset to my plan" clears the saved scenario.
4. Every semester is coloured by semester number (1/2/3) and carries an icon for its type (Normal or Short).
5. Every drag action also has a non-drag way to do it, so keyboard and screen-reader users can do the same.
6. The comparison with the original plan, the "Subjects not to delay" list and the assumptions still work.

## Non-goals

- More than one scenario per student, scenario names, or a scenario list.
- `academic_plan` / `plan_subject` (a fixed, adopted plan). They stay unused; `simulation_scenario.source_plan_id`
  stays null.
- Reordering subjects *within* a semester. Order inside a semester has no meaning.
- Co-requisites, offering forecasts or approvals for semesters after the first planned one (unchanged from S3-P004-004).
- Tailwind, FlyonUI or any icon library.

## Anti-goals

- Never write to `academic_record` or anything outside the two scenario tables (UC15 BR1).
- Never save a scenario the engine considers invalid. Pins that break a rule are refused when the student drops, and
  refused again by the API.
- Never let the drag library and React both own the same DOM. A broken page after a drop is worse than no drag.
- Colour must not be the only way to tell semesters apart (themeguide §2/§3.2): the label and icon always show it too.

## Constraints found in the project

- **Semesters must exist.** `simulation_subject.proposed_semester_id` references `academic_semester`. A pin can only
  target a semester the admin has created. Today that runs to 2031/2032 Semester 3. The engine itself can plan past
  that; those semesters show in the timeline but cannot take a drop. Their drop zone is disabled with
  "This semester is not set up yet".
- **One change per subject.** `simulation_subject` has `UNIQUE (scenario_id, curriculum_subject_id)`. The current page
  allows two changes on the same subject. From now on a new change to a subject replaces its earlier change, so the
  saved list and the screen always agree.
- **Curriculum check in the DB.** The `member_simulation_subject` trigger refuses subjects outside the student's
  curriculum (SQLSTATE 23514). The API maps that to a safe error.
- **Programme changes leave rows behind.** The admin "change programme" function (0011) does not delete
  `simulation_subject` rows. After a programme change, the saved rows point at the old curriculum. The same happens
  when a pinned semester becomes the current or a past semester, or when a subject becomes passed. On load these
  changes are **dropped** and a one-line notice says "Some saved changes no longer apply and were removed". The next
  save rewrites the rows.
- **Shared code and wiring.** The engine is shared by the browser (plan page, recommendations) and the API, and
  recommendations call `planningAnalysis`, so the baseline behaviour must not change. The router, `prepare.mjs` and
  the UI harness are integration-lead files (P004). Planning module files are Harraz's (M5) and will be handed over.
- **Typography and readability.** Follow themeguide §typography and run the readability guard in the UI suite.

## Approaches considered

**What a drag means.**
- **A. Pin and re-plan (chosen).** The dropped subject is fixed to that semester and the engine re-plans everything
  else. It follows UC15 ("system rechecks and reschedules"), keeps every saved plan valid, and reuses the engine.
- B. Free arrangement. The student places every subject by hand, nothing moves on its own, and the engine only
  warns. That would use `academic_plan` / `plan_subject`. Rejected because it means more work for the student, plans
  can be invalid, and it's a second planning model next to the engine.

**Drag library.**
- **SortableJS (chosen).** It's what FlyonUI uses, a single dependency (~45 KB min), and it handles touch and
  auto-scroll. It works on the DOM directly, so React integration needs care (see "Drag mechanics").
- dnd-kit. React-native with keyboard sensors, but three packages and not what the owner pointed at.
- Native HTML5 drag and drop. No dependency, but no touch support, so phone users could not drag.

## Engine changes (`packages/shared/src/planning`)

### New change kind: `PLACE`

```ts
export type ScenarioChangeKind = 'POSTPONE' | 'FAIL' | 'WITHDRAW' | 'REPLACE' | 'PLACE';
export interface ScenarioChange {
  kind: ScenarioChangeKind;
  curriculumSubjectId: number;
  replacementId?: number;      // REPLACE
  semester?: SemesterRef;      // PLACE: the target semester (academic year + semester no)
}
```

The target is a `SemesterRef`, not a plan index. A saved pin then still points at the same real semester after the
current semester moves on. The engine converts it to an index relative to `input.start`. With no calendar
(`start === null`), PLACE is not offered.

### Behaviour

- `Constraints` gains `pinned: Map<curriculumSubjectId, index>`.
- In `plan()`, for each semester index, after failed attempts, place that index's pinned subjects **first**. Then
  fill the rest as now. A pinned subject is never placed at any other index, and the semester limits count it.
- Prerequisites of a pinned subject get a deadline (pin index − 1, recursively up the chain). Subjects with a deadline
  sort ahead of the normal critical-path order, earliest deadline first. That way the greedy fill places them in time
  when there is room.
- `planScenario` applies PLACE like the other kinds, in order. A PLACE on a subject the current plan does not include
  (passed, not needed) is ignored, like today.
- With no changes the baseline is unchanged, so `planBaseline`, `planningAnalysis` and recommendations are not
  affected. Existing engine tests must pass untouched.

### Checking a drop: `checkPlacement`

```ts
export function checkPlacement(input: PlanningInput, changes: ScenarioChange[], curriculumSubjectId: number, target: SemesterRef):
  { ok: true; changes: ScenarioChange[]; plan: GraduationPlan } | { ok: false; reason: string };
```

This is a pure function used by the page, before saving, and by the API, before writing. It builds the new change
list: any earlier change to that subject is removed, then the PLACE is added at the end. It refuses with a short,
student-readable reason, checked in this order:

1. The target is before the first planned semester: "You can only plan from {first label} onwards."
2. The target is not a configured semester: "This semester is not set up yet."
3. Semester type: "Runs only in Normal semesters" or "Runs only in Short semesters".
4. First planned semester and coordinator approvals (`approvedFirst` not null and the subject not in it):
   "Not approved by your coordinator for {label}."
5. Room: pinned subjects already in the target, plus this one, exceed max subjects or max credits:
   "{label} is already full with subjects you placed there."
6. Order with other pins: a subject that needs this one is pinned at or before the target:
   "{code} is placed in {label} and needs this subject first."
7. After running `planScenario` with the new list: if the subject is not at the target, or a prerequisite isn't
   placed earlier (there wasn't enough room before it), the reason is "Needs {code} first, and there is no room to fit
   it in an earlier semester."

Moving a subject back to the semester the plan already put it in is allowed, and it simply removes its pin
(no-op save).

"Configured" means an exact `academic_semester` row (a `semesterId` match in `limits`). It must **not** come from
`limitsFor(...).configured`, which is also true when only another semester of the same type has a row.

### Which earlier change a new change replaces (my call)

- A PLACE on a subject that has a **FAIL** or **WITHDRAW** keeps that change and adds the pin: "fail it in
  Sem 1, retake it in Sem 3". The failed attempt stays locked; only the retake card can be dragged. These are saved
  as one row (see mapping).
- A PLACE on a subject that has a **POSTPONE** or an earlier PLACE replaces it.
- A form change (postpone, fail, withdraw, swap) on a pinned subject replaces the pin.

### A later change that breaks an earlier pin (my call)

All checks are on the **whole list**: `validateChanges(input, changes)` runs `planScenario` and requires every pinned
subject to sit at its pin, with its prerequisites in earlier semesters. `checkPlacement` is "the new list, then
`validateChanges`", plus the specific reasons above. The form uses the same check. If a postpone, fail, withdraw or
swap would break an existing pin, it is **refused** with the reason, for example: "SECJ3032 is placed in
2027/2028 – Semester 2 and needs this subject first. Remove that move first." The page therefore never holds a list
the API would refuse, and a failed save can only come from the network or server, never from validation. The PUT
handler runs the same `validateChanges`. On load, stale changes are removed one at a time, from the last change
backwards, until the list is valid.

## Saving: tables, API, rules

### Rows

| Table | What is stored |
|---|---|
| `simulation_scenario` | One row per student. `scenario_name` = `'My plan'`, `description` null, `source_plan_id` null. Created on the first save. |
| `simulation_subject` | One row per change, ordered by `simulation_subject_id` (the order in which changes were applied). |

Mapping per change (my call; the builder may adjust the encoding as long as it round-trips and keeps one row per
subject):

| Change | `curriculum_subject_id` | `change_type` | `proposed_semester_id` | `hypothetical_status` |
|---|---|---|---|---|
| PLACE | subject | `PLACE` | target semester ID | null |
| POSTPONE | subject | `POSTPONE` | null | null |
| FAIL | subject | `FAIL` | retake semester ID if the retake was dragged, else null | `FAILED` |
| WITHDRAW | subject | `WITHDRAW` | new semester ID if then dragged, else null | `WITHDRAWN` |
| REPLACE | original subject | `REPLACE` | null | null |
|   + its replacement | replacement subject | `REPLACEMENT` | target semester ID if the replacement was then dragged, else null | null |

The REPLACEMENT row is written straight after its REPLACE row. On read, each REPLACE pairs with the next REPLACEMENT.
A later drag of the replacement subject updates that REPLACEMENT row's semester rather than adding a second row
(unique constraint). On read it becomes REPLACE followed straight by PLACE. That can sit at a different spot in the
change order than the drag really happened; this is accepted and documented.

### API (`apps/api/src/modules/planning`)

All routes are STUDENT only, `requireProfile`, and act only on the signed-in student's own scenario.

- `GET /api/planning/scenario` returns `{ data: { changes: SavedChange[]; savedAt: string } | null }`.
- `PUT /api/planning/scenario` takes `{ changes: SavedChange[] }` (at most 60) and returns the same shape as GET. It
  replaces the saved list in **one transaction**: create the scenario row if it is missing, delete the old subject
  rows, insert the new ones in order. Before writing it loads the planning input and re-runs the checks (shape, every
  subject in the curriculum and not passed, semester IDs configured, every PLACE valid via `checkPlacement`, every
  REPLACE valid). If a check fails it returns 422 `SCENARIO_INVALID` with the reason, and nothing is written.
- `DELETE /api/planning/scenario` removes the subject rows and the scenario row and returns 204. This is
  "Reset to my plan".
- One scenario per student is kept by the API: lock the student's `student_profile` row (`FOR UPDATE`) in the
  transaction before checking for an existing scenario. No migration is needed.
- `SavedChange` on the wire:
  `{ kind: 'PLACE'|'POSTPONE'|'FAIL'|'WITHDRAW'|'REPLACE'; curriculumSubjectId: number; semesterId?: number; replacementId?: number }`.
  The client maps `semesterId` to and from `SemesterRef` using the `limits` list. That list needs the semester ID
  added: `SemesterLimit` gains `semesterId`.
- DB errors go through the existing safe mapping; 23514 (curriculum mismatch) becomes 422 `SCENARIO_INVALID`.
- OpenAPI/route docs are updated the way the other planning routes are documented.

### Loading and stale changes

The page loads the input and the saved scenario together, then turns saved rows into `ScenarioChange[]`. It drops
any change whose subject is not in the curriculum or is now passed, whose semester is gone or now before the first
planned semester, or that `checkPlacement` / the REPLACE check now refuses. It keeps the rest in order. If anything
was dropped it shows the notice and saves the cleaned list once.

### When it saves

- It saves automatically after each accepted change (drop, "Move to…", form change, remove a change). Saves are queued
  so only one request runs at a time and the latest list wins.
- Status text near the timeline: "Saving…", "Saved", or "Not saved — Try again" with a button.
- A refused drop never saves.
- If a save fails, the change stays on screen with the "Not saved" status. It isn't rolled back, so the student can
  retry.

## Page design (`apps/web/src/features/planning`)

### Layout

```
[Summary: estimated completion · earliest · still to take]
[What if… form (postpone / fail / withdraw / swap)          Saved ✓]
[Compare with your plan]                        (when changes exist)
[ Show: (•) With your changes  ( ) Your original plan ]

Plan with your changes  — drag a subject to another semester
┌ 2027/2028 ────────────────────────────────────────────────────────┐
│ ▌Sem 1 ☀  2/3 · 7/12 cr │ ▌Sem 2 ☀  3/3 · 10/12 │ ▌Sem 3 ◐ Short │
│ ⠿ SECJ2013  Data Str. 4 │ ⠿ SECI2143 📌 3       │  drop here      │
│ ⠿ SECR2213  Networks 3  │ ⠿ ...                 │                 │
└───────────────────────────────────────────────────────────────────┘
┌ 2028/2029 … same three columns, colours repeat ┐
```

- Semesters are grouped by academic year. On wide screens (≥ 1024px) a year is a row of up to three columns:
  Sem 1, Sem 2, Sem 3. Below that the semesters stack, each still coloured. If the plan starts mid-year, the first
  year only shows the remaining semesters.
- Each semester is a coloured panel with a **3 px left accent bar and a light tinted header**, coloured by semester
  number. The body stays `--color-surface` so card text keeps full contrast. New tokens in `planning-page.css`
  (`--plan-sem-1-accent/-tint`, `-2-`, `-3-`) are picked to sit with the maroon/cream theme. They are not the
  status colours (green/amber/red/blue mean status everywhere, themeguide §3.3), so the builder picks muted, distinct
  hues, e.g. teal, indigo and ochre, and checks contrast of header text on the tint (≥ 4.5:1).
- The header shows the label, the type icon, and "x of y subjects · a of b credits". A semester that is full shows
  "Full" as text.
- Subject cards replace the table rows. Each card shows a grip icon, name, code, credits and badges: 📌 "Placed by
  you" (pinned), 🔒 "Can't move" (failed attempt; passed subjects are never shown), "Elective example", and the
  existing change notes (`subjectNote`). Each card keeps `data-subject="{code}"` for tests.
- The "Your original plan" toggle shows the baseline read-only, with no grips and no drop zones.
- One empty drop-zone semester is shown after the last planned semester, if it is configured, so a subject can move
  later than the current end. It shows the text "Drop here to move a subject later".

### Icons (my call)

Inline SVG components in `apps/web/src/features/planning/icons.tsx`, sized in `em` and `aria-hidden`, with the
meaning always in text next to them:

- grip (six dots) for draggable cards
- sun for a Normal semester and half-sun for a Short semester, each with "Normal" / "Short semester" text
- pin for pinned subjects
- lock for cards that can't move
- warning triangle for a refused drop and for unplanned subjects
- check / spinner / alert for the save status

### Drag mechanics (SortableJS in React)

- Each droppable semester list gets a `Sortable` instance created in a `useEffect` and destroyed on cleanup. The
  settings are `group: 'plan'`, `sort: false` (no reordering within a list), `handle: '.planning-grip'`,
  `filter: '.planning-locked'`, `animation: 150`, `forceFallback: false`, `delay` on touch (~150 ms) so scrolling still
  works, and auto-scroll on.
- `onEnd`: if the item moved to another list, **put the DOM node back** where SortableJS took it from, *then* call
  `checkPlacement` and update React state. React stays the only owner of the DOM. If the check refuses, show the
  reason in a live region (`role="status"`) next to the timeline and briefly highlight the card.
- While a card is being dragged, panels that would refuse the drop get a muted "can't drop here" style. This uses a
  cheap pre-check (type, approvals, configured) on `onStart`. The full check still runs on drop.
- Not draggable: failed-attempt cards and the baseline view.

### Keyboard and screen reader path

- Each draggable card has a "Move…" button (icon plus visually hidden text "Move {code}"). It opens a small menu
  (`<select>` in a popover, or a native `<dialog>`) listing the semesters it can go to, with refused ones disabled
  and their reasons given. "Postpone", "Mark as failed" and "Withdraw" stay in the What if form, which is unchanged
  except that it now replaces any earlier change on the same subject.
- Results go through the same `checkPlacement` and status region as a drag.

### Changes list

"Your changes" lists PLACE as "Move {code} to {label}", plus the existing descriptions. Each has a Remove button, and
"Reset to my plan" deletes the saved scenario.

## Testing

- **Engine unit tests:**
  - PLACE later, PLACE earlier, a pin pulls its prerequisite earlier, pins count toward limits;
  - every refusal reason in `checkPlacement`;
  - a PLACE that matches the planned semester removes the pin;
  - a stale PLACE (semester before start) is dropped;
  - the baseline is unchanged with no changes;
  - all existing tests pass.
- **Mapping tests:** `SavedChange` ⇄ rows round-trip, including a REPLACE pair and a dragged replacement.
- **API tests**, in the style of `planning.test.ts`:
  - GET with no scenario and with one;
  - PUT replaces rows in one transaction;
  - PUT refuses an invalid pin, an unknown subject and a passed subject with 422, writing nothing;
  - only one scenario per student;
  - DELETE;
  - 405 / auth / role checks.
- **UI harness** (`tools/integration/test-ui.mjs`, planFixture):
  - colours and icons render per semester number;
  - the "Move…" menu pins a subject and the plan recalculates;
  - a refused move shows its reason;
  - a reload keeps the change (mock saves);
  - Reset clears it;
  - the baseline view is read-only;
  - the readability guard passes at phone and desktop widths.
  - One Playwright test drags a card with the mouse between two semesters, to prove the SortableJS wiring and the
    DOM revert.
- **Full set:** `npm run typecheck`, `lint`, `test`, `check:cloudflare`, and the UI suites.

## Left to the builder

- Exact colour values (within the rules above) and the icon artwork.
- Whether "Move…" uses a popover `<select>` or a `<dialog>`.
- Save queue/debounce details.
- Exact OpenAPI wording.
- Splitting `PlanningPage.tsx` into smaller components as needed.

## Hand-over

The work is built in this repository as usual:
- a feature branch `feature/s3-plan-drag-drop`;
- change record S3-P004-010 and a CHANGELOG entry;
- merged to main and pushed only when the owner says so.

These files will be handed over to Harraz (M5) as files, as with S3-P004-004:

- the planning module files: shared engine, API module, web feature;
- the new dependency (`sortablejs` + `@types/sortablejs`).

These files stay with P004:

- the router and `prepare.mjs` changes;
- the UI harness.
