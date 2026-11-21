# S3-P004-022 — Delete (hide) a student data snapshot

- **Status:** Merged to main and pushed to dev and prod (2026-11-20). Migration 0014 applied to Neon on 2026-11-20.
- **Date:** 2026-11-19
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20)
- **Related UC / FR:** UC20 data import
- **Branch / PR:** `feature/delete-snapshot`; no PR
- **Reviewer:** Automated code review 2026-11-20: 4 findings, fixed in S3-P004-026

## 1. Plan

- The owner asked for a "delete snapshot" action on Data Imports.
- Accepted snapshots are frozen in the database by design: the 0007 lifecycle trigger refuses UPDATE and DELETE. Forecast runs and the immutable offering decision audit also reference snapshots.
- The owner chose **Hide** over permanent deletion (2026-11-19): record the removal and stop showing the snapshot, keeping the frozen data so no history breaks.

## 2. Implementation

- **Database:** `db/migrations/0014_import_snapshot_removal.sql` adds `public.academic_import_batch_removal`, with these columns:

  | Column | Definition |
  | --- | --- |
  | `import_batch_id` | Primary key; foreign key to `academic_import_batch`, `ON DELETE RESTRICT` |
  | `removed_by` | Required; never blank |
  | `removed_at` | Required; defaults to `now()` |

  - An insert trigger allows ACCEPTED snapshots only.
  - Rows are immutable: no update, delete or truncate.
  - PUBLIC has no privileges.
  - The snapshot tables and their freeze triggers are not changed.
  - Rollback: `DROP TABLE public.academic_import_batch_removal;`
- **DB tooling:**
  - check `db/checks/019_import_snapshot_removal.sql`, wired into `db:verify`;
  - manifest and `db/engineering-extensions.json` entries;
  - migration tests: a new 0014 test, and the 0012 and 0013 tests now cut the list at their own version.
- **API (`apps/api/src/modules/forecasting/`):**
  - New route `DELETE /api/coordinator/forecast-imports/{id}`. Coordinator only, for an assigned scope. Unknown, pending or unassigned snapshots answer 404 `IMPORT_NOT_FOUND`.
  - Success returns `{ importBatchId, removed: true }`. A repeat call answers the same and records nothing new.
  - Removed snapshots are left out of the list and of fingerprint re-use, so the same data creates a new snapshot.
  - GET of the snapshot or its roster answers 404. Generating a forecast from a removed snapshot answers 404.
  - Forecasts and decisions made earlier keep working.
- **Web:**
  - Each snapshot row has a red-on-hover trash icon button, "Delete snapshot <label> (import #id)".
  - It opens a confirm dialog with no reason asked. The dialog explains that the snapshot disappears from Data Imports and the Class Offering Forecast, that decisions stay, and that this cannot be undone.
  - On success: a notice "Snapshot "<label>" deleted.", and the list reloads. The result card is cleared if it showed that snapshot.
  - `client.removeImport(id)` sends `DELETE`.
- **Docs:** `docs/databaseimplementation.md` (system boundaries).
- **Check 005:** `db/checks/005_multi_role_access.sql` now expects 41 public tables, because 0014 adds one.
- **ID:** first drafted as S3-P004-021. Renumbered to S3-P004-022 at merge, because S3-P004-021 was already used for the coordinator menu polish.

## 3. Verification

typecheck and lint pass.

| Suite | Result |
| --- | --- |
| DB tooling | 28 pass |
| Forecasting API and coordinator client unit tests | 213 pass, 13 skipped |
| Coordinator UI | 58 PASS |

- The new route tests failed before the handler existed. The run-generation guard test failed without the guard.
- The UI check covers: the icon button, Cancel (focus returns, nothing deleted), confirm (one DELETE, notice, row gone).
- Screenshot: `.wrangler/coordinator-review/imports-delete-dialog-desktop.png`.

## 4. Deploy note

Migration 0014 must be applied to Neon (shared by dev and prod) **before** this code is deployed. Otherwise listing snapshots fails, because the queries read the new table.

Done on 2026-11-20, before the push:
- `db:status`: 0014 was the only pending migration;
- `db:migrate` applied 0014;
- `db:verify`: 53 PASS.

All three ran with `--websocket`, because this network resets Postgres connections on port 5432.

Re-verified after the rebase onto `origin/main`:
- typecheck and lint pass;
- unit tests: 1848 pass, 65 skipped;
- DB tooling: 28 pass;
- coordinator UI: 58 PASS.

## 5. Changelog

- Coordinators can delete a snapshot from Data Imports. It is hidden, not erased: its frozen data and any earlier forecasts and decisions are kept.
