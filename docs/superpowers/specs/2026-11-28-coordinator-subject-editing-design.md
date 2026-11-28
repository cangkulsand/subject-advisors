# Coordinator subject editing and subject removal (S3-P004-041): design

- **Date:** 2026-11-28
- **Owner:** P004. This builds Harraz's review item and ACL open decision 1. It is to be handed over to Harraz.
- **Status:** draft, waiting for owner approval.
- **Builds on:** S3-P004-040 (coordinator faculty scope), and Harraz's Curriculum & Prerequisites editor (`/api/p001-sprint2`, `CurriculumPage.tsx`).

## 1. Why

At the 21 November review, Dr. Adila said "subject additions are determined at department level and coordinators need the relevant permissions". The notes ask Harraz to "complete the explicit Sprint 2 item of subject removal and handle prerequisite links to removed subjects. Align permissions with the ACL and retain cycle detection."

The owner asked (2026-11-28) that coordinators get **create, edit and delete** for subjects within their scope.

## 2. How it works today

**Who can use it:** only SYSTEM_ADMIN can use `/api/p001-sprint2/curricula…` (routes.ts `authorize … roles: ['SYSTEM_ADMIN']`).

**Endpoints:**

| Method | Path | Does |
| --- | --- | --- |
| GET | `/curricula` | Catalogue: all curricula and all subjects |
| GET | `/curricula/{id}` | Snapshot with a `revision` (md5) |
| POST | `/curricula/{id}/subjects` | Adds a subject to the curriculum |
| PUT | `/curricula/{id}/subjects/{mappingId}` | Edits a subject |
| POST, PUT, DELETE | `/curricula/{id}/dependencies[/{id}]` | Prerequisite links |

- **Adding** creates a new `subject` row plus a `curriculum_subject` mapping, and can add prerequisites and semester rules.
- **Editing** updates `subject` (code, name, credits) and `curriculum_subject` (category, compulsory flag), plus the semester rules.
- **Stale edits:** every write passes the `revision`. A stale revision returns `409 STALE_CURRICULUM`.
- **Cycle detection:** `prerequisite_integrity` trigger plus the validation.

**What isn't there:**
- There is **no subject removal**.
- There is **no audit**: no reason is asked, and nothing is written to `academic_setup_audit_log`.

**Subjects are shared.** A `subject` row can be used by several curricula. In Neon, 61 of 98 subjects are in both the SECJ and SECRH curricula. Code, name and credits live on the shared `subject` row. Category, compulsory flag, semester rules and prerequisites belong to each curriculum (`curriculum_subject`).

**Database guards that stay:**
- `preserve_recorded_credits` refuses a credit change on a subject with recorded results.
- `preserve_mapping_identity` refuses changing which curriculum or subject a mapping points to.

**Tables that point at `curriculum_subject` (all ON DELETE RESTRICT):**
- `subject_prerequisite`, in both directions
- `subject_semester_rule`
- `semester_offering`: students' saved picks (6 rows today)
- `plan_subject`: graduation plans (0 rows today)
- `simulation_subject`: what-if scenarios (15 rows today)

Academic records and offering decisions point at `subject`, not the mapping.

**The coordinator app** (`/coordinator`, `CoordinatorRoutes.tsx`) has Overview, Imports, Offering Forecast and Offering History. Coordinator scope comes from `listScopes(clerkUserId)`, which is programme × centre (S3-P004-040).

## 3. Goals, non-goals, anti-goals

**Goals:**
1. **Coordinator access.** A COORDINATOR can open, add, edit and delete subjects in any curriculum of a programme their live scope covers, at any centre. Admins keep access to every curriculum.
2. **Shared subjects (owner chose option 1).** A coordinator may change a subject's code, name or credits only if every curriculum using that subject is in their scope.
   - **Otherwise** those three fields are locked, with the message "Also used by <programme codes>. Ask its coordinator or the admin."
   - **Still editable** when locked: category, compulsory, semesters and prerequisites.
   - The admin is never locked.
3. **Removal.** "Delete" takes the subject out of **this curriculum**:
   - Its prerequisite links in both directions and its semester rules are removed.
   - Students' what-if scenario rows for it are removed and counted.
   - The shared `subject` row, academic records and offering decisions are kept.
