# S3-P004-036 — Staff sign up without an invitation and wait for a role

- **Status:** READY_FOR_REVIEW (branch `feature/staff-waiting-access`, not merged or deployed)
- **Date:** 2026-11-24
- **Sprint:** Sprint 3
- **Owner:** P004 (M0 authentication, M7 administration)
- **Related UC / FR:** UC01, UC02, M7 user management; ACL amendment [S3-P004-035](S3-P004-035-access-control-list.md)
- **Branch / PR:** `feature/staff-waiting-access`; no PR
- **Reviewer:** Pending

## 1. Plan

### Objective / problem

A `@utm.my` or `@gmail.com` person who signs up without an invitation is refused at first sign-in
(`EMAIL_DOMAIN_DENIED`, "Student access requires a verified @graduate.utm.my primary email."). They see an error
with Retry and Sign out and nothing tells them what to do; the administrator has no list of such people. The
owner wants staff to be able to sign up on their own and wait until a System Administrator gives them a role.

### Scope and requirements

- First sign-in (`POST /api/me/initialize`) for a verified `@utm.my` or `@gmail.com` email with no account and no
  redeemable invitation returns `403 ROLE_PENDING` ("Your account is waiting for a System Administrator to give
  it a role."). No application account is created, so no role, profile or data exists until an admin acts.
- Other domains keep `EMAIL_DOMAIN_DENIED`; unverified emails keep `EMAIL_UNVERIFIED`; students are unchanged.
- The web shows a **Waiting for access** screen for `ROLE_PENDING`: who is signed in, what happens next,
  **Check again** and **Sign out**.
- New `GET /api/admin/waiting-users` (SYSTEM_ADMIN): Clerk sign-in accounts whose verified primary email is on
  `utm.my` or `gmail.com` and that have no application account, newest first, with the role their domain allows.
- Users & Access shows them as a **Waiting for a role** group (All view, search and role filter apply) with an
  **Assign role** button that opens Add user prefilled (Add existing user, the email, the domain's role). The
  grant itself is the existing `POST /api/admin/users` with a reason and audit.
- Sign-up page note mentions that staff can sign up and wait for a role.
- Out of scope: notifying the admin by email; a database table for requests (owner chose the Clerk list); the
  coordinator's programme × centre assignment (still done in Coordinator Assignments after the role).

### Proposed implementation

- `apps/api/src/modules/auth/policy.ts`: `staffSignupRole(email)` → `COORDINATOR` for `utm.my`, `SYSTEM_ADMIN`
  for the admin domains, else null. `apps/api/src/middleware/auth.ts`: in the initialize branch, after no
  invitation, a verified staff-domain email throws `ROLE_PENDING` instead of reaching `requireStudentEmail`.
- `AdminIdentities.listStaffSignups()` (Clerk, bounded pages) and `AdminRepository.existingClerkUserIds(ids)`;
  route in `apps/api/src/modules/admin/routes.ts`; shared type `AdminWaitingUser`.
- Web: `AuthGate` branch for `ROLE_PENDING`; admin client `waitingUsers()`; `AdminUsersPage` group and prefilled
  `AddUserDialog`.

### Acceptance criteria

- Uninvited verified `@utm.my` / `@gmail.com` initialize → 403 `ROLE_PENDING`, nothing written.
- An invitation still wins; students and other domains are unchanged.
- The admin list shows only staff-domain Clerk users without an account; Assign role grants with a reason.

### Verification plan

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ui:admin`, auth UI test.

### Risk / assumptions / rollback

No migration. Risk: anyone with a gmail address can create a Clerk sign-in (they still get no access); the
development Clerk instance allows 100 users, so waiting sign-ups count against it. Rollback: revert the branch.

## 2. Implementation

- **Sign-in** (`apps/api/src/modules/auth/policy.ts`, `apps/api/src/middleware/auth.ts`): `staffSignupRole(email)` returns `COORDINATOR` for a verified `@utm.my` email, `SYSTEM_ADMIN` for a verified admin-domain (`@gmail.com`) email, else null. In the initialize branch, after the invitation check, a staff-domain email throws `403 ROLE_PENDING`. Nothing is written. An invitation whose roles do not fit the email is still not redeemed, and the person now waits instead of being refused.
- **Admin API**: `AdminIdentities.listStaffSignups()` (`apps/api/src/modules/admin/identities.ts`) reads Clerk users newest first in pages of 100, up to `STAFF_SIGNUP_SCAN` = 500, and keeps those whose verified primary email matches a staff domain exactly. A Clerk text search for "utm.my" would also return every `graduate.utm.my` student, so it is not used. `AdminRepository.existingClerkUserIds()` (`repository.ts`) is one bound read. `GET /api/admin/waiting-users` (`routes.ts`) is SYSTEM_ADMIN only, GET only, takes no query parameters, and returns `503 WAITING_USERS_UNAVAILABLE` without provider details. Shared types `AdminWaitingUser` / `AdminWaitingUsers` live in `packages/shared/src/admin/admin.ts`.
- **Web**: `AuthGate` (`apps/web/src/features/auth/Auth.tsx`) shows **Waiting for access** for `ROLE_PENDING`, with the signed-in email, Check again and Sign out. The sign-up note adds a staff line. The admin client gets `waitingUsers()`. `AdminUsersPage` adds a **Waiting for a role (N)** group in the All view; search and the role filter apply, and if the list fails the page shows a notice instead of hiding the table. **Assign role** opens `AddUserDialog` with `initial` (Add existing user, the email, the domain's role). The new `.admin-waiting-tag` is styled in `admin.css`.
- **Test support**: `useUser` added to the Clerk mock (`apps/web/src/features/auth/testing/clerk-mock.tsx`). The waiting-users fixture is in `tools/admin/fixtures.mjs`.
- **Docs**: `docs/api/admin-users.openapi.json` (new path and `WaitingUser` schema), `docs/api/auth-multi-role.openapi.json` (`ROLE_PENDING`), `docs/auth-multi-role.md`, the ACL amendment (A1, A2, C3, summary), and the README row.

## 3. Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 1983 passed, 67 skipped |
| `node tools/auth/test-ui.mjs` | 13 PASS (new: Waiting for access, email shown, no sideways scroll at 390px, Check again reloads the account) |
| `npm run test:ui:admin` | 63 PASS (new: waiting group, role filter, hidden in the Active view, Assign role prefill, POST body, row leaves the list, 375px screenshot) |
| `npm run test:ui:coordinator` | 65 PASS |
| `npm run test:ui:integration` | 79 PASS |
| `node tools/landing/test-ui.mjs` | PASS |

- Self-review: domain matching is exact (`staff@utm.my.attacker.test` refused, unverified email `EMAIL_UNVERIFIED`); the admin list cannot grant anything by itself; no provider metadata leaves `listStaffSignups`.
- Not done: no live Clerk check. Sign-up with a real `@utm.my` / `@gmail.com` address on dev is still to do.
- **Outcome:** PASS — SELF-REVIEW; peer review pending.

## 4. Changelog

- **Date:** 2026-11-24 · **Type:** Changed (auth), Added (admin list) · **Owner:** P004 · **UC:** UC01, UC02, M7
- **Actual changes:** Staff on `@utm.my` / `@gmail.com` can sign up without an invitation and see Waiting for access. Admins see them under Waiting for a role and assign the role with a reason.
- **Compatibility/impact:** new error code `ROLE_PENDING` (403) on `POST /api/me/initialize`; new `GET /api/admin/waiting-users`. No migration, no environment change. Waiting sign-ups count towards the 100-user limit of the Clerk development instance.
- **Outstanding:** live Clerk check on dev; optional email to admins when someone is waiting (not built).
- **Status:** READY_FOR_REVIEW

