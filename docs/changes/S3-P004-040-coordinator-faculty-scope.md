# S3-P004-040: Coordinator faculty scope and the Coordinators page

- **Status:** Merged to `main` on 2026-11-28; migration 0017 applied to Neon 2026-11-28 (verify 66 PASS); deployed to dev and prod; dummy coordinators cleaned up 2026-11-28
- **Date:** 2026-11-28
- **Sprint:** Sprint 3
- **Owner:** P004, building Idham's review item. To be handed over to Idham.
- **Related UC / FR:** M7 academic setup (coordinator assignments), ACL open decision 2, review of 21 Nov 2026
- **Branch / PR:** `feature/faculty-scope`, no PR
- **Design:** `docs/superpowers/specs/2026-11-28-coordinator-faculty-scope-design.md`
- **Plan:** `docs/superpowers/plans/2026-11-28-coordinator-faculty-scope.md`
- **Reviewer:** Pending

## 1. Plan

**The review item:** at the 21 November review, Dr. Adila "directed the team to assign coordinators by faculty across the relevant Learning Centers". Her example was Dr. Zamiah, who covers Computing at JB, KL and Penang. The notes ask us to "apply faculty scope and verify cross-center coverage alongside Aisa's nested views".

**Owner decisions (2026-11-28):**
- **Live faculty scope:** programmes added to the faculty later are covered.
- **Programme rows stay:** programme assignments are kept alongside faculty rows.
- **How it's stored:** approach A, a faculty row in the existing table.
- **Rename:** the menu becomes **Coordinators**.
- **Clean up dummy coordinators after deploy:**
  - **Keep:** `ecjh+` (SECJ) and `ecrh+` (SECRH), each at all three centres.
  - **Remove:** end the other five dummies' assignments, revoke their role and delete their Clerk test logins.

**Next item:** coordinators get create, edit and delete for subjects in their scope. That has its own design.

## 2. Implementation

**Migration 0017** (`db/migrations/0017_coordinator_faculty_scope.sql`, additive):
- `coordinator_assignment.programme_id` becomes nullable. NULL means the whole faculty.
- A new index, `coordinator_assignment_one_live_faculty_idx`, allows one live faculty row per account, faculty and centre.
- `db_academic_setup_assignment_guard` is replaced so it skips the programme checks for faculty rows.

**Checks and tooling:**
- **New check 021:** `db/checks/021_coordinator_faculty_scope.sql`.
- **Check 012:** its column shape now allows a nullable `programme_id`.
- **Wiring:** the manifest, extensions, CLI, review script and tooling tests are updated.

**Rollback:** described in the migration header.

**API** (`academic-repository.ts`, `packages/shared/src/admin/academic-setup.ts`):
- **Expanding faculty rows:** `scopeSelect` expands a faculty row to every active programme of the faculty (`c.programme_id IS NULL AND p.faculty_id=c.faculty_id`) and returns `p.programme_id`.
- **Access checks:** `isScopeAssigned` filters on the expanded programme. Forecasting, offerings and View as are unchanged because they still receive programme × centre scopes.
- **Create request:** `{ accountId, facultyId, programmeId: number | null, learningCentreIds: number[] (1–20), reason }`. It inserts one row per centre in one statement and returns the rows.
- **Duplicates:** a duplicate on either index returns 409 `ASSIGNMENT_EXISTS` ("This coordinator already has this assignment at this learning centre."). `ASSIGNMENT_ACTIVE` now only means a programme with a live assignment cannot change faculty.

**Page** (`CoordinatorAssignmentsPage.tsx`, still at `/admin/coordinator-assignments`):
- **Name:** the title and menu are **Coordinators**, with the description "Who coordinates each faculty or programme, and at which learning centres."
- **Add coordinator dialog:**
  - Coordinator, then Faculty.
  - **Covers:** "Whole faculty (all its programmes, including new ones)" (the default) or "One programme".
  - **Learning centres:** checkboxes.
  - Reason.
  - Save stays disabled until everything needed is chosen.
