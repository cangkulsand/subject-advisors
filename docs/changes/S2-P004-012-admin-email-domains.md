# S2-P004-012 — SYSTEM_ADMIN allowed email domains

- **Status:** IMPLEMENTED (pending coordinator review)
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** admin user management; amends the SYSTEM_ADMIN rule of [S2-P004-004](S2-P004-004-admin-user-management.md) (history kept as is).
- **Branch / PR:** `feature/p004-s2-admin-email-domains` (from `main` 912a33e); no PR
- **Reviewer:** Coordinator review
- **Approval:** product owner decision 2026-11-02.

## 1. Plan

### Objective

The owner must be able to add a friend with an `@graduate.utm.my` (or personal `@gmail.com`) email as a system administrator. Previously SYSTEM_ADMIN was limited to exact `@utm.my` at grant time and not domain-gated at runtime.

### Rules

1. SYSTEM_ADMIN may be granted to a verified primary email whose domain is exactly `utm.my`, `graduate.utm.my` or `gmail.com` (case-insensitive; no subdomains such as `x.gmail.com`, no lookalikes such as `evil-gmail.com` or `gmail.com.evil.io`). Unverified emails are never eligible.
2. STUDENT (`@graduate.utm.my`) and COORDINATOR (`@utm.my`, plus the protected-owner exception) are unchanged. A gmail.com address can hold neither.
3. One definition: `SYSTEM_ADMIN_EMAIL_DOMAINS` / `isSystemAdminEmailDomain` in `packages/shared/src/admin/admin.ts`. `auth/policy.ts` `eligibleRoles` enforces it at runtime and `admin/eligibility.ts` reuses `eligibleRoles` (the separate staff-domain probe is gone), so grant-time and runtime rules cannot drift.
4. Runtime now also requires the domain for SYSTEM_ADMIN: an admin membership on any other domain is no longer honoured (`EMAIL_DOMAIN_DENIED`). The protected owner (`@graduate.utm.my`) and any existing admin on an allowed domain keep access. Existing admins on another domain, if any, would lose admin access until their email changes; check before deploying.

### Invitation trace (`authorize()` with `initialize`)

1. No application account for the Clerk user and `deps.invitations` present: `redeem(identity)` runs first.
2. Redemption requires a verified primary email, a PENDING unexpired invitation for that exact lower-cased email, and `checkRoleEligibility` of the invited roles (now allowing gmail.com for SYSTEM_ADMIN). It then creates the account and roles in one transaction.
3. Only if redemption returns nothing does `requireStudentEmail` run. An invited gmail.com administrator therefore never meets the student-domain check; an uninvited gmail.com user falls through to it and gets `EMAIL_DOMAIN_DENIED` (no self-signup).
4. An invited `@graduate.utm.my` administrator receives only SYSTEM_ADMIN. Redemption only happens when no account exists, so no duplicate account arises; a later student registration for the same Clerk user finds the existing account and is not re-run. The administrator can add the STUDENT role explicitly.

### Security note

gmail.com accounts are outside institutional identity. Administrator remains an explicit grant by an existing administrator or an invitation, always audited; self-lockout, protected-owner and last-active-admin protections are unchanged.

## 2. Implementation

- **Shared:** `packages/shared/src/admin/admin.ts` (`SYSTEM_ADMIN_EMAIL_DOMAINS`, `SYSTEM_ADMIN_EMAIL_RULE`, `isSystemAdminEmailDomain`).
- **API:** `auth/policy.ts` (domain gate for SYSTEM_ADMIN), `admin/eligibility.ts` (delegates fully to the policy).
- **Web:** Add user dialog role fieldset shows the per-role domain rule; the Add System Admin role confirmation repeats it (`AdminUserManagement.tsx`, `AdminPages.tsx`, `admin.css`).
- **Tools:** `tools/admin/fixtures.mjs` mirrors the rule; `tools/admin/test-ui.mjs` asserts the hint and a gmail Coordinator rejection.
- **Docs:** `docs/auth-multi-role.md`, `docs/api/admin-users.openapi.json`.
- **Owner action in Clerk (cannot be verified from code):** confirm the Clerk instance allows `@gmail.com` sign-in/invitations (no allowlist/blocklist or "restrict sign-up" setting blocking gmail.com or `graduate.utm.my`; email-domain restrictions, if any, must include gmail.com), that invitations/sign-up are permitted for invited emails, and that email verification is required so the primary email is verified.

## 3. Review

- **Tests added/updated:** eligibility for each domain x role (case, subdomain, lookalike, unverified, malformed), runtime policy (allowed and denied domains, gmail STUDENT/COORDINATOR memberships ignored, protected owner kept), redemption (invited gmail admin and graduate-only admin succeed with no student registration, uninvited gmail denied, gmail COORDINATOR/STUDENT invitations rejected), route tests, shared helper, admin UI harness.
- **Results (local):** `npm run typecheck` pass; `npm run lint` pass (0 warnings); `npm test` 1366 passed / 59 skipped (67 files passed, 5 skipped); `npm run test:integration` 9/9; `npm run test:ui:admin` 44 checks pass; `npm run test:ui:coordinator` 47 pass; `node tools/integration/test-ui.mjs --installed` 35 pass; `npm run build:cloudflare` built (public test key via env only).

## 4. Changelog

- **Changed.** System administrators can now be added or invited with a verified `@utm.my`, `@graduate.utm.my` or `@gmail.com` email (exact domain). The same rule applies at sign-in; the Add user dialog and Add System Admin role confirmation state it.
- **Unchanged.** Student and Coordinator email rules; audit, self-lockout, protected-owner and last-admin protections.
