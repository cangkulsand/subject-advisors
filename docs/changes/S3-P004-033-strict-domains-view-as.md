# S3-P004-033 — One email domain per role, owner on gmail, and System Admin "View as"

- **Status:** Implemented on `feature/strict-domains-view-as`; final review pending; not merged, migration not applied
- **Date:** 2026-11-22
- **Sprint:** Sprint 3
- **Owner:** P004 (access, admin)
- **Related UC / FR:** account access, admin user management, UC20 coordinator decisions (view as)
- **Branch / PR:** `feature/strict-domains-view-as`; no PR
- **Reviewer:** Pending
- **Design / plan:** `docs/superpowers/specs/2026-11-21-strict-domains-view-as-design.md`, `docs/superpowers/plans/2026-11-21-strict-domains-view-as.md`

## 1. Plan

The owner wants one clear rule per role and an administrator who can see and help in the other workspaces, like a Moodle admin ("Switch role to", "Log in as"). Before this change a `@graduate.utm.my` address could be Student, Coordinator (owner exception) and System Admin, and `@utm.my` could also be System Admin.

- Student: verified `@graduate.utm.my` only. Coordinator: verified `@utm.my` only. System Admin: verified `@gmail.com` only. No exceptions.
- The protected owner moves from `sp-mohdsharhan.ag@graduate.utm.my` (account 1) to `sharhanarean@gmail.com` (account 2671). Account 1 keeps STUDENT only.
- View as Coordinator (programme + centre): the admin can do everything a coordinator can; writes are recorded as the admin.
- View as Student (one student with a complete profile): read only.

## 2. Implementation

- **Domains** (`apps/api/src/modules/auth/policy.ts`, `packages/shared/src/admin/admin.ts`): `eligibleRoles` drops the owner coordinator exception; `SYSTEM_ADMIN_EMAIL_DOMAINS = ['gmail.com']`. Grants, invitations and invitation redemption reuse it. `tools/auth/role-provisioning.mjs` applies the same rules; the owner bootstrap needs a gmail identity and SYSTEM_ADMIN only.
- **Unusable roles**: the admin account detail adds `usable` per membership; the page shows "Not usable: email domain".
- **Migration 0015** (`db/migrations/0015_owner_to_gmail.sql`): pinned to the two owner Clerk IDs. No-op when neither exists or the move already happened; aborts on any other state. Disables the owner lock trigger only for the two audited owner-flag updates, enables it again, then revokes account 1's SYSTEM_ADMIN/COORDINATOR with the trigger auditing the revoke. Tested by `tools/db/owner-transfer-check.mjs` (run from `tools/admin/test-academic-database.mjs`), which runs the real migration text with fixture IDs.
- **View as, API** (`apps/api/src/modules/auth/view-as.ts`, `apps/api/src/middleware/auth.ts`): `X-View-As: COORDINATOR;programme=<id>;centre=<id>` or `STUDENT;student=<id>`. Only an active, domain-eligible System Admin may send it (`VIEW_AS_DENIED`); student view refuses every non-GET/HEAD (`VIEW_AS_READ_ONLY`) and an incomplete profile (`VIEW_AS_PROFILE_INCOMPLETE`); `/api/me/initialize` refuses any view. Each use is logged (`event: view_as`).
- **Coordinator scope** (`apps/api/src/modules/forecasting/scope-provider.ts`, `routes.ts`): in view as, the scope provider is pinned to the chosen active programme × centre. Decision history marks entries recorded by a System Admin (`recordedByAdmin`), shown as "(System Admin)".
- **Web** (`apps/web/src/features/auth/view-as*.ts`, `ViewAsBanner.tsx`, `apps/web/src/features/admin/ViewAsDialog.tsx`): view kept per tab in `sessionStorage`; every non-admin client sends the header; the account cache key includes the view and accepts a view-as account only when it names this session's admin. "View as" button in the admin top bar (navigation menu on phones); banner with Exit view on every page. The profile and offerings clients keep the page when a write is refused as read-only.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 1968 passed, 67 skipped |
| `node --test tools/auth/role-provisioning.test.mjs` | 7 PASS |
| `npm run test:db-tooling` | 29 PASS |
| `node tools/admin/test-academic-database.mjs` | 0015 owner transfer: 6 PASS. The suite still stops on the pre-existing "allows NULL and mixed-case active programme status…" repository test, which fails on `main` too |
| `npm run test:ui:admin` | 62 PASS (5 new View as checks, 375px included) |
| `npm run test:ui:coordinator` | 65 PASS (view-as banner, header on every call, "(System Admin)" in history, 375px) |
| `npm run test:ui:integration` | 78 PASS (student read-only view, light and dark, 375px) |

Not done: the migration has not been applied to Neon; no live Clerk sign-in check.

## 4. Rollout

1. Owner confirms; apply 0015 to Neon (dev and prod share it) **before** deploying the code. The new code drops admin from the graduate account, so the gmail account must already be the owner.
2. Merge to main, push to dev, check, push to prod, sync the local prod clone.
3. Owner signs in as `sharhanarean@gmail.com` and checks admin, View as Coordinator and View as Student.

## 5. Changelog

- Each role now has one email domain: Student `@graduate.utm.my`, Coordinator `@utm.my`, System Admin `@gmail.com`.
- The permanent owner is now the gmail System Administrator.
- System Administrators can **View as** a coordinator (for a chosen programme and learning centre, with full coordinator actions recorded under their own name) or a student (read only), with a banner and Exit view.
