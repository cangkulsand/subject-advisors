# S3-P004-020 — Hide CSV import and "Both" on Data Imports (system snapshot only for now)

- **Status:** On branch `feature/hide-csv-import` (not merged)
- **Date:** 2026-11-19
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20)
- **Related UC / FR:** UC20 data import; CSV import is deferred to a later phase
- **Branch / PR:** `feature/hide-csv-import`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner decided that, for this phase, coordinators create snapshots only from the students in the system. CSV import and "Both" come back in a later phase.

## 2. Implementation

- **The switch:** `apps/web/src/features/coordinator/ImportsPage.tsx` has `CSV_IMPORT_ENABLED = false`. Set it to `true` to bring CSV import and "Both" back.
- **While the switch is off:**
  - there is no "Data source" choice; the setup card shows the scope fields and Create snapshot;
  - an old `?source=csv` or `?source=both` link falls back to the system snapshot;
  - the snapshot list hides its Source filter;
  - the list description, empty state and "Choose a scope" text no longer mention CSV.
- **Not removed:** all CSV and combined code, the template download, and the API routes stay in place. Existing CSV or combined snapshots still appear in the list with their source badge, and can still be opened and used for a forecast.
- **Tests:** the UI tests turn CSV on per page with `window.__SA_COORDINATOR_CSV_IMPORT__ = true`, set by `mock()` unless a test passes `csvImport: false`. So the CSV tests keep running, and one new check covers the hidden state.

## 3. Verification

typecheck and lint pass. Coordinator UI: 57 PASS, including the new check "imports: CSV import and Both are hidden; only students in the system create a snapshot". It confirms:
- there is no radio group, CSV form or Source filter;
- the system-only wording is shown;
- `?source=csv` falls back to the system snapshot;
- the page passes the readability check.

Screenshot: `.wrangler/coordinator-review/imports-system-only-desktop.png`.

## 4. Changelog

- Data Imports creates snapshots only from the students in the system. CSV import is hidden until a later phase.
