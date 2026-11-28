# SRS/SDD v2.7 amendment — Access Control List and recovery permissions (2026-11-24)

- **Source decision:** Academic System Project Review, 21 November 2026 (Dr. Adila): "Define the Access Control List (ACL) in the requirements report. Specify which roles each email domain can hold, who can assign roles, and what Students, Coordinators, and System Admins can view, edit, approve, or recover." and "Resolve student-to-admin promotion and dual-role switching … Agree on recovery permissions that protect academic records and preserve the audit trail." Change record: [S3-P004-035](../changes/S3-P004-035-access-control-list.md).
- **Target document:** `UTMSPACE_SRS_SDD_v2.7 (21 Nov).docx`. Not yet applied to the .docx; when applied, save as v2.8 (v2.7 kept unchanged) with a revision-history row and an Appendix B entry "Access Control List (24 November)".
- **Status of each rule:** **In force** means the deployed code enforces it today (file references given). **Proposed** means it still needs agreement at the 5 and 6 December review. Nothing here is a product rule until the owner and Dr. Adila accept it.

## The decision in one paragraph

Each role has exactly one email domain, and one account cannot be both student and staff. Students sign in
with `@graduate.utm.my`, coordinators with `@utm.my` and System Administrators with `@gmail.com`. Staff may sign
up on their own and wait until an administrator gives them their role. A student who
also becomes an administrator gets a **separate** gmail account; the student account, its records and its
history are not moved or merged. Role assignment belongs only to the System Administrator, and every grant,
revoke, suspend and reactivate needs a reason and is written to an append-only audit log. Instead of holding two
roles, an administrator uses **View as** to see a coordinator's workspace (with full coordinator actions,
recorded under the administrator) or a student's workspace (read only). Recovery never deletes history: accounts
are suspended rather than deleted, reference data is deactivated rather than removed, and corrections are new
audited entries.

## A1. Email domains and roles (In force)

| Role | Email domain (verified primary email) | How the role is obtained |
| --- | --- | --- |
| Student | `@graduate.utm.my` only | Automatic on first sign-in (`initializeStudent`, `apps/api/src/modules/auth/repository.ts`) |
| Coordinator | `@utm.my` only | Granted by a System Administrator: an invitation (roles given at first sign-in), an added account, or a role grant. A `@utm.my` person may also sign up without one: they see **Waiting for access** (`ROLE_PENDING`), nothing is created, and they appear in Users & Access under **Waiting for a role** until an administrator assigns the role (S3-P004-036) |
| System Administrator | `@gmail.com` only | Granted by a System Administrator in the same ways; an uninvited `@gmail.com` sign-up also waits for a role. The permanent (protected) owner is the gmail owner account |

- Rule source: `eligibleRoles` in `apps/api/src/modules/auth/policy.ts` and `SYSTEM_ADMIN_EMAIL_DOMAINS` in `packages/shared/src/admin/admin.ts` (S3-P004-033). The same rule applies to grants, invitations, invitation redemption and `tools/auth/role-provisioning.mjs`.
- An unverified email holds no role (`EMAIL_UNVERIFIED`). A role whose domain no longer matches is kept in the record but cannot be used; the admin page shows it as "Not usable: email domain".
- A matching domain never creates a role by itself, except Student on first sign-in.

## A2. Who can assign roles (In force)

| Action | Who | Safeguards |
| --- | --- | --- |
| Create an account, invite, grant a role (including **Assign role** for a waiting sign-up) | System Administrator | Reason required (max 500 characters); domain must match the role (`ROLE_NOT_ELIGIBLE`); audited in `user_role_audit_log` |
| Revoke a role | System Administrator | Reason required; an account keeps at least one role (`LAST_ROLE`; suspend instead); at least one active System Administrator remains (`LAST_ACTIVE_ADMIN`); cannot remove own System Administrator role (`SELF_LOCKOUT`); the protected owner cannot be changed (`PROTECTED_OWNER`) |
| Suspend or reactivate an account | System Administrator | Reason required; sign-in is blocked in Clerk at the same time (`SIGN_IN_BLOCK_FAILED` rolls back); cannot suspend self; audited in `user_access_audit_log` |
| Assign a coordinator to a programme and learning centre | System Administrator | Reason required; one live assignment per coordinator, programme and centre; ending sets `ended_at` and keeps the row; audited in `academic_setup_audit_log` |
| Change a student's programme | System Administrator | Reason required; audited (`entity_type='student_programme'`); records kept; open future picks of the old curriculum removed and counted (S2-P004-026) |

