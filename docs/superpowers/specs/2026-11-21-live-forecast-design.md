# Live forecast for coordinators — design (short)

- **Date:** 2026-11-21
- **Owner:** P004 (UC20 class offering forecast, UC23 offering decisions)
- **Status:** Draft, awaiting owner approval

## Intent

The lecturer said the forecast does not need a snapshot step. When a coordinator opens the Forecast page, they should see the forecast for **current** student data in their scope at once: no Data Imports step and no "create snapshot".

## Goals

- The Forecast page calculates live from `student_profile` and `academic_record` on every load, using the existing engine (`runForecastEngine`) unchanged.
- "View students" (eligible, near graduation, not counted) uses the same live calculation.
- Approve/Remove decisions, student picks, the Picked column and the selection window keep working as they do now (`offering_decision` is keyed by programme, centre, semester and subject, not by snapshot).
- The coordinator menu no longer shows Data Imports.

## Non-goals

- Not deleting the snapshot tables, migrations or existing runs. They stay in the database and the code, unused by the coordinator UI.
- No change to the student Semester offerings page or the engine rules.
- The CSV/Excel import is not built or shown now. It keeps its snapshot design and stays hidden (S3-P004-020).

## Anti-goals

- Writing rows to the shared prod database just because a coordinator opened the page.
- Numbers on the Forecast page that differ from what "View students" shows.

## Approaches

| | Approach | Trade-off |
| --- | --- | --- |
| **A (chosen)** | Calculate on every page load: a live endpoint reads the scope's students and records, runs the engine and returns subject rows. Nothing is stored. | Always current, no database clutter. The exact numbers behind a decision are not saved; the owner accepted this ("its ok"). |
| B | Make a hidden snapshot and run automatically on each visit, reusing the current pipeline. | Traceable, less new code, but writes rows on every visit and stays "live" only in appearance. |

The owner chose A on 2026-11-21.

## Decided

- Live data only, for database students.
- Losing the per-decision record of the forecast numbers is acceptable.
- The CSV import remains hidden for now; its snapshot path is kept for later.

## Builder's calls (proposals the owner can correct)

- New read endpoint, for example `GET /api/coordinator/forecast/live?programmeId&learningCentreId`, targeting the next Normal semester (S3-P004-031). The response is private and `no-store`, like the other coordinator reads.
- It reuses the student selection behind `buildSystemSnapshot` (same eligibility, same learning centre rule, records count as COMPLETE history, no records = UNKNOWN), but builds the engine input in memory instead of storing it.
- Decision audit rows written from the live page have `import_batch_id` NULL (already allowed).
- The Offering History page stays: it reads decisions, not snapshots.
- A "Refresh" button on the Forecast page recalculates. A line shows "Live data, calculated at <time>".
- Records: a new change record `S3-P004-0NN-live-forecast` following `docs/implementationguide.md`; README and `docs/database/data-contracts.md` updated; the SRS notes UC20 uses live data.
- Built after the presentation, on a feature branch, then merged and deployed to dev and prod.
