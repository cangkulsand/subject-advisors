# S1-P004-010 — Reuse account state for the current login session

- Status: READY_FOR_REVIEW; implemented locally, not committed/pushed
- Date: 2026-10-26
- Scope: frontend account/session UX; no backend authorization changes
- User instruction: check account at login and when attempting create/update/delete;
  do not repeat the account check on every page navigation.
- Human review: pending

## 1. Plan

Cache the small /api/me account snapshot by verified Clerk user/session/API base,
using memory plus sessionStorage because navigation currently reloads documents.
The cache lasts only for the same signed-in Clerk session: no periodic/focus account
polling or artificial timer. Always perform fresh initialization at login/completion.
Deduplicate concurrent account requests, including React StrictMode mounts.
Never cache tokens, cookies, profile contents, academic data or errors.

Logout/session changes clear snapshots. A successful profile save updates the cached
setup state so navigating to records does not bounce back to setup. Permission/session
denials from profile/record/offering clients invalidate the snapshot and recheck access.
Explicit Retry bypasses the cache. Browser storage failures fall back to memory.
Reject malformed/cross-user cache data and prevent invalidated in-flight responses
from restoring a cleared cache. The server remains the authority: protected reads
and all create/update/delete endpoints retain real session/role/owner validation.

Expected files: auth cache module, AuthGate/logout lifecycle, minimal invalidation
hooks in P001/P002 API clients, meaningful unit/browser request-count regressions.
Verify navigation reuse across reloads, user/session/base isolation, deduplication,
fresh login, profile-save transition, logout/denial/retry and blocked storage.
No DB writes/migrations, deployment, commit or push. Rollback is a scoped source revert.

## 2. Implementation

Added a validated memory/sessionStorage account snapshot keyed by Clerk user,
session and API base. Login initialization always goes to the server; navigation
and reload reuse that session snapshot without timer/focus polling. Concurrent
gate loads are deduplicated. Tokens and academic/profile contents are never stored.

AuthGate still requires Clerk loaded/signed-in state and enforces its local role
and setup UI guards. Logout clears snapshots; session changes prune other identities.
Retry bypasses cache. Invalidated in-flight responses cannot recreate a snapshot.
Browser storage denial falls back to memory and a missing/malformed snapshot is
hydrated once from the server. This cold-start check is not repeated per page.

Minimal P001/P002 client hooks invalidate cached account state on 401/403. A
successful validated profile PUT updates the same session/API setup snapshot and
notifies the gate without an extra navigation GET. A switched session cannot
reuse an old pending token operation or profile-save result for another account.
The backend, schema, API authorization and private data queries are unchanged.

Files: auth/Auth.tsx, account-cache.ts, account-cache.test.ts, test-only Clerk/cache
harnesses, tools/auth/test-account-cache.mjs and minimal profile/offerings client hooks.
No root dependency, database, credentials or other business logic change.

## 3. Review

PASS — SELF-REVIEW; human review pending.

Actual results:
- TypeScript strict check and ESLint (including the new browser script): PASS.
- Full Vitest suite: 203 PASS, 13 optional DB checks SKIPPED. Includes 17 new cache
  tests for session/API identity, full-session lifetime, deduplication, token-free
  persistence, cold hydration, fresh login/retry, denied/error states, blocked
  storage, invalid snapshots, late responses and profile/session-switch behavior.
- node tools/auth/test-account-cache.mjs: 7 actual Chromium checks PASS, with explicit
  Clerk/API mocks. One account request across profile -> records -> offerings and
  reload; no focus recheck or draft loss; login initialization reused at destination;
  validated profile save updates setup; denied mutation evicts access; logout and
  different-user/session isolation verified.
- Existing auth browser checks: 11 PASS; P001 UI checks: 19 PASS; shared installed
  page navigation: 9 PASS. These are mock identity/API tests, not real login claims.
- Shared Worker and production frontend bundles: PASS.
- Live unauthenticated GET/POST/PUT/DELETE requests: 5 return 401. No write executed.
  The running frontend serves the new session-cache implementation.
- git diff -- apps/api: empty; server current-session, role/status and owner checks
  remain unchanged on protected requests, including reads and every data mutation.
- git diff --check: PASS. No commit, push, migration or deployment performed.

Fixed during review: lint flagged unused mock parameter names; converted to a typed
mock signature. Existing backend regressions pass. Real-user navigation acceptance
and independent human review remain pending; the user's browser can refresh once
to load this implementation. The old transfer manifests describe the original ZIP
payload; these intentional integration edits are tracked by this new change record.

Reference reviewed: [Clerk session getToken documentation](https://clerk.com/docs/react/reference/objects/session).
Clerk manages token caching/refresh. This change caches only application UI account
metadata and does not modify Clerk token or server verification behavior.

## 4. Changelog

2026-10-26: Plan reflects the user's explicit full-session navigation cache preference.

2026-10-26: Implemented session-scoped account UI cache, removed per-page/focus
account requests, preserved server validation for CRUD/private requests, added
invalidation and request-count regressions, and verified the running frontend.
203 unit checks and 46 mock-browser checks pass (7 new + 11 auth + 19 P001 + 9 shared).
Status READY_FOR_REVIEW, uncommitted; no provider or data mutation.
