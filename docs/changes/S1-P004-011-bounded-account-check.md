# S1-P004-011 — Bounded account access check

- **Status:** COMPLETE
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC02 account access and private-route guard
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator review PASS; real user session cause remains unknown

## 1. Plan

### Objective / problem
Resolve a private-route UI that can remain on “Checking account access...” indefinitely after sign-in or sign-out/sign-in. Bound the browser's account check and present the existing retryable error state if Clerk token acquisition or `/api/me` does not complete.

### Scope and requirements
- In scope: a timeout around token acquisition and the authenticated `/api/me` request; abort a stalled fetch; convert timeout to a typed, retryable `AuthApiError`; add focused unit and mocked browser regressions.
- Out of scope: bypassing Clerk or backend authorization, changing role/profile checks, clearing or weakening identity-scoped cache behavior, changing API routes, changing Clerk configuration, database changes, or reading/printing tokens or secrets.

### Current behavior and intended behavior
`AuthGate` renders “Checking account access...” until `loadSessionAccount` resolves or rejects. `loadAccount` awaits `getToken()` and `fetch()` without a deadline, so either promise can leave the gate pending forever. A bounded wait should transition to an accessible error with Retry and Sign out, while private content remains blocked.

### Proposed implementation
- Expected files: `apps/web/src/features/auth/client.ts`, `client.test.ts`, and focused auth testing mock/UI files plus `tools/auth/test-ui.mjs`; this record.
- Keep per-session account caching, generation checks, Clerk identity, backend role/profile authorization and retry behavior intact.
- Use an internal abort controller and finite deadline for token/fetch/body completion. If token acquisition settles after timeout, do not start a fetch. If a request is in flight, abort it. Surface a typed timeout error for the gate's existing retry view.

### API/data/migration and cross-programmer impacts
No API contract, schema, database, migration, cache key or shared route changes are planned. The timeout applies only to the local browser account-access check.

### Acceptance criteria
- [x] A never-resolving token promise exits “Checking account access...” and shows a retryable error; it never sends a later request if the token resolves after timeout.
- [x] A stalled `/api/me` fetch is aborted and shows the same retryable error.
- [x] Valid `/api/me` responses still render only allowed role/profile content; 401/403 and network errors remain handled; cache identity/session protections remain unchanged.
- [x] `npm.cmd test`, `npm.cmd run test:ui`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` pass; no real account or token is used in tests.

### Verification plan
Add a failing mocked browser/unit reproduction before implementing the bound; then run the focused client/cache tests and the listed auth checks. Inspect the final diff and keep the user's other uncommitted offering/toast/reference-data work untouched.

### Risks / assumptions / rollback
- A slow network may time out; the accessible Retry action allows another check without weakening authorization.
- No real Clerk browser session is available to this harness, so verification is mocked and cannot prove this user's session/token behavior.
- Rollback the focused client/test/record changes if a timeout interferes with supported network behavior; no persistent data is changed.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `apps/web/src/features/auth/client.ts`, `apps/web/src/features/auth/client.test.ts`, `apps/web/src/features/auth/testing/clerk-mock.tsx`, `tools/auth/test-ui.mjs`, and this record.
- **Summary:** Added a 15-second bound over Clerk token acquisition and the `/api/me` request/body. Timeout aborts an in-flight fetch and surfaces typed `ACCOUNT_CHECK_TIMEOUT` so the existing AuthGate recovery view offers Retry and Sign out. A token that resolves after timeout cannot start a fetch. Caller cancellation is propagated, including a signal already aborted when the check begins. Role/profile authorization, cache identity, and session generation behavior are unchanged.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** PASS — timeout does not grant access, and private content remains blocked until the normal authenticated account check succeeds.
- **Test evidence:** Latest `npm.cmd test` exit 0 — 24 files passed, 2 skipped; 313 tests passed, 13 skipped. `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` exit 0. `npm.cmd run test:ui` exit 0 — 12 mocked Clerk/API browser checks passed. `npm.cmd run test:ui:integration` exit 0 — 20 mocked integrated route checks passed. Focused client/cache run exit 0 — 2 files, 25 tests passed. `client.test.ts` cleanup restores real timers after every test.
- **Manual checks:** No real user token/session inspected.
- **Defects found and fixes:** `loadAccount` could wait indefinitely on either `getToken()` or `fetch()`; bounded both, aborting fetch and preventing late token use.
- **Review outcome:** PASS - SELF-REVIEW and COORDINATOR REVIEW.
- **Human reviewer / approval:** Pending; coordinator review is not human approval.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Fix
- **Added / Changed / Fixed:** AuthGate now leaves the checking spinner after 15 seconds and provides its existing retry flow when token acquisition or account access stalls.
- **Affected routes / tables / consumers:** Browser auth gate and its existing `/api/me` client only.
- **Breaking changes / migration steps:** None planned.
- **Verification summary:** All listed auth unit, browser, integrated UI, typecheck, lint, and build commands passed. Clerk/API behavior in automated UI suites is mocked.
- **Outstanding blockers / follow-up:** The user's signed-in browser session was not available for inspection. This reproduces and fixes the indefinite wait path but does not establish which promise stalled in the user's actual session.
- **Final status:** COMPLETE
