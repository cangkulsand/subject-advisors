# UC05 progress in the student app and UC18 subject details — design

- Date: 2026-11-14
- Change record: S2-P001-006 (UC05 / P001; UC18 / P003; built by P004)
- Approved by the project owner in conversation on 2026-11-14. The SRS/SDD document is not updated.

## Intent

Close the two remaining Sprint 2 gaps. UC05 Academic progress exists (page + live `GET /api/p001-sprint2/progress`)
but only runs in P001's separate overlay launcher. UC18 asks that a student can open a subject's basic details
from an academic subject list, not only from the pathway graph.

## Goals

1. **UC05:** "Academic progress" in the student menu (`/student/progress`, after Subject records), rendering the
   existing `ProgressPage`, restyled to the student template (same look as Subject records / Semester offerings).
   Content unchanged: earned / required / remaining credits, completion bar, outstanding compulsory subjects,
   requirement groups, filterable list of every curriculum subject, warnings, retry.
2. **UC18:** a **Details** button on each subject in the progress page's subject list opens a read-only panel:
   - code, name, credits, category, compulsory/elective, permitted semesters (explain a Short-semester-only restriction);
   - the student's status: Completed / Exempted / Remaining;
   - prerequisites marked Met / Not met: mandatory, co-requisite, recommended (labelled "advice only");
     "No mandatory prerequisite is configured" when there are none;
   - "Unlocks": subjects that require this one;
   - next semester: "Approved for next semester" when it is in the student's approved offering list, otherwise
     "Availability not confirmed" (also when the offerings request fails).

## Data

- `Progress` (API) gains `links: Dependency[]` (`{ id, from, required, kind }`, curriculum mapping ids) — the
  repository already loads them in `ProgressSource.curriculum.links`. Additive; nothing else changes.
- Met = the required subject's progress outcome is `COMPLETED` or `EXEMPTED` (failed/withdrawn never count).
- Offering availability: the page reuses the existing `GET /api/semester-offerings` response (approved subjects
  for the next semester) and matches by subject id.

## Non-goals

SDD edits; CGPA; imported SECRH rules (credit thresholds, "any of") in the panel; any editing from the panel
(UC18 BR8); changes to the Subject records page; database changes.

## Approaches

1. **Details on the progress page's subject list (chosen).** It already lists every curriculum subject with the
   student's outcome and is read-only.
2. Details on Subject records: that page is an editing form whose existing Details column opens record details
   (grade/remarks); a second Details would confuse.
