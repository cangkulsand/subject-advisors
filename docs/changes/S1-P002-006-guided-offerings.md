# S1-P002-006 — Guided semester offerings

- **Status:** DATA/FILTER/CACHE PASS - COORDINATOR REVIEW; GUIDED UI PASS - COORDINATOR REVIEW; HUMAN/PEER APPROVAL PENDING
- **Date:** 2026-10-27
- **Sprint:** Sprint 1
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08 / FR-C1
- **Branch / PR:** `main` / not created
- **Reviewer:** Coordinator review passed for data/filter/cache, shared toast, and guided UI

### Coordinator-approved implementation sequence (2026-10-27)
1. Data/filter/cache mini-task: add only optional curriculum subject metadata, P001 own-history read composition, pure display predicates/history projection, five-minute offering GET cache, and the documented retention policy. No page or CSS changes.
2. UI mini-task after review: apply the guided layout and consume the approved data/filter contract.
3. Each mini-task is reviewed against its actual diff before dependent work proceeds.

## 1. Plan

### Objective / problem
Replace the current all-subject offering picker with the user-directed guided Semester Offerings layout: an academic-year and semester selector, a summary header, a left history sidebar, and a searchable, categorized offered-subject table. Preserve UC08's student-reported provenance and draft ? review ? confirm/save workflow.

### Scope and requirements
- In scope: UC08 display and self-reported availability only; year/semester-specific saved list, selection and removal, truthful student-reported counts/credits, search, Taken and Exempted history, filters below, and responsive presentation.
- Short semesters (semester 3) show remaining subjects worth 2 credits or subjects categorized Elective Umum U1/U2. Exclude `SECJ3032 Projek I Kejuruteraan Perisian` from Short semesters. Normal semesters (1/2) show other remaining subjects plus `SECJ3032`.
- Category comes from configured subject-category metadata, never a code-prefix heuristic. Taken and Exempted derive from the student's own saved academic records; use those labels, not “Passed.” Failed and Withdrawn remain in the remaining list.
- Preserve saved offerings in the selection/review view if a current filter or history record hides them; never silently drop them. Use catalogue IDs (`curriculumSubjectId`) for PUT payloads.
- Keep existing page branding and shared shell; use scoped CSS, native React controls and inline SVG as needed. Reuse the existing toast behavior only if a small, reviewed integration is feasible.
- Out of scope: UC09/UC10 eligibility, limits, planner/registration actions, official availability, graduation/progress calculations, catalogue/calendar seeding, unrelated owners' features, external CDN/icon/font dependencies, and database writes or schema changes in this plan-only stage.

### Current behavior and intended behavior
`OfferingsPage` currently loads the authenticated student's curriculum subjects and configured semesters, offers a searchable checkbox list, summarizes selections, and confirms a full-list PUT. It has no academic history or category metadata in its page contract. The target view adds the user-directed filtering and history presentation while retaining the existing safe save boundary and all existing loading, empty-calendar, error, and discard protections.

### Proposed implementation
- Data/filter/cache mini-task expected files: `packages/shared/src/offerings/offerings.ts`; `apps/api/src/modules/offerings/context.ts` and context tests; `apps/web/src/features/offerings/response.ts`, `client.ts`, `client.test.ts`, and a pure helper plus tests under the offerings feature. `docs/cachingguide.md` documents the five-minute P002 policy. No `OfferingsPage.tsx`, page CSS, toast, migration, or UI layout edits in this mini-task.
- Add optional `subjectId?: string`, `subjectCategory?: string | null`, and `isCompulsory?: 0 | 1` from `curriculum_subject` (`cs.subject_id`, `cs.subject_category`, `cs.is_compulsory`). Keep existing `curriculumSubjectId` and PUT semantics. Decode old/fixture responses without these optional values as unknown.
- Compose the authenticated P001 `/api/academic-records` read using `createAcademicClient`. Expose a validated optional own-history snapshot: present `[]` means known empty; missing/unavailable means unknown; non-auth failures degrade to offerings data plus unknown history; 401/403 propagate. Match P001 `subjectId` to offerings `subjectId` only after validation, never by casting curriculum-subject IDs. Duplicate legacy subject records are ambiguous: do not classify as Taken/Exempted and exclude their totals; preserve the unique records' recorded status/recognized credits.
- Cache only the P002 server GET payload for five minutes using `cachedAcademicRead`; key by identity, normalized API base and semester endpoint/query. Keep P001 academic-record session caching unchanged. Successful PUT invalidates the academic cache before response decoding even if the response is malformed; failed PUT preserves it. Check session identity before/after token acquisition, fetch, and response decoding. Explicit refresh can clear cache if needed by later UI.
- Add pure user-display helpers for semester predicate and category labeling. Short = 2 credits or normalized Elective U1/U2, excluding code `SECJ3032`; Normal = complement plus that exception. No eligibility/limits/prerequisite engine and no filter restriction on saved selections.
- No migration or DB schema change is planned. P002's existing atomic PUT remains the only write for offerings and continues to validate the current student's semester and curriculum-subject IDs server-side.
- Cache plan: use the existing academic cache conventions only after reviewing cache key identity/session semantics. Any offering/history/category cache must be student/session and selected semester scoped, with catalogue/options at the existing short TTL; invalidate on offering saves and P001 academic-record/profile saves, logout, denial, or identity/session change. Recheck the session after fetch completion as well as before it. Do not weaken auth checks or reuse data across identities.

