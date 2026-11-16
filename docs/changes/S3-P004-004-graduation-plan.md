# S3-P004-004 — Graduation plan and what-if scenarios (UC14–UC16)

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P003 (M5, UC14–UC16); built by P004, to be handed to P003 as files
- **Related UC / FR:** UC14 projected pathway (FR-E2–E6), UC15 simulate subject choices (FR-F1, F2, F5), UC16 compare and
  reset (FR-F3, F4); SDD Sprint 3 "Combine baseline completion forecasting and scenario comparison"
- **Branch / PR:** `feature/s3-graduation-plan`; not merged, no PR
- **Reviewer:** Pending

## 1. Plan

The project owner asked P004 to start the Sprint 3 M5 work and later hand the files to the module owner ("just
proceed"). Design: `docs/superpowers/specs/2026-11-16-graduation-plan-design.md`. Every rule the SRS leaves open is
marked **(call)** there for P003 to confirm: the start semester, how elective groups are filled, scenarios kept in the
browser only, and the earliest-completion bound.

## 2. Implementation

- **Engine** `packages/shared/src/planning/` (pure, used by the browser; same code for baseline and scenarios):
  `planBaseline`, `planScenario` (postpone, fail, withdraw, replace an elective), `comparePlans`; semester labels
  ("AY 2026/2027 – Semester 3 (Short Semester)"), limits (configured, else latest same type, else 3/10 and 3/6).
  Places subjects after their MANDATORY prerequisites, in their allowed semester type, within the subject and credit
  limits, critical path first; fills requirement groups only up to what is still needed; first semester limited to
  coordinator-approved subjects when decisions exist; lists subjects that cannot be placed; earliest-possible bound;
  top 5 bottlenecks with an explanation.
- **API** `apps/api/src/modules/planning/`: `GET /api/planning/input` (STUDENT, completed profile; read-only). Reads
  `student_profile`, `curriculum`, `curriculum_subject`, `subject`, `subject_semester_rule`, MANDATORY
  `subject_prerequisite`, `academic_record`, `curriculum_requirement`, `academic_semester` and `offering_decision`.
  Registered in `apps/api/src/integration/router.ts` and `tools/integration/prepare.mjs`.
- **Web** `apps/web/src/features/planning/`: `/student/plan` "Graduation plan" (menu item after Graduation check):
  summary (estimated completion, earliest possible, what is left), "What if…" (subject, change, replacement; list
  with Remove; Reset), comparison (difference and subjects that move), toggle between the two plans, semester
  timeline, "Subjects not to delay", and how the plan is made. Registered in `AppRoutes`, `StudentRoutes`,
  `StudentShell`.
- No database change, no write endpoint. The old `/api/pathway/projection` scheduler (not routed by the integrated
  router) is untouched; P003 can retire it.

## 3. Review

- typecheck, lint, build, check:cloudflare pass; `npm test` 1683 passed (65 skipped), including 17 engine, 9 API,
  2 router and 2 web helper tests.
- `PLAYWRIGHT_CHANNEL=chrome`: integration UI 54 (6 new: plan at 1440 and 375, what-if flow, done / unplanned /
  failure states, menu link, setup guard; readability guard on each), coordinator UI 54, admin UI 50.
- Screenshots checked at 1440 and 375; semester tables use fixed column widths on wide screens only, so phones keep
  readable subject names.

Not verified: against live Neon data (mocks and fakes only). Open for P003 / product owner: the **(call)** items in the
design; corequisites are not enforced; Industrial Training and final-year projects get no special placement; scenario
persistence (`simulation_scenario` tables) and "outdated scenario" marking are not built.

## 4. Changelog

- 2026-11-16 - Type: Added. Student Graduation plan (`/student/plan`) with what-if scenarios and comparison;
  `GET /api/planning/input`; shared planning engine. Read-only, no migration. Outstanding: human peer review; P003
  confirmation of the design calls.
