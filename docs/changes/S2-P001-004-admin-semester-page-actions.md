# S2-P001-004 — Improve admin academic-semester page actions

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10
- **Sprint:** Sprint 2
- **Owner:** P001 / Aisar (P001 Programmer 1); merged into the current codebase by P004 on 2026-11-11
- **Renumbered:** the handoff named this record S2-P004-013-admin-academic-semester-actions; S2-P004-013 already exists (uc20-coordinator-review-ux), so it is S2-P001-004 here.
- **Related UC / FR:** UC20 admin academic setup; current-semester administration
- **Branch / PR:** `feature/student-profile-admin-academic-year` (handoff, based on `7b4b9af`); merged into `feature/s2-continue` / no PR
- **Reviewer:** Coordinator review PASS after source and desktop/mobile screenshot review; human peer review pending

## 1. Plan

### Objective / problem

Improve the visual hierarchy and accessibility of the `/admin/semesters` page's current/next summary, add and advance actions, and per-row controls. Keep the existing admin semester workflows and behavior intact.

### Scope and requirements

- In scope: clearer current and next semester summary, a consistent advance action, a distinct Add semester primary action, concise row action text with accessible row context, explicit current-row indication, coherent action grouping, responsive layout and readable control sizing.
- Preserve existing Add, Edit, Set current, Advance, reason dialogs, validation, error/retry behavior, API contracts and current-semester business rules. Keep Edit available on current rows and show Set current only on non-current rows.
- Out of scope: admin API/repository/database changes, current-semester selection semantics, schema/migrations, offerings/coordinator workflows, unrelated admin pages, filtering/search/sorting, new dependencies/assets, deployment, commit and push.

### Proposed implementation

- Expected files: `apps/web/src/features/admin/SemestersPage.tsx`; scoped additions to `apps/web/src/features/admin/admin.css`; `tools/admin/academic-ui-checks.mjs`; the relevant `tools/admin/test-ui.mjs` empty-summary assertion; and only minimal `tools/admin/academic-fixtures.mjs` expansion if needed for visual/accessibility assertions. No server/API files.
- UI: clarify the hierarchy of the current semester and next semester summary with existing admin palette and typography tokens. Style the Advance button consistently and distinguish it from Add semester. Make Add semester a primary button with icon/text using a small repository-native SVG only if helpful; add no dependency or external asset.
- Row actions: display concise “Edit” and “Set current” text. Retain accessible row-specific names such as `Edit 2026/2027 · Semester 1` and `Set current 2026/2027 · Semester 1`. Group row controls with consistent gap, alignment and sizing; visibly distinguish the current row/badge. Reuse the existing setup-table scroll region and reason dialogs.
- CSS: scope additions to the admin-semesters page. Use existing admin tokens/patterns; action controls must be at least 44px high and body/control text at least 14px. Add a scoped override if reusing `.admin-row-action` (currently 13px). Preserve keyboard focus and dialog semantics. Maintain responsive summary/actions and no horizontal page overflow at 375px; the table itself may use its existing scroll region.
- No table filters, search or sorting are requested, so do not add a table toolbar.
- Dependencies / shared-file impact: no API, shared contract or other admin-page changes. The test harness may gain focused layout/readability checks and screenshots.

### Acceptance criteria

- [x] Current and next semester are easy to scan; Advance to next semester is consistently styled and remains correctly unavailable when no next semester exists.
- [x] Add semester remains an obvious primary action with an accessible name and repository-native icon.
- [x] Rows visibly identify the current semester; current row retains Edit but has no Set current action; non-current rows have both concise actions with accessible semester context.
- [x] Row actions have consistent spacing/alignment and remain usable at desktop and mobile widths without page-level horizontal overflow at 375px, 800px, 1024px and 1440px.
- [x] Existing add/edit validation, dates, reason dialogs, current switching, advance, inline error handling and retry behavior are unchanged and continue to pass existing admin UI checks.
- [x] New/updated UI checks call `assertReadable`, verify action sizing/accessibility and capture desktop/mobile review screenshots.
- [x] CSS changes are scoped to the semesters page; no unrelated admin pages, API, database, offering/coordinator feature, dependency or deployment changes.

### Verification plan

- Extend `tools/admin/academic-ui-checks.mjs` with desktop/mobile layout and action/readability assertions, while retaining the existing admin academic UI cases for nullable current state, create/edit/date validation, set/switch/advance and inline API errors.
- Run the admin UI suite and inspect desktop/mobile screenshots. Verify concise visible labels and row-specific accessible names, keyboard operation/focus for actions and dialogs, >=44px action controls, >=14px text, and no page overflow at 375px.
- Run scoped lint/typecheck as appropriate, then the authorized final broad checks after the preceding profile-period mini-task is reviewed. No local database/runtime checks or live DB writes are needed because behavior/API are unchanged.