### Data mappings, filters, and edge cases
- Semester label/type derives only from configured `semesterNo`: 1/2 Normal, 3 Short. Select configured academic years and semesters; do not synthesize a calendar.
- Map academic-record status to Taken only when the saved status is `COMPLETED`; map `EXEMPTED` to Exempted. `FAILED` and `WITHDRAWN` are not completed and stay eligible for display as remaining. Preserve recognized-credit values as recorded; do not count a zero-credit exemption as earned credits.
- Display subject categories from configured metadata. Short predicate: remaining AND (`creditHours === 2` OR category is Elective Umum U1/U2) AND code is not `SECJ3032`. Normal predicate: remaining AND (code is `SECJ3032` OR not in the excluded Short-only set). These are the user's display instructions, not a complete official eligibility policy.
- Remove Taken/Exempted subjects from the default remaining list using current own records, but show the history in the sidebar. Offer a “Show completed within semester” view only if it can be implemented without losing or mutating saved offerings. A saved selection hidden by history/filter remains visibly retained in selected/review summaries and PUT draft.
- Duplicate/conflicting legacy records: do not inflate summary counts/credits; show an explicit ambiguous-history state and retain all raw saved offerings pending user correction. Do not choose one academic outcome arbitrarily.
- Missing category or record fields: show an “unknown/not recorded” state and avoid classifying by code. If a required category/history field cannot safely be resolved, keep the corresponding filter opt-in/unavailable and state why rather than inventing data.
- No configured semester: retain the existing empty-calendar help and disable save; do not seed semesters. Empty catalogue/history and failed read states remain explicit.
- Year/semester changes with an unsaved draft: prompt before discard, preserve saved data, then load that semester's own saved list. Cancel/back-out restores the saved list without writing.

### API/data/migration and cross-programmer impacts
Existing `GET /api/semester-offerings` returns curriculum identity, curriculum subjects (`curriculumSubjectId`, code, name, credit hours), configured semesters, and selected semester's saved selection; `PUT` replaces that full list atomically. Existing GET is authenticated and scoped by verified Clerk identity. P001 records expose own `subjectId`, code/name/status/recognized credits/credit hours; profile options expose subject category and related metadata. Any new context fields must be additive, read-only, curriculum scoped, and reviewed with P001 because subject and curriculum-subject identifiers differ. No DB migration is expected. Any shared cache or toast change must be minimal and called out.

### Acceptance criteria
- [ ] The new layout presents configured academic year and semester, accurate semester type, student-reported summary and separate Taken/Exempted history.
- [ ] Search and semester-specific display filters behave as specified; Normal/Short and `SECJ3032` exception cases are covered.
- [ ] Categories come from configured metadata; no unsupported eligibility, prereq, planner, fake course, official offering or graduation-progress claim appears.
- [ ] Only the current student's own history affects the view; `curriculumSubjectId` remains the only offering write identifier.
- [ ] Filter/search/history visibility never silently removes a saved or drafted offering; unsaved semester changes and Cancel preserve the saved list.
- [ ] Confirmed save uses the existing atomic PUT; failed save retains the draft and prior saved data; reload shows the saved semester list.
- [ ] Missing metadata, duplicate/conflicting records, empty catalog/calendar, loading and error states remain explicit and safe.
- [ ] Data mini-task tests cover additive category mapping, legacy field absence, own-history validation/ambiguity, filter predicates, cache TTL/keying/invalidation/session races, and auth versus degradable history failures.
- [ ] Responsive layout is usable at narrow widths, with keyboard labels/focus and semantic status text.

### Verification plan
For the data/filter/cache mini-task, run targeted offerings tests, offerings typecheck and lint, and P001 academic-client/cache regression tests because the shared client preserves denial details. Do not run DB/provider tests or live queries. Defer desktop/narrow viewport review and accessibility checks to the dependent UI mini-task.

### Risks / assumptions / rollback
- Risks: duplicate historical records remain ambiguous; a missing configured semester calendar will prevent offering saves. Do not infer an academic outcome or seed a calendar to work around those facts.
- Assumptions: the user's Normal/Short display rules are presentation policy for UC08 only, not official eligibility; existing authenticated P001 read endpoints may be consumed without ownership changes.
- Dependencies: coordinator approved this data/filter/cache sequence; exact P001 record response and safe common `subjectId` mapping were confirmed from the existing shared subject/record contracts. The UI mini-task remains dependent on this diff's review. No live database/provider access is part of this plan.
- Rollback: revert the focused frontend/API/shared-contract patch and restore prior offerings UI; no data migration is planned. Atomic existing PUT remains unchanged.

## 2. Implementation

