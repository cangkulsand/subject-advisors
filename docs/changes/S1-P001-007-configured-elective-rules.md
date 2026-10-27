# S1-P001-007 — Curriculum-scoped elective group rules

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator review pending

## 1. Plan

### Objective / problem
Expose configured elective selection requirements and subject group metadata so records UI can show the correct Pilih rule for the student's own curriculum.

### Scope and requirements
- In scope: optional group metadata in profile options; `isCompulsory` on subject options; owner/current-curriculum scoped SQL aggregating category membership and curriculum requirements without multiplying counts; tested helper grouping for elective subcategories and Industrial Training's explicit compulsory flag.
- Out of scope: UI wiring, schema/migration/data changes, globally hardcoded selection counts, unrelated programmes, record write APIs, live mutations.

### Proposed implementation
- Expected files: P001 profile contracts/repository/repository tests; records subject grouping helper/tests; this change record.
- Group membership comes from `curriculum_subject.subject_category`; required counts come from `curriculum_requirement.required_subjects`, matched by normalized configured category to requirement type. Aggregate requirements and categories before joining. Null is returned when count is absent or conflicting duplicate rows exist.
- Normalize explicit Core/Elective labels. Industrial Training maps to Core only when that specific membership has `is_compulsory=1`. Preserve unknown categories in Other.

### APIs / database / cross-programmer impacts
- `/api/profile/options` adds optional `subjectGroups?: {category,requiredSubjects,availableSubjects}[]` and optional `isCompulsory?: 0|1` on subject entries. No schema changes.
- Source evidence: supplied `sqlite_course_database_schema_and_data.md` and `course_prerequisite_mapping_schema.md`; read-only public-catalogue verification on approved development branch identified SECJ/1 (`curriculum_id=1`) with E1 4/5, E2 7/9, U1 1/24, U2 1/7, and Industrial Training 2 compulsory plus its separate 92-credit requirement. These values are test evidence only, not global constants.

### Acceptance criteria
- [ ] Groups and pick counts are read from the authenticated student's current curriculum and never seeded/hardcoded globally.
- [ ] Duplicate conflicting requirements yield `requiredSubjects: null`; missing requirements also yield null.
- [ ] Counts are not multiplied by the requirement join.
- [ ] Known elective subcategories classify under Elective; unknown rows remain Other; Industrial Training is Core only with `isCompulsory===1`.
- [ ] Focused tests/typecheck/lint/diff checks pass without DB access.

### Verification plan
- Focused profile repository and helper Vitest; P001 TypeScript check; focused ESLint; `git diff --check`.

### Risk / assumptions / rollback
- Category to requirement normalization uses the configured category string, not programme constants. No automatic choice fulfillment is calculated; metadata is informational for UI grouping. Code-only rollback; no live writes.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/api/src/modules/profile/contracts.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`, `apps/web/src/features/records/subject-groups.ts`, and `apps/web/src/features/records/subject-groups.test.ts`.
- **Summary:** Options now include optional `isCompulsory` per subject and optional `subjectGroups` with category, requirement count and available count. Repository calculates category counts and requirement counts in separate curriculum-scoped CTEs and joins by normalized category to requirement type. Conflicting/missing `required_subjects` yields null. Helper recognizes explicit E1/E2/U1/U2, Alt Elective and Generic Elective categories; Industrial Training maps to Core only for a compulsory row.
- **Decisions / deviations from plan:** No configured counts or group membership are hardcoded. Requirements with identical duplicate rows resolve to their common count; differing or partly null duplicate rows resolve to null. Unknown categories remain Other.
- **Migrations / env / shared contracts:** Additive optional API fields; no schema or environment changes.

## 3. Review

- **Self-review checklist:** Query is scoped by verified Clerk user through the current profile curriculum; category and requirement CTEs are aggregated separately to avoid count multiplication; no values are inferred from programme codes or global constants; helper preserves unknown categories and only uses configured compulsory status for Industrial Training.
- **Test evidence:** Focused Vitest — PASS, 24 tests. Focused strict TypeScript invocation over all changed TS implementation/tests — PASS. Focused ESLint — PASS. `git diff --check` — PASS (line-ending notices for concurrently edited unrelated files). `node node_modules/typescript/bin/tsc -p tsconfig.p001.json` — currently FAILS only on three unused local/import diagnostics in concurrently edited `apps/web/src/features/records/RecordsPage.tsx`; no diagnostics in this task's files.
- **Manual checks:** Read-only Neon metadata queries on approved development branch `br-shy-cherry-azuzy9v5` verified canonical SECJ/1 (`curriculum_id=1`) and reference-consistent counts: Core 31 (31 compulsory), E1 5, E2 9, U1 24, U2 7, Industrial Training 2 (both compulsory); requirements E1=4, E2=7, U1=1, U2=1, Industrial Training=92 credits. Queries selected public catalogue/curriculum metadata only; no student/access rows or credentials were read. Supplied reference provenance: `sqlite_course_database_schema_and_data.md` and `course_prerequisite_mapping_schema.md`.
- **Defects found and fixes:** Initial tests exposed missing fallback available count for helper-only elective categories; corrected to count supplied subject rows when configured group metadata is absent. Focused TypeScript passed; project-wide check is blocked by unrelated active UI edits noted above.
- **Review outcome:** PASS — SELF-REVIEW; coordinator review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Added; Changed; Tests
- **Added / Changed / Fixed:** Added optional `subjectGroups` and `isCompulsory` profile-options fields; added owner/current-curriculum scoped category and requirement aggregation; expanded helper exports with `normalizeSubjectCategory`, `SubjectGroupMetadata`, `ElectiveSubgroup`, and `groupElectiveSubjects`.
- **Affected routes / tables / consumers:** `/api/profile/options`; `curriculum_subject.subject_category`, `curriculum_subject.is_compulsory`, `curriculum_requirement`.
- **Breaking changes / migration steps:** None; additions are optional and no migration is required.
- **Verification summary:** 24 focused tests, focused strict TypeScript, focused ESLint, and diff whitespace check passed. Full P001 check currently reports three unused symbols in concurrently edited RecordsPage outside this scope.
- **Outstanding blockers / follow-up:** UI integration may consume group metadata; no automatic eligibility/choice selection is implemented. Coordinator review pending.
- **Final status:** READY_FOR_REVIEW
