# S3-P004-005 — Subject recommendations, bottlenecks and alternatives (UC11–UC12)

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P002 (M4, UC11–UC12); built by P004, to be handed to P002 as files
- **Related UC / FR:** UC11 (FR-D1, D2, D6), UC12 (FR-D3, D4); SDD Sprint 3 "Implement intelligent subject
  recommendations, ranking, bottleneck warnings and alternatives"
- **Branch / PR:** `feature/s3-recommendations` (on top of `feature/s3-graduation-plan`, S3-P004-004); not merged, no PR
- **Reviewer:** Pending

## 1. Plan

Design: `docs/superpowers/specs/2026-11-16-subject-recommendations-design.md`. Every valid combination for the next
semester is ranked by planning the rest of the degree around it with the S3-P004-004 engine (UC11 BR6), so
recommendations and the Graduation plan cannot disagree. No new API: the page reuses `GET /api/planning/input`.
Open **(call)** items for P002: saving a combination as a proposed plan, workload preferences / strategies, electives
outside the plan's elective choices.

## 2. Implementation

- `packages/shared/src/recommendations/recommend.ts`: candidates (still needed, prerequisites passed, semester type
  allowed, coordinator-approved when the semester is decided), every combination within the subject and credit limits,
  ranking (completion, then critical-chain length, compulsory count, credits, codes), best plus 3 alternatives with
  the difference in semesters, reasons per subject ("Unlocks N later subjects", "Compulsory", "Counts toward …",
  "Short semester only: the next chance is …"), and warnings for chain-head subjects whose omission delays
  completion. States: READY, NO_CANDIDATES, DONE.
- `packages/shared/src/planning/engine.ts`: `planningAnalysis(input)` exported (needed subjects, chain lengths, unlocks).
- `apps/web/src/features/recommendations/`: `/student/recommendations` "Recommendations" (menu item after Semester
  offerings): recommended combination, "Do not postpone", "Other combinations", links to Semester offerings and
  Graduation plan, and how recommendations are made. Reuses the Graduation plan stylesheet.
- `apps/web/src/features/planning/planning-page.css`: summary tiles keep their spacing under a heading (also fixes
  the Graduation plan comparison card).

## 3. Review

- typecheck, lint, check:cloudflare pass; `npm test` 1695 passed (65 skipped), 5 new recommendation tests; coordinator UI 54 and admin UI 50 also pass.
- `PLAYWRIGHT_CHANNEL=chrome` integration UI 59 (5 new: page at 1440 and 375, Short-only warning, no-candidates and
  failure states, menu link, setup guard). Screenshots checked at 1440 and 375.

Not verified: against live Neon data. Not built: saving a recommendation, strategies, "recalculate on coordinator
change" beyond reloading.

## 4. Changelog

- 2026-11-16 - Type: Added. Student Recommendations page (`/student/recommendations`) with ranked combinations,
  alternatives and bottleneck warnings; shared recommendation engine. Read-only, no API or migration change.
  Outstanding: human peer review; P002 confirmation of the design calls.