- **Status:** DATA/FILTER/CACHE PASS - COORDINATOR REVIEW; GUIDED UI PASS - COORDINATOR REVIEW; HUMAN/PEER APPROVAL PENDING
- **Files actually changed:** `packages/shared/src/offerings/offerings.ts`; `apps/api/src/modules/offerings/context.ts`, `context.test.ts`, `database.test.ts`; `apps/web/src/features/offerings/client.ts`, `client.test.ts`, `response.ts`, `response.test.ts`, `academic-history.ts`, `academic-history.test.ts`, `display-filter.ts`, `display-filter.test.ts`, `OfferingsPage.tsx`, `offerings.css`, `testing/ui-harness.tsx`, `testing/rich-fixtures.ts`; `apps/web/src/features/profile/client.ts`, `client.test.ts`; `apps/web/src/features/records/RecordToastStack.tsx`, `RecordsPage.tsx`, `subject-records-table.css`; `apps/web/src/components/feedback/useToastNotifications.ts`, `ToastStack.tsx`, `toast-stack.css`; `tools/offerings/test-ui.mjs`; `docs/cachingguide.md`, `docs/themeguide.md`, and both change records.
- **Summary:** Data/filter/cache implementation passed coordinator review. Guided UI adds configured year/semester controls, explicit Taken/Exempted/recognized-credit summary, left academic-history/sidebar, searchable category-filtered semantic subject table, Normal/Short rules with SECJ3032 exception, unknown/ambiguous states, retained hidden selections, and the existing draft-review-confirm-save flow. Shared toast is supplementary; durable state/errors remain.
- **Decisions / deviations from plan:** The data/filter/cache stage added no page, CSS, or toast changes. The dependent guided UI stage was then implemented and reviewed using the approved shared toast consumer. P001 and P002 authorization response fallbacks remain scoped to typed denial handling; no API route response, database migration, provider call, or live database access was added.
- **Migrations / env / shared contracts:** No migration or environment change. Shared OfferingSubject and OfferingPageData additions are optional; existing overlays without the fields remain decodable. PUT still uses only `curriculumSubjectId`.

## 3. Review

- **Self-review checklist:** Data/filter/cache and guided UI passed coordinator review. Guided UI preserves curriculumSubjectIds in selection and PUT, retains hidden saved IDs and removal, keeps failed drafts, confirms semester discard, and labels missing/ambiguous metadata. Category-missing subjects remain visible as Other / unknown; definite code/credit rules apply and other rows are not category-classified. Semantic table is locally scrollable by keyboard at narrow/tablet widths. Human/peer approval pending.
- **Test evidence:** Offerings: `npm.cmd run test:offerings` (109 passed, 8 skipped), `typecheck:offerings`, `lint:offerings`, `build:offerings`, and `test:ui:offerings` (31 browser checks) passed. Integrated: `npm.cmd run typecheck`, `test` (299 passed, 13 skipped), `lint`, and `build` passed. P001 test UI passed all 38 mocked checks. `git diff --check` passed. No live DB/provider query.
- **Manual checks:** Reviewed fresh desktop and 375px mobile browser screenshots. The 375px page and 800px tablet test had no page-level horizontal overflow; subject table scrolling is contained in its focusable labeled region.
- **Defects found and fixes:** Review identified and reverted earlier P001 client changes outside scope. Coordinator then authorized a focused P001 correction because malformed academic-record denials otherwise degrade to unknown history. Also changed history summary to unavailable on incomplete/duplicate catalogue mappings, excluded Failed/Withdrawn credits, and normalized malformed/unreadable P001/P002 401/403 bodies. Final focused checks are recorded below.
- **Review outcome:** PASS - COORDINATOR REVIEW of data/filter/cache, shared toast, and guided UI
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-27
- **Type:** Changed / Tests / Docs
- **Added / Changed / Fixed:** Added optional curriculum-subject metadata, typed own-history snapshot, history projection, duplicate handling, Normal/Short display predicates, five-minute P002 response cache, and cache guidance. Guided UI now presents configured semester controls, history summary/sidebar, semantic categorized subject table, retained hidden selections, and responsive controls; it consumes the reviewed shared toast stack while keeping durable feedback. PUT semantics and identifiers remain unchanged.
- **Affected routes / tables / consumers:** Existing authenticated `/api/semester-offerings` GET gains optional read-only fields from existing `curriculum_subject` columns; browser composes existing own-record `GET /api/academic-records`. Existing PUT route, payload, tables and authorization are unchanged.
- **Breaking changes / migration steps:** None; additive optional response fields only; no migration or environment change.
- **Verification summary:** Offerings unit/typecheck/lint/build passed; 31 browser checks passed, including normal/short edge cases and 375/800px scroller checks. Integrated typecheck/test/lint/build passed. P001 UI had 38 mocked checks passed. Screenshots: `dist-offerings/review/desktop-guided.png`, `dist-offerings/review/mobile-guided-375.png`. No database/provider/live query.
- **Outstanding blockers / follow-up:** Human/peer approval remains pending. Screenshots and browser evidence are available under ignored `dist-offerings/review/`.
- **Final status:** COORDINATOR REVIEW PASS - implementation complete; human/peer approval pending.
