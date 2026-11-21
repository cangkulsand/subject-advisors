# SRS/SDD v2.6 amendment — Live coordinator forecast, no snapshot step (2026-11-21)

- **Source decision:** Product owner (P004), 2026-11-21, after the lecturer said the forecast does not need a snapshot step. Change record: [S3-P004-032](../changes/S3-P004-032-live-forecast.md).
- **Target document:** `UTMSPACE_SRS_SDD_v2.6 (21 Nov).docx`. Not applied to the .docx yet; apply in the next version.
- **Reading guide:** each item gives the affected place, the **old** text and the **new** text. Where the old text runs on, only its start is quoted.

## The decision in one paragraph

The Class Offering Forecast is calculated live from the students in the system each time the coordinator opens
or refreshes the page. There is no Data Imports step, no snapshot to choose and nothing is stored for the
forecast. Decisions (Pending / Approved / Removed), the selection window, picks and the Offering History page
are unchanged; decisions were already kept per programme, learning centre, semester and subject. The
snapshot and Excel/CSV import design stays for later (the import remains hidden), so the data dictionary
tables are kept.

## Amendments

### C1. Sprint plan — Sprint 2, P004 cell

- **Old:** "UC20, UC23 — Forecast for each student data snapshot; the coordinator approves or removes each subject. … Screens: Coordinator Data Imports, Class Offering Forecast; …"
- **New:** "UC20, UC23 — Forecast for each student data snapshot; the coordinator approves or removes each subject (live student data from Sprint 3, S3-P004-032). … Screens: Coordinator Data Imports, Class Offering Forecast; …"

### C2. Sprint plan — Sprint 3, P004 cell

- **Old:** "Excel/CSV import of student data into snapshots; delete (hide) a snapshot; offering history for past semesters; …"
- **New:** "Live forecast from the students in the system (no snapshot step); Excel/CSV import of student data into snapshots; delete (hide) a snapshot; offering history for past semesters; … Screens: Class Offering Forecast, Offering History; Admin Users & Access."

### C3. UC20 forecast requirement (M6) — "For the chosen student data snapshot…"

- **Old:** "For the chosen student data snapshot, the system shall show each subject's not-taken-yet and eligible counts, …"
- **New:** "From the students in the system at the time the page is opened or refreshed, the system shall show each subject's not-taken-yet and eligible counts, …"

### C4. UC23 requirement — "…records who changed what, when, and from which snapshot."

- **New:** "…records who changed what and when. Changes from the live forecast record no snapshot."

### C5. UC23 requirement — "Decisions shall stay the same when the coordinator switches to another student data snapshot…"

- **New:** "Decisions belong to the programme, learning centre, semester and subject. New subjects start as Pending. A decided subject missing from the live forecast stays decided and is marked "not in the forecast"."

### C6. FR-H14 — "The system shall keep one forecast for each student data snapshot…"

- **New:** "The system shall calculate the forecast live from the students in the system and shall not store it. There are no forecast versions, statuses or version comparison. Past semesters' decisions and picks are shown on the coordinator's Offering History page."

### C7. UC20 main flow, steps 1–3

- **Old:** "1. Coordinator uploads a CSV or uses the students already in the system. 2. System checks the data and saves it as a dated snapshot. 3. Coordinator picks a snapshot (newest first) and the system shows its forecast."
- **New:** "1. Coordinator opens Class Offering Forecast and chooses the programme and learning centre. 2. System reads the students in the system for that scope (records count as complete history; no records = uncertain). 3. System calculates and shows the forecast; Refresh recalculates it."

### C8. UC20 alternative flows 3 and 4; postcondition

- **Old:** "3. Old snapshot: show a warning. 4. Curriculum changed since the forecast: the student list says it was recalculated." / "A dated snapshot and its forecast are ready for UC23."
- **New:** "3. No students in the scope: say so. 4. (removed: the forecast always uses the current curriculum)" / "A live forecast is ready for UC23; nothing is stored."

### C9. UC23 precondition 2, main flow step 1, alternative flow 1

- **Old:** "2. At least one student data snapshot exists (UC20)." / "1. Coordinator opens Class Offering Forecast and picks a student data snapshot." / "1. No snapshot: ask the coordinator to upload student data first (UC20)."
- **New:** "2. The programme has students in the system (UC20)." / "1. Coordinator opens Class Offering Forecast." / "1. No students in the scope: show that nothing can be forecast yet."

### C10. Design text (M6 class model and workflow)

- **Old:** "…manages a forecast per data snapshot…", "There is one forecast per snapshot and no versions.", "Forecasts keep their snapshot, source date, assumptions and capacity rules."
- **New:** "…calculates a live forecast from the students in the system…", "The forecast is calculated on each read and is not stored; there are no versions.", "Snapshot, source date and assumption fields belong to the hidden Excel/CSV import path."

Diagrams for UC20 and UC23 that show snapshot selection need updating in the next diagram pass.