### Risk / assumptions / rollback

- Risks: CSS leakage into other admin pages, long row context labels returning to cramped visible controls, or changing an action's accessible name in a way that breaks keyboard/screen-reader use. Keep context in `aria-label` and scope styles locally.
- Assumptions / blockers: existing `SetupCard`, `SetupTable`, admin palette/type tokens and `ReasonDialog` remain the page foundation. The handoff used P004 sequence `013`, which is taken in this repository; the record is renumbered to S2-P001-004.
- Rollback: revert only this page, its scoped CSS, focused fixtures/checks and this change record. No persisted data or server behavior changes.

## 2. Implementation

- **Status:** IMPLEMENTATION COMPLETE; coordinator review PASS.
- **Files actually changed:** `apps/web/src/features/admin/SemestersPage.tsx`; scoped `apps/web/src/features/admin/admin.css` additions; `tools/admin/academic-ui-checks.mjs` and its shared `tools/admin/test-ui.mjs` empty-summary assertion; this record. No fixture, API, database, dependency, offering or coordinator implementation changes.
- **Summary:** Added a scan-friendly current/next summary, primary Add semester action, consistently styled Advance action, concise grouped row actions with contextual accessible names, and a current-row badge. Summary and row controls adapt to narrow screens while preserving the existing local table scroll region.
- **Decisions / deviations from plan:** Summary uses accessible Current semester and Next semester groups so duplicate empty values remain unambiguous. At widths up to 1000px it stacks to fit beside the persistent sidebar. The mobile screenshot scrolls only the existing table region to show the action column.
- **Integration (2026-11-11, merged by P004):** 3-way merged into the current `SemestersPage.tsx` (base `7b4b9af`). Kept ours: the selection-window fields (Selection opens / closes), the "Selection" table column and the datetime-local handling added by S2-P004-017. Took his: the current/next summary groups, the primary Add semester button with icon, the Advance button class, the current-row badge and the concise grouped Edit / Set current actions with row-specific accessible names, plus his `admin.css` additions and UI checks (`Not configured` assertions now scoped to the Current semester group). The table headings are now Semester, Type, Limits, Dates, Selection, Current, Actions.
- **Migrations / env / shared contracts:** N/A — no API/database/schema changes.

## 3. Review

- **Self-review checklist:** [x] Scope limited to semester UI/CSS/browser checks; [x] existing dialogs and API calls retained; [x] visible labels shortened while preserving row-specific accessible names; [x] current row badge and action constraints; [x] responsive layout and local table scroll; coordinator reviewed source and both screenshots.
- **Test evidence:** `npm.cmd run test:ui:admin` — 44 administration browser checks passed, including the existing nullable-current, add/edit/date, set/switch/advance, reason and inline-error flow. Updated semester checks cover current S1 / next S2, accessible row names, current-row actions, >=44px / >=14px actions, page overflow at 375/800/1024/1440, and desktop/mobile screenshots. `assertReadable` passed as part of the admin harness. `npm.cmd run typecheck` and `npm.cmd run lint -- --no-fix` passed. Final `npm.cmd test` — 67 files passed, 5 skipped; 1,374 tests passed, 59 skipped. `npm.cmd run build` and `npm.cmd run build:local` passed; local build emitted its existing >500 kB chunk-size advisory. Coordinator reviewed source and both screenshots.
- **Manual checks:** Inspected `.wrangler/admin-review/academic-semesters-desktop.png` and `.wrangler/admin-review/academic-semesters-375.png`; desktop shows current 2026/2027 S1, next S2, primary Add, and concise row actions. Mobile keeps summary and action buttons visible; only the existing table scroll region is horizontally scrolled.
- **Defects found and fixes:** None reported.
- **Review outcome:** Coordinator review PASS after source and desktop/mobile screenshot review. Human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-10 (merged 2026-11-11); change ID S2-P001-004-admin-semester-page-actions (renumbered from S2-P004-013-admin-academic-semester-actions); owner P001; related UC20.
- **Type:** Changed, Tests, Docs.
- **Added / Changed / Fixed / Removed:** Improved visual hierarchy and action grouping on `/admin/semesters`; added responsive and accessible UI assertions and screenshots. Admin semester business/API behavior is unchanged.
- **Affected routes / tables / consumers:** Updated `/admin/semesters` UI only; existing academic-semester API and database contracts remain unchanged.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Admin UI 44 checks, typecheck, lint, full unit suite (1,374 passed / 59 skipped), build and build:local passed. Read-only UI fixtures only; no database writes.
- **Outstanding blockers / follow-up:** Human peer review pending. No commit or push.
- **Final status:** READY_FOR_REVIEW.
