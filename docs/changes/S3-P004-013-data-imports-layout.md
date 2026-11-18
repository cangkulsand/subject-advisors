# S3-P004-013 — Data Imports screen: clearer layout, latest-snapshot line and drop zone

- **Status:** MERGED to main (fast-forward, e150697) and deployed to dev and prod on 2026-11-18
- **Date:** 2026-11-18
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20)
- **Related UC / FR:** UC20, FR-H1, FR-H2, FR-H3
- **Branch / PR:** `feature/coordinator-imports-layout`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner supplied an HTML mockup of `/coordinator/imports`. Adopt its layout; keep every existing behaviour.

## 2. Change

- Scope row: Programme gets the widest column (2 : 1.2 : 1). The target semester shows a lock icon and the tooltip
  "Set by the system administrator" (`coordinator-ui.tsx`, shared with the Class Offering Forecast page).
- New line under the scope: "Latest snapshot: …, source date …, N students, accepted …. A new snapshot is added next
  to it; earlier snapshots are kept." or "No snapshot for this scope yet." (one extra `GET forecast-imports?limit=1`).
- Students in the system: description in a box (names the scope), action bar with "The snapshot is frozen…" and
  Create snapshot.
- CSV and Both: "Download template" as an outlined button with an icon beside the heading; Both shows a "Merged with
  system records" pill; narrow Source date + wide Source label; a drag-and-drop zone around the real file input
  (visually hidden, still labelled "CSV file" and focusable), showing the chosen file's name and size with Replace and
  Remove; an action bar with the validation note and the submit button.
- Kept from our version (mockup differed): Source label stays required; a new upload never replaces a snapshot; the
  limits text stays "CSV up to 5 MiB (maximum 20,000 rows)."; no student count before a snapshot exists.

## 3. Tests

- `tools/coordinator/test-ui.mjs`: new check — latest-snapshot line (empty and after upload), lock tooltip, dropping a
  CSV shows it, dropping a .txt is refused and clears the earlier file, Remove clears the file and returns focus,
  no horizontal scroll at 375px.
- Results: typecheck, lint pass; `npm test` 1841 passed (65 skipped); coordinator UI 56 PASS (readability guard included).

## 4. Changelog

- 2026-11-18 - Type: Changed. Data Imports: wider programme field, latest-snapshot line, drag-and-drop CSV zone with
  Replace/Remove, action bars.
