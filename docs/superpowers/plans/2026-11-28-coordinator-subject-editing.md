# Coordinator subject editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** coordinators can add, edit and remove subjects in curricula their scope covers. Shared fields (code, name, credits) lock when other programmes use the subject. Every curriculum change needs a reason and is audited. Removing a subject is a true delete, refused once the subject has been picked or planned.

**Architecture:**
- **Migration 0018:** adds audit triggers on `subject`, `curriculum_subject`, `subject_prerequisite` and `subject_semester_rule`, plus a DELETE-only trigger on `simulation_subject`. They write to `academic_setup_audit_log` when an actor context is set.
- **API:** the p001-sprint2 routes admit COORDINATOR with a server-side scope check (programme ids from `listScopes`). Every write sets the actor context with the reason. There is a new DELETE subject route.
- **Web:** the same `CurriculumPage` is mounted in the coordinator app.

**Tech Stack:** Postgres (Neon) with the `tools/db` CLI, TypeScript Worker, React, Vitest, Playwright UI scripts (`tools/admin`, `tools/coordinator`).

**Spec:** `docs/superpowers/specs/2026-11-28-coordinator-subject-editing-design.md`

## Global Constraints

- **Migration and checks:** migration `0018_curriculum_audit.sql`, structural check `023_curriculum_audit.sql`, behaviour check `024_curriculum_audit_behavior.sql`. Wire them like 0017 (manifest, extensions with no columns, `cli.mjs`, `review.mjs`, `test-academic-database.mjs`, `migrations.test.mjs`).
- **Never apply to Neon without owner approval.** Rehearse in a rolled-back transaction first.
- **Audit row shape:** `entity_type` = the table name, `entity_id` = the key (`subject_id`, `curriculum_subject_id`, `prerequisite_id`, `rule_id`, or `simulation_subject_id` for scenario rows), `action` = `TG_OP`, and before and after values as `to_jsonb`. Rows are written only when both `app.access_actor` and `app.access_reason` are set. A no-op UPDATE writes no row.
- **Roles:** curriculum routes allow `SYSTEM_ADMIN` and `COORDINATOR`. `/progress` stays STUDENT only. Holding the admin role wins.
- **Error codes and copy:**
  - `403 CURRICULUM_OUT_OF_SCOPE`: "This curriculum is outside your coordinator assignment."
  - `403 SUBJECT_SHARED_OUTSIDE_SCOPE`: "This subject is also used by <codes>. Ask its coordinator or the admin to change its code, name or credits."
  - `409 SUBJECT_IN_USE`: "Picked by <n> students in <semesters>. It can't be removed yet." Planned subjects get " and in <m> graduation plans" added.
- **Reason:** required on every write (`normaliseReason`, 1–500 characters). Its label is "Reason (recorded in the audit log)".
- **Coordinator page:**
  - Menu label "Curriculum & Subjects" at `/coordinator/curriculum`.
  - Lock hint: "Also used by <codes>. Ask its coordinator or the admin."
  - Empty state: "You are not assigned to any programme yet. Ask a system administrator to assign you in Coordinators."
- **UI rules:** readability guard, and no table toolbar.
- **Commits:** no AI trailer, explicit paths, never `docs/System Documents/`.

## Review Focus

1. **A coordinator calls a write route on a curriculum outside their scope directly:** it gets 403 before any repository write. Test in Task 2.
2. **A coordinator edits only the category of a shared subject:** it is allowed. Changing its code is refused. Test in Task 2.
3. **Removing a subject that is a prerequisite of another subject:** both links are removed and audited, and the other subject stays. Covered by check 024 and a test in Task 2.
4. **A stale revision on delete:** `409 STALE_CURRICULUM`, and nothing is removed. Test in Task 2.
5. **A whole-faculty coordinator:** sees every curriculum of the faculty's programmes, including a new one. Test in Task 2, with a scope reader returning two programmes.

---

### Task 1: Migration 0018 and checks 023 and 024

**Files:** create the migration and the two checks; modify the wiring files and `tools/db/migrations.test.mjs`.

- [ ] **Step 1: Failing tooling tests.** "0018 follows 0017 and only adds the curriculum audit function and its five triggers" asserts:
  - `CREATE OR REPLACE FUNCTION public.db_curriculum_audit()`.
  - One `CREATE TRIGGER … AFTER INSERT OR UPDATE OR DELETE` on each of the four tables.
  - `AFTER DELETE ON public.simulation_subject`.
  - No DROP TABLE, DELETE FROM or INSERT INTO a data table.

  "0018 checks are registered" covers files 023 and 024 in the three tools. Run `npm run test:db-tooling`. Expected: FAIL.
- [ ] **Step 2: Write the migration, the checks and the wiring.**
  - **Check 024** (a rolled-back transaction, in the style of 022). Under a context:
    - Insert a subject and mapping, giving one audit row each.
    - Update the mapping's category, giving one row.
    - A no-op update gives no row.
    - Deleting a prerequisite link gives one row.
    - Deleting a scenario row gives one row.
    - Without a context, an insert gives no row.
  - Run `npm run test:db-tooling`. Expected: PASS.
- [ ] **Step 3: Commit** as `feat(db): 0018 curriculum audit triggers (S3-P004-041)`.

### Task 2: API — roles, scope, reason, shared lock, delete

