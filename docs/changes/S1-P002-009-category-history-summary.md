# S1-P002-009 — Category history summary and catalogue

- **Status:** COMPLETE
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08 / FR-C1
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator review PASS; human approval remains separate

## 1. Plan

### Objective / problem
Replace the catalogue's programme-name line with a compact summary of the student's recorded subject history by metadata category, sort catalogue rows by category and subject code, and remove the table's History column.

### Scope and requirements
- In scope: authenticated current-curriculum subject/history data already loaded by P002; category summary and ordering helpers; Offerings table presentation; focused unit/browser coverage and this record.
- Normal semester summaries show Core/E1/E2 metadata groups; Short semester summaries show U1/U2 groups. Counts represent unique mapped COMPLETED or EXEMPTED subjects against the actual current-curriculum catalogue count, never credits or graduation requirements. The summary is independent of search and draft selections.
- Keep existing subject display eligibility/filtering rules, including SECJ3032 and unknown-category handling. History remains available to filtering and summary logic after its table column is removed.
- Out of scope: API/schema/database/provider changes; status or credit policy changes; fabricated categories/counts; restoring any user-removed headings, controls, or sidebar; changing saved/edit/review behavior.

### Proposed implementation
- Expected files: `apps/web/src/features/offerings/OfferingsPage.tsx`, `display-filter.ts` or a focused summary helper, scoped `offerings.css`, relevant unit/browser tests and fixtures, and this record.
- APIs / database / interfaces: none; consume existing authenticated P002 subject metadata and P001 history response.
- Dependencies / shared-file impact: none expected.

### Acceptance criteria
- [x] The programme name is replaced with semester-appropriate category history counts derived from actual records and catalog metadata.
- [x] Unavailable, duplicate, or unmappable history is visibly unknown/ambiguous rather than represented as a falsely complete count.
- [x] Catalogue ordering is stable by canonical category group and then subject code; category labels remain readable in distinct category pills.
- [x] The History table header and row cells are absent while existing history filtering/saved-list behavior is preserved.
- [x] Browser coverage checks Normal/Short summaries, history edge cases, ordering/pills, saved/revisit behavior and selection retention.
- [x] Desktop and 375px screenshots show the summary/table without page-level horizontal overflow.

### Verification plan
- Run offerings unit tests, typecheck, lint, browser UI harness and build; inspect generated desktop/mobile screenshots and run `git diff --check`.
- No database/provider/live queries.

### Risk / assumptions / rollback
- Category aliases are derived only from explicit category metadata (not subject-code prefixes). Groups outside the semester's requested set are not shown as that semester's elective categories.
- When category/history data cannot be mapped uniquely, show an explicit unavailable/ambiguous state rather than an assumed zero or complete count.
- Rollback is limited to the P002 summary/table presentation, helper/tests/fixtures and this record.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `apps/web/src/features/offerings/OfferingsPage.tsx`, `apps/web/src/features/offerings/offerings.css`, `apps/web/src/features/offerings/category-history-summary.ts`, `apps/web/src/features/offerings/category-history-summary.test.ts`, `apps/web/src/features/offerings/testing/rich-fixtures.ts`, `tools/offerings/test-ui.mjs`, and this record.
- **Summary:** Replaced the programme-name line with actual per-category completed/exempted subject counts against the current curriculum catalogue. Normal semesters display available Core/E1/E2 groups; Short semesters display U1/U2 groups. Counts exclude failed/withdrawn records, flag duplicate identity history as unclear, and label unavailable history instead of showing zero. Catalogue rows sort by known category order, then normalized other category and subject code. Added readable category pills and removed the History table header/cells while retaining ambiguity messaging and saved-list history behavior.
- **Decisions / deviations from plan:** Core classification mirrors P001's explicit Core aliases and its `Industrial Training` plus `isCompulsory === 1` exception. Other category labels are not guessed into E/U groups. Unclassified catalogue subjects are counted in a separate note; ambiguity is shown separately and not included in recorded counts. The latest user-edited removal of the category filter control was preserved; its dead local state was removed, and search fills the available filter width. Existing page copy/layout and saved/edit/review state and selection behavior were preserved.
- **Migrations / env / shared contracts:** None. Uses current authenticated P002 catalogue and history response only.

## 3. Review

- **Self-review checklist:** PASS — category groups derive from explicit metadata; category history uses current-curriculum subject identity and counts unique COMPLETED/EXEMPTED rows only; failed/withdrawn rows do not count; ambiguous identities are not counted; no History table column remains; table sorting copies input and preserves saved curriculum-subject IDs; unrelated user edits were preserved.
- **Test evidence:** `npm.cmd run test:offerings` exit 0 — 12 files passed, 1 skipped; 129 tests passed, 8 skipped. `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, and `npm.cmd run build:offerings` exit 0. `node tools/offerings/test-ui.mjs` exit 0 — 32 mocked browser checks passed. `git diff --check` exit 0 (Git emitted existing LF-to-CRLF working-copy warnings only).
- **Manual checks:** Inspected fresh 1280px `dist-offerings/review/desktop-guided.png` and 375px `dist-offerings/review/mobile-guided-375.png`; verified category summary placement, distinct category pills, removed History column, and local table scrolling with no page-level horizontal overflow. Browser fixtures are fictional and no database/provider calls were made.
- **Defects found and fixes:** A stale browser assertion expected the removed History cell to contain “History unknown”; updated it to check the unavailable summary and ensure rows remain visible after history becomes unavailable.
- **Review outcome:** PASS — coordinator reviewed actual helper/render/CSS/test diffs and desktop/mobile screenshots.
- **Human reviewer / approval:** Separate human approval remains pending.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Changed / Tests
- **Added / Changed / Fixed / Removed:** Added semester-specific subject history summary and pure category sorting/count helpers; styled category pills and removed the table History column. Expanded isolated fictional fixtures and focused unit/browser coverage.
- **Affected routes / tables / consumers:** Existing P002 `/student/offerings` UI only; no API/schema/table changes.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Offerings unit tests (129 passed, 8 skipped), typecheck, lint, build and 32 mocked browser checks passed; desktop/mobile screenshots reviewed; diff check passed.
- **Outstanding blockers / follow-up:** Category totals describe recorded mapped subjects against current curriculum catalogue counts; they do not represent official requirement counts.
- **Final status:** COMPLETE