4. **Refused deletes.** A delete is refused while any student has the subject in saved picks or a graduation plan. The message gives the count, for example "6 students have this subject in their picks."
5. **Audit for everyone.** Every change, by an admin or a coordinator, needs a reason (1–500 characters) and is audited automatically in `academic_setup_audit_log`.
6. **Coordinator menu.** The coordinator app gets **Curriculum & Subjects** (`/coordinator/curriculum`). It reuses Harraz's editor, limited to their curricula.

**Non-goals:**
- Deleting a `subject` row itself.
- Editing curricula (version, credits).
- Coordinators adding curricula.
- Subject-list search and credit-total validation. That is a separate Harraz follow-up.

**Anti-goals:**
- **No edit without an audit row.** The triggers must catch every write made with an actor context.
- **No way round the scope rule.** A coordinator must not be able to edit outside their scope by calling the API directly. Scope is checked on the server for every call.
- **No silent cross-programme edits.** Option 1 prevents them.
- **No broken records.** Deleting must never remove a student's academic record or pick.

## 4. Approaches (owner chose A, 2026-11-28)

**A. Open Harraz's editor to coordinators (chosen).**
- One API and one screen.
- The rules stay in one place: revision check, cycle detection, scope check, shared lock and delete.
- Audit comes from database triggers (migration 0018).

**B. A separate coordinator module.** Rejected: it duplicates the add, edit and prerequisite rules, and its audit would only cover that path.

## 5. Design

### 5.1 Migration 0018: curriculum audit triggers

File: `db/migrations/0018_curriculum_audit.sql`, additive.

**The function `public.db_curriculum_audit()`** runs AFTER INSERT, UPDATE or DELETE, FOR EACH ROW, on four tables:

| Table | Key |
| --- | --- |
| `subject` | `subject_id` |
| `curriculum_subject` | `curriculum_subject_id` |
| `subject_prerequisite` | `prerequisite_id` |
| `subject_semester_rule` | `rule_id` |

- **When it writes:** only when `app.access_actor` and `app.access_reason` are both set, the same convention as 0012. Importer writes without a context stay unaudited.
- **What it writes:** one `academic_setup_audit_log` row with:
  - `entity_type` = the table name
  - `entity_id` = the key
  - `action` = `TG_OP`
  - `actor` and `reason` from the context
  - `before_data` = `to_jsonb(OLD)`, or null
  - `after_data` = `to_jsonb(NEW)`, or null
- **No-op updates are skipped:** an UPDATE that changes nothing (NEW = OLD) writes no row.
- **Rollback:** drop the four triggers and the function.
- **Checks:**
  - **Structural:** `db/checks/023_curriculum_audit.sql`, confirming the triggers exist and are enabled.
  - **Behaviour:** `024_curriculum_audit_behavior.sql`, which rolls back. It covers an insert, update and delete under a context each writing one row, no row without a context, and a no-op update writing no row.
  - **Wiring:** registered like 0017.

### 5.2 API (`apps/api/src/modules/p001-sprint2`)

**Roles:**
- `authorize` allows `SYSTEM_ADMIN` and `COORDINATOR` on the curriculum routes. `/progress` stays STUDENT only.
- An account holding both roles is treated as admin.

**Scope (coordinators only):**
- The covered programmes are the distinct `programmeId`s from `listScopes(clerkUserId)`. That reuses the admin academic reader, so faculty rows expand.
- A curriculum outside scope returns `403 CURRICULUM_OUT_OF_SCOPE`: "This curriculum is outside your coordinator assignment."
- This is checked on every GET and write.
- `GET /curricula` lists only in-scope curricula. The subject catalogue still lists all subjects, so a coordinator can see existing codes.

**Reason:**
- Every write body gains `reason`, validated by the shared `normaliseReason` (1–500 characters, otherwise `400 INVALID_REQUEST`).
- `mutate()` sets `app.access_actor` (the Clerk user id) and `app.access_reason` with `set_config(…, true)` as its first command, so the 0018 triggers record the change.
- The admin web editor sends the reason too.

