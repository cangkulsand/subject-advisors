# S1-P004-007-empty-initialize-stream — Accept bodyless Worker POSTs

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-24
- **Owner / sprint / UC:** P004 / Sprint 1 / UC01, UC02
- **Branch / reviewer:** No Git repository; human review pending.

## 1. Plan

Problem: POST /api/me/initialize rejects bodyless HTTP requests with BODY_NOT_ALLOWED.
Reproduced against both local Worker and Vite proxy using an invalid test token: 400
occurs before token verification. Workers represents an empty incoming POST as a stream,
whereas the original guard assumed request.body must be null.

Scope: P004 auth route guard and regression tests only. No other owner features,
database schema changes, authentication bypasses or new account assignment behavior.

Implementation: inspect the request stream until completion or its first nonempty chunk.
Accept only zero bytes; reject any actual payload. Cancel/release the reader and avoid
buffering unbounded request bodies. Never trust Content-Length as proof of emptiness.
Files: apps/api/src/modules/auth/routes.ts, auth.test.ts, tools/auth/test-init-http.mjs,
a minimal package test script, handoff note and this record.

Acceptance: null/empty stream and empty chunks accepted; actual payload still rejected;
identity/role injection denied before authorization; local Worker/proxy empty requests
reach session validation and return 401 with invalid test token instead of 400.
Verification: targeted regression tests, typecheck/lint/tests/module build and real
local HTTP regression script. No real user/token logging or account writes.

Risk/rollback: reading a broken stream fails closed. Reads stop at the first actual
byte; no unlimited body buffering. Revert this isolated fix if regression appears.
No credentials, reference schemas or shared application architecture changed.

## 2. Implementation

- apps/api/src/modules/auth/routes.ts: replaced the non-null stream check with
  zero-byte validation. Stops on the first nonempty chunk, cancels/releases the reader
  and does not trust Content-Length or buffer the full payload.
- apps/api/src/modules/auth/auth.test.ts: six regressions cover empty streams,
  zero-length chunks, nonempty bodies despite a zero-length header, and early cancellation.
- tools/auth/test-init-http.mjs: ten real requests through Worker and Vite paths.
- package.json: added test:init-http only; no dependency or credential changes.
- Local Wrangler automatically reloaded the corrected module. No database changes.

## 3. Review

- npm.cmd test: PASS, 47 tests; 5 optional Neon tests skipped in the default invocation.
  Existing live Neon tests passed earlier; they were not repeated for this stream-only fix.
- npm.cmd run typecheck: PASS.
- npm.cmd run lint: PASS.
- npm.cmd run build: PASS.
- npm.cmd run test:init-http: PASS, 10 actual HTTP checks:
  empty/omitted bodies return 401 SESSION_INVALID with deliberately invalid tokens;
  JSON, whitespace and role-injection payloads return 400 BODY_NOT_ALLOWED.
- Regression reproduced as 400 for a bodyless POST before the fix, on both HTTP paths.
- Scope/security review: no role/identity accepted from the body; session and role guards
  unchanged; stream failures fail closed; no real account writes or tokens in logs.
- Review outcome: PASS — SELF-REVIEW. Human peer review pending.
- Real user's successful account initialization remains to be retried in the browser.
- Runtime reference: https://developers.cloudflare.com/workers/runtime-apis/request/

## 4. Changelog

- Date / owner / UC: 2026-10-24 / P004 / UC01 and UC02.
- Type: Fixed, Tests, Docs.
- Fixed: zero-byte incoming Worker POSTs are accepted as bodyless initialization requests.
- Preserved: nonempty payload rejection and server-verified identity/role assignment.
- Shared impact: one additional package test script; no schema or provider configuration changes.
- Verification: 47 unit tests, 10 real HTTP checks, typecheck/lint/build pass.
- Follow-up: refresh local page and retry; full real-user auth flow not claimed complete.
- Final status: READY_FOR_REVIEW; reported body rejection bug resolved.
