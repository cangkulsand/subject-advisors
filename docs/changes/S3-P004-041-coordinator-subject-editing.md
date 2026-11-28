# S3-P004-041: Coordinator subject editing, subject removal, curriculum audit

- **Status:** On branch `feature/coordinator-subjects`. Not merged. Migration 0018 is not applied.
- **Date:** 2026-11-28
- **Sprint:** Sprint 3
- **Owner:** P004, building Harraz's review items. To be handed over to Harraz.
- **Related UC / FR:**
  - UC06 and UC24 (curriculum subjects and prerequisites)
  - ACL open decision 1
  - Review of 21 Nov 2026
- **Branch / PR:** `feature/coordinator-subjects`, no PR
- **Design:** `docs/superpowers/specs/2026-11-28-coordinator-subject-editing-design.md`
- **Plan:** `docs/superpowers/plans/2026-11-28-coordinator-subject-editing.md`
- **Reviewer:** Pending

## 1. Plan

**From the 21 November review:**
- Dr. Adila: "subject additions are determined at department level and coordinators need the relevant permissions."
- Harraz's item: "complete the explicit Sprint 2 item of subject removal and handle prerequisite links to removed subjects. Align permissions with the ACL and retain cycle detection."

**Owner decisions (2026-11-28):**
- **Coordinator access:** coordinators can create, edit and delete subjects within their scope.
- **Shared subjects (option 1):** code, name and credits can be changed only when every programme using the subject is in the coordinator's scope.
- **Approach A:** Harraz's editor is opened to coordinators, and the audit is done with database triggers.
- **Removal in two steps:**
  - **Now:** a true delete, refused once the subject has been picked or planned.
  - **Follow-up:** "retire" a picked subject, which touches about 13 reader files across every module.

## 2. Implementation

**Migration 0018** (`db/migrations/0018_curriculum_audit.sql`, additive):
- **Function:** `db_curriculum_audit()`.
- **Triggers:** AFTER INSERT, UPDATE and DELETE on `subject`, `curriculum_subject`, `subject_prerequisite` and `subject_semester_rule`, plus AFTER DELETE on `simulation_subject`.
- **What it writes:** one `academic_setup_audit_log` row per change, but only under an actor context. No-op updates are skipped.
- **Checks:** structural check `023_curriculum_audit.sql` and behaviour check `024_curriculum_audit_behavior.sql` (rolled back).

**API** (`/api/p001-sprint2`):
- **Who can use it:** COORDINATOR as well as SYSTEM_ADMIN. Holding the admin role means no scope limit.
- **Scope:** the programme ids of the coordinator's live assignments, with faculty rows expanded (`coordinatorScopes`, from `listScopes`). It is checked on every read and write:
  - Out of scope: `403 CURRICULUM_OUT_OF_SCOPE`.
  - The catalogue lists only in-scope curricula.
- **Shared lock:**
  - The snapshot subjects carry `sharedWith`.
  - For a coordinator they also carry `lockedBy`, the out-of-scope programme codes.
  - Changing code, name or credits while `lockedBy` is non-empty returns `403 SUBJECT_SHARED_OUTSIDE_SCOPE`.
- **Reason:** every write requires `reason`. `mutate()` sets `app.access_actor` and `app.access_reason`, so the 0018 triggers record who changed what and why.
- **Removal:** `DELETE /curricula/{id}/subjects/{mappingId}` with `{ revision, reason }`.
  - **Refused while in use:** any pick (any semester) or graduation plan returns `409 SUBJECT_IN_USE`, for example "Picked by 6 students in 2026/2027 S1. It can't be removed yet."
  - **Otherwise, in one guarded transaction,** it deletes, in order: what-if scenario rows, prerequisite links on either side, semester rules, then the mapping.
  - **Reports** `removed: { scenarioRows, prerequisiteLinks }`.
  - **Kept:** the shared subject row and academic records.

**Screens:**
- **Admin (`/admin/curriculum`):**
  - The "Review change" step has **Reason (recorded in the audit log)**, required before Confirm save.
  - Each subject row has **Remove**. The result reads "Subject removed. 1 prerequisite link and 2 what-if scenario rows were cleared."
