# Coordinator faculty scope and the Coordinators page (S3-P004-040): design

- **Date:** 2026-11-28
- **Owner:** P004, building Idham's review item; to be handed over to Idham
- **Status:** Draft, for owner approval
- **Follow-up (separate design):** coordinators get create, edit and delete for subjects within their scope. This also closes Harraz's subject-removal item.

## 1. Why

At the 21 November review, Dr. Adila "directed the team to assign coordinators by faculty across the relevant Learning Centers". Her example was Dr. Zamiah, who covers Computing across Johor Bahru, Kuala Lumpur and Penang. The notes ask us to "apply faculty scope and verify cross-center coverage alongside Aisa's nested views".

Today an admin assigns one row per coordinator × programme × learning centre, so covering a faculty means many rows. A programme added later is not covered until someone remembers to assign it.

The owner also asked to rename the menu item. "Coordinator Assignments" reads as robotic, so it becomes **Coordinators**.

## 2. How it works today

**Table `coordinator_assignment` (0008):**
- Columns: `access_assignment_id`, `faculty_id`, `programme_id` (NOT NULL), `learning_centre_id`, `started_at`, `ended_at`.
- Rows are never deleted; ending one sets `ended_at`.
- Duplicate guard: one live row per (account, programme, centre), enforced by `coordinator_assignment_one_live_scope_idx`.

**Insert guard (`db_academic_setup_assignment_guard`):**
- The account must be active and hold the COORDINATOR role.
- The programme, faculty and centre must be active.
- `programme.faculty_id` must equal `faculty_id`, otherwise `PROGRAMME_FACULTY_MISMATCH`.
- An update may only set `ended_at`.

**Programme guard (`db_academic_setup_reference_guard`):** a programme's faculty cannot change while a live assignment names that programme (`ASSIGNMENT_ACTIVE`).

**Audit:** `db_academic_setup_audit` writes one row to `academic_setup_audit_log` per insert or end (`coordinator_assignment`, INSERT / END_ASSIGNMENT).

**Where coverage is read:** every read of what a coordinator may see goes through `listScopes(clerkUserId)` and `isScopeAssigned(clerkUserId, programmeId, learningCentreId)` in `apps/api/src/modules/admin/academic-repository.ts`. Both use `scopeSelect`. Forecasting, offerings and View as all consume a list of programme × centre scopes through `scope-provider.ts`.

**Admin page:** `CoordinatorAssignmentsPage.tsx` at `/admin/coordinator-assignments`, with menu label "Coordinator Assignments".
- Add assignment: one account, faculty, programme and centre.
- Table columns: Account, Faculty, Programme, Learning centre, Started, Ended, plus **End assignment**.

## 3. Goals, non-goals, anti-goals

**Goals:**
1. **Whole-faculty assignment:** an admin can assign a coordinator to a **whole faculty** at one or more learning centres. The coordinator then covers every programme in that faculty at those centres, including programmes added to the faculty later.
2. **Programme assignments stay:** programme-level assignments keep working unchanged, so the admin chooses "Whole faculty" or "One programme".
3. **Several centres at once:** the admin can pick several learning centres in one add. This creates one row per centre, so each centre can be ended on its own later.
4. **New name:** the menu label and the page title become **Coordinators**.
5. **Dummy cleanup after deploy** (owner-approved in conversation, asked again before running):
   - Keep `ecjh+clerk_test@utm.my` (SECJ) and `ecrh+clerk_test@utm.my` (SECRH), each with a **programme** assignment at **all three** centres (JB, KL, Penang).
   - End the assignments of `coord-ecjh-jb`, `coord-ecjh-pg`, `coord-ecrh-jb`, `coord-ecrh-pg` and `coord-ecjh-kl-jb`.
   - Revoke those five accounts' COORDINATOR role and delete their Clerk test logins.

