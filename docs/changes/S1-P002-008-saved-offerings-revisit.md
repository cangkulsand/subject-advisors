# S1-P002-008 — Saved offerings on revisit

- **Status:** COMPLETE
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08 / FR-C1
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator review PASS (2026-10-28); human approval not requested

## 1. Plan

### Objective / problem
When a student returns to Offerings with a non-empty saved list for their profile-selected semester, show the saved summary and an explicit Edit offerings action instead of reopening the selection/review flow. Remove the review-only explanatory paragraph identified by the user. Preserve existing user-edited headings and copy.

### Scope and requirements
- In scope: P002 page state initialization, Cancel destination, removal of `.offerings-review-help` paragraph/style, and focused Offerings browser tests and documentation.
- A non-empty selection returned by the authenticated API is reliable evidence of a saved offering list. The current API returns an empty selection object for both a never-saved and an explicitly saved empty list; without schema/API persistence metadata these states cannot be distinguished after a reload. For an empty list, retain the current selection mode on revisit; after an empty save in the current page session, continue to show saved mode.
- Out of scope: API/schema/database changes, synthetic saved markers, storage outside the existing demo fixture, restoring any user-removed Offerings heading/text, and changes to Records/profile UI.

### Acceptance criteria
- [x] Initial load with non-empty server-returned saved subject IDs shows the saved list, saved state, and Edit offerings button; it does not open the selection UI.
- [x] Explicit Edit opens the existing selection flow with saved IDs retained. Review Cancel restores the saved view; back-to-selection and failed save retain the current edit draft.
- [x] Saved mode does not imply hidden selections are pending for another save; review retains the hidden-selection inclusion warning.
- [x] Empty initial selections remain editable; an empty save remains visibly saved until reload, with the inability to distinguish saved-empty from never-saved documented.
- [x] The requested `offerings-review-help` paragraph and its unused scoped CSS are removed; user-deleted heading and unrelated copy remain untouched.
- [x] Browser coverage checks saved on initial load and after reload, edit/cancel restore, first visit empty editor, failed-save draft retention, and absence of the paragraph in review and saved modes.

### Verification plan
Run Offering unit tests, typecheck, lint and browser UI harness. Run integrated checks only if shared contracts or non-P002 code changes become necessary. No database/provider/live queries.

### Risk / assumptions / rollback
- A non-empty selection is unambiguous evidence of a prior successful save. An empty response list is not, because the API does not expose whether an empty list was explicitly persisted; adding that capability would require a separately reviewed data/API contract change.
- Rollback is limited to the P002 page state, removed help paragraph/style, focused tests, and this record.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `apps/web/src/features/offerings/OfferingsPage.tsx`, `apps/web/src/features/offerings/offerings.css`, `tools/offerings/test-ui.mjs`, and this record.
- **Summary:** Initial page load now enters saved mode when the server returns one or more saved curriculum-subject IDs. Explicit Edit opens the existing editor, and Cancel returns to saved mode when the page has evidence of a saved list. Successful empty saves also remain in saved mode until reload. Removed the requested review-help paragraph and its CSS, and gated the hidden-selection “included in the save” warning to review mode so the saved view does not suggest a pending write.
- **Decisions / deviations from plan:** Preserved the user's removed Offerings headings, display-rule control, history sidebar, and all other custom layout edits. Removed unused imports/state left behind by those existing deletions so focused Offerings typecheck/lint pass; no deleted UI was restored. Empty-list save provenance cannot be inferred after reload from the current GET contract, so an empty returned list continues to open editable mode.
- **Database/API impact:** None planned.

## 3. Review

- **Self-review checklist:** PASS - non-empty saved state is based on the API-returned list; no synthetic marker or global storage was added; draft IDs and existing saves remain intact; failed saves remain in review; empty-save behavior follows the documented API limitation; user-deleted UI was preserved.
- **Test evidence:** `node tools/offerings/test-ui.mjs` exit 0 - 32 mocked browser checks passed. `npm.cmd run test:offerings` exit 0 - 11 files passed, 1 skipped; 124 tests passed, 8 skipped. `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, and `npm.cmd run build:offerings` exit 0. `git diff --check` exit 0.
- **Manual checks:** Browser assertions verified initial saved summary, Edit, Cancel to saved summary, first-visit editor, saved view after reload for non-empty selections, and current-session saved view after empty save. Tests use fictional demo/API fixtures only; no database/provider query or write.
- **Review outcome:** PASS - coordinator reviewed the final page state/edit/cancel/save branches, requested paragraph removal, scoped dead-code cleanup, focused tests, and change record. Human approval remains separate.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Changed / Fixed / Tests
- **Added / Changed / Fixed / Removed:** Added saved-summary initialization for non-empty server lists, saved-view restoration on Cancel, and removed the `offerings-review-help` paragraph and CSS. Updated browser coverage to use existing saved/edit/status controls without restoring user-deleted headings.
- **Affected routes / tables / consumers:** Existing P002 `/student/offerings` UI only; no API/schema/table changes.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Offering unit/typecheck/lint/build and 32 mocked browser checks passed. `git diff --check` passed.
- **Outstanding blockers / follow-up:** Empty saved-list provenance remains indistinguishable from never-saved through the existing API response; the page keeps such lists editable on revisit until persistence metadata is added in a separately reviewed change.
- **Final status:** COMPLETE.
