# S3-P004-009 — Suspending an account also blocks sign-in

- **Status:** MERGED to `main` (2026-11-16); human peer review pending
- **Date:** 2026-11-16
- **Sprint:** Sprint 3
- **Owner:** P004 (M0 authentication, M7 system administration)
- **Related UC / FR:** UC02 / FR (suspend or reactivate application access); SRS L585, L589
- **Branch / PR:** `feature/s3-suspend-blocks-signin`; merged into `main` on 2026-11-16 (merge commit d05f82c); no PR
- **Reviewer:** Pending

## 1. Plan

Gap found in the Sprint 3 review of the 1 November KIV items: suspending an account only made the API refuse it
(`ACCOUNT_SUSPENDED`). The person could still sign in to Clerk, and an open session kept showing cached pages until
they tried to save. Fix: on suspend, ban the user in Clerk (no new sign-in, current sessions revoked, so the open app
signs out when its session token next refreshes, about a minute with Clerk's default); on reactivate, unban.

## 2. Implementation

- `AdminIdentities.setSignInBlocked(clerkUserId, blocked)` (`apps/api/src/modules/admin/contracts.ts`,
  `identities.ts`): Clerk `users.banUser` / `users.unbanUser`; refuses anything that is not a Clerk user ID.
- `PATCH /api/admin/users/:id/access` (`routes.ts`): app status first (its existing guards: self-lockout, protected
  owner, last active admin), then Clerk. If Clerk fails, the app status is put back with an audited reason
  ("Reverted: sign-in could not be blocked in Clerk") and the request fails with `502 SIGN_IN_BLOCK_FAILED` or
  `SIGN_IN_UNBLOCK_FAILED`, so the app and Clerk never disagree and the admin can simply retry.
- Shared error codes (`packages/shared/src/admin/admin.ts`) and messages (`errors.ts`); OpenAPI
  `docs/api/admin-users.openapi.json` documents the order and the 502.
- Admin page wording: the suspend dialog says the person "is signed out and cannot sign in until access is
  reactivated"; the reactivate dialog says they "can sign in and use the application again".
- No database change. Existing data: no account is suspended today (59 active), so nothing needs syncing.

## 3. Review

- typecheck, lint, check:cloudflare pass; `npm test` 1702 passed (65 skipped), including 4 new tests (ban/unban call,
  order app then Clerk, refused change never touches Clerk, Clerk failure reverts and reports).
- `PLAYWRIGHT_CHANNEL=chrome`: admin UI 50, integration UI 59, coordinator UI 54 passed.
- Not verified against real Clerk: banning a real account is a live change. Suggested check after deploy: suspend a
  test account, confirm it is signed out and cannot sign in, then reactivate and sign in again.

## 4. Changelog

- 2026-11-16 - Type: Fixed. Suspending an account bans it in Clerk (signed out, cannot sign in); reactivating
  unbans it. Clerk failure reverts the change. Merged to `main` 2026-11-16 (d05f82c). Outstanding: human peer review; live Clerk check.
