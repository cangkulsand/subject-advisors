# S2-INT-005 — Admin Curriculum & Prerequisites page uses the admin template theme

- **Status:** MERGED to `main` (2026-11-14); human peer review pending
- **Date:** 2026-11-14
- **Sprint:** Sprint 2
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** `feature/s2-admin-curriculum-theme`; merged into `main` on 2026-11-14 (merge commit e80f1cd); no PR
- **Reviewer:** P003 (owner of UC24) and Coordinator review

## 1. Plan

`/admin/curriculum` (`CurriculumPage.tsx`, UC24) rendered inside the admin shell but used Sprint 2 `s2-*` classes, so it looked unlike the other admin pages. Restyle it to the admin template. Presentation only: no API, state, validation, message or prop (`initialCurriculumId`) changes.

## 2. Implementation

- `CurriculumPage.tsx`: root is `admin-card`; headings, notes, errors and success use `admin-card-title`, `admin-eyebrow`, `admin-muted`, `admin-form-error`, `admin-success`; forms use `admin-form`, `admin-field`, `admin-check(s)`; primary actions use `admin-primary`. Subject list and saved relationships now render in the shared `SetupTable` (was `<ul>` lists). Tabs keep their roles, ids and keyboard handling. Dropped the `sprint2.css` import (only `ProgressPage` still uses it; `sprint2.css` is unchanged).
- `admin.css`: small scoped block `admin-curriculum-*` (tab strip, selector row, field grid, prerequisite picker, review panel, mobile rules).
- Shared table toolbar: not applied. The page has no table filtering, search or sorting; "Search prerequisites" is a picker inside a form, not a table filter.
- Tests: `tools/p001-sprint2/test-uc24-ui.mjs` selectors `.s2-picks li` and `.s2-nav [role=tab]` renamed to `.admin-curriculum-picks li` and `.admin-curriculum-tabs [role=tab]` because the classes were renamed; assertions are otherwise unchanged.

## 3. Review

Before/after screenshots at 1440 and 375 (Subject List, Create Subject, Manage Prerequisites) plus `/admin/programmes` for comparison. No horizontal page scroll at 375.

## 4. Changelog

- 2026-11-14 - Merged: `feature/s2-admin-curriculum-theme` into `main` (merge commit e80f1cd). Checks on merged main: typecheck, lint, unit tests (1616 passed, 65 skipped), integration 11/11, db-tooling 26/26, build, check:cloudflare, offerings UI (57), UC24 UI (14), admin UI (50). Status: MERGED; human peer review pending.
- 2026-11-14 — Type: UI. Curriculum & Prerequisites page restyled to the admin template theme; behaviour unchanged. Status: READY_FOR_REVIEW.
