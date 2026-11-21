# S3-P004-026 — Admin UI review, remaining items (icons, Overview tiles, notices, coordinator names, Users table, Current pill, phone tables and top bar, tablet tables); code-review fixes for snapshot removal

- **Status:** Implemented on `feature/admin-ui-polish-2` (2026-11-20); not merged; reviewed (see Reviewer)
- **Date:** 2026-11-20
- **Sprint:** Sprint 3
- **Owner:** P004 (admin and shared staff UI)
- **Related UC / FR:** Administration; themeguide 5.1, 5.2, 7.1, 11 and 12
- **Branch / PR:** `feature/admin-ui-polish-2`; no PR
- **Reviewer:** Automated code review (2026-11-20) of S3-P004-021, 022, 023, 025 and this change; findings fixed below

## 1. Plan

The admin UI review of 2026-11-20 listed 13 items. S3-P004-025 fixed 1, 2, 4, 7 and 9. The owner asked to fix the rest:

3. **Same icon on five menu items.** Learning Centres, Faculties, Departments, Programmes and Subjects & Prerequisites all used the document icon.
5. **Overview tiles.** All three said "View accounts" in 12px text with a tiny ↗, so a screen reader heard three identical links to different pages. "Assigned roles" had an uppercase "MEMBERSHIPS" label that no other card uses.
6. **Small notices.** Save messages were 12px. On Coordinator Assignments the helper sentence sat directly on the table.
8. **Coordinator Assignments showed internal IDs.** The account column read "Account 2" and the button "End assignment 2".
10. **Users & Access.** Long invitation emails broke mid-address, the Invited/Expires dates took four lines, and Status was a pill here but plain text on the setup pages.
11. **Current pill.** It was solid burgundy, like a primary button.
12. **Phone tables.** At 375px Status and the row actions ("View details", "Revoke", "Edit") were off screen until you scrolled sideways, and the "Suspended" tab read "Suspend…".
13. **Phone top bar.** The role switcher and Sign out wrapped onto a second row; the Overview refresh button sat on its own row.

Also: the S3-P004-025 wider tablet sidebar made the admin tables scroll sideways by 62px at 1024px (40px before).

## 2. Implementation

- **Icons (3):** `staff-navigation.tsx` adds `centre`, `faculty`, `department` and `programme` icons; `AdminShell.tsx` uses them. Subjects & Prerequisites keeps the book icon.
- **Overview (5):** `AdminPages.tsx` tiles read "View all accounts", "View active accounts", "View suspended accounts" with →. The tile label and link are 13px and 14px. "MEMBERSHIPS" is removed.
- **Notices (6):** `.admin-success` is 14px. The Coordinator Assignments helper text uses `.admin-setup-note` (muted, 14px gap below).
- **Coordinator names (8):** `CoordinatorAssignmentsPage.tsx` loads each coordinator's account details (one request per distinct account) and shows name and email. Until they load, or if one fails, the row shows "Account #id". The button reads "End assignment"; its accessible name is "End assignment for <name>, <programme> at <centre>". The confirm dialog names the person and place.
- **Users & Access (10):**
  - the account column is at least 220px and wraps at word boundaries;
  - invitation dates show the day only ("Invited 28 Oct 2026"); the full time is in the tooltip;
  - setup tables show Active/Inactive as pills (`StatusPill` in `academic-ui.tsx`; new `.admin-status-inactive`).
- **Current pill (11):** light burgundy tint with burgundy text and border, 13px, so it no longer looks like a button.
- **Phone tables (12):**
  - at 600px and below, setup tables, Users & Access and the access history stack each row, with a visible label per value (`data-label`, set by `SetupTable` from its headings, written directly in the other tables). Nothing scrolls sideways and every button is on screen;
  - the shared table toolbar sizes its tabs by label on narrow screens (`table-toolbar.css`), so "Suspended" is not cut off.
- **Phone top bar (13):** at 600px and below the role badge is hidden when the role switcher is shown (the switcher already shows the role), so the bar stays on one row. On narrow screens the page heading keeps a lone icon action (Refresh) beside the title.
- **Tablet tables:** between 761 and 1050px, tables have a 640px minimum width and 11px side padding, the account column is at least 200px, and setup row buttons may wrap. At 1024px no admin table scrolls sideways.
- **Tests:**
  - `tools/admin/academic-ui-checks.mjs`: coordinator names and email, no "Account #" or seconds, the end button and dialog text; at 320 and 375px stacked rows with every row button on screen (768px still scrolls);
  - `tools/admin/test-ui.mjs`: at 320 and 375px, Users rows stacked with status and actions on screen, tab labels not cut off, top bar on one row; new check that every admin table fits at 1024px.

### Code-review fixes (2026-11-20)

An automated code review of S3-P004-021, -022, -023, -025 and this change reported 8 findings. All are fixed here:

- **S3-P004-022 snapshot removal, four gaps:**
  - `runs-routes.ts`: the forecast replay now runs before the removal check, so a forecast made before its snapshot was removed still opens (the Forecast page opens forecasts through this idempotent call). A removed snapshot still cannot start a new forecast;
  - `decisions-routes.ts`: a decision can no longer cite a removed snapshot (IMPORT_NOT_FOUND);
  - `runs-repository.ts` + `errors.ts`: `createRun` re-checks the removal under the batch lock (`GUARD_RUN_REMOVED` maps to IMPORT_NOT_FOUND), so a removal committed between the route's check and the insert stops the run;
  - `routes.ts`: retrying a subset acceptance no longer returns a removed snapshot as accepted.
- **Phone tables:** a cell with several values (invitation dates, Protected owner pill, audit target id) kept its second value in the label column. Every value element now sits in the value column.
- **Screen readers:** stacked rows use `display: block`, which can drop table semantics. Tables now carry explicit `table`/`rowgroup`/`row`/`columnheader`/`cell` roles, and the header row is visually hidden instead of removed.
- **Invitation expiry:** "Expires" shows the time again (only "Invited" is day-only), since a tooltip is not reachable on touch.
- **Coordinator names:** at most four account lookups run at once.

Tests: new unit tests for each API gap (each fails without its fix); new UI checks that both invitation dates sit in the value column at 320 and 375px, that rows, cells and 5 column headers keep their roles, and that Expires shows a time.

Not run: the `createRun` guard against a live database. Dev and prod share the Neon database, so the database test was not run; the guard follows the existing `GUARD_RUN_EXISTS` pattern, and its error mapping is unit-tested.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (unit) | 1849 PASS, 65 skipped |
| `npm run test:ui:admin` | 51 PASS (one new check; readability guard included) |
| `npm run test:ui:coordinator` | 57 PASS (shares the shell and menu CSS) |
| `npm run test:ui:integration` | 75 PASS (shares the table toolbar) |

Screenshots with the TEST-ONLY fixtures (not committed): Overview and Coordinator Assignments at 1440px, Users & Access at 375px, Programmes at 1024px.

Execution note: the coordinating agent made this change directly.

## 4. Changelog

- Each academic setup menu item has its own icon.
- Overview tiles say which accounts they open.
- Save messages are easier to read.
- Coordinator Assignments shows each coordinator's name and email.
- Users & Access keeps emails and invitation dates tidy; setup tables show Active/Inactive as pills.
- The Current semester pill no longer looks like a button.
- On phones, admin tables show one card per row with labels, so actions are always on screen; the top bar fits on one row.
- At tablet width, admin tables fit without scrolling sideways.
