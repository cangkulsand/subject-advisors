# SRS/SDD v2.4 amendment — Forecast versions and comparison dropped (2026-11-18)

- **Source decision:** Product owner (P004), 2026-11-18. Change record: [S3-P004-012](../changes/S3-P004-012-drop-forecast-comparison.md).
- **Target document:** `UTMSPACE_SRS_SDD_v2.4 (15 Nov).docx`. The `.docx` has **not** been edited; the owner applies this amendment to it (for example as v2.5).
- **Reading guide:** each item gives the affected place, the **old** text and the **new** text.

## The decision in one paragraph

Coordinator forecasts have no versions, statuses (Draft / Under Review / Finalized) or version-to-version
comparison, and none are planned. Each student data snapshot has one forecast; the coordinator marks each
subject Pending, Approved or Removed (UC20, UC23), every change is recorded, and past semesters are shown on
the Offering History page. This was already the rule in v2.4 (FR-H14) and in the system since 10 November
(S2-P004-024); this amendment removes the wording that still pointed to versions or comparison.
Not affected: the student's own plan comparison (UC14–UC16, "Compare and Reset Pathway Scenarios").

## Amendments

### B1. Sprint plan — Sprint 4 row (section 1, development plan)

- **Old:** "UC01–UC02, UC20–UC23 — Test authentication, forecasts, decision auditing, user permissions and version lifecycle"
- **New:** "UC01–UC02, UC20–UC23 — Test authentication, forecasts, offering decisions and their history, user permissions and the selection window"

### B2. FR-H14 (M6, UC23)

- **Old:** "…There are no forecast versions, statuses or version comparison. Past semesters' decisions and picks are kept for a future Offering History page."
- **New:** "The system shall keep one forecast for each student data snapshot. There are no forecast versions, statuses or version comparison. Past semesters' decisions and picks are shown on the coordinator's Offering History page."

### B3. Data dictionary — ForecastRun (section 5.2)

- **Old:** rows `status` (Draft / Under Review / Finalized / Superseded / Archived), `version_number`, `parent_forecast_run_id`, `finalized_by`, `finalized_at`, `initial_demand_threshold`, `refinement_rules`, followed by "The version, status, finalised and threshold fields are no longer used."
- **New:** keep the rows (the columns still exist in the database) but mark each one "Not used (no forecast versions)". Replace the closing note with: "One ForecastRun is kept per snapshot. Forecast versions and comparison are not part of the system; these columns are kept only for database compatibility."

### B4. Change log table (end of document) — "Offering refinement and coordinator control" row

- **Old (Replacement):** "Add resource-based refinement and explicit coordinator additions/removals with reasons, versions and audit history. UC23 finalises the list for student use."
- **New:** add "(superseded 10 November and 18 November 2026: no versions, no reasons; see the one-forecast-per-snapshot row)" at the end of the row. Do not change the history text itself.

### B5. Revision history

- **Add a row:** "2.5 — 18/11/2026 — Forecast versions and version comparison confirmed out of scope; Sprint 4 test row and ForecastRun data dictionary updated; Offering History page referenced as delivered."
