# S1-P001-012 — Recorded credit progress on Subject Records

- **Status:** COMPLETE
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC04 / FR-A4; display-only recorded-credit summary
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator review PASS (2026-10-28); human approval not requested

## 1. Plan

### Objective / problem

Move the existing Degree Progress card from Offerings to Subject Records so students see their configured total and recorded recognized credits alongside their subject history. Preserve the existing Records UI edits already in the worktree, including the removed page heading, and keep Offerings free of the card and its aggregate calculations.

### Scope and requirements

- In scope: expose the signed-in profile curriculum's configured `total_credit_required` on the existing profile read; calculate earned and exempted recognized credits from unique own records mapped to current curriculum subjects; move the card design and accessible progress meter to Subject Records; update focused fixtures, tests, screenshots and records.
- Also in scope per latest user steering: within the existing Core/E/U/Other and elective subgroup boundaries, sort by saved status (unrecorded/remaining, Taken, Exempted) and then subject code; display the saved status in a readable pill. Unrecorded uses a literal hyphen with visually hidden “Not recorded” text; COMPLETED is green Taken; EXEMPTED is light blue. FAILED/WITHDRAWN and duplicate rows remain distinct and are not promoted to Taken. Sort uses saved records, never optimistic checkbox state.
- Out of scope: schema/DB changes, migration or reference writes, offerings/history/sidebar redesign, eligibility or graduation rules, speculative values, restoration of user-removed records headings or Offerings labels.

### Proposed implementation

- Expected files: `apps/api/src/modules/profile/contracts.ts` and `repository.ts`; profile repository tests; narrow `/api/profile` cache version; `RecordsPage.tsx`, `SubjectRecordsTable.tsx`; new P001 summary/card/sort helpers and tests; scoped records CSS; remove the existing card from `OfferingsPage.tsx` and its dedicated CSS; P001/Offerings/integration browser harnesses as needed; this record.
- APIs / database / interfaces: additive optional `Profile.totalCreditRequired` from the profile's own configured curriculum. No endpoint, schema or database change; old cached profile snapshots are bypassed with a narrow endpoint version marker.
- Dependencies / shared-file impact: Subject Records uses its existing AcademicClient, `/api/profile`, `/api/profile/options`, and `/api/academic-records`; it does not fetch Offerings context. Offerings retains its history helpers where independently used and no longer computes or renders the card.

### Acceptance criteria

- [x] Card appears on Subject Records, not Offerings, and uses only the current curriculum's configured total and uniquely mapped own records.
- [x] COMPLETED and EXEMPTED recognized credits stay separate, including zero-credit exemptions; FAILED/WITHDRAWN contribute zero. Duplicate/unmapped history or missing totals never produce a falsely complete bar.
- [x] Successful record changes, exemption saves, clear/Undo immediately recalculate the card; failed writes retain the previous saved totals.
- [x] Each existing category/subgroup shows saved outcomes sorted Remaining/unrecorded, Taken, Exempted, then ascending subject code. FAILED/WITHDRAWN/duplicates keep explicit labels; checkbox changes reorder only after persistence succeeds.
- [x] Status pills distinguish Taken (green), Exempted (light blue), and Not recorded (light gray with a dash and visually hidden accessible label); keyboard focus and record editing remain functional when saved rows reorder.
- [x] Existing Records markup/behavior and user edits remain intact. Old profile cache snapshots missing the total do not persist for five minutes.
- [x] Loading/empty/error behavior remains usable; 375px mobile has no page overflow; progressbar, bubble endpoints and uncertainty are accessible.

### Verification plan

- Run focused profile/records summary unit tests and P001 browser suite; verify card relocation and mutation/error/Undo scenarios.
- Run P002 browser regression, `npm.cmd test`, typecheck, lint, build, and relevant offerings checks after source changes.
- Capture fresh Records desktop/mobile screenshots. No database/provider calls.

### Risk / assumptions / rollback