Students and coordinators cannot assign or change any role.

## A3. What each role can view, edit, approve and recover

### Student (In force)

| | Scope |
| --- | --- |
| **View** | Own profile, own academic records, degree progress, graduation check, graduation plan, pathway, recommendations, and the semester offerings their coordinator approved for their programme and learning centre |
| **Edit** | Own profile fields; own academic records; own semester picks while the admin-set selection window is open; own plan (what-if scenario) |
| **Locked after first save** | Programme (`PROFILE_PROGRAMME_LOCKED`), intake year (`PROFILE_INTAKE_LOCKED`, S3-P004-037) and matric number (`PROFILE_MATRIC_LOCKED`, S3-P004-039; a number another student holds is refused with `PROFILE_MATRIC_TAKEN`), changed only through a System Administrator; learning centre while the selection window is open until the admin moves the semester forward (S2-P004-023) |
| **Approve** | Nothing. Graduation check confirmation is the student's own statement, not an approval |
| **Recover** | Nothing beyond re-entering own data |

All student endpoints are scoped to the signed-in identity; a browser-supplied student ID is never trusted.

### Coordinator (In force)

| | Scope |
| --- | --- |
| **View** | Class Offering Forecast and the student list behind each count, for their assigned scope only: a programme × learning centre, or a whole faculty × learning centre covering every active programme of the faculty (S3-P004-040; `apps/api/src/modules/forecasting/scope-provider.ts`); Offering History for past semesters of that scope |
| **Edit / Approve** | Offering decisions (Pending / Approved / Removed) for the next Normal semester of their scope; open or close a subject for picks. Each change is audited (`offering_decision_audit`, `forecast_decision_audit_log`) |
| **Cannot** | See or change student records or profiles directly; change curricula, subjects, prerequisites, semesters, roles or other coordinators' scopes |
| **Recover** | Change a decision back (every change is a new audit row) |

### System Administrator (In force)

| | Scope |
| --- | --- |
| **View** | Users & Access (accounts, roles, status, invitations), the role and access audit, academic setup (learning centres, faculties, departments, programmes, curricula, semesters, coordinator assignments), Curriculum & Prerequisites |
| **Edit** | Everything in A2; academic setup records (reason required, audited in `academic_setup_audit_log`); the current semester and the selection window; curriculum subjects and prerequisite links (with cycle detection) |
| **View as Coordinator** | Choose an active programme and learning centre; the admin can do everything that coordinator could, and the history shows "(System Admin)" on those decisions |
| **View as Student** | Choose one student with a complete profile; read only (`VIEW_AS_READ_ONLY` on any write) |
| **Cannot** | Edit a student's academic records or picks; change the audit logs; delete accounts or reference data that history points to |

## A4. Student-to-admin promotion and dual roles (In force)

- A person who is both a student and staff uses **two accounts**: the `@graduate.utm.my` student account and a `@utm.my` (coordinator) or `@gmail.com` (administrator) staff account. Roles are not moved between accounts.
- The student account's profile, records, picks, plans and audit history stay with the student account. Nothing is merged or re-owned (`Plan ownership is immutable`, `Scenario ownership is immutable` in migration 0011).
- There is no role switching inside one account for students and staff. An administrator who needs to see another workspace uses **View as** (A3), and every view is logged (`event: view_as`).
- If a staff member's old account still carries a staff role from before S3-P004-033, that role shows as "Not usable" and the admin revokes it with a reason.

## A5. Recovery permissions

