# S2-P003-001 — UC13 Check Graduation Eligibility

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-31
- **Sprint:** Sprint 2 — Core Functionality
- **Owner:** P003 / Harraz Haziq (M5 Interactive Academic Pathway)
- **Related UC / FR:** UC13 / FR-E1
- **Branch / PR:** feature/p003-s2-uc13-uc14
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
Students need a read-only check of whether their self-reported academic records
meet the configured curriculum graduation requirements. Sprint 1 only rendered
the prerequisite tree; it did not compute eligibility.

### Scope and requirements
- In scope: read-only graduation-eligibility computation and endpoint for UC13.
- Out of scope: UC14 scheduling, what-if simulation (UC15/UC16), roadmap (UC19),
  and any writes to records/curriculum. No fabricated data.

### Proposed implementation
- Expected files:
  - `apps/api/src/modules/pathway/contracts.ts` (add result types)
  - `apps/api/src/modules/pathway/repository.ts` (read `curriculum_requirement`
    and `curriculum.total_credit_required`)
  - `apps/api/src/modules/pathway/graduation.ts` (new pure engine)
  - `apps/api/src/modules/pathway/routes.ts` (add `GET /api/pathway/graduation`)
  - `apps/api/src/modules/pathway/graduation.test.ts` (new tests)
- APIs / database / interfaces: read `curriculum_requirement`,
  `curriculum.total_credit_required`, `curriculum_subject`, `academic_record`.
- Dependencies / shared-file impact: none outside the pathway module.

### Acceptance criteria
- [ ] Computes total recognized credits from COMPLETED/EXEMPTED records only.
- [ ] Treats duplicate attempts for a subject as unresolved (not satisfied).
- [ ] Checks total credits against `curriculum.total_credit_required`.
- [ ] Checks each `curriculum_requirement` row (credits and/or subject count).
- [ ] Returns eligibility, per-requirement status, and outstanding items.
- [ ] Endpoint enforces STUDENT role + complete profile and rejects non-GET.

### Verification plan
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test` (pathway graduation tests)

### Risk / assumptions / rollback
- Risks: `curriculum_requirement.requirement_type` values are not fully
  specified in SRS/SDD; the engine uses a documented defensive mapping
  (category match, COMPULSORY/ELECTIVE flags, else all subjects).
- Assumptions / blockers: depends on P001-owned curriculum/requirement data
  being present; if absent the endpoint reports unmet requirements truthfully.
- Rollback: revert the pathway module files; no data or API writes.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** contracts.ts, repository.ts, graduation.ts (new), routes.ts, index.ts, pathway.test.ts, graduation.test.ts (new)
- **Summary:** Added read-only UC13 graduation-eligibility computation and endpoint.
- **Decisions / deviations from plan:** requirement_type mapped defensively (COMPULSORY/ELECTIVE flags, else subject_category match).
- **Migrations / env / shared contracts:** N/A

## 3. Review

- **Self-review checklist:** Scope, plan-vs-diff, correctness, authorization, validation, contracts, migrations, security, tests, diff quality, documentation — reviewed.
- **Test evidence:** `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/pathway` → 27 passed (2 files).
- **Manual checks:** Not run (no dev server).
- **Defects found and fixes:** None.
- **Review outcome:** PASS — SELF-REVIEW
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Added
- **Added / Changed / Fixed / Removed:** Added UC13 graduation-eligibility engine and GET /api/pathway/graduation.
- **Affected routes / tables / consumers:** GET /api/pathway/graduation; reads curriculum_requirement, curriculum.total_credit_required, curriculum_subject, academic_record.
- **Breaking changes / migration steps:** None.
- **Verification summary:** 27 pathway tests passed; typecheck passed.
- **Outstanding blockers / follow-up:** requirement_type values depend on P001 curriculum data; defensive mapping documented.
- **Final status:** READY_FOR_REVIEW
