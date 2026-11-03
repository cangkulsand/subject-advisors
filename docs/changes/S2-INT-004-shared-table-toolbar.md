# S2-INT-004 — Shared table toolbar (tabs, search, filter and sort menus)

- **Status:** MERGED to `main` (2026-11-03); human peer review pending
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** `feature/s2-typography-guideline` (same branch as [S2-INT-003](S2-INT-003-typography-scale-and-guideline.md)); no PR
- **Reviewer:** Coordinator review

## 1. Plan

User request: "set a style guide all table must do this type of filter", modelled on the TailAdmin table toolbar (light mode, burgundy brand). One shared React component set, no new dependencies, a mandatory guideline and a guard. API and query semantics are unchanged: existing server-side filters map onto the new controls.

## 2. Implementation

- **Component:** `apps/web/src/components/table-toolbar/TableToolbar.tsx` + `table-toolbar.css` exporting `TableToolbar`, `SegmentedFilter`, `SearchField`, `FilterMenu` (filter and sort variants, multiple groups per popover), `ClearFilters`. Popover is CSS-absolute, width 12rem, capped at viewport minus 32px, closes on outside click, Escape (focus returns to the button), Tab and selection; ArrowUp/Down/Home/End move between options. Sizes use the typography tokens (group heading is 12px, the minimum).
- **Applied to:**
  - Admin Users & Access: tabs All / Active / Suspended / Invited (same state as the old Access select), Filter menu (Role; Invitation status when Invited is selected), search (Enter applies, as the old Search button did), Clear filters.
  - Admin Audit Log: event-type tabs; the From/To date fields and Apply filters button stay in the toolbar.
  - Coordinator forecast Subjects: Decision tabs (All / Pending / Approved / Reviewed; Deferred, Mixed and No sections sit in the Filter menu group "Other decisions" because the tabs hold at most four), Filter menu (Class type, Flags), Sort menu, search. Behaviour kept: name A-Z default, page reset on filter, the finalize "pending jump" clears filters.
  - Student offerings: the subject search uses `SearchField` (category filter is already commented out in P002's page, so no menu).
- **Not changed (no filtering exists today, so there is nothing to map):** semesters, faculties/programmes/learning centres, coordinator assignments, forecast list, accepted imports, offering decisions, student records. The guideline requires the shared toolbar the moment they gain filters. Flag for their owners if tabs/search are wanted now.
- **Tests updated:** `tools/admin/test-ui.mjs` (tabs, Filter menu helper, Enter to search), `tools/coordinator/test-ui.mjs` (tabs and menus, menu-open screenshots at desktop, 320 and 375, no-overflow and in-viewport menu assertions, Escape returns focus, readable controls).
- **Guard:** `tools/ui/readability.mjs` also fails for `.tt-search`/`.tt-menu-button` under 44px and `.tt-segment` under 40px.
- **Docs:** `docs/themeguide.md` section 5.2 "Table toolbar (mandatory)", AGENTS.md, CONTRIBUTING.md, implementationguide checklist.

## 3. Review

Verification is recorded with S2-INT-003 (full command list rerun after this change). Screenshots opened: coordinator subjects with Filter menu open at desktop and 375px, admin users desktop.

## 4. Changelog

- 2026-11-03 — Type: UI/Docs. Added the shared table toolbar and applied it to admin users, admin audit log, coordinator forecast subjects and the offerings search; documented as mandatory in the theme guide. Tables without filters (semesters, faculties, centres, assignments, forecast list, accepted imports, offering decisions, student records) adopt it when they gain filtering. Status: MERGED.
