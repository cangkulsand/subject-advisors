# UC09 offering eligibility — design

- Date: 2026-11-14
- Change record: S2-P004-027 (UC09 / FR-C2, FR-C5; owner P002, built by P004)
- Approved by the project owner in conversation on 2026-11-14 ("block first"; SD document is not updated)

## Intent

Students see the coordinator-approved subjects for the next semester (UC08) and save picks (UC10), but
prerequisites are only listed as text. A student can pick a subject they are not allowed to take. UC09
asks the system to classify each offered subject as eligible, conditionally eligible or ineligible, explain
why, and stop ineligible picks.

## Goals

- Each approved subject on `/student/offerings` shows one of three results with the reasons:
  - **Eligible** — all requirements met.
  - **Check with your coordinator** (conditionally eligible) — the system cannot decide; can still be picked.
  - **Not eligible** — names what is missing; checkbox disabled; the API rejects the pick.
- The same rule runs in the browser and in `PUT /api/semester-offerings` (one shared function).

## Rules (decided)

- Passed = academic record status `COMPLETED` or `EXEMPTED`. `FAILED` / `WITHDRAWN` never satisfy a
  requirement (UC09 BR4).
- **Blocking source = the UC24 prerequisite links** (`subject_prerequisite`), the only rules an admin can edit:
  - `MANDATORY` not passed → Not eligible ("Needs CODE Name").
  - `COREQUISITE` not passed and not picked in the same selection → Not eligible.
  - `RECOMMENDED` not passed → advice only, never changes the result (UC09 BR5–6).
- Imported SECRH `prerequisite_details` add only what the links cannot express:
  - `completedCredits` condition (sum of recognised credits of passed records) not met → Not eligible.
  - `cgpa` condition → Check with your coordinator (CGPA is not stored).
  - `topicDependent` → Check with your coordinator.
  - The imported expression evaluates false while all links pass (an "any of" group) → Check with your coordinator.
- Academic history could not be loaded → Check with your coordinator ("records unavailable"); a known-empty
  history is evaluated normally (mandatory prerequisites are then unmet).
- Prerequisite metadata unavailable → Check with your coordinator.
- Existing checks stay as they are: approved-only, selection window, pick limits, Semester 3 two-credit
  display rule, completed/exempted subjects hidden.

## Non-goals

- Updating the SRS/SDD document.
- Coordinator editing of prerequisites (coordinators only approve/remove offered subjects; admin edits
  prerequisites in UC24).
- Storing CGPA, repeat-registration rules, English 1→2→3 special handling beyond ordinary links.
- Database changes.

## Anti-goals

- Never block on a rule the admin cannot edit in the app (CGPA, topic, imported "any of").
- Never block because the records request failed.

## Approaches

1. **Shared pure function used by web and API (chosen).** One rule set, enforced server-side, explained in the UI.
2. Browser-only check: a direct API call bypasses it.
3. Hide ineligible subjects: students cannot see why a subject is missing; UC09 requires the explanation.
