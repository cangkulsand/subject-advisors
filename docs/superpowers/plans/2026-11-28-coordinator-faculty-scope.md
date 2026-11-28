# Coordinator faculty scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an admin can assign a coordinator to a whole faculty at one or more learning centres. That covers every active programme in the faculty, including programmes added later. The page is renamed **Coordinators**.

**Architecture:**
- **Migration 0017:** `coordinator_assignment.programme_id` becomes nullable, and NULL means the whole faculty. It adds a partial unique index for faculty rows and replaces the insert guard so it skips programme checks for faculty rows.
- **Scope reads:** `scopeSelect` in the academic repository expands faculty rows to programmes, so every consumer keeps getting programme × centre scopes.
- **Create:** it takes `learningCentreIds[]` and inserts one row per centre in one transaction.

**Tech Stack:** Postgres (Neon) migrations with the `tools/db` CLI, TypeScript Worker API, React, Vitest, Playwright admin UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-28-coordinator-faculty-scope-design.md`

## Global Constraints

- **Migration:** additive and numbered `0017_coordinator_faculty_scope.sql`, with check `021_coordinator_faculty_scope.sql`. Wire it the way 0016 was wired: `db/migrations/manifest.json`, `db/engineering-extensions.json`, `tools/db/cli.mjs`, `tools/db/review.mjs`, `tools/db/migrations.test.mjs` and `tools/admin/test-academic-database.mjs`.
- **Never apply to Neon without owner approval.** Dev and prod share it.
- **New faculty index:** `coordinator_assignment_one_live_faculty_idx` on (`access_assignment_id`, `faculty_id`, `learning_centre_id`) WHERE `programme_id IS NULL AND ended_at IS NULL`.
- **Error codes:**
  - **Duplicates:** both unique indexes map to `ASSIGNMENT_EXISTS` with the message "This coordinator already has this assignment at this learning centre."
  - **`ASSIGNMENT_ACTIVE`** keeps only its meaning "the programme has a live assignment and cannot change faculty".
- **Create request:** `{ accountId, facultyId, programmeId: number | null, learningCentreIds: number[] (1–20 distinct), reason }`. The old `learningCentreId` is removed. The response is `AdminCoordinatorAssignment[]`.
- **Copy:**
  - Menu label and page title: **Coordinators**.
  - Description: "Who coordinates each faculty or programme, and at which learning centres."
  - Radio labels: "Whole faculty (all its programmes, including new ones)" and "One programme".
  - Covers column: "Whole faculty".
  - End dialog: "End <name>'s coverage of <faculty or programme> at <centre>. Its history is kept."
- **Unchanged:** the address stays `/admin/coordinator-assignments`, and the dummy-coordinator flow (S3-P004-029) is unchanged.
- **UI rules:** the themeguide readability rules apply (12px minimum, 14px in tables) and the readability guard runs in the UI tests. No table toolbar.
- **Commits:** no AI trailer, explicit paths only, never `docs/System Documents/`.

## Review Focus

1. **A faculty row and a programme row covering the same programme × centre:** `listScopes` returns one scope, and ending the faculty row leaves programme access in force. Covered by a test in Task 2.
2. **A programme moved out of the faculty, or deactivated:** it drops out of the faculty row's coverage on the next read. Covered by a test in Task 2 (SQL shape) and check 021.
3. **An add with one of three centres already live:** the whole add is refused with nothing inserted, because it is one transaction. Covered by a test in Task 2.
4. **A faculty row on a faculty with no active programmes:** the add is allowed, with no scopes until a programme exists. The page shows "0 programmes". Covered by a test in Task 3.
5. **Moving a programme between faculties while only faculty rows exist:** it is allowed. Covered by check 021.

---

### Task 1: Migration 0017 and check 021

**Files:**
- Create:
  - `db/migrations/0017_coordinator_faculty_scope.sql`
  - `db/checks/021_coordinator_faculty_scope.sql`
- Modify: the six wiring files from Global Constraints.

**Migration body:**
- `ALTER COLUMN programme_id DROP NOT NULL`.
- Create the faculty index.
- `CREATE OR REPLACE FUNCTION public.db_academic_setup_assignment_guard()`: the 0008 body, where the programme lookup and the `PROGRAMME_FACULTY_MISMATCH` check run only `IF NEW.programme_id IS NOT NULL`.
- A header comment with the rollback note from spec 5.1.

**Check 021** (it fails loudly on any mismatch, in the style of 020):
- The column is nullable.
- The faculty index exists with the predicate `programme_id IS NULL`.
- The guard function source contains `NEW.programme_id IS NOT NULL`.

- [ ] **Step 1:** Add the 0017 expectations to `tools/db/migrations.test.mjs` the way 0016 did: the manifest entry, the check file listed, and the extension registered. Run `npm run test:db-tooling`. Expected: FAIL.
- [ ] **Step 2:** Write the migration, the check and the wiring. Run `npm run test:db-tooling`. Expected: PASS.
- [ ] **Step 3:** If `tools/admin/test-academic-database.mjs` runs locally (with a local Postgres), run it. Otherwise record that it was skipped.
- [ ] **Step 4:** Commit as `feat(db): 0017 coordinator faculty scope — nullable programme, faculty index, guard (S3-P004-040)`.

### Task 2: API — scope expansion and multi-centre create

**Files:**
- Modify:
  - `apps/api/src/modules/admin/academic-repository.ts` (`scopeSelect`, `createCoordinatorAssignment`)
  - `academic-contracts.ts`
  - `academic-errors.ts`
  - `academic-routes.ts` (only if the return type needs it)
  - `packages/shared/src/admin/academic-setup.ts`: the validator, `AdminCoordinatorAssignment.programmeId: number | null`, and `ASSIGNMENT_EXISTS`
- Test:
  - `academic-repository.test.ts`
  - `academic-routes.test.ts`
  - the shared academic-setup tests (if any exist)
  - `apps/api/src/modules/forecasting/*scope*` test

**Interfaces:**
- **Produces:**
  - `createCoordinatorAssignment(input: CreateCoordinatorAssignmentRequest, actor): Promise<AdminCoordinatorAssignment[]>`
  - `CreateCoordinatorAssignmentRequest { accountId; facultyId; programmeId: number | null; learningCentreIds: number[]; reason }`

- [ ] **Step 1: Failing tests.**
  - **Expansion:** `scopeSelect` contains `c.programme_id IS NULL AND p.faculty_id=c.faculty_id`, and it selects `p.programme_id`.
  - **Filter:** `isScopeAssigned` filters on `p.programme_id=$2`.
  - **Create:** one INSERT per centre in one `write` call, with `programme_id` bound as null for a faculty row. It returns all the rows.
  - **Validator:**
    - It rejects an empty, duplicate or 21-long centre list.
    - It rejects `programmeId` of `0` or `'x'`.
    - It accepts `null`.
    - It rejects the old `learningCentreId` field.
  - **Error mapping:** 23505 on either index gives `ASSIGNMENT_EXISTS` with its message.
  - **Forecasting:** the scope provider gets two programmes from a faculty-row source and lists both.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run apps/api/src/modules/admin apps/api/src/modules/forecasting packages/shared/src/admin --config vitest.auth.config.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement it. Update the existing 'ASSIGNMENT_ACTIVE for duplicate' test to `ASSIGNMENT_EXISTS`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm run typecheck` and fix the consumers of `programmeId` on admin assignments.
- [ ] **Step 5:** Commit as `feat(admin): faculty-wide coordinator scope and multi-centre assignments (S3-P004-040)`.

### Task 3: Coordinators page

**Files:**
- Modify:
  - `apps/web/src/features/admin/CoordinatorAssignmentsPage.tsx`
  - `academic-client.ts` (`createAssignment` input and output)
  - `AdminShell.tsx` (label)
  - `AdminRoutes.tsx` (title)
  - `tools/admin/academic-fixtures.mjs` (multi-centre create, faculty rows)
  - `tools/admin/academic-ui-checks.mjs` (the `routes` title becomes 'Coordinators', plus the new checks)
  - any test asserting 'Coordinator Assignments'

**Interfaces:**
- **Consumes:** the Task 2 request and response.

- [ ] **Step 1: Failing UI checks.**
  - **"coordinators: add a whole-faculty coordinator at two centres, Covers shows Whole faculty and the programme count, end one centre (S3-P004-040)"**
    - The fixture body is `{ programmeId: null, learningCentreIds: [1,2] }`.
    - Two rows show "Whole faculty".
    - Ending one leaves one row active.
  - **"coordinators: One programme limits the programme list to the faculty and needs a centre"**
    - Add stays disabled with no centre ticked.
  - **"coordinators: duplicate shows the plain message"**
    - The fixture returns 409 `ASSIGNMENT_EXISTS`.
  - **The menu shows "Coordinators".**
- [ ] **Step 2:** Run `ADMIN_CHECK=coordinators npm run test:ui:admin`. Expected: FAIL.
- [ ] **Step 3:** Implement the dialog (radios, centre checkboxes, reason), the table (Covers column, programme count), the end dialog copy, the rename and the fixtures.
- [ ] **Step 4:** Run `npm run test:ui:admin`. Expected: all PASS, including the existing responsive and readability checks for this route.
- [ ] **Step 5:** Commit as `feat(admin): Coordinators page — whole faculty or one programme, several centres (S3-P004-040)`.

### Task 4: Docs, full suites

**Files:**
- Create: `docs/changes/S3-P004-040-coordinator-faculty-scope.md`
- Modify:
  - `README.md`
  - `docs/api/admin-academic-setup.openapi.json`
  - `docs/database/data-contracts.md`
  - `docs/requirements/srs-amendment-2026-11-24-access-control-list.md`: open decision 2 marked "Implemented in S3-P004-040; to confirm at the 5–6 December review", and the A3 coordinator row updated.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db-tooling`, `npm run test:ui:admin` and `npm run test:ui:integration`. Expected: all PASS.
- [ ] **Step 3:** Commit as `docs: S3-P004-040 change record, API docs, ACL`.
