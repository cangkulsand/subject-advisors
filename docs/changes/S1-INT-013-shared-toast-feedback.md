# S1-INT-013 — Shared semantic toast feedback

- **Status:** COMPLETE
- **Date:** 2026-10-27
- **Sprint:** Sprint 1 integration
- **Owner:** INT / Integration coordination
- **Related UC / FR:** UC04 records feedback; UC08 student-reported offerings feedback
- **Branch / PR:** `main`; no commit or push in this task
- **Reviewer:** Coordinator review PASS

## 1. Plan

### Objective / problem
P001 records already has accessible stacked toast feedback, while the UC08 offerings UI needs the same standard. Extract one owner-independent React queue/component so both features can share notifications without duplicating timers, stacking, semantics, or CSS.

### Scope and requirements
- In scope: preserve current records behavior while exposing a shared queue hook and stack component suitable for the planned offerings client API `notify(message, 'success')`.
- Out of scope: any P002 contract/client/plan implementation, offerings UI, record CRUD/filter/tab behavior, backend behavior, new packages, commit, or push.

### Proposed implementation
- Expected files: `apps/web/src/components/feedback/ToastStack.tsx`, `toast-stack.css`, `useToastNotifications.ts`; compatibility re-export in `apps/web/src/features/records/RecordToastStack.tsx`; queue wiring in `RecordsPage.tsx`; remove extracted rules from `subject-records-table.css`; add shared import guidance to `docs/themeguide.md` and complete this change record.
- Reuse existing `.p001-record-toast*` class names to preserve P001 selectors and tests, but style them without a `.p001` ancestor. Use sufficiently specific stack-scoped button selectors so host feature button rules cannot overwrite the close control.

### APIs / database / interfaces
- No API, database, or schema changes. Shared hook returns `toasts`, `notify(message, kind?)`, `dismissToast(id)`, and `onToastAnimationEnd(id, event)`; the stack consumes these values. The existing record module keeps `RecordToastStack`, `RecordToast`, and `RecordToastKind` exports compatible.
- P002-owned files remain untouched; shared files impact P001 and future UC08 consumers.

### Acceptance criteria
- [x] Queue retains the newest three notifications with unique IDs and independent five-second timers (including bounded exit), manual close, reduced-motion-safe fallback, and unmount cleanup/mounted guard.
- [x] Shared component safely renders message text and maintains semantic green/blue/amber/red styles and existing accessible labels/roles.
- [x] RecordsPage retains existing behavior via the shared hook; existing imports remain compatible.
- [x] P001 browser regressions and focused type/lint checks pass; scoped CSS compatibility inspected.
- [x] No P002-owned files, record data behavior, backend contracts, new dependencies, stage/commit/push are changed.

### Verification plan
- Run `npm run test:p001:ui` (or the repository's existing focused P001 browser command), relevant web typecheck and focused lint; inspect `git diff --check` and staged/unstaged status. Do not access live DB/auth services.

### Risk / assumptions / rollback
- Existing P001 browser tests may assert class names; preserve those names and the legacy wrapper. Keep CSS imported by the shared component and avoid host-page selectors. Roll back by restoring RecordsPage's queue and stylesheet rules and removing the shared component; no data/API rollback is needed.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/web/src/components/feedback/ToastStack.tsx`; `apps/web/src/components/feedback/toast-stack.css`; `apps/web/src/components/feedback/useToastNotifications.ts`; `apps/web/src/features/records/RecordToastStack.tsx`; `apps/web/src/features/records/RecordsPage.tsx`; `apps/web/src/features/records/subject-records-table.css`; `docs/themeguide.md`; this record.
- **Summary:** Extracted a reusable semantic stack component and notification hook with unique IDs, three-item newest-retained queue, per-toast five-second lifetime including exit, manual close, reduced-motion fallback, animation-end removal, unmount timer cleanup and mount guard. The component renders untrusted message strings as React text and keeps the established accessible status/live-region markup. Moved toast styles to the shared component stylesheet, retained the old records component/types as re-exports, and wired RecordsPage to the shared hook. Documented the shared import path in the theme guide.
- **Decisions / deviations from plan:** Preserved existing `.p001-record-toast*` selectors for P001 browser compatibility while making the stylesheet owner-independent. The close-button selector is scoped to the stack itself, with enough specificity to resist host feature button styles. No P002-owned files were changed.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** PASS — shared behavior extracted without changing record CRUD, tabs, filters, Undo, backend contracts, or cache behavior; compatibility exports retained; source message interpolation remains React-safe; no P002-owned paths changed; no dependency added.
- **Test evidence:** `node tools/p001/test-ui.mjs` PASS (38). The first run had a transient timing assertion at the three-toast count; the immediate rerun passed all 38 checks, including newest-three stacking, independent expiration, manual close with durable Undo, reduced motion, safe text rendering and mobile overflow. `node node_modules/typescript/bin/tsc -p tsconfig.auth.json` PASS. Focused ESLint on ToastStack, hook, compatibility re-export and RecordsPage PASS (`--max-warnings 0`). `git diff --check` PASS (line-ending conversion notices only).
- **Manual checks:** Inspected P001 compatibility selectors and verified shared toast CSS has no `.p001` ancestor dependency. Current worktree contained independent P002 changes; those files were preserved and excluded from this task.
- **Defects found and fixes:** Initial focused browser run transiently observed only two messages at the three-message assertion. A rerun passed the complete suite; no code correction was indicated.
- **Review outcome:** PASS — SELF-REVIEW AND COORDINATOR REVIEW
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-27
- **Type:** Changed
- **Added / Changed / Fixed / Removed:** Added shared toast queue hook, accessible stack component and independent stylesheet; refactored records feedback to use the shared implementation; documented its public import path.
- **Affected routes / tables / consumers:** Records page; intended shared offerings consumer after coordinator review.
- **Breaking changes / migration steps:** None planned; legacy exports retained.
- **Verification summary:** P001 UI suite 38 PASS on rerun; auth TypeScript project PASS; focused ESLint PASS; `git diff --check` PASS.
- **Outstanding blockers / follow-up:** None for this mini-task. UC08 UI consumes the reviewed shared toast stack; P002-owned feature files remain separately reviewed.
- **Final status:** PASS — COORDINATOR REVIEW; HUMAN/PEER APPROVAL PENDING
