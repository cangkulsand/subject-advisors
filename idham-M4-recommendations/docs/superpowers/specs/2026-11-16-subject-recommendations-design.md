# Subject recommendations, bottlenecks and alternatives (UC11–UC12) — design

- **Date:** 2026-11-16
- **Change record:** S3-P004-005 (owner M4 / P002 Idham; built by P004, to be handed over as files)
- **Builds on:** S3-P004-004 planning engine (`packages/shared/src/planning`) and `GET /api/planning/input`

## Intent

For the next semester, tell the student which subjects to take, why, and what happens if they choose differently
(UC11), and warn them about subjects they should not postpone (UC12). Ranking uses the M5 planning engine: each
candidate combination is placed as the next semester and the rest of the degree is planned around it (UC11 BR6
"constraint-based optimization", not a dependency count).

## Rules

1. **Semester:** the first planned semester of the planning input (the one after the system current semester).
2. **Candidates (BR1, BR10, BR11):** subjects the baseline plan still needs whose MANDATORY prerequisites are all
   passed and whose semester-type rule allows that semester; when the coordinator has decided the semester, only
   approved subjects. Two-credit Short-only subjects therefore appear only for Semester 3.
3. **Combinations (BR2):** every non-empty set of candidates within the semester's subject and credit limits.
4. **Ranking:** plan the rest of the degree with the combination fixed as the next semester. Order by (a) projected
   completion, earliest first; (b) total critical-chain length of the subjects taken (BR4, BR12: unlocking long
   sequences first); (c) more compulsory subjects (BR3, BR5); (d) more credits; (e) subject codes.
5. **Output:** the best combination plus up to 3 alternatives with a different completion or a different set of
   critical subjects, each with its completion, the difference from the best, and reasons in words (BR5): "Unlocks N
   later subjects", "Compulsory", "Short-semester only: next chance is …" (UC12 BR9).
6. **Bottleneck warnings (UC12):** for each candidate that heads a chain of two or more needed subjects, compare the
   best plan with the best plan that leaves it out. A later completion gives a warning: "If you do not take X next
   semester, your earliest completion moves from A to B (assumes later semesters offer every subject)" (BR3, BR6,
   BR10). No warning when nothing moves. No candidates → "no valid recommendation can be made from the current
   offering list" (exception 1).
7. **Assumptions:** listed as in the plan, plus "uses the offering list as it is now; a coordinator change means the
   page recalculates on reload" (exception 6).

## Non-goals

- Saving a combination as a proposed plan (BR7/BR8; `academic_plan` unused) **(call)**: the page links to Semester
  offerings, where picks are already saved, and to the Graduation plan for what-ifs.
- Workload preferences / strategies (FR-D5 "Should", extension point) **(call)**: not enough data in the planning input.
- Electives outside the baseline's elective choices are not offered as alternatives **(call)**.

## Approaches considered

1. **Rank by running the planning engine per combination, in the browser (chosen).** Same engine as UC14, so
   recommendations and the plan never disagree; no new API (reuses `GET /api/planning/input`). At most a few hundred
   small plans; fast.
2. Score subjects by weights (dependency count, compulsory, credits). Rejected by UC11 BR6.
3. Server endpoint. No gain: the input is already in the browser and nothing is stored.

## Files (extractable)

- `packages/shared/src/recommendations/` — engine and tests (M4).
- `apps/web/src/features/recommendations/` — page, CSS, helpers (M4); `/student/recommendations` registered in
  `AppRoutes`, `StudentRoutes`, `StudentShell`.