| Situation | Recovery | Who | Status |
| --- | --- | --- | --- |
| Account suspended by mistake | Reactivate with a reason; Clerk sign-in unblocked in the same step | System Administrator | In force |
| Role removed by mistake | Grant the role again with a reason; both the revoke and the grant stay in the audit | System Administrator | In force |
| Student cannot sign in (lost access to Clerk) | Clerk account recovery for the same email; the application account is matched by Clerk user ID and keeps its data | Student, through Clerk | In force |
| Wrong programme chosen at registration | Programme change with a reason (A2); records kept; future picks removed and counted | System Administrator | In force |
| Wrong intake year | Change intake year with a reason on the account page; audited (`student_intake`); the curriculum is not changed (S3-P004-037) | System Administrator | In force |
| Wrong matric number | Change matric number with a reason on the account page; audited (`student_matric` / `CHANGE_MATRIC_NO`); a number another student holds is refused; the intake year is not changed (S3-P004-039) | System Administrator | In force |
| Learning centre, faculty, department, programme or curriculum deactivated by mistake | Set active again with a reason; nothing is hard-deleted | System Administrator | In force |
| Coordinator assignment ended by mistake | Create a new assignment for the same scope; the ended row stays as history | System Administrator | In force |
| Offering decision made by mistake | Change the decision again; each change is a new audit row | Coordinator, or System Administrator through View as | In force |
| Student data snapshot hidden by mistake | Not recoverable from the UI (the snapshot stays frozen in the database and the removal is recorded in `academic_import_batch_removal`) | — | In force; import path is hidden since S3-P004-032 |
| The last System Administrator or the protected owner | Cannot be suspended or lose the role; ownership moves only through a pinned, audited migration (as in 0015) | — | In force |
| Student deletes or changes an academic record by mistake | **Gap:** academic records are deleted outright and changes are not audited, so they cannot be recovered | — | **Proposed:** keep deleted records as removed (soft delete) with who and when, and keep an append-only record history; only the student edits records, and the System Administrator can view the history and restore a removed record with a reason. Owner: P001 (UC04) |
| Wrong intake or programme for many students | **Batch correction** (Users & Access → Batch correction): paste up to 500 matric numbers, check the preview, choose the programme and/or intake year (a year for all, or each student's year from their matric number), give one reason. All students change together or none do; one audit row per student; a programme change follows the single-change rules and removes future picks (S3-P004-039) | System Administrator | In force |

Audit logs (`user_role_audit_log`, `user_access_audit_log`, `academic_setup_audit_log`, `offering_decision_audit`, `forecast_decision_audit_log`, `confirmed_offering_audit`, `forecast_adjustment_audit`) are append-only: database triggers reject any update or delete (`db_immutable`, migrations 0001, 0004, 0007, 0008, 0009). No role can edit or delete them.

## A6. Open decisions for 5 and 6 December

1. **Subject and curriculum editing by coordinators.** Dr. Adila said subject additions are decided at department level and coordinators need the relevant permissions. Today only the System Administrator can edit curricula and prerequisites. Proposal: a coordinator may add, edit or remove subjects and prerequisites only for curricula of programmes in their own assignment, with the same audit; this follows the faculty-scope change (Idham).
2. **Coordinator scope by faculty.** Implemented in S3-P004-040; to confirm at the 5–6 December review. An admin assigns a coordinator to a whole faculty (or one programme) at one or more learning centres; a faculty row covers every active programme of the faculty, including programmes added later.
3. **Academic record history** (A5, proposed rows) and whether a System Administrator may restore records.
4. **Batch programme and intake correction** (A5): delivered in S3-P004-039; no longer open.

## Amendments to the SRS text

### C1. Section 2 (Users and roles) — add after the role descriptions

- **New:** "Each role has one email domain: Student `@graduate.utm.my`, Coordinator `@utm.my`, System Administrator `@gmail.com`. An account holds roles only from its own domain. Only a System Administrator assigns, revokes, suspends or reactivates, with a required reason recorded in an append-only audit. A person who is both a student and staff uses separate accounts. The access control list is in Appendix C."

### C2. New Appendix C — Access Control List

- **New:** sections A1 to A5 of this amendment (tables as written).

### C3. UC01 / UC02 (registration, sign-in) — business rules

- **New rule:** "A `@graduate.utm.my` account receives the Student role on first sign-in. A `@utm.my` or `@gmail.com` person may sign up at any time but has no access until a System Administrator gives the role their domain allows; until then the system shows that the account is waiting for access. An invited person receives the invited roles at first sign-in."

### C4. M7 administration — add

- **New:** "The System Administrator can View as a coordinator (programme and learning centre; full coordinator actions recorded as the administrator) or a student (read only). Each view is logged."