- **Table:**
  - **Columns:** Coordinator, Faculty, Covers, Learning centre, Started, Ended, Actions.
  - **Covers** shows "Whole faculty" with the current programme count.
  - **End dialog:** "End <name>'s coverage of <faculty (whole faculty) or programme> at <centre>. Its history is kept."
- **Other screens:** the "Coordinator Assignments" wording in the coordinator notices and the structure move message now says "Coordinators".

**Tests:**
- **Repository:** the expansion, the multi-centre create and the error mapping.
- **Shared validator.**
- **Web client.**
- **Admin browser checks:** one programme with a duplicate and an end, and whole faculty at two centres with the programme count and one centre ended.
- **db-tooling:** checks for 0017.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2142 passed, 67 skipped |
| `npm run test:db-tooling` | 33 PASS |
| `npm run test:ui:admin` | 78 PASS |
| `npm run test:ui:coordinator` | 65 PASS. One run hit a page-load timeout flake in a forecast check; the rerun passed. |

**Neon (2026-11-28, owner-approved):**
- **Rehearsal:** 0017 plus checks 021 and 022 ran in one rolled-back transaction. The 6 structural checks and 9 behaviour checks passed, and nothing was kept.
- **Applied:** `migrate` applied 0017, and `verify` passed all 66 checks.

**Dummy coordinator cleanup (2026-11-28, owner-approved):**
- **How it ran:** through the repository code paths. The actor was the protected owner, with the reason "Dummy coordinator cleanup: keep ecjh+/ecrh+ at all centres (S3-P004-040)".
- **Kept and widened:** `ecjh+clerk_test@utm.my` (SECJ) and `ecrh+clerk_test@utm.my` (SECRH) each gained JB and Penang programme rows (assignments 21–24). Each now covers KL, JB and Penang.
- **Ended and suspended:** the 6 assignments of `coord-ecjh-jb`, `coord-ecjh-pg`, `coord-ecrh-jb`, `coord-ecrh-pg` and `coord-ecjh-kl-jb` were ended, and their 5 app accounts were suspended. Removing their only role is refused (`LAST_ROLE`), so suspending was used instead.
- **Clerk:** those 5 Clerk test logins were deleted, taking the instance from 56 to 51 users.

**Whole-branch review (independent reviewer):** no Critical findings. Two Important findings were fixed:
- **Database test:** a test expected `ASSIGNMENT_EXISTS` for a programme faculty move. It is back to `ASSIGNMENT_ACTIVE`.
- **Behaviour checks:** 0017 had no behaviour checks. The new `db/checks/022_coordinator_faculty_scope_behavior.sql` covers them, and it ran in the rehearsal above.

**Deferred minors:**
- **Duplicate message:** it doesn't name the centre that clashed.
- **Covers column:** it shows only the programme code, not the code and name.
- **Programme count:** it is also shown for ended rows and inactive faculties.
- **List filter:** the `?programmeId=` filter leaves out the faculty rows that cover the programme.

**Outcome:** PASS; independent review fixes applied; Idham's review is pending.

## 4. Handover to Idham

- **Data model:** a row with `programme_id` NULL means the whole faculty at that centre. All coordinator access goes through `listScopes` / `isScopeAssigned` (`academic-repository.ts`). Change those two, not their consumers.
- **Page:** `CoordinatorAssignmentsPage.tsx`, which holds the dialog (`AssignmentOptions`) and the table.
- **Still open:** coordinator subject editing (next item), and confirming the faculty scope at the 5–6 December review.

## 5. Changelog

- **Date:** 2026-11-28 · **Type:** Added · **Owner:** P004 (for Idham)
- **Actual changes:**
  - Coordinators can be assigned to a whole faculty, which covers its programmes now and later, or to one programme.
  - The admin can pick several learning centres at once.
  - The page and menu are renamed Coordinators.
- **Compatibility/impact:**
  - **Migration:** 0017, additive.
  - **API:** the create request uses `learningCentreIds[]` instead of `learningCentreId`, returns an array, and duplicates now return `ASSIGNMENT_EXISTS`.
- **Status:** MERGED, DEPLOYED (dev and prod, 2026-11-28); migration 0017 applied
