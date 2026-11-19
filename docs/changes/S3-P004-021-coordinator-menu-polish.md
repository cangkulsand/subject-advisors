# S3-P004-021 — Staff menu focus ring, label size, shorter forecast label; page descriptions on Data Imports and Forecast

- **Status:** Merged to main and pushed to dev and prod (2026-11-19); prod deploy verified live; independent review pending
- **Date:** 2026-11-19
- **Sprint:** Sprint 3
- **Owner:** P004 (coordinator and shared staff UI)
- **Related UC / FR:** UC20; themeguide 5.5 and "Typography and readability (mandatory)"
- **Branch / PR:** `feature/coordinator-menu-polish`; no PR
- **Reviewer:** Pending

## 1. Plan

A UI/UX review of the coordinator menu (2026-11-19) found four small issues the owner asked to fix:

1. **Focus ring clipped.** The 3px focus outline sits 3px outside each menu link, and `.admin-sidebar nav` scrolls (`overflow-y: auto`), so the left and right sides of the ring are cut off. The same applies to the admin "Academic setup" group heading.
2. **Missing page description.** Themeguide 5.5 says the page heading holds the h1 and one short muted sentence. Offering History has one; Data Imports and Class Offering Forecast do not. The `description` values in the `CoordinatorRoutes.tsx` `pages` map were never rendered.
3. **Menu labels small and faint.** Menu links used `--font-size-label` (13px) in `#555`. They become `--font-size-control` (14px), and coordinator menu links use a darker grey.
4. **"Class Offering Forecast" wraps at tablet width.** At 1024px (218px sidebar) the label breaks onto two lines. The menu and the Overview card use the shorter "Offering Forecast"; the page title stays "Class Offering Forecast".

Out of scope: the Overview page content, the "workspace" wording, the top bar and the other polish items from the review.

## 2. Implementation

- `apps/web/src/features/admin/admin.css`:
  - menu links and group headings in the sidebar and drawer draw their focus ring inside the element (`outline-offset: -3px`), so the scroll area no longer clips it. Admin and coordinator share these rules;
  - menu links use `--font-size-control` (14px) for both roles;
  - new token `--staff-nav-link` sets the inactive link colour. Admin keeps `--staff-nav-muted`; the coordinator uses `#3d3d3d` (about 10.6:1 on `#faf6ee`, up from 7.0:1).
- `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`:
  - the menu link (and so the Overview quick-link card) reads "Offering Forecast";
  - the unused `description` field is removed from the `pages` map; each page now owns its description.
- `ImportsPage.tsx` and `ForecastsPage.tsx`: `PageHeading` gets a one-line description. The Data Imports text does not mention CSV upload, because CSV import is hidden (S3-P004-020).
- Tests updated for the new label: `tools/coordinator/test-ui.mjs`, `tools/admin/test-ui.mjs`.

## 3. Verification

typecheck and lint pass. UI suites with Chrome:

| Suite | Result |
| --- | --- |
| coordinator | 56 PASS (readability guard included) |
| admin | 50 PASS (unchanged `main` also runs 50) |

Screenshots with the TEST-ONLY fixtures, taken by the coordinator (not committed):
- at 1440px, keyboard focus on "Data Imports" shows a complete ring on all four sides;
- at 1024px, every menu label fits on one line;
- Data Imports shows its description under the title.

Not run: integration and P001 suites (no changes to their screens).

Execution note: `AGENTS.md` asks for execution by `gpt-6-luna`. That model is not available in this Claude Code session, so the coordinating agent made the change directly. An independent review is still pending.

## 4. Changelog

- The staff menu shows a complete keyboard focus ring and slightly larger, darker labels.
- The coordinator menu reads "Offering Forecast", which fits on one line at tablet width.
- Data Imports and Class Offering Forecast show a one-line description under the page title.