**Non-goals:**
- Coordinator subject editing (a separate design).
- Changing what a coordinator can do inside their scope.
- A faculty-wide scope that also means "all centres". Centres are always chosen explicitly.

**Anti-goals:**
- **Downstream code having to understand faculty rows.** Forecasting, offerings and View as must keep receiving plain programme × centre scopes.
- **A faculty row covering a programme from another faculty.**
- **Losing audit or history**, for example deleting rows.

## 4. Approaches (owner chose A, 2026-11-28)

- **A. A faculty row in the existing table (chosen).** `programme_id` becomes nullable, and NULL means "every programme in `faculty_id`". The two scope functions expand faculty rows into programmes, so the existing audit, end and history logic is reused. It needs a small migration.
- **B. A separate faculty-assignment table.** Rejected: it duplicates the audit, end and history logic, and every scope read joins two tables.
- **C. A shortcut that creates one programme row per programme.** Rejected: programmes added later are silently not covered.

## 5. Design

### 5.1 Migration 0017 (`db/migrations/0017_coordinator_faculty_scope.sql`, additive)

**Column:** `ALTER TABLE public.coordinator_assignment ALTER COLUMN programme_id DROP NOT NULL`.

**Duplicate guard for faculty rows:** a new partial unique index on (`access_assignment_id`, `faculty_id`, `learning_centre_id`) WHERE `programme_id IS NULL AND ended_at IS NULL`, named `coordinator_assignment_one_live_faculty_idx`. The existing programme index stays. Its NULL programme ids never collide, so faculty rows are covered only by the new index.

**Insert guard:** `CREATE OR REPLACE` the function `db_academic_setup_assignment_guard`.
- **When `programme_id` is NULL:**
  - Skip the programme lookup and the faculty-match check.
  - The account, role, faculty-active and centre-active checks are unchanged.
- **When it is not NULL:** behaviour is unchanged.
- **Update rule:** unchanged.

**Programme guard:** `db_academic_setup_reference_guard` already matches only `programme_id=NEW.programme_id`, so faculty rows do not block moving a programme between faculties. Coverage follows the programme. No change is needed; a check confirms it.

**Audit:** no change needed. `to_jsonb(NEW)` records `programme_id: null`.

**Scope index:** `coordinator_assignment_scope_idx` stays.

**Rollback:**
1. End or remove the faculty rows: `UPDATE … SET ended_at` is the only allowed change, and deletes are blocked. Restoring NOT NULL requires there to be no NULL rows, so a rollback after faculty rows exist means first ending them and then ruling on keeping the column nullable. This is documented in the migration header.
2. Drop the new index and restore the old function body.

**Checks:**
- `db/checks/021_coordinator_faculty_scope.sql`, with the manifest, engineering-extension and verify updates used for 0016.
- What it checks:
  - The column is nullable and the faculty index exists.
  - A faculty row inserts with no programme, and a duplicate live faculty row is refused.
  - A faculty row does not block a programme's faculty change.

### 5.2 Scope reads (`academic-repository.ts`)

**`scopeSelect`:** it returns one row per covered programme × centre. A faculty row expands to every **active** programme whose `faculty_id` equals the row's faculty. The join becomes `JOIN public.programme p ON (c.programme_id=p.programme_id OR (c.programme_id IS NULL AND p.faculty_id=c.faculty_id))`, plus the existing active filters.

**`DISTINCT`:** it stays, so a coordinator holding both a faculty row and a programme row for the same programme × centre gets one scope.

**`isScopeAssigned`:** it uses the same expansion, so a faculty row grants access to any active programme of that faculty at that centre.

**Results:** `listScopes` and `isScopeAssigned` keep their shapes, so no downstream change is needed.

**Programme state:** a programme that is inactive, or moved out of the faculty, drops out of the faculty row's coverage at the next request, because the scopes are read live.

### 5.3 API (`/api/admin/academic-setup/coordinator-assignments`)

