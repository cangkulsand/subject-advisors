# S3-P004-035 — Access Control List and recovery permissions (requirements)

- **Status:** Merged to `main` (d84707e) on 2026-11-25; docs only; SRS .docx not yet updated
- **Date:** 2026-11-24
- **Sprint:** Sprint 3
- **Owner:** P004 (access, admin)
- **Related UC / FR:** UC01, UC02, M7 administration; follows S3-P004-033 (one email domain per role, View as)
- **Branch / PR:** none yet (docs only)
- **Reviewer:** Pending (owner, then Dr. Adila at the 5 and 6 December review)

## 1. Plan

### Objective / problem

At the 21 November 2026 review Dr. Adila asked P004 to (1) define the Access Control List in the requirements
report: which roles each email domain can hold, who can assign roles, and what Students, Coordinators and System
Admins can view, edit, approve or recover; and (2) resolve student-to-admin promotion and dual-role switching and
agree on recovery permissions that protect academic records and keep the audit trail.

### Scope and requirements

- Write the ACL from what the deployed code enforces, citing the enforcing files, so the document cannot drift from the system.
- Record student-to-admin promotion as two separate accounts (already enforced by S3-P004-033) and View as as the replacement for in-account role switching.
- List recovery permissions per situation. Mark each rule **In force** or **Proposed**; proposed rules go to the 5 and 6 December review.
- Out of scope: code changes. Gaps found (academic record deletion is not audited; no batch correction; coordinator curriculum permissions; faculty-wide coordinator scope) belong to other owners or need agreement first, so they are listed as proposed and open decisions only.

### Acceptance criteria

- Amendment lists domain → role, who assigns roles with every safeguard, a view/edit/approve/recover table per role, the promotion rule and a recovery table.
- Every "In force" statement is checked against the code.

### Verification plan

Read the enforcing code for each statement (listed in section 2).

### Risk / assumptions / rollback

Docs only. Rollback: delete the two new files and revert the README and `docs/auth-multi-role.md` lines.

## 2. Implementation

- **New:** `docs/requirements/srs-amendment-2026-11-24-access-control-list.md` (A1 domains and roles, A2 who assigns roles, A3 per-role ACL, A4 promotion and dual roles, A5 recovery, A6 open decisions, C1–C4 SRS text changes).
- **Changed:** `README.md` Sprint 3 table row; `docs/auth-multi-role.md` (link to the ACL; the multi-role selector paragraph now says that since S3-P004-033 a usable account holds roles of one domain only, and that admins use View as).
- **Checked against:** `apps/api/src/modules/auth/policy.ts` (`eligibleRoles`, `requireStudentEmail`), `apps/api/src/modules/auth/repository.ts` (`initializeStudent`), `packages/shared/src/admin/admin.ts` (`SYSTEM_ADMIN_EMAIL_DOMAINS`, mutation error codes), `apps/api/src/modules/admin/errors.ts` (safeguard messages), `apps/api/src/modules/admin/routes.ts` and `academic-routes.ts` (SYSTEM_ADMIN only), `apps/api/src/integration/router.ts` and each module's `authorize` call (role per route), `apps/api/src/middleware/auth.ts` and `apps/api/src/modules/auth/view-as.ts` (View as), `apps/api/src/modules/forecasting/scope-provider.ts` (coordinator scope), migrations 0001/0004/0007/0008/0009 (`db_immutable` audit triggers), 0011 (programme change audit, ownership immutability), `apps/api/src/modules/records/repository.ts:57` (records are hard-deleted, the gap in A5), `docs/auth-multi-role.md` (invitation flow, uninvited staff domains refused).
- **Finding:** academic records are deleted with `DELETE FROM public.academic_record` and have no audit table, so a student's deleted or changed record cannot be recovered. Recorded as a proposed rule for P001 (UC04); not changed here.

## 3. Review

- Self-review: every "In force" row traced to code above. One correction made while checking: uninvited `@utm.my` / `@gmail.com` users are refused at sign-in (`EMAIL_DOMAIN_DENIED`), not left waiting for a role.
- No code changed, so no tests run.
- **Outcome:** PASS — SELF-REVIEW; owner and lecturer review pending.

## 4. Changelog

- **Date:** 2026-11-24 · **Type:** Docs · **Owner:** P004
- **Actual changes:** Access Control List and recovery permissions written as an SRS v2.7 amendment; README and auth doc updated.
- **Compatibility/impact:** none (no code, schema or API change). P001 (records history), Aisa (batch correction), Idham (faculty scope) and Harraz (coordinator subject permissions) are named in the open decisions.
- **Outstanding:** apply to the SRS as v2.8 after agreement; decide the four open items in A6 at the 5 and 6 December review.
- **Status:** READY_FOR_REVIEW