- A missing/invalid configured total is treated as unavailable, never replaced by a sample denominator. Duplicate current-curriculum records make totals partial and suppress the percentage.
- Revert only the new profile field, Records card/helper/styles/tests and Offerings card removal if rollback is needed; no database data/schema rollback exists.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `apps/api/src/modules/profile/contracts.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`; `apps/web/src/features/profile/client.ts`, `apps/web/src/features/profile/data-cache.test.ts`; `apps/web/src/features/records/RecordsPage.tsx`, `SubjectRecordsTable.tsx`, `RecordedCreditProgress.tsx`, `recorded-credit-summary.ts`, `recorded-credit-summary.test.ts`, `subject-records-table.css`; `apps/web/src/features/offerings/OfferingsPage.tsx`, `offerings.css`; `tools/p001/test-ui.mjs`, `tools/offerings/test-ui.mjs`, `tools/integration/test-ui.mjs`; `docs/changes/S1-P002-007-degree-progress-card.md`; this record.
- **Summary:** Added optional `Profile.totalCreditRequired` sourced from the signed-in student's configured curriculum and versioned only the `/api/profile` client cache contract. Records now renders the configured-credit card from its loaded own records and current curriculum subjects; it updates from committed React state after save, delete and Undo. Optional profile metadata degrades only on non-auth errors; 401/403 and aborts still propagate through the page's normal recovery path. Removed the duplicate card and aggregate progress calculation from Offerings while keeping its history/filter behavior. Saved status pills now show Taken/Exempted/Failed/Withdrawn/Multiple saved records or an accessible hyphen for unrecorded rows. Tables sort a copy of each existing subgroup by unresolved/remaining, Taken, Exempted, then subject code.
- **Decisions / deviations from plan:** Retained the user's removed Records page heading and the Offerings page's removed duplicate semester note/header edits. The card uses the existing academic summary eyebrow, and no profile or Offerings layout removed by the user was restored. No schema/database work was done.
- **Migrations / env / shared contracts:** No migration or environment change planned; additive optional P001 profile response property only.

## 3. Review

- **Self-review checklist:** PASS - record summary maps current subject identities uniquely; auth denials are not swallowed by the optional profile read; category/subgroup boundaries and saved record identities remain unchanged; no optimistic selection affects totals or sort; existing user UI edits are preserved.
- **Test evidence:** `node tools/p001/test-ui.mjs` exit 0 - 42 mocked browser checks passed. `node tools/offerings/test-ui.mjs` exit 0 - 32 mocked browser checks passed. `npm.cmd test` exit 0 - 25 files passed, 2 skipped; 333 tests passed, 13 skipped. `npm.cmd run typecheck` and `npm.cmd run typecheck:offerings` exit 0; focused lint for RecordsPage and SubjectRecordsTable after the focus-preservation change exit 0. `npm.cmd run lint` and `npm.cmd run lint:offerings` exit 0. `npm.cmd run build` and `npm.cmd run build:offerings` exit 0. `npm.cmd run test:offerings` exit 0 - 11 files passed, 1 skipped; 124 tests passed, 8 skipped. `git diff --check` exit 0.
- **Manual checks:** Captured mocked desktop/mobile screenshots at `.wrangler/p001-review/records-desktop.png` and `records-mobile.png`; the 375px run is included in the browser suite. The card is on Subject Records and absent from Offerings. Screenshots use fictional harness records, not real student data. No live DB/provider access was used.
- **Defects found and fixes:** The first optional-profile implementation would have swallowed 401/403 denials; changed it to propagate auth and cancellation errors. Browser heading waits referenced a user-removed Records heading; moved the wait to the rendered table without restoring that heading. A hidden accessible label initially extended the document by one pixel; pinned the visually hidden label to the viewport and verified widths from 320px to 1440px.
- **Review outcome:** PASS - coordinator inspected the final code, focused focus-restoration hunk, and both Records screenshots. Human reviewer approval remains separate.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Changed
- **Added / Changed / Fixed / Removed:** Moved configured-credit progress from Offerings to Subject Records and added saved-status pills/order based on persisted records.
- **Affected routes / tables / consumers:** Additive `/api/profile` response field for Subject Records; Subjects Records and Offerings presentation. No table/schema changes.
- **Breaking changes / migration steps:** None; the profile property is optional and old cache snapshots are bypassed by a narrow version marker.
- **Verification summary:** Focused P001 and Offerings browser checks plus integrated unit/typecheck/lint/build and Offering unit/typecheck/lint/build passed. Screenshot artifacts are ignored under `.wrangler/p001-review/`.
- **Outstanding blockers / follow-up:** Real-account acceptance was not performed in this mocked browser environment.
- **Final status:** COMPLETE.
