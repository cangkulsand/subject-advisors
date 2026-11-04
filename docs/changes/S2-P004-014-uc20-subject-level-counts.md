# S2-P004-014 — UC20 forecast counts per subject, Below optimal hidden, info tips, student list cache

- **Status:** MERGED to `main` (2026-11-04); human peer review pending
- **Date:** 2026-11-04
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 forecast review; follows [S2-P004-013](S2-P004-013-uc20-coordinator-review-ux.md).
- **Branch / PR:** `feature/p004-s2-uc20-subject-counts` (from `main` af7b56d); no PR
- **Reviewer:** Coordinator review

## 1. Plan

The system does not split subjects into classes (S2-P004-013), so section-based numbers mislead the coordinator. The user agreed (2026-11-04) to drop "Below optimal" and count subjects instead of sections.

## 2. Implementation

- **Summary API (additive):** `RunSummary` gains `pendingSubjects` (subjects with any PENDING section) and `subjectsBelowMinimum` (subjects with any BELOW_MINIMUM section). These are computed in `runs-view.ts` for detail, in the `listRuns` SQL in `runs-repository.ts` (`count(DISTINCT d.demand_id)`), in `runs-testing.ts`, and in the fixtures. The section fields stay for compatibility. OpenAPI updated.
- **Web (`ForecastsPage.tsx`):**
  - Summary facts are now Subjects / Potential demand / Below minimum, with Below minimum counted in subjects.
  - In the forecast list, the Sections column is removed; Awaiting decision and the "Most awaiting decision" sort use `pendingSubjects`.
  - The Below optimal flag badge and filter option are removed; the engine still records the flag.
  - The finalize dialog says "N subjects still pending".
- **Info tips (user request 2026-11-04, hover popovers like TailAdmin):** shared `apps/web/src/components/info-tip/InfoTip.tsx` + `info-tip.css` (opens on hover and keyboard focus, stays open over the popover, Escape closes it without closing a dialog, fixed position so tables and dialogs do not clip it). The texts are in `coordinator/coordinator-help.tsx`. They are used on the forecast summary facts, the Subjects table headers (Potential demand, Quality), the forecast list headers (Subjects, Potential demand, Awaiting decision), the student popup facts, and the Student header (explains `PORTAL-<id>` references).
- **Student list cache (user request 2026-11-04):**
  - Server: the list no longer re-runs the whole forecast to detect a curriculum change. It compares `catalogueFingerprint(curricula)`, a new export of `engine/forecast.ts` that shares the code `runForecastEngine` uses. The response stays `no-store`.
  - Web: lists loaded on the open forecast page are kept in memory (`StudentListCache`), so reopening a subject sends no request. They are cleared on Refresh, on opening another forecast, and on leaving the page. Documented in `docs/cachingguide.md` rule 9.
- **Tests:**
  - API summary assertions now cover the new fields.
  - `client.test.ts` fixture updated.
  - `tools/coordinator/test-ui.mjs`: summary facts, no Below optimal, forecast list headers, finalize text; new info tip check (hover, focus, Escape, in viewport, readable, inside the dialog); reopening a subject sends no request and Refresh clears the cache.
  - Engine test: `catalogueFingerprint` equals the run's fingerprint and ignores curriculum order.

## 3. Review

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm test` — 67 files, 1375 tests passed
- `node tools/coordinator/test-ui.mjs` — PASS 51 coordinator browser checks; screenshots opened (info tip on the Subjects table and in the student popup)
- `node tools/integration/test-ui.mjs --installed` — 35 passed

Not verified: the new `listRuns` SQL against a real database (DB tests skip without `FORECASTING_TEST_DATABASE_URL`).

## 4. Changelog

- 2026-11-04 — Type: Changed/Removed. Forecast summary and list count subjects (pending, below minimum) instead of sections; Sections column and Below optimal flag removed from the coordinator UI. Added hover info tips explaining the forecast terms. Student lists are cached in memory on the forecast page, and the server no longer re-runs the forecast for each list. Compatibility: additive summary fields; no migration. Status: MERGED.
