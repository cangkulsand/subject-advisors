# S3-P004-018 — Close (×) at the top of every modal, icon buttons, Counted-first student list, plain coordinator menu

- **Status:** On branch `feature/modal-close-top` (not merged)
- **Date:** 2026-11-19
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20) with shared UI components
- **Related UC / FR:** UC20, FR-H4; themeguide 5.3 and 5.4
- **Branch / PR:** `feature/modal-close-top`; no PR
- **Reviewer:** Pending

## 1. Plan

Owner requests (2026-11-19):
- hide Uncertain from the main forecast table;
- the eligible-to-take student list opens on Counted, with no All filter;
- Close sits at the top of every modal as an X icon, so a long modal can be closed without scrolling to the bottom;
- Refresh, Previous and Next become icon buttons;
- the coordinator sidebar loses the WORKSPACE caption and the Forecast planning group heading;
- record the modal and icon rules in the style guide.

## 2. Implementation

- **Shared components:**
  - `apps/web/src/components/dialog/DialogHead.tsx` and `dialog-head.css`: the title row with the X (`aria-label` "Close"). It sticks to the top of the dialog while the content scrolls, and each dialog sets `--dialog-pad`.
  - `apps/web/src/components/icon-button/IconButton.tsx` and `icon-button.css`: `IconButton` (refresh, previous, next) and `PagerButtons`.
- **Dialogs that now use `DialogHead`:**
  - coordinator `ActionDialog` and `ReadOnlyDialog`; the read-only dialog's bottom Close is removed and the X takes focus on open;
  - admin `ReasonDialog`, `AddUserDialog` and `SetupForm`;
  - planning `MoveDialog` and `ConfirmDialog`;
  - student `SubjectDetailsPanel`.
  - The records detail editor already had a top X and keeps it. The mobile menu drawer keeps its own ×.
- **Icon buttons:**
  - Pagers in admin lists, forecast subjects, View students, Pickers and coordinator assignments.
  - Refresh on coordinator Subjects, the admin page heading ("Refresh data"), student progress and the plan header.
  - Accessible names are unchanged.
  - Refresh buttons that are the way out of an error or warning stay as text.
- **Forecast table:** the Uncertain column is removed. The "Has uncertain students" filter stays, and the dialog still shows the Uncertain count.
- **`SubjectStudentsDialog`:**
  - Filters are Counted, Uncertain, Near graduation and Not counted. The list opens on Counted, and Clear filters returns to Counted.
  - Search applies within the chosen filter.
- **Sidebar:**
  - The WORKSPACE caption is removed from the shared staff sidebar, so admin loses it too.
  - The coordinator's Class Offering Forecast and Offering History are single links with no group heading.
- **Docs:** `docs/themeguide.md` gains 5.3 "Modal close button (mandatory)" and 5.4 "Icon buttons for repeated controls (mandatory)".

## 3. Verification

typecheck and lint pass. UI suites with Chrome:

| Suite | Result |
| --- | --- |
| coordinator | 56 PASS |
| admin | 51 PASS |
| integration | 75 PASS |
| auth | 12 PASS |
| landing | 9 PASS |

The coordinator tests also check that:
- the X is in the title row, has no text, takes focus and stays at the top after scrolling;
- the list opens on Counted and has no All option;
- the table has no Uncertain column;
- the menu has four plain links.

## 4. Changelog

- Modals close from an X at the top.
- Refresh and paging use icons.
- The student list opens on the counted students.
- The Uncertain column is hidden.
- The coordinator menu is flat.
