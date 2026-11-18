# S3-P004-014 — Staff page headers: no breadcrumb, no workspace eyebrow, role badge in the top bar

- **Status:** MERGED to main (fast-forward, 6e281f6) and deployed to dev and prod on 2026-11-18
- **Date:** 2026-11-18
- **Sprint:** Sprint 3
- **Owner:** P004 (staff shell for M6 coordinator and M7 admin)
- **Related UC / FR:** UC20–UC23 screens; admin setup pages (FR-I8–FR-I10)
- **Branch / PR:** `feature/staff-page-headers`; no PR
- **Reviewer:** Pending

## 1. Plan

Owner request: remove repeated text from admin and coordinator pages and give every staff page the same header.

## 2. Change

- Shared shell (`admin/staff-navigation.tsx`, every admin and coordinator page):
  - top bar shows the role badge ("Academic coordinator" / "System administrator") instead of the plain
    "Coordinator" / "Administration" title; the badge is no longer repeated next to Sign out and stays visible on
    small screens;
  - breadcrumb removed (`<main>` is labelled with the page title instead).
- Page headings: the "COORDINATOR WORKSPACE", "ADMIN WORKSPACE", "STAFF WORKSPACE" and "Curriculum management"
  eyebrows removed (`coordinator-ui.tsx` PageHeading, `CoordinatorRoutes.tsx` Overview, `AdminPages.tsx`,
  `StaffPlannedPage`, `p001-sprint2/CurriculumPage.tsx`).
- Repeated card titles removed, sections keep an accessible name: Data Imports "Forecast data setup / Imports and
  forecasts are kept separately for each scope."; Class Offering Forecast "Forecast scope / Choose a programme…";
  Offering History "Scope / Choose a programme…"; the shared `ScopePicker` "Forecast scope" title.
- CSS (`admin.css`): breadcrumb and eyebrow rules removed; badge style for the top bar; the first setup section no
  longer draws a divider.

## 3. Tests

- `tools/admin/test-ui.mjs` and `tools/coordinator/test-ui.mjs`: no Breadcrumb navigation, no workspace eyebrow, no
  "Forecast data setup", the top-bar title is the role badge and the badge is not repeated.
- Results: typecheck, lint pass; `npm test` 1841 passed (65 skipped); UI: coordinator 56, admin 51, auth 12,
  integration 76 PASS.

## 4. Changelog

- 2026-11-18 - Type: Changed. Staff pages: no breadcrumb or workspace eyebrow; role badge in the top bar; repeated
  scope-card titles removed.

## Later changes

- 2026-11-18 (owner request): the visible "Workspace view" text above the role selector is removed
  (`auth/RoleSwitcher.tsx`, shared by staff and student shells); the select keeps the accessible name and a tooltip
  "Workspace view". The top bar now fits on one row. Tests: admin 51 (new check: no visible "Workspace view" text),
  integration 76, coordinator 56, auth 12 PASS; typecheck and lint pass.
