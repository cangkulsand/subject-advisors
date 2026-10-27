# S1-P001-011 — Stacked semantic record notifications

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-27
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; production `main` publication authorized but not performed
- **Reviewer:** Coordinator reviewed implementation and screenshot; human peer review pending

## 1. Plan

### Objective / problem
Replace the single-message record success toast with a React-managed stack of short semantic notifications. Successful record actions, including clear and restore, should be green; informational/cancel messages blue; warning amber and danger red reserved for actual warnings/errors. Messages must not overwrite each other.

### Scope and requirements
- In scope: up to three newest notifications, newest at bottom-right, per-toast independent five-second lifetime, manual close with exit animation and guaranteed timer fallback, entry/exit motion with reduced-motion support, safe React text rendering, short action-oriented message copy, semantic feedback colors guidance; prevent async completions after unmount from creating timers; apply current P001 action-button standard (blue actions, red explicit Cancel) to profile and records pages.
- Out of scope: durable error presentation (keep existing alerts), Undo behavior, API/cache/data semantics, general application theme/action restyle, dependencies, unrelated toast consumers.

### Current behavior and intended behavior
- Current RecordsPage stores one success string, so each message replaces the previous one. Current toast is burgundy and displays verbose record-update messages.
- Intended behavior: show up to three latest toasts with semantic styles and check/other inline SVG icons. Fourth notification removes the oldest. Each toast owns its timer; dismissal exits and is removed after a bounded fallback even with reduced motion or missing `animationend`. Preserve five seconds total display time, including timed exit.

### Proposed implementation
- Expected files: `apps/web/src/features/records/RecordToastStack.tsx`, `apps/web/src/features/records/RecordsPage.tsx`, `apps/web/src/features/records/subject-records-table.css`, `apps/web/src/features/profile/ProfilePage.tsx`, `apps/web/src/features/profile/profile.css`, `apps/web/src/app/student-shell.css`, `tools/p001/test-ui.mjs`, `docs/themeguide.md`, this record, and update `docs/changes/S1-P001-010-record-update-toasts.md`, `docs/p001-sprint1-handoff.md`, and `docs/changes/S1-INT-012-p001-session-publication.md`.
- Use React text nodes only for messages; do not use `innerHTML` or unmanaged DOM. Semantic colors for feedback: success green, info/action blue, warning amber, danger/cancel red. The current shared UI standard (user direction 2026-10-27) uses blue `#2563EB`/hover `#1D4ED8` for action buttons and red `#B91C1C`/hover `#991B1B` for explicit Cancel buttons, overriding earlier neutral Cancel and teal/burgundy primary-button guidance. It applies to all owners' future UI work, but this implementation changes only current P001 profile and records action buttons. Keep burgundy `#521f28` for the application shell/navigation and non-action brand accents.

### APIs / database / cross-programmer impacts
- No API, database, cache, authentication, or shared-contract changes. Local P001 Records UI only; theme guide gains a narrow semantic-feedback rule referencing the established burgundy override for primary brand.

### Acceptance criteria
- [x] Four quick successes retain only the newest three, stacked bottom-right; all use simple messages (`<code> marked as Taken/Exempted`, details saved, record cleared/restored).
- [x] Each toast has an independent five-second timer; one message expiring does not dismiss later messages.
- [x] Manual close shows exit motion; timer fallback removes after bounded time without waiting on animation events, including reduced motion.
- [x] Success is green for every successful record mutation including clear/restore, info blue, warning amber, danger red; visible text/icon conveys meaning without color alone.
- [x] Profile and records action buttons use blue; explicit Cancel buttons use red, with hover colors; tabs, checkbox accents, navigation and shell retain their existing styles.
- [x] Student-controlled strings render as text, not HTML; errors remain durable and Undo stays usable.
- [x] Focused P001 UI suite, strict typecheck and lint pass; ignored screenshot shows a green three-toast stack.

### Verification plan
- Extend `node tools/p001/test-ui.mjs` for four rapid actions, newest-three cap, per-toast independent expiry, manual exit, no HTML injection, reduced-motion fallback, and Undo persistence.
- Run focused P001 TypeScript check/lint and `git diff --check`; capture `.wrangler/p001-review/records-toast-stack.png` (ignored).

