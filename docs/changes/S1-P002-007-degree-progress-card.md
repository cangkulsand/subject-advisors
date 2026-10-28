# S1-P002-007 - Recorded credit summary card

- **Status:** COMPLETE
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08 offerings page; display-only academic summary
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator review PASS; human approval remains separate

## 1. Plan

### Objective / problem
Replace the generic Taken, Exempted and Recognized credits metrics on the offerings page with a Degree Progress card based on the student's current curriculum configuration and mapped own academic records.

### Scope and requirements
- In scope: expose the configured curriculum credit requirement, summarize uniquely mapped COMPLETED and EXEMPTED recognized credits, and show a scoped progress bar with honest incomplete-data behavior.
- Out of scope: graduation eligibility, degree audit, completion guarantees, transfer-credit inference, schema/data changes, and any academic policy calculation beyond comparing recorded recognized credits with the configured total.

### Proposed implementation
- Expected files: shared UC08 context contract; read-only P002 context query/mapper and tests; P002 response decoder/tests; history summary helper/tests; offerings page/CSS/browser harness and test fixtures; P002 cache key test; this record.
- APIs / database / interfaces: additive optional `curriculum.totalCreditRequired`; read existing `curriculum.total_credit_required`. Legacy contexts without it remain valid and render unavailable progress.
- Dependencies / shared-file impact: P002 consumes existing FOUNDATION curriculum field. Add a version marker to the P002 offering-context cache key while preserving identity at key index zero, so old five-minute snapshots cannot hide the new value. No other cache policy changes.

### Acceptance criteria
- [x] Progress uses the actual configured denominator, and earned/exempted values use only unique records mapped to current curriculum subjects.
- [x] Missing/invalid totals, unavailable history, and ambiguous mappings never produce fabricated zero or complete progress; incomplete history is explicitly described.
- [x] Completed and exempted recognized credits are distinct; exemptions with zero recognized credits remain visible as exemptions; no transfer status is inferred.
- [x] Progress is accessible and clamped to a finite 0..100 bar, while text accurately reports over-total recorded credits without making an eligibility claim.
- [x] Legacy contexts without the additive total remain accepted, and old cached P002 contexts are bypassed by the narrowly versioned cache key.
- [x] Browser checks cover card data, missing/zero/over-total values, history ambiguity/unavailability, keyboard and mobile 375px layout with no page overflow; screenshots are saved under ignored `dist-offerings/review/`.

### Verification plan
Run offerings tests, typecheck, lint, browser suite and build; run integrated `npm.cmd test`, typecheck, lint, and build because the shared contract/API mapper changes. Inspect desktop/mobile screenshots and final diff. No database/provider queries or writes.

### Risk / assumptions / rollback
- The example total in the pasted image is illustrative. The page must use configured curriculum data (current reference value confirmed by coordinator as 131).
- COMPLETED means recorded earned credits and EXEMPTED means recorded exempted credits only; neither status proves transfer or graduation eligibility.
- Roll back the additive response/UI/test changes if they misrepresent records; the database and schema are not changed.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `packages/shared/src/offerings/offerings.ts`; `apps/api/src/modules/offerings/context.ts`, `context.test.ts`, and `database.test.ts`; `apps/web/src/features/offerings/client.ts`, `client.test.ts`, `response.ts`, `response.test.ts`, `academic-history.ts`, `academic-history.test.ts`, `OfferingsPage.tsx`, `offerings.css`, `testing/ui-harness.tsx`, and `testing/rich-fixtures.ts`; `tools/offerings/test-ui.mjs`; `docs/cachingguide.md`; this record.
- **Summary:** Added optional `curriculum.totalCreditRequired`, populated read-only from existing `curriculum.total_credit_required`, and decoded as a non-negative PostgreSQL integer. Separately totals recognized credits from uniquely mapped COMPLETED and EXEMPTED current-curriculum records. Added a scoped dark slate Degree Progress card with configured total, earned/exempted/remaining breakdown and a compact percent bubble over the green bar. Missing totals, unavailable history, zero denominator and ambiguous mappings show honest unavailable/partial states. The progress ratio is clamped to 100%; over-total records show the capped bar and exact overage. Existing P002 snapshots are bypassed with a narrow response-contract cache marker while identity remains key index zero.
- **Decisions / deviations from plan:** Kept the user's latest OfferingsPage layout edits: the duplicate semester/year note beside the dropdowns and the page provenance/title area remain absent; the selector is two columns and option labels continue to show Normal/Short. The obsolete browser checks for the removed elements were deleted. No academic-year/semester profile workflow was implemented in this change.
- **Later placement update:** Per the subsequent user request tracked in S1-P001-012, the Degree Progress card is now rendered on Subject Records and removed from Offerings. The additive UC08 configured-total response field and its decoder remain backward-compatible; Offerings continues its history and selection behavior. The Offering browser suite now explicitly asserts that the duplicate card is absent.
- **Migrations / env / shared contracts:** Additive optional shared response field; no migration or environment change.

## 3. Review

- **Self-review checklist:** PASS - API exposes only the configured integer; history is based on authenticated P001 records and current curriculum subject identities; no schema/database writes or eligibility logic were added; legacy contexts remain accepted; over-total state is truthful.
- **Test evidence:** `npm.cmd run test:offerings` exit 0 - 11 files passed, 1 skipped; 121 tests passed, 8 skipped. `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, and `npm.cmd run build:offerings` exit 0. `node tools/offerings/test-ui.mjs` exit 0 - 36 mocked browser checks passed. Integrated `npm.cmd test` exit 0 - 24 files passed, 2 skipped; 313 tests passed, 13 skipped. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` exit 0.
- **Manual checks:** Viewed `dist-offerings/review/degree-progress-desktop.png` and `degree-progress-375.png`; card shows 99/131 and 76% on fictional test data, fits mobile without page overflow, and selector has two controls. Zero/100 bubble endpoints are browser-asserted inside the card. No live database/provider query or write was performed by this task.
- **Defects found and fixes:** Configured requirement was not exposed in the P002 context; added the optional response field and narrowly versioned the P002 context cache so old five-minute snapshots cannot mask it. Aggregate summary previously combined completed and exemption credit values; split them and mark ambiguous/missing mappings incomplete.
- **Review outcome:** PASS - coordinator reviewed the actual card/data/test diff; later placement on Subject Records is tracked in S1-P001-012.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Changed
- **Added / Changed / Fixed:** Replaced the generic academic history metrics with a configured-total degree progress summary derived from unique mapped student records.
- **Affected routes / tables / consumers:** P002 `/api/semester-offerings` read response, existing curriculum total column, offerings page, and P002 session cache key only.
- **Breaking changes / migration steps:** None; response field is additive/optional for old fixtures. No database schema or reference data changes.
- **Verification summary:** Focused P002 unit/typecheck/lint/build/browser checks and integrated test/typecheck/lint/build all passed. Mocked browser uses fictional sample `99/131` (76%), not a statement about any student's records.
- **Outstanding blockers / follow-up:** No remaining P002 card work. The card now lives on Subject Records under S1-P001-012; configured-total API compatibility remains additive. Human approval is separate.
- **Final status:** COMPLETE
