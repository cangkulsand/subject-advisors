# S3-P004-017 — Forecast table: Uncertain column; the eligible count opens View students

- **Status:** On branch `feature/forecast-uncertain-column` (not merged)
- **Date:** 2026-11-18
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20/UC23)
- **Related UC / FR:** UC20, FR-H4, FR-H8
- **Branch / PR:** `feature/forecast-uncertain-column`; no PR
- **Reviewer:** Pending

## 1. Plan

Owner request: keep students without records as uncertain (no rule change), but show the uncertain count in its own
column and merge the "N uncertain · View students" button into the eligible count so each row stays one line high.

## 2. Change

- `ForecastsPage.tsx`: new "Uncertain" column (with the existing help text) between "Eligible to take" and "Action";
  the eligible count is now the button that opens View students (people icon, accessible name "View students for
  <code>", tooltip "View students"); subjects not in the snapshot keep a dash and no button.
- `coordinator.css`: count-button style; uncertain counts above zero in amber, zero in muted text.
- No change to how eligible or uncertain students are counted.

## 3. Tests

- `tools/coordinator/test-ui.mjs`: headers now include Uncertain; the SECJ1013 count button reads "46" and opens the
  dialog; the uncertain count "3" sits in its own cell; no "uncertain · View students" text; Picked moves one column
  right; a subject not in the snapshot shows three dashes.
- Results: typecheck, lint pass; coordinator UI 56 PASS (readability guard included).

## 4. Changelog

- 2026-11-18 - Type: Changed. Forecast table: separate Uncertain column; the eligible count opens the student list.