### Risk / assumptions / rollback
- Timer maps must be cleared for unmounted/evicted toasts and on component unmount. Keep max stack and all DOM owned by React. Revert this local toast component/page/CSS/tests and docs to roll back; no data or migration rollback exists.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/web/src/features/records/RecordToastStack.tsx`, `RecordsPage.tsx`, `subject-records-table.css`, `apps/web/src/features/profile/ProfilePage.tsx`, `profile.css`, `apps/web/src/app/student-shell.css`, `tools/p001/test-ui.mjs`, `tools/integration/test-ui.mjs`, `docs/themeguide.md`, this record, `docs/changes/S1-P001-010-record-update-toasts.md`, `docs/p001-sprint1-handoff.md`, and `docs/changes/S1-INT-012-p001-session-publication.md`.
- **Summary:** Added a React-managed stack showing at most three newest messages at bottom-right. Each toast has a unique ID and own five-second timer; manual close animates out with a 300ms fallback, auto-close includes its exit in the five seconds, and reduced-motion disables animation without blocking removal. Message text renders as React text. Success is green, informational notices blue, and clear/restore both receive green success. Errors remain durable and Undo persists independently. P001 action buttons are blue and explicit Cancel buttons red; shell/navigation remain burgundy.
- **Decisions / deviations from plan:** Latest user direction supersedes the original single burgundy toast behavior in S1-P001-010 and the prior teal/burgundy primary-action guidance. Semantic notification/action colors now appear in themeguide; current session publication record and handoff updated. No packages added.
- **Migrations / env / shared contracts:** None. The shared shell CSS adds only the scoped token definitions and P001 hover override required for the approved button colors; auth/navigation actions were untouched.

## 3. Review

- **Self-review checklist:** Toast queue is React-owned, capped at three and keeps stable IDs. Each toast gets an independent timer; evicted/unmounted timers clear and a mount guard blocks late async success from creating new timers. Auto-exit begins at 4.7s and removes at 5s; manual exit uses animationend plus a 300ms fallback. Reduced-motion disables both animations but preserves bounded timer dismissal. Messages render as text. Errors remain durable; Undo is separate. Action/Cancel colors use semantic tokens, shell override was checked in the installed app. No API/cache/auth changes.
- **Test evidence:** `node tools/p001/test-ui.mjs` — PASS, 38 browser checks covering newest-three cap after four successes, simple message copy, independent five-second expiry, manual exit animation, reduced-motion fallback, unsafe-looking subject-code text, durable failures, Undo after dismissal, and no page overflow with an active three-toast stack at 320px/375px. `node node_modules/typescript/bin/tsc -p tsconfig.p001.json` — PASS. Focused ESLint on the changed React and UI test files — PASS, zero warnings. `node tools/integration/test-ui.mjs --installed` — PASS, 25 checks including real shared-shell blue action/red Cancel hover colors. `git diff --check` — PASS (line-ending notices only).
- **Manual checks:** Reviewed `.wrangler/p001-review/records-toast-stack.png`; three solid green notifications display together, close controls remain usable at 44px, the primary shell remains burgundy, and the detail action is blue. No live account/data was used.
- **Defects found and fixes:** Review added a mount guard so late writes cannot create orphan timers after unmount; increased toast close target to 44px and raised CSS specificity over shared P001 button rules; scoped animation clipping to prevent mobile page overflow; corrected actual shared-shell hover colors to use semantic blue/red tokens. Semantic review also changed successful clear feedback from amber to green and expanded the theme guide with the canonical stack, animation, timer, copy, Undo and durable-error contract. Documentation-only corrections were not followed by further runtime tests.
- **Review outcome:** PASS — SELF-REVIEW; coordinator accepted the current queue, timer/animation behavior and screenshot. Human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-27
- **Type:** Changed; Tests; Docs
- **Added / Changed / Fixed / Removed:** Added stacked semantic toasts, independent timers, safe React message rendering, semantic action colors and current P001 blue-action/red-Cancel behavior; updated theme guidance, test coverage and session/handoff records.
- **Affected routes / tables / consumers:** P001 student profile/records UI only; no endpoints or tables.
- **Breaking changes / migration steps:** None.
- **Verification summary:** P001 browser checks 38 pass; P001 typecheck and focused ESLint pass; installed shared integration browser checks 25 pass; `git diff --check` passed.
- **Outstanding blockers / follow-up:** Human peer review pending; no stage/commit/push.
- **Final status:** READY_FOR_REVIEW.