**Files:**
- `apps/api/src/modules/p001-sprint2/{routes,repository,contracts,validation,index}.ts`
- Test: `sprint2.test.ts`

**Interfaces:**
- **Dependencies:** `Sprint2Dependencies` gains `scopes: { programmeIds(clerkUserId: string): Promise<number[]> }`. `index.ts` builds it from `createAcademicSetupRepository(...).listScopes`, taking the distinct `programmeId`s.
- **Repository changes:**
  - `catalogue(programmeIds?: number[])` filters curricula when it is given ids.
  - `curriculum(id)` snapshot subjects gain `sharedWith: { programmeCode: string }[]`, computed outside the md5 revision.
  - New `curriculumProgrammeId(id): Promise<number | null>`.
  - New `subjectUse(mappingId): Promise<{ picks: number; plans: number; semesters: string[] }>`.
  - `subject(id, item, input, actor)`, `dependency(id, linkId, input, actor)` and `removeDependency(id, linkId, rev, reason, actor)` now take the actor, and `mutate` gets an actor context.
  - New `removeSubject(id, mappingId, rev, reason, actor): Promise<CurriculumSnapshot & { removed: { scenarioRows: number; prerequisiteLinks: number } }>`.
- **Inputs:** `SubjectInput` and `LinkInput` gain `reason: string`. The DELETE dependency and DELETE subject bodies are `{ revision, reason }`.

- [ ] **Step 1: Failing tests** in `sprint2.test.ts`, under `describe('coordinator subject editing (S3-P004-041)')`:
  - **Coordinator access:** a coordinator with programme 1 in scope GETs `/curricula`. The catalogue is called with `[1]`.
  - **Out of scope:** a coordinator writing to a curriculum of programme 2 gets 403 `CURRICULUM_OUT_OF_SCOPE`, and `repository.subject` is not called.
  - **Shared lock:** a coordinator PUTs a code change on a subject `sharedWith` SECRH (programme 2, not in scope). The result is 403 `SUBJECT_SHARED_OUTSIDE_SCOPE` with the message naming SECRH. The same PUT with only the category changed returns 200.
  - **Admin:** no scope call, and a shared edit is allowed.
  - **Reason missing:** a write without `reason` returns 400.
  - **Delete in use:** `subjectUse` returns picks 6, semesters `['2026/2027 S1']`. The result is 409 `SUBJECT_IN_USE` with "Picked by 6 students in 2026/2027 S1. It can't be removed yet." and `details`.
  - **Delete success:** `removeSubject` is called with the actor and reason, and returns `removed`.
  - **Stale delete:** the repository raises `STALE_CURRICULUM`, giving 409.
  - **Repository SQL:**
    - `mutate`'s first command sets `app.access_actor` and `app.access_reason`.
    - The `removeSubject` order is: delete `simulation_subject`, then `subject_prerequisite` (both sides), then `subject_semester_rule`, then `curriculum_subject`, all under the permitted revision.
  - **Replace the old test:** the existing "denies coordinator" test becomes the scope tests above.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run apps/api/src/modules/p001-sprint2 --config vitest.auth.config.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Run the same command. Expected: PASS. Then run `npm run typecheck`.
- [ ] **Step 4: Commit** as `feat(curriculum): coordinators edit subjects in scope; reason, shared lock, subject removal (S3-P004-041)`.

### Task 3: Web — reason fields, Remove subject, coordinator page

**Files:**
- `apps/web/src/features/p001-sprint2/{CurriculumPage.tsx,client.ts}`
- `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`
- Fixtures and checks: `tools/admin/test-ui.mjs` (the curriculum checks) and `tools/coordinator/test-ui.mjs`

**Interfaces:**
- **Consumes:** the Task 2 API.
- **Produces:** `CurriculumPage` props `{ api, initialCurriculumId?, role?: 'admin' | 'coordinator' }`. With the coordinator role, `sharedWith` locks the fields.

- [ ] **Step 1: Failing browser checks.**
  - **Admin "curriculum: every save asks for a reason; Remove subject removes it or shows the in-use message (S3-P004-041)":**
    - The fixture gets a DELETE route.
    - A 409 `SUBJECT_IN_USE` shows its message in the dialog.
  - **Coordinator "curriculum & subjects: menu, only in-scope curricula, shared subject fields locked with the hint, category still editable (S3-P004-041)":**
    - With no scope, the page shows the empty-state copy.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it. Run `npm run test:ui:admin` and `npm run test:ui:coordinator`. Expected: PASS.
- [ ] **Step 4: Commit** as `feat(curriculum): reason on every change, Remove subject, Curriculum & Subjects for coordinators (S3-P004-041)`.

### Task 4: Docs and full suites

- [ ] **Step 1: Write the docs.**
  - Change record `docs/changes/S3-P004-041-coordinator-subject-editing.md`, including the retire follow-up.
  - README row.
  - ACL amendment: open decision 1 marked "Implemented in S3-P004-041; to confirm at the 5–6 December review", and the A3 "Cannot" row updated.
  - Data-contracts paragraph.
- [ ] **Step 2:** Run typecheck, lint, `npm test`, db-tooling, admin, coordinator, integration and the p001 UI suites. Expected: all PASS, apart from the known p001 check that also fails on main.
- [ ] **Step 3: Commit** as `docs: S3-P004-041 change record, ACL, data contracts`.
