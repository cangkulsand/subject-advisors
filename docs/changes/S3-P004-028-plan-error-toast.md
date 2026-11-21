# S3-P004-028 — Hotfix: graduation plan errors show as toasts

- **Status:** Implemented on branch; not merged or deployed
- **Date:** 2026-11-21
- **Sprint:** Sprint 3
- **Owner:** P004 (graduation plan, S3-P004-004 / S3-P004-010)
- **Related UC / FR:** UC14–UC16 graduation plan
- **Branch / PR:** `hotfix/plan-error-toast`; no PR
- **Reviewer:** Pending

## 1. Plan

When a student drags a subject to a semester where it cannot go, the reason appeared in one line at the top of the plan board. A student working further down the page did not see it, so the drop looked like it silently failed. The owner asked for the error to be visible right away.

Decision: use the shared toast (`components/feedback/ToastStack`, already used on Offerings and Records). It appears at a fixed place on screen and closes by itself, so students see it wherever they are without having to dismiss a popup after every refused drag.

Out of scope: the page load error (the page has nothing else to show, so it stays inline), the plan engine and its messages, the API.

## 2. Implementation

- `apps/web/src/features/planning/PlanBoard.tsx`: new `onRefuse(reason)` prop. A refused drag, drop on "postpone" or Move dialog choice calls it. The inline message line at the top of the board is removed.
- `apps/web/src/features/planning/PlanningPage.tsx`:
  - uses `useToastNotifications` and renders `ToastStack`;
  - refused moves, and a refused Remove in "Your changes", show a **warning** toast;
  - a failed save shows a **danger** toast once ("Your last change was not saved. Use Try again at the top of the plan."); the "Not saved / Try again" control stays;
  - when the plan becomes out of date it shows a **warning** toast once; the out-of-date banner stays.
- `tools/integration/test-ui.mjs`: the refused-drag test reads the reason from the toast and checks the old inline line is gone; the failed-save and out-of-date tests also check their toast; banner checks now look only at the banner.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 1849 passed, 65 skipped |
| `npm run test:ui:integration` | 75 PASS, 0 FAIL (Clerk and API mocked; includes the dark-mode readability check) |

Not done: no screenshot review in a real browser session.

## 4. Changelog

- On the graduation plan, a move that is not allowed, a failed save and an out-of-date plan now show as a toast at the bottom right of the screen, so the student sees it right away.
