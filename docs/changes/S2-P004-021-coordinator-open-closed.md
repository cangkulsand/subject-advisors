# S2-P004-021 — Coordinator screen: selection open and closed, Picked column and pickers dialog

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 simplified offering flow, task 5 of `docs/superpowers/plans/2026-11-10-uc20-simplified-offering-flow.md`
- **Branch / PR:** `feature/p004-s2-uc20-simplified-flow`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

Problem: once students can pick subjects, the coordinator screen must behave differently per selection phase, and after selection closes the coordinator must see how many students picked each approved subject and who they are.

Approach:
- Phase OPEN: the Action dropdown keeps working live. Taking an approved subject away (Removed or Pending) shows one toast "`CODE` withdrawn. N students who picked it will see a note." ("1 student"; "`CODE` withdrawn." when nobody picked it) instead of the plain "removed" toast.
- Phase CLOSED: no dropdown (status pill only), no Add back, a **Picked** column (count for approved subjects, a dash otherwise) with a "View pickers for `CODE`" button that opens a read-only dialog "Picked · `CODE`": Student (name, matric number or else sign-in email under it), search through the shared table toolbar, "No student picked this subject." when empty, the sign-in email warning when emails could not be read.
- Picker lists are cached in memory on the page only, keyed by subject id (one scope, the next semester only: product owner answer 3), dropped on Refresh, on a scope change and when the page is left. No storage.

Out of scope: API and database (Tasks 2 and 3 already provide the pickers route and `pickCounts`), student pages (Task 6). Rollback: revert the page, dialog, client, help text and fixture/test changes.

## 2. Implementation

- **`apps/web/src/features/coordinator/SubjectPickersDialog.tsx`** (new): `SubjectPickersDialog` on `ReadOnlyDialog`, `PickerListCache` type, search with `TableToolbar` / `SearchField` / `ClearFilters`, 20 rows per page, empty and no-match states.
- **`ForecastsPage.tsx`**: `SubjectTable` takes `scope`, `pickerCache`, `closed` (phase CLOSED) and `pickCounts`; adds the Picked column and pickers button; `Forecast` owns the picker cache (cleared on scope change, unmount and Refresh) and shows the withdrawn toast when the answer's `phase` is OPEN and an approved subject stops being approved. In PLANNING the earlier toasts are unchanged. While decisions are locked the card text says "Decisions are locked."
- **`client.ts`**: `getPickers(scope, subjectId, signal)` with a response guard (`pickers` list, `emailsAvailable`, `pickCount`); 404 `OFFERING_DECISION_NOT_FOUND` surfaces as `CoordinatorApiError`. **`coordinator-help.tsx`**: `picked` info tip.
- **`client.test.ts`**: one new test (decode, URL, body without list rejected, 404 code kept).
- **`tools/coordinator/test-ui.mjs`**: 6 new browser checks (open-phase withdrawn toast with 3 students and with nobody; singular "1 student"; closed-phase Picked column, dialog rows, search, cache hit on reopen, Refresh drops the cache, nothing in browser storage; empty state and Escape; mobile 320 and 375 for the column and the dialog). `assertReadable` runs in every check. The fixture routes for pickers and `pickCounts` from Task 4 already honour `state.picks`, so `fixtures.mjs` needed no change.
- **Screenshots** (`.wrangler/coordinator-review/`): `forecast-open-withdrawn-desktop.png`, `forecast-closed-picked-desktop.png`, `forecast-pickers-dialog-desktop.png`, `forecast-pickers-empty-desktop.png`, `forecast-closed-picked-mobile.png` (375), `forecast-pickers-dialog-mobile.png` (375).
- **Deviation:** the withdrawn toast replaces the "removed" toast (one toast, not two) and applies only while selection is OPEN, so an Approved to Pending change in PLANNING still reads "set back to pending."

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 69 files passed, 5 skipped; 1422 tests passed, 63 skipped (database suites skip without credentials)
- `node tools/coordinator/test-ui.mjs`: 61 coordinator browser checks passed
- `node tools/integration/test-ui.mjs --installed`: 35 passed

Not verified: the screen against the real API and database (mocked fixtures that mirror the Task 3 contract; migration 0009 is not applied).

## 4. Changelog

- 2026-11-10 - Type: Added. While student selection is open the coordinator can still change subjects live; withdrawing an approved subject says how many students who picked it will see a note. After selection closes the decisions are locked and a Picked column shows how many students picked each approved subject, with a read-only list of those students (name, matric number or sign-in email). Compatibility: no API change. Status: READY_FOR_REVIEW.
