# S2-P003-002 — UC14 Generate Projected Academic Pathway

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-31
- **Sprint:** Sprint 2 — Core Functionality
- **Owner:** P003 / Harraz Haziq (M5 Interactive Academic Pathway)
- **Related UC / FR:** UC14 / FR-E2..E6
- **Branch / PR:** feature/p003-s2-uc13-uc14
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
Students need a read-only, advisory semester-by-semester projection of the
remaining subjects in their curriculum, respecting credit/subject limits,
semester-type restrictions, and mandatory prerequisite chains.

### Scope and requirements
- In scope: read-only projected-pathway scheduling engine and endpoint for UC14.
- Out of scope: what-if simulation (UC15/UC16), scenario persistence, roadmap
  UI (UC19), and any writes. No fabricated offerings or guaranteed dates.

### Proposed implementation
- Expected files:
  - `apps/api/src/modules/pathway/contracts.ts` (add projection types)
  - `apps/api/src/modules/pathway/repository.ts` (read `subject_semester_rule`
    and `academic_semester`)
  - `apps/api/src/modules/pathway/scheduler.ts` (new pure engine)
  - `apps/api/src/modules/pathway/routes.ts` (add `GET /api/pathway/projection`)
  - `apps/api/src/modules/pathway/scheduler.test.ts` (new tests)
- APIs / database / interfaces: read `subject_semester_rule`,
  `academic_semester`, `subject_prerequisite`, `curriculum_subject`,
  `academic_record`.
- Dependencies / shared-file impact: none outside the pathway module.

### Acceptance criteria
- [ ] Excludes COMPLETED/EXEMPTED subjects; treats duplicate attempts as unresolved.
- [ ] Orders remaining subjects by mandatory prerequisite dependencies.
- [ ] Assigns subjects greedily within NORMAL/SHORT credit and subject limits.
- [ ] Respects subject semester-type restrictions.
- [ ] Reports estimated completion semesters and explicit assumptions.

### Verification plan
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test` (pathway scheduler tests)

### Risk / assumptions / rollback
- Risks: semester limits/sequence are provisional; the engine uses configured
  `academic_semester` limits with documented defaults (NORMAL 3/10, SHORT 3/6).
- Assumptions / blockers: depends on P001/P002-owned semester and prerequisite
  data; if absent the projection reports remaining subjects without a plan.
- Rollback: revert the pathway module files; no data or API writes.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** contracts.ts, repository.ts, scheduler.ts (new), routes.ts, index.ts, pathway.test.ts, graduation.test.ts, scheduler.test.ts (new)
- **Summary:** Added read-only UC14 projected-pathway scheduler and endpoint.
- **Decisions / deviations from plan:** prerequisites scheduled in earlier semesters; semester-type rules interpreted as permitted types.
- **Migrations / env / shared contracts:** N/A

## 3. Review

- **Self-review checklist:** Scope, plan-vs-diff, correctness, authorization, validation, contracts, migrations, security, tests, diff quality, documentation — reviewed.
- **Test evidence:** `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/pathway` → 37 passed (3 files).
- **Manual checks:** Not run (no dev server).
- **Defects found and fixes:** Fixed prerequisite ordering (earlier semester) and non-null assertions in tests.
- **Review outcome:** PASS — SELF-REVIEW
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Added
- **Added / Changed / Fixed / Removed:** Added UC14 projected-pathway scheduler and GET /api/pathway/projection.
- **Affected routes / tables / consumers:** GET /api/pathway/projection; reads subject_semester_rule, academic_semester, subject_prerequisite, curriculum_subject, academic_record.
- **Breaking changes / migration steps:** None.
- **Verification summary:** 37 pathway tests passed; typecheck passed; lint passed.
- **Outstanding blockers / follow-up:** semester limits/sequence provisional; depends on P001/P002 data.
- **Final status:** READY_FOR_REVIEW
