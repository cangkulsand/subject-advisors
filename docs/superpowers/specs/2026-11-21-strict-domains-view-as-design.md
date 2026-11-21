# Strict role domains, owner on gmail, and admin "View as" — design

- **Date:** 2026-11-21
- **Owner:** P004 (access, admin)
- **Change ID (proposed):** S3-P004-033

## 1. Intent

The owner wants one clear rule per role, with no exceptions, and wants the System Administrator to see and help in the other workspaces the way a Moodle admin uses "Switch role to" and "Log in as".

Today a `@graduate.utm.my` address can be Student, Coordinator (protected owner exception) and System Admin, and `@utm.my` can also be System Admin. That made it unclear who is what, and it let a self-registered gmail user fall through the cracks (see the trace in the conversation: sign-up first, then "invite" refuses and "Add existing user" is the right path).

## 2. Goals

1. **Strict email domain per role.**
   - Student: verified `@graduate.utm.my` only.
   - Coordinator: verified `@utm.my` only.
   - System Admin: verified `@gmail.com` only.
2. **Protected owner moves to `sharhanarean@gmail.com`** (account 2671, already System Admin). `sp-mohdsharhan.ag@graduate.utm.my` (account 1) keeps only Student.
3. **Admin "View as Coordinator"**: the admin picks a programme and learning centre and uses the coordinator screens for that scope. The admin **can do everything a coordinator can** in that scope (owner's choice, 2026-11-21): offering decisions, CSV upload, snapshots, subset acceptance and snapshot removal. Actions are recorded under the admin's own Clerk ID.
4. **Admin "View as Student"**: the admin picks one student and sees that student's screens. **Read-only**: every change is refused.
5. A visible banner while viewing as someone else, with "Exit view" back to the admin workspace.

## 3. Non-goals

- No "act as student" (can be added later with the same logging).
- No change to Clerk configuration, sign-in methods or the dummy-user feature (dummies stay Student/Coordinator on `+clerk_test` addresses of the right domain).
- No data clean-up of other accounts: the owner removes old data himself.
- No change to how real coordinators get their scopes (`coordinator_assignment`).

## 4. Anti-goals (would be a failure even if it works)

- The owner locked out at any point during the switch.
- An admin action in a coordinator scope that looks, in the decision log, as if the assigned coordinator made it.
- View as Student able to write anything (plan, records, profile, confirmations), including by calling the API directly.
- A non-admin able to use the view-as parameters.

## 5. Constraints found in the code

- `eligibleRoles` (`apps/api/src/modules/auth/policy.ts`) filters roles by domain on **every** request, and `checkRoleEligibility` (`admin/eligibility.ts`) reuses it for grants, invitations and redemption. Changing it changes all of them at once.
- `SYSTEM_ADMIN_EMAIL_DOMAINS` and `SYSTEM_ADMIN_EMAIL_RULE` (`packages/shared/src/admin/admin.ts`) drive the admin UI text.
- The protected owner flag is locked by the trigger in `db/migrations/0004_multi_role_access.sql` (an owner row cannot be updated or deleted; a new owner needs the `app.protected_owner_bootstrap` context; only one owner allowed by a unique index). Moving it needs a **reviewed migration**, not an app action.
- Account 1 also has `email_policy='OWNER_STUDENT_COORDINATOR'` support in the schema; with the exception gone that policy value is never used again.
- Coordinator routes all go through one `authorize(... roles: ['COORDINATOR'])` in `forecasting/routes.ts` and read scopes from `ScopeProvider.listScopes / isScopeAssigned(actor, ...)`.
- Student routes (`profile`, `planning`, `graduation`, `offerings`, `pathway`, `records`) each call `authorize(... roles: ['STUDENT'])` and use `me.clerkUserId` to load the student's data.
- Offering decisions store `decided_by` (Clerk ID) and have an audit table.

## 6. Approaches considered

| | Approach | Trade-off |
| --- | --- | --- |
| A | **View-as context on admin requests (chosen).** The admin stays SYSTEM_ADMIN. The browser sends the chosen context (role plus scope or student) with each request; the API checks the caller is an active admin and then runs the coordinator or student handler with that context. | Domain rules stay strict; one place to enforce read-only; logs show the real admin. Every coordinator and student route must accept the context. |
| B | Domain exception: admins may also hold Student and Coordinator roles. | Smallest change, but breaks the strict rule the owner asked for, and the admin would only see their *own* student data, not a chosen student's. |
| C | Real impersonation (Clerk "act as" token for another user). | Closest to Moodle "Log in as", but needs Clerk impersonation (paid feature on many plans), and student "read-only" would then have to be enforced against a session that is the student's own. |

The owner chose A ("admin is gmail.com but can view other role and jump to role and programme, like Moodle").

## 7. Design

### 7.1 Strict domains

- `eligibleRoles`: STUDENT ↔ `@graduate.utm.my`, COORDINATOR ↔ `@utm.my`, SYSTEM_ADMIN ↔ `@gmail.com`. Remove the `coordinatorStudentException && protectedOwner` branch.
- `SYSTEM_ADMIN_EMAIL_DOMAINS = ['gmail.com']`; rule text "System Administrator: verified @gmail.com".
- The `+clerk_test` refusal for SYSTEM_ADMIN stays.
- Existing role rows on the wrong domain are not deleted by the code; they simply stop working (they already do today for other mismatches). The admin user page shows such a role as "Not usable: email domain" so the admin can revoke it.

### 7.2 Owner move (migration `0015_owner_to_gmail.sql`)

Pinned IDs (read from Neon on 2026-11-21, `user_access_assignment`):

| `access_assignment_id` | Clerk user ID | Email (Clerk) | Today | After |
| --- | --- | --- | --- | --- |
| 1 | `user_3L9068HIQmPtA3AzFTo6bBpRAyO` | `sp-mohdsharhan.ag@graduate.utm.my` | STUDENT, SYSTEM_ADMIN (owner) | STUDENT |
| 2671 | `user_3MPgmlCxY4NFIuYgPaypFquJ0l6` | `sharhanarean@gmail.com` | SYSTEM_ADMIN | SYSTEM_ADMIN (owner) |

These are the only two SYSTEM_ADMIN accounts (checked 2026-11-21; the owner already revoked the others), so no other admin loses access on deploy.

One transaction, in this order, so there is never zero owners able to sign in:

1. Abort unless both Clerk IDs above exist and `user_3MPgmlCxY4NFIuYgPaypFquJ0l6` holds a SYSTEM_ADMIN row and `user_3L9068HIQmPtA3AzFTo6bBpRAyO` holds the owner row.
2. Replace the trigger function with a temporary version that allows exactly this transfer.
3. Clear owner on account 1's SYSTEM_ADMIN row, set owner on account 2671's SYSTEM_ADMIN row; both audited (`PROTECT_OWNER`, reason "Owner moved to gmail (S3-P004-033)").
4. Revoke account 1's SYSTEM_ADMIN and any COORDINATOR row (audited). Account 1 keeps STUDENT.
5. Drop the `OWNER_STUDENT_COORDINATOR` policy value and the `coordinator_student_exception` path (constraint and trigger branches).
6. **Restore the original owner lock** (the function from 0004 minus the dropped exception branches) before commit. Builder-check ruling: a transfer path left in place would let anyone with DB access move ownership later; a future transfer gets its own migration.

Before applying: dry-run against the embedded test Postgres; the owner confirms; apply to Neon (dev and prod share it) **before** the code deploy, because the old code still accepts both accounts, while the new code needs the owner on gmail.

### 7.3 View as — API

- Context travels as request headers set by the web app: `X-View-As: COORDINATOR;programme=<id>;centre=<id>` or `X-View-As: STUDENT;student=<studentId>`.
- `authorize` gains a view-as step: when the header is present the caller must be an ACTIVE account whose eligible roles include SYSTEM_ADMIN; otherwise 403 `VIEW_AS_DENIED`. The returned `Me` carries `viewAs: { role, ... , adminClerkUserId }`.
- **Coordinator:** `ScopeProvider.listScopes/isScopeAssigned` return exactly the chosen programme × centre (if the programme and centre exist and are active), instead of reading `coordinator_assignment`. Handlers keep using `actor` = the admin's Clerk ID, so `decided_by`, `recorded_by`, `accepted_by` and `removed_by` all show the admin. No audit column is added (`offering_decision_audit` has no reason column and is immutable). Instead, wherever a coordinator screen shows who decided or recorded something, it shows the person's name and, for a SYSTEM_ADMIN, "(System Admin)", so an admin action never reads as the assigned coordinator's (builder-check ruling).
- **Student:** the student routes resolve the student's Clerk ID from the chosen `studentId` and load that student's data. **Any method other than GET/HEAD returns 403 `VIEW_AS_READ_ONLY`**, enforced once in `authorize` (not per route), so a new student route is read-only by default.
- Every view-as request is logged (structured log line with admin ID, role, scope or student). No new table in this change.

### 7.4 View as — web

- Admin workspace gets a "View as" control (in the staff navigation, beside the existing role switcher):
  - Coordinator → choose programme, then learning centre (active ones only).
  - Student → search by name or matric (reuses the admin user search), pick one. Only students with a **complete profile** can be picked (all student routes require one, and the setup page is a write flow); others show "Profile not set up yet" (builder-check ruling).
- While viewing, a fixed banner: "Viewing as coordinator — SECJH, Johor Bahru" or "Viewing as student — Aina (read only)", with **Exit view**.
- The context is kept in `sessionStorage` (per tab) so a reload keeps it; signing out or Exit clears it.
- In student view, save/edit buttons are hidden or disabled with "Read only while viewing as a student"; the API refusal is the real guard.

## 8. Left to the builder

- Exact header parsing and error copy; where the banner component lives.
- Whether the coordinator choice lists all active programme × centre pairs or only pairs with students.
- Test layout (unit for policy and authorize, DB check for the migration, UI tests in `tools/admin` and `tools/coordinator`, readability guard on the banner).

## 9. Rollout order

1. Migration reviewed and tested on embedded Postgres.
2. Owner confirms; migration applied to Neon.
3. Code (strict domains + view as) merged and deployed to dev, checked, then prod.
4. Owner signs in with `sharhanarean@gmail.com`, checks admin, View as Coordinator, View as Student.
