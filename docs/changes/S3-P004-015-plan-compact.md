# S3-P004-015 — Graduation plan: board first, Postpone drop zone, two tabs, no What-if form

- **Status:** MERGED to main (fast-forward, 45f9dda) and deployed to dev and prod on 2026-11-18
- **Date:** 2026-11-18
- **Sprint:** Sprint 3
- **Owner:** P004 (built for P003 UC14–UC16)
- **Related UC / FR:** UC15 what-if simulation, UC16 compare and reset
- **Branch / PR:** `feature/plan-compact`; no PR
- **Reviewer:** Pending

## 1. Plan

Owner request: the student had to scroll past text and the What-if form to reach the drag-and-drop board. Show the
board first, make postponing a drag target, keep only the Semester plan and Dependencies tabs, drop explanations.

## 2. Change

- `PlanningPage.tsx`:
  - removed the lead sentence and the What-if card (Subject / Change / Add change);
  - removed the "Your plan / With your changes" toggle; the board always shows the plan with the changes, and the
    "Compare with your plan" card still shows the original completion side by side;
  - order: title + Refresh/Save status → tabs (Semester plan, Dependencies) with the changes as removable chips and
    Reset to my plan (`Your changes`) → board → summary → comparison → subjects not to delay → how the plan is made.
- `PlanBoard.tsx`:
  - a "Drop here to postpone one semester" zone at the top of the board (sticky while scrolling); dropping a card
    adds a POSTPONE change through `checkChange`, refusals show the reason like a refused move;
  - removed the "Drag a subject by its handle…" sentence;
  - the Move… dialog gains "Or try": Postpone one semester, Fail it, Withdraw and, for an elective, "Replace with …"
    (the button reads Apply), so every what-if from the old form stays available, also by keyboard.
- `planning-page.css`: header row, toolbar, change chips, postpone zone.
- Kept: drag-and-drop and Move…, validation, saving (SaveQueue, Try again, stale-plan refresh), Reset with
  confirmation, saved changes restored on load.

## 3. Tests

- `tools/integration/test-ui.mjs`: the what-if test now checks the page opens on the board (board before the summary,
  near the top, no What-if form, no lead text, only two tabs), postpones DEML1112 by dragging it to the zone, fails
  DEMB1013 and replaces DEME1013 from Move…, removes a chip, cancels and confirms Reset; other plan tests use the
  Move… dialog in place of the form.
- Results: typecheck, lint pass; `npm test` 1841 passed (65 skipped); integration UI 76 PASS.

## 4. Changelog

- 2026-11-18 - Type: Changed. Graduation plan opens on the board; postpone by dropping on a zone; other what-ifs in
  Move…; only Semester plan and Dependencies tabs.
