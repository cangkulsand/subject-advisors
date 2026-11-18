# S3-P004-012 — Forecast versions and comparison dropped from scope (docs only)

- **Status:** Docs updated on main (not pushed)
- **Date:** 2026-11-18
- **Sprint:** Sprint 3
- **Owner:** P004 (M6, UC20 and UC23)
- **Related UC / FR:** UC23, FR-H14; SRS v2.4 sprint plan (Sprint 4 row) and ForecastRun data dictionary
- **Branch / PR:** main; no PR
- **Reviewer:** Pending

## 1. Plan

The owner decided not to build forecast versions or version-to-version comparison. The SRS v1.x/v2.0 sprint
plan listed "forecast versioning/comparison" under Sprint 3; v2.4 already removed it from the requirements
(FR-H14) and the system removed the screens on 10 November (S2-P004-024), but some wording still pointed to it.

## 2. Change

- New `docs/requirements/srs-amendment-2026-11-18-no-forecast-comparison.md`: the edits the owner applies to
  SRS v2.4 (Sprint 4 test row, FR-H14 wording, ForecastRun data dictionary, change-log row, revision history).
- `docs/databaseimplementation.md`: note that the database still has the forecast version columns and checks,
  but the system does not use them.
- `docs/System Documents/UTMSPACE_SRS_SDD_v2.5 (18 Nov).docx` (owner's copy, not tracked in git): v2.4 with this
  amendment applied; checked by opening it in Microsoft Word (146 pages) and the XML validator.
- No code change. The database columns and their constraints stay, so no migration is needed.
- Not affected: the student plan comparison (UC14–UC16).

## 3. Tests

None (documentation only).

## 4. Changelog

- 2026-11-18 - Type: Docs. Forecast versions and comparison confirmed out of scope; SRS v2.4 amendment written.