- **Coordinator:**
  - A new menu item, **Curriculum & Subjects** (`/coordinator/curriculum`), uses the same editor limited to the coordinator's curricula.
  - A locked shared subject shows read-only code, name and credits, with "Also used by <codes>. Ask its coordinator or the admin."
  - With no assignment, the page shows "You are not assigned to any programme yet. Ask a system administrator to assign you in Coordinators."

**Tests:**
- **API:** roles, scope, shared lock, reason, removal, and the actor context and SQL order.
- **db-tooling:** checks for 0018.
- **Editor browser checks** (`tools/p001-sprint2/test-uc24-ui.mjs`):
  - Reason required.
  - Remove, including the in-use refusal.
  - Existing checks now fill in a reason.
- **Coordinator browser checks:**
  - The menu.
  - In-scope curricula.
  - Locked fields, with category still editable.
  - The no-assignment message.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2157 passed, 67 skipped |
| `npm run test:db-tooling` | PASS |
| `npm run test:ui:admin` | 78 PASS |
| `npm run test:ui:coordinator` | 67 PASS |
| `npm run test:ui:integration` | 81 PASS |
| `node tools/p001-sprint2/test-uc24-ui.mjs` | All checks pass until "UC24 workspace at 1024px with 200% zoom stays usable", which also fails on `main` (pre-existing) |

**Whole-branch review (independent reviewer):** no Critical findings. Two Important findings were fixed, each with a failing test first:
- **Admin bypass:** it used stored roles. An account whose email domain does not allow System Administrator, but which still has that role stored, got unscoped edits. The bypass now uses the roles the email allows (`availableRoles`).
- **Lock after save:** the shared-subject lock disappeared after any save, because only the GET response carried `lockedBy`. Every snapshot returned to a coordinator now carries it.

**Deferred minors:**
- **Audit noise:** every subject save rewrites its semester rules, so the audit gets rows even when nothing changed.
- **Removal check order:** a removal checks "in use" before the revision check.
- **Lock and in-use checks:** both run outside the write transaction, so a concurrent change can slip past them. The database keeps the data safe either way.
- **Padded values:** saved code or name with stray spaces can refuse a category-only edit.
- **Stale reason:** the reason box keeps its text after a failed save or Back.
- **Failure after commit:** if reading shared subjects fails after a write is saved, the error says 503.
- **Test gap:** the coordinator 403 test doesn't cover the dependency routes.
- **Duplicate fetch:** the coordinator page loads the curriculum list twice.

**Outcome:** PASS; independent review fixes applied; Harraz's review is pending.

## 4. Handover to Harraz

**Where the code lives:**
- **Rules:** `apps/api/src/modules/p001-sprint2/routes.ts` holds the scope, the shared lock and the removal refusal.
- **Writes:** `repository.ts` holds `mutate`/`run` (actor context), `withShared`, `subjectUse` and `removeSubject`.
- **Screen:** `CurriculumPage.tsx` takes the `role` prop. The reason is entered in the review step, and Remove is in the Subject List.

**Still open:**
- **Retire:** retire a subject that students have picked. This is a follow-up that touches about 13 reader files.
- **Subject list:** subject-list search, and validating the credit total against the curriculum requirement.
- **Review:** confirm at the 5–6 December review.
- **Known failure:** the pre-existing 200% zoom check.

## 5. Changelog

- **Date:** 2026-11-28 · **Type:** Added · **Owner:** P004 (for Harraz)
- **Actual changes:**
  - Coordinators edit subjects in their scope, with shared fields locked when another programme uses the subject.
  - Every curriculum change needs a reason and is audited.
  - Admins and coordinators can remove a subject that no student has picked or planned.
- **Compatibility/impact:**
  - **Migration:** 0018, additive.
  - **API:** curriculum write bodies now require `reason`, the dependency DELETE body is `{ revision, reason }`, and there are new 403 and 409 codes.
- **Status:** READY_FOR_REVIEW
