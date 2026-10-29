# S1-P002-011 - Responsive prerequisite column

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 follow-up
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08; user-requested responsive presentation adjustment to S1-P002-010
- **Branch / PR:** `feature-offerings-prerequisites` / not created
- **Reviewer:** Coordinator AI review PASS; human peer review pending

## 1. Plan

### Objective / problem
The prerequisite details added by S1-P002-010 currently appear below the subject name in both desktop and narrow layouts. The user approved showing prerequisites in a dedicated table column on desktop while keeping the inline presentation below the subject name on mobile.

### Owner, scope, and requirement
- P002 / UC08 presentation follow-up only.
- Desktop subject catalogue shows five visible columns: Select, Subject, Prerequisites, Category, Credits.
- At widths 900px and below, show four visible columns and keep prerequisite details beneath each subject name.
- The earlier S1-P002-010 desktop four-column acceptance is superseded by this later user request for the desktop layout. The completed 010 record remains unchanged as historical evidence.

### Current and intended behavior
The catalogue table has four columns. Its subject cell includes the reusable `PrerequisiteDisplay`, which is also used in all selected review/saved list entries. The target change moves the visible desktop rendering into a dedicated Prerequisites column while retaining the same reusable display inline at narrower widths. Only one presentation variant is visible and accessible at a time.

### Proposed files and approach
- `apps/web/src/features/offerings/OfferingsPage.tsx`: add the prerequisite column header/cell and mark the existing inline rendering for responsive visibility.
- `apps/web/src/features/offerings/offerings.css`: set column widths, switch variants at the existing 900px breakpoint, and preserve the current narrow table scroller and layout.
- `tools/offerings/test-ui.mjs`: verify desktop five-column presentation, narrow four-column/inline presentation, no duplicated visible/accessibility content, and usable 320/360/900/901/1024/1280 widths; capture new desktop/mobile screenshots.
- This record only. Do not alter S1-P002-010 history.

### API, data, and cross-programmer impact
No API, shared types, decoder, client/cache, data, auth, save behavior, schema, migration, dependency, provider, Redis, or P001 changes. Reuse the existing `PrerequisiteDisplay` and its resolved names/statuses. Keep checkbox labels, category/history rules, filters, selected hidden entries, review/saved layout, confirmation, and write contract unchanged.

### Acceptance criteria
- [x] Desktop has exactly five visible column headers in the planned order and each catalogue row shows prerequisites only in the dedicated column.
- [x] At 900px and below, exactly four column headers remain visible and prerequisite details appear under the subject name; hidden desktop markup is `display:none` and absent from the accessibility tree.
- [x] Review and saved selected-subject lists retain the existing prerequisite groups and content without layout or behavior changes; their rendering was not changed.
- [x] Subject/category ordering, checkbox accessible names, filtering, hidden selection retention, confirmation/save/revisit behavior, and known-empty/unavailable labels remain intact under the responsive UI suite.
- [x] No page-level horizontal overflow at 320, 360, 900, 901, 1024, and 1280px; desktop prerequisite column remains readable near the breakpoint.
- [x] New screenshots show the column layout on desktop and inline layout on mobile, both with meaningful fictional prerequisite data.

### Verification and rollback
- Run `npm.cmd run test:ui:offerings`, `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, `npm.cmd run build:offerings`, `npm.cmd run typecheck`, and `npm.cmd run build:local` sequentially where generated build outputs could collide. Remove database URL variables from test/build command environments. Run `git diff --check`.
- Rollback consists of reverting this change's table column, scoped CSS, UI assertions/screenshots and this record; S1-P002-010 behavior remains available.
- Risk is limited to table readability near the breakpoint and duplicate accessible content if CSS visibility is not applied. No external data/provider risks.

## 2. Implementation

- **Status:** COMPLETE; ready for review
- **Files changed for this mini-task:** `apps/web/src/features/offerings/OfferingsPage.tsx`, `apps/web/src/features/offerings/offerings.css`, `tools/offerings/test-ui.mjs`, and this record. The prior 010 implementation remains the reviewed baseline.
- **Summary:** Added a dedicated desktop prerequisite column and retained a single visible/accessibility-tree inline rendering at 900px and below. Review/saved entries, prerequisite data and metadata handling, and selection/save behavior are unchanged.

## 3. Review

- **Self-review checklist:** Scoped to the existing UC08 table; no API/shared/cache/data or review/saved markup changes. Responsive variants use CSS visibility so only one is rendered visibly and exposed to assistive technology at each tested width.
- **Test evidence:** `npm.cmd run test:ui:offerings` passed (37 browser checks). `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, `npm.cmd run build:offerings`, `npm.cmd run typecheck`, and `npm.cmd run build:local` all exited 0. `git diff --check` is clean. Database URL variables were unset for the command environment; no database fixtures were used.
- **Manual checks:** Inspected 320, 360, 900, 901, 1024, and 1280px responsive states with no page-level overflow. Visually inspected desktop, 1024px, and mobile screenshots. The 1024px desktop column remains readable; mobile displays requirements beneath the subject name.
- **Review outcome:** PASS - self-review and coordinator code, visual, diff, and verification evidence review passed; human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** UI / Tests / Docs
- **Added / Changed / Fixed / Removed:** Added a responsive prerequisite column on desktop and inline prerequisite rendering at 900px and below; added responsive browser assertions and screenshots.
- **Affected routes / tables / consumers:** UC08 offerings page table presentation only. No route, table, API, or data changes.
- **Breaking changes / migration steps:** None.
- **Verification summary:** `test:ui:offerings` passed 37 checks; offerings typecheck, lint, and build passed; full typecheck and local build passed; `git diff --check` clean. Screenshots: `dist-offerings/review/prerequisites-column-desktop.png`, `dist-offerings/review/prerequisites-column-1024.png`, `dist-offerings/review/prerequisites-column-mobile.png`.
- **Outstanding blockers / follow-up:** Human peer review pending. S1-P002-010 remains historical; this authorized user request supersedes its desktop four-column constraint for the follow-up.
- **Final status:** READY_FOR_REVIEW