# S3-P004-003 — Remove the Data Quality and Decision Audit coordinator pages

- **Status:** MERGED to `main` (2026-11-16); human peer review pending
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P004 (M6)
- **Related UC / FR:** M6 coordinator dashboard; SDD Sprint 3 "Continue the coordinator and admin dashboards"
- **Branch / PR:** `feature/s3-coordinator-menu-cleanup`; merged into `main` on 2026-11-16 (merge commit b9b3c7f); no PR
- **Reviewer:** Pending

## 1. Plan

Owner decision (2026-11-16): remove the two coordinator menu items that were only "planned workspace" placeholders,
Data Quality and Decision Audit. Offering History (S3-P004-002) now covers looking back at past decisions, so the
2026-11-10 plan to turn the Decision Audit placeholder into Offering History (S2-P004-024) is closed.

## 2. Implementation

- `CoordinatorRoutes.tsx`: Data Quality removed from "Academic data"; the "Audit" group with Decision Audit removed;
  both entries removed from the page map, so `/coordinator/data-quality` and `/coordinator/audit` show "Page not found".
  Every Overview quick link is now a built page, so the "Planned workspace" label is gone; Overview text updated.
- No API, database or contract change. The audit tables (`forecast_adjustment_audit`, 0007 tables) stay unused, as before.
- `StaffPlannedPage` in `staff-navigation.tsx` is no longer used by any route; left in place.
- Tests: `tools/coordinator/test-ui.mjs` menu expectation and removed-pages check; `tools/admin/test-ui.mjs`
  quick-links check rewritten (three built links, removed routes show "Page not found", only `/api/me` requested) and
  the workspace-switch check now uses Overview instead of `/coordinator/audit`.
- Docs: README Sprint 3 row; `docs/implementationguide.md` P004 row.

## 3. Review

- typecheck, lint pass; `npm test` 1653 passed (65 skipped).
- `PLAYWRIGHT_CHANNEL=chrome`: coordinator UI 54, admin UI 50, integration UI 48 — all passed.

## 4. Changelog

- 2026-11-16 - Type: Removed. Coordinator Data Quality and Decision Audit placeholder pages and menu items. Merged to `main` 2026-11-16 (b9b3c7f). Outstanding: human peer review.