**Create request:** `{ accountId, facultyId, programmeId: number | null, learningCentreIds: number[], reason }`.
- `learningCentreIds` holds 1–20 distinct ids and replaces the single `learningCentreId`.
- **Ruling:** keep accepting the old single `learningCentreId` for one release? No. The only client is our page, so the old field is removed and the OpenAPI is updated.

**Write:**
- Creates one row per centre in **one transaction** with one reason.
- Returns the created rows.

**Refusals:**
- **Live row already exists:** if any centre already has a live identical row (same account, same programme or faculty, same centre), the whole add is refused with 409 `ASSIGNMENT_EXISTS`: "This coordinator already covers <faculty or programme> at <centre>."
- **Programme row mismatch:** `programmeId` set means a programme row, and `facultyId` must match the programme's faculty (the existing guard).

**Reads:** the list response includes faculty rows with `programmeId: null`.

**End:** ending one row (`POST …/{id}/end`) is unchanged.

**Shared types:**
- `AdminCoordinatorAssignment.programmeId` becomes `number | null`, defined in `packages/shared/src/admin/academic-setup.ts` without changing the forecasting `CoordinatorAssignment` type.
- `ASSIGNMENT_EXISTS` is added to `ACADEMIC_SETUP_ERROR_CODES`.

### 5.4 Coordinators page

**Address and naming:**
- The address stays `/admin/coordinator-assignments` so old links work.
- The menu label is **Coordinators**.
- The page title is **Coordinators**, with the description "Who coordinates each faculty or programme, and at which learning centres."

**Add coordinator** (button) opens a dialog:
1. **Coordinator account** (active accounts with the Coordinator role), as today.
2. **Faculty** (active faculties).
3. **Covers**, as radios:
   - "Whole faculty (all its programmes, including new ones)", the default.
   - "One programme", which shows a **Programme** select limited to the chosen faculty's active programmes.
4. **Learning centres:** checkboxes of the active centres, with at least one required.
5. **Reason.**

**Table:**
- **Columns:** Coordinator, Faculty, Covers, Learning centre, Started, Ended, Actions.
- **Covers** reads "Whole faculty" or the programme code and name.
- **Faculty rows** also show "<n> programmes" for the number of active programmes the row covers now.
- **One row per centre**, as today.

**Remove:** the action **End assignment** stays per row. The ending dialog says "End <name>'s coverage of <faculty or programme> at <centre>. Its history is kept."

**No table toolbar:** no filter, search or sort is added, which matches the current page.

**Readability:** the page follows the themeguide and runs the readability guard in the UI tests.

### 5.5 Docs and tests

**Docs:**
- **API:** `docs/api/admin-academic-setup.openapi.json`.
- **Data contracts:** a faculty scope paragraph.
- **ACL amendment:** open decision 2 (faculty scope) becomes In force, and the coordinator row in A3 is updated.
- **Change record and README row.**

**Tests:**
- **Repository:** the `scopeSelect` expansion, `isScopeAssigned` with a faculty row, the create with several centres, and `ASSIGNMENT_EXISTS`.
- **Routes and validation:** request and response shapes.
- **Database check 021.**
- **Admin browser checks:**
  - Add a whole-faculty coordinator at two centres, then end one centre.
  - The One programme path.
  - The menu label "Coordinators".
  - Layouts at 320, 375 and 768px.
- **Forecasting scope provider:** a faculty row yields every active programme × centre.

## 6. Left to the builder

- The SQL form of the expansion, as long as it is one query and `DISTINCT`.
- How the dialog's account list is loaded. Reuse what the page has.
- The exact wording of helper hints, within the themeguide.

## 7. After deploy (asked again before running)

**Migration:** apply 0017 to Neon (shared dev and prod) with `migrate` and `verify` after owner approval.

**Dummy cleanup (§3 goal 5):**
- Through the admin API's code paths, with reasons, or through Clerk for the logins.
- Report each step: assignments ended, roles revoked, Clerk users deleted, and the remaining Clerk user count.
