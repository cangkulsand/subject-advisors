# S3-P004-030 — Forecast: show uncertain students as "Not counted"

- **Status:** Implemented on branch; not merged or deployed
- **Date:** 2026-11-21
- **Sprint:** Sprint 3
- **Owner:** P004 (coordinator forecast UI)
- **Related UC / FR:** UC20 class offering forecast
- **Branch / PR:** `feature/hide-uncertain`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner asked to hide "uncertain" in the forecast and put those students in the "Not counted" group. Uncertain students are students whose records are incomplete or whose prerequisite cannot be proven. The forecast never counted them as eligible, so this is a display change only. The engine, API, saved runs and the "Eligible to take" numbers are unchanged.

## 2. Implementation

- `apps/web/src/features/coordinator/SubjectStudentsDialog.tsx` ("View students"):
  - the separate Uncertain count, the Uncertain filter button and the "Why students are uncertain" list are removed;
  - **Not counted** now includes these students (`notCounted + uncertain`);
  - their status pill reads **Records incomplete** (muted), and the reason (for example "Academic history incomplete") still shows in Details.
- `ForecastsPage.tsx`: the "Flags → Has uncertain students" filter is removed.
- `coordinator-help.tsx`: the "Not counted" help now mentions incomplete records; the unused Uncertain help text is removed.
- `ImportsPage.tsx`: students without records "are not counted in the forecast".
- `tools/coordinator/test-ui.mjs` updated:
  - the counts are now Eligible, Near graduation and Not counted (46 / 4 / 8 in the fixture);
  - the filters are Counted, Near graduation and Not counted;
  - the dialog never shows the word "uncertain";
  - the Flags filter is gone.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | PASS |
| `npm test` | 1898 passed, 67 skipped |
| `npm run test:ui:coordinator` | 57 PASS (readability guard included) |
| `npm run test:ui:integration` | 75 PASS (mocked) |

## 4. Changelog

- In the forecast, students with incomplete records are now part of "Not counted" (shown as "Records incomplete") instead of a separate "Uncertain" group. The forecast numbers do not change.
