# S1-P001-003 — Reusable subject records table presentation

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up (authorized P001 UI component)
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC04 / subject-record presentation (presentation-only component)
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
Provide an isolated reusable native HTML table component for rendering subject rows and controlled Taken/Exempted selections, with pending and error feedback.

### Scope and requirements
- In scope: a prop-driven React component and feature-scoped stylesheet in `apps/web/src/features/records/`.
- Out of scope: integration into RecordsPage, ProfilePage, the shared S1-P001-002 work, profile.css, APIs/contracts/clients, tests runner, existing notes, persistence interpretation, deletion, grade data/column, dropdowns/plugins, fabricated statuses/data, and API calls.

### Current behavior and intended behavior
- Current records page is an existing API-backed attempt workflow. This addition will be independently importable and will receive all subject rows and selection/state via props; it will not alter that page.
- Each subject row presents code, name, credits, mutually exclusive Taken and Exempted checkboxes, and optional details action. Either selected state can be cleared by checking it again, emitting `null`.

### Proposed implementation
- Expected files: `apps/web/src/features/records/SubjectRecordsTable.tsx`, `apps/web/src/features/records/subject-records-table.css`, and this record.
- APIs / database / interfaces: no API or database change; typed controlled props/callback only.
- Dependencies / shared-file impact: React already installed; no shared files changed. CSS will be scoped and use inherited theme variables/fallbacks.

### Acceptance criteria
- [x] Semantic table with caption and column headers renders all provided subjects without built-in data.
- [x] Accessible subject-specific checkbox labels are mutually exclusive; clicking an active checkbox emits `null`.
- [x] Pending disables all selection/details controls and communicates visible pending text; error is visible and announced.
- [x] Optional details action only renders when provided; table overflow is confined to a local scroll region; controls have generous hit areas and visible focus.

### Verification plan
- Run a targeted TypeScript compiler invocation on the component. Inspect the component and scoped CSS manually. No tests requested or planned.

### Risk / assumptions / rollback
- Risks: CSS isolation/inherited template token naming may vary by host; use semantic CSS variables with established fallbacks.
- Assumptions / blockers: Sprint-specific source is absent in this workspace listing; the explicitly assigned task provides scope and requirements. Component is standalone and parent supplies row identities and current selection.
- Rollback: remove the new component, scoped CSS, and this change record; no consumer or data changes to revert.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:**
  - `apps/web/src/features/records/SubjectRecordsTable.tsx`
  - `apps/web/src/features/records/subject-records-table.css`
  - `docs/changes/S1-P001-003-subject-table-presentation.md`
- **Summary:** Added a standalone controlled table component. It renders the supplied rows, exposes a typed Taken/Exempted/null selection callback, allows clearing the active selection, disables checkboxes and optional details actions while pending, and shows visible pending/error messages.
- **Decisions / deviations from plan:** Added a keyboard-focusable local scroll container and per-row accessible names for checkbox and details controls. During coordinator review, strengthened scoped choice-label/input selectors so they override the profile form's flex and full-width input rules independent of stylesheet order; aligned fallback focus and checkbox accents with the shared burgundy template. No scope deviations.
- **Migrations / env / shared contracts:** None; no route or API consumer was changed.

## 3. Review

- **Self-review checklist:**
  - [x] Scope limited to the standalone component, local stylesheet, and change record; no prohibited files changed.
  - [x] Component contract is controlled and contains no persistence, API, data fixtures, grades, or status interpretation.
  - [x] Native table caption, column headers, and row headers are semantic.
  - [x] Subject-specific checkbox names, mutually exclusive selection representation, and clear-to-null behavior are present.
  - [x] Pending disables interactive controls; pending and error messages are visible, with status/alert semantics.
  - [x] Local horizontal overflow, 44px interaction target, visible focus, and inherited theme tokens are provided.
  - [x] Scoped checkbox styling has enough specificity to override `.p001 label` and `.p001 input` without `!important`, regardless of import order.
  - [x] No shared API, migration, or contract impact.
- **Test evidence:** `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --noUncheckedIndexedAccess --skipLibCheck --types node,vite/client --noUnusedLocals --noUnusedParameters apps/web/src/features/records/SubjectRecordsTable.tsx` — passed (exit code 0). No tests were run; this isolated presentation component has no requested test-runner changes.
- **Manual checks:** Reviewed component and scoped CSS source. No browser visual or keyboard session was run.
- **Defects found and fixes:** None found in self-review.
- **Review outcome:** PASS — SELF-REVIEW, including coordinator-requested cascade correction; peer review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26; change ID `S1-P001-003-subject-table-presentation`; owner P001; related UC04.
- **Type:** Added.
- **Added / Changed / Fixed / Removed:** Added reusable controlled native subject table and scoped stylesheet with optional details, accessible named selection controls, clear-to-null behavior, pending/error feedback, and cascade-safe burgundy fallback styling.
- **Affected routes / tables / consumers:** No route integration; exported component is available for a future consumer.
- **Breaking changes / migration steps:** None; no API, schema, environment, or shared-file changes.
- **Verification summary:** Targeted TypeScript check passed as recorded above. Tests and browser checks were not run.
- **Outstanding blockers / follow-up:** Peer review and any consuming-page integration are separate follow-up work.
- **Final status:** READY_FOR_REVIEW; human peer review pending.