**Shared-subject lock (coordinators):**
- **What changes:** on PUT subject, if code, name or credits differ from the saved values and the subject is mapped in any curriculum whose programme is not in the coordinator's scope, the request returns `403 SUBJECT_SHARED_OUTSIDE_SCOPE`.
- **Message:** "This subject is also used by <codes>. Ask its coordinator or the admin to change its code, name or credits."
- **Data for the page:** the snapshot gains, for each subject, `sharedWith: { programmeCode: string }[]`, the other programmes' curricula that use it. The page then locks the fields up front.

**Delete:** `DELETE /curricula/{id}/subjects/{mappingId}` with the body `{ revision, reason }`.
- **Refused first:** a stale revision returns `409 STALE_CURRICULUM`. A mapping that is not in this curriculum returns `404 SUBJECT_NOT_FOUND`.
- **Check use:** count distinct students in `semester_offering` and in `plan_subject` (through `academic_plan`) for the mapping. Any count above zero returns `409 SUBJECT_IN_USE`.
  - Message example: "6 students have this subject in their picks and 1 in a graduation plan. It can be removed once they no longer use it."
  - The response carries `details: { picks, plans }`.
- **Then, in one transaction (inside `mutate`):**
  1. Delete the `simulation_subject` rows for the mapping and count them.
  2. Delete the `subject_prerequisite` rows where the mapping is on either side.
  3. Delete the `subject_semester_rule` rows.
  4. Delete the `curriculum_subject` row.
- **Result:** the new snapshot plus `removed: { scenarioRows, prerequisiteLinks }`.
- **Audit:** the 0018 triggers record each deleted mapping, link and rule. `simulation_subject` has no trigger; its count goes into the result and the change record.

**Errors:**
- New codes: `CURRICULUM_OUT_OF_SCOPE`, `SUBJECT_SHARED_OUTSIDE_SCOPE`, `SUBJECT_IN_USE`.
- Existing codes are unchanged.

### 5.3 Screens

**Admin, `/admin/curriculum` (Harraz's page):**
- **Reason on every save:** each save (add subject, edit subject, add, edit or remove a link) asks for **Reason (recorded in the audit log)** inside the existing form or dialog.
- **Remove subject:** each subject row gets a **Remove subject** action, which opens a confirm dialog:
  - "Remove <CODE> from <programme version>. Its prerequisite links and semester rules are removed, and N what-if scenario rows are cleared. Students' records are kept."
  - A Reason field.
  - When the subject is in use, the server's plain message appears in the dialog.

**Coordinator, `/coordinator/curriculum`:**
- **Menu:** **Curriculum & Subjects**, in its own menu group.
- **Page:** the same `CurriculumPage`, given the coordinator client. The curriculum picker lists only in-scope curricula.
- **Locked fields:** for a subject with `sharedWith` outside scope, Code, Name and Credits are read-only, with "Also used by SECRH. Ask its coordinator or the admin." Admins never see the lock.
- **Empty state:** with no curricula in scope, the page shows "You are not assigned to any programme yet. Ask a system administrator to assign you in Coordinators."

**Readability:** both pages follow the themeguide rules and run the readability guard. No table toolbar is added.

### 5.4 Tests and docs

**Tests:**
- **Unit:** scope filter, shared-lock decision, delete counts and refusal, reason required, coordinator 403 on an out-of-scope curriculum, and the admin still unrestricted.
- **API routes:** roles, plus the new codes.
- **Checks 023 and 024.**
- **Browser:**
  - The admin removes a subject, and sees the in-use refusal.
  - A coordinator edits an in-scope subject and sees a locked shared subject.
  - A coordinator gets a direct 403 on an out-of-scope curriculum.
  - The coordinator menu.
  - Layout at 320, 375 and 768px.

**Docs:**
- The change record and README row.
- ACL amendment: open decision 1 marked "Implemented in S3-P004-041; to confirm at the 5–6 December review". The A3 coordinator "Cannot" row is updated.
- Data contracts: the curriculum audit paragraph.
- OpenAPI, if a sprint2 contract file exists. Otherwise the change record lists the routes.

## 6. Left to the builder

- The SQL shape of the in-use counts and the `sharedWith` aggregate.
- How `CurriculumPage` receives the role and lock flags (props, or snapshot fields).
- The exact component split for the remove dialog.

## 7. After deploy

Apply 0018 to Neon after owner approval. Rehearse it in a rolled-back transaction first, as for 0017, then run `migrate` and `verify`.
