# Offering History (coordinator) — design

- Date: 2026-11-15
- Change record: S3-P004-002 (M6 coordinator dashboard; owner P004)
- Approved by the project owner in conversation on 2026-11-15. The SRS/SDD document is not updated.

## Intent

SDD Sprint 3: "Add an Offering History page for past semesters"; FR-H14: past semesters' decisions and picks are
kept for it. Coordinators look back at what they approved or removed and how many students picked each subject.

## Decisions

- Coordinators only (owner decision); read-only; within each coordinator's assigned programme + learning centre scopes.
- Semesters listed: those whose selection has closed (`selectionClosesAt` set and in the past), newest first.
  The next semester stays on the Forecast page.
- Page `/coordinator/history` "Offering History", coordinator menu under "Forecast planning" after
  "Class Offering Forecast". Selectors: programme, learning centre, semester (default: newest closed semester and the
  first assigned scope).
- Table: subject code + name, credits, decision (Approved / Removed), picked by (count; "—" for removed or none),
  and "View students" for subjects with picks (names + matric numbers, the existing pickers dialog).
- Empty states: no closed semesters yet; no decisions recorded for the chosen scope and semester.

## How (approach 1, chosen)

Frontend only, reusing existing coordinator APIs, which already accept any semester and enforce scope:
- context (`semesters` with selection dates, assigned scopes, programmes, centres);
- `GET /api/coordinator/offering-decisions?programmeId&learningCentreId&targetSemesterId` (decisions + pick counts,
  `editable:false` for past semesters);
- the existing pickers endpoint for "View students".
No API, contract or database change.

## Non-goals

Cross-semester comparison/trends (approach 2, rejected for now); admin access; the "Decision Audit" placeholder;
counts of picks withdrawn by removals; SDD edits.
