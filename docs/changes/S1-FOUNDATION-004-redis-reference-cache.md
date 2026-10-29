# S1-FOUNDATION-004 — Optional Redis reference cache for profile options

- **Status:** MERGED
- **Date:** 2026-10-29
- **Sprint:** Sprint 1
- **Owner:** FOUNDATION / integration infrastructure
- **Related UC / FR:** Supports P001 UC03/UC04; no new SRS requirement
- **Branch / PR:** `main` / direct publication requested by user; commit `bca1f91264c4b99f507e27f986fbc623bcab90e8` pushed and verified
- **Reviewer:** Coordinator AI review passed; no human peer review performed

## 1. Plan

### Objective / problem
Reduce repeat Neon reads for two global reference lookups in the authenticated P001 profile-options flow, using optional server-side Redis while preserving PostgreSQL authority and current response behavior.

### Scope and requirements
- In scope: cache only the global active curriculum list with programme metadata (300-second server TTL) and global academic semester list (60-second server TTL) used by `createProfileRepository(query).options(userId)`.
- Keep per-request Clerk/session/account-role/suspension authorization and `profile.options` route ordering intact. Authorization must complete before repository access even on a warm cache. Construct/inject cache dependencies without network activity; Redis lookup begins lazily only when the authorized repository executes.
- Keep `subjects` and `subjectGroups` owner-scoped and fetched with their current live SQL and verified user ID. Do not refactor those queries to consume cached student/curriculum association.
- No whole response cache. Continue querying owner-scoped data on every request. Profile, records, offerings, Admin Users/Audit, auth decisions, tokens, errors, drafts, and future forecasts/imports/jobs/rate limits are excluded.
- Cached references are presentation options only. All writes and validation, including semester existence, limits, credits, and academic rules, remain live against Neon.
- Out of scope: subject/category requirement caching, server mutations/invalidation, admin editing, revision/outbox support, migrations, browser cache changes, Redis provisioning, and deployment. An optional isolated development provider smoke check is verification only when credentials already exist; it is never required to complete the mocked/code-only implementation.

### Current behavior and intended behavior
`apps/api/src/modules/profile/repository.ts` currently runs four parallel queries in `options`: global active curricula/programmes, owner-profile subjects, global semesters, and owner-profile subject-group counts. `routes.ts` calls `authorize` before `profiles.options`. `AuthBindings` currently contains Clerk and Neon values only. No server Redis adapter or binding exists. On successful cache hits, only the two global reference SELECTs should be skipped; owner-scoped SQL and strict auth still run. On a cache read miss/error/expiry/timeout, invoke the relevant Neon reference loader once. If writing that already-loaded value back to Redis fails, return the successful Neon value without repeating the loader/query. With the feature disabled or unconfigured, the API response and Neon query behavior remain unchanged.

### Proposed implementation and expected file areas
Delivery order is gated; review the diff after each phase before proceeding:

A. **Optional adapter and focused tests:** add a small Worker-compatible Redis adapter (likely `apps/api/src/cache/redis.ts` and `redis.test.ts`) using the `@upstash/redis` HTTP SDK, with typed payload/contract validation, bounded operation budget, safe bypass behavior, and no module-global user state. Check SDK version compatibility with Workers and repository constraints during implementation; make only the required package/lockfile changes and no unrelated dependency upgrades.

B. **Wire the two lookups and regressions:** inject optional reference-cache dependencies into the profile repository without breaking existing callers; keep subjects and subjectGroups unchanged. Likely touch `apps/api/src/modules/profile/{repository.ts,index.ts,repository.test.ts,profile.test.ts}`, app/P001 env types, and focused tests. Intersect optional `CacheBindings` into app/P001 environment types so cache support does not expand or change auth-verification behavior. Preserve the existing profile-options response contract.

C. **Configuration and verification support:** if needed, minimally update `apps/api/src/cloudflare.ts`, `tools/auth/local/api.ts`, Wrangler config types/vars, `.dev.vars.example`, and setup docs. Keep generated integration artifacts and generated `worker-env.d.ts` generated; never hand-edit them. If integration composition changes, update `tools/integration/prepare.mjs` and its test, then regenerate with the supported command. Preserve generator fixtures and combinations that have no cache infrastructure and/or no P001 overlay; do not make optional bindings mandatory. Avoid changes to unrelated feature overlays.

### Adapter and cache contract
- `REDIS_CACHE_ENABLED` defaults false in local and production runtimes. Use server-only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, plus explicit non-secret `REDIS_CACHE_NAMESPACE` and `REDIS_CACHE_DATASET` (or equivalent coherent configuration). Missing/incomplete config or invalid namespace safely bypasses Redis; never fall back to a shared default namespace when enabled configuration is incomplete.
- Use deployment + dataset + contract-version keys, e.g. `sa:dev:<dataset>:v1:reference:curricula` and `...:semesters`; isolate test namespaces and credentials. Do not include user identity or PII in these keys.
- Validate shape, contract version, and finite expiry metadata; reject unknown, malformed, or corrupt payloads. A valid empty array is cacheable. Cache only successful Neon reference loads; never cache exceptions or errors.
- Keep Neon exceptions unchanged and unmasked. Redis read/fill failures are cache misses; successful Neon results still return if cache fill fails. Aggregate logs may include kind, timing, and outcome only; never log raw URLs, tokens, payloads, or unsafe error text.
- Bound total Redis overhead (lookup, retries, and fill) to an initial proposed budget near 200 ms, tuned against measurements. A timeout must leave time for the existing Neon fallback and must not alter Neon timeout/error handling. Avoid a `Promise.race` that leaves unbounded retries/fetch work running; select SDK cancellation or bounded/no retry behavior.
- Await cache fills within the explicit budget; do not use unawaited background fetches or require `ExecutionContext`. Cache GET hits do not restart TTL. Capture load start/expiry before the reference query or calculate remaining TTL so slow loads cannot extend maximum entry age.
- No stale-while-revalidate, polling, auth caching, or per-user module-global state.

### API, data, and cross-programmer impacts
No endpoint, response schema, database schema, or migration change is planned. `ProfileOptions` remains unchanged. Only global `curricula` and `semesters` reference SELECTs may be avoided on a validated hit; owner-scoped subject/category SQL remains live and unchanged. P001 saves continue validating against Neon. Cache namespace separation does not isolate the two workspaces' shared Neon dataset; manual reference edits rely on cache expiry, a subsequent server read, and existing browser retention. There is no instant cross-app freshness claim. Any later immediate-fresh admin mutation integration requires database-backed revisions and reliable retry/outbox before use; no delete-only invalidation API is part of this tranche.

### Acceptance criteria
- [x] Enabled cold reads load reference data from Neon and cache only validated successful curricula/semester reference results; subsequent warm reads skip exactly those two reference SELECTs while owner-scoped queries still execute.
- [x] Disabled/missing configuration causes zero Redis network calls and preserves existing options output and query behavior; valid empty arrays are cache hits.
- [x] Expired/corrupt/unknown-contract payloads, Redis timeout, and Redis read errors invoke the relevant Neon loader once; a Redis cache-fill failure returns the already-loaded successful Neon value without invoking the loader/query a second time. Database errors are not masked, cached, or retried as cache failures.
- [x] Lookup does not refresh TTL; age metadata cannot outlive the configured maximum because the DB query was slow; namespaces/datasets/contracts are isolated.
- [x] Warm-cache requests still reject missing/invalid sessions, suspended accounts, and wrong roles before any repository access; auth/provider checks run every protected request.
- [x] Current server and browser response contracts, authorization/profile regressions, and generated integration combinations remain valid.
- [x] Live write validation continues rejecting stale/invalid semester choices using Neon; cache data does not determine semester availability, limits, credits, or rules.

### Verification plan and evidence
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test` with `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` omitted in the child process
- `npm.cmd run test:integration`
- `npm.cmd run build:local`
- `npm.cmd run build`
- `npm.cmd run check:cloudflare` (build plus Wrangler dry-run; no deployment)
- No browser run is needed unless browser code changes; retain and run relevant existing browser cache regression tests if touched.
- Mock tests verify cold/warm Neon query counts and the emitted lookup/Redis timing fields. A representative live latency comparison is optional future evidence and must not be presented as a performance guarantee. Clerk verification/access checks still run on every protected request.
- Live Upstash smoke testing is conditional on provider credentials and a dedicated isolated development namespace; absence of credentials does not block reversible mocked/unit implementation.

### Risks, dependencies, assumptions, and rollback
- Risks: eventual consistency and stale UI choices; mitigations are strict reference-only scope, short TTLs, existing browser freshness disclosure, and live save validation. Cache overhead could delay fallback; enforce a total bounded Redis budget before Neon fallback.
- Dependencies: compatible Upstash HTTP SDK/runtime behavior, testable optional binding injection, and local/Cloudflare type compatibility. Verify actual cancellation/retry behavior before choosing timeout implementation.
- Assumptions: the two global queries contain no user-specific values; `options` route authorization ordering remains unchanged; the agreed cache guideline is policy, not a new SRS feature requirement.
- Rollback: turn `REDIS_CACHE_ENABLED` off; no DB migration or data rollback. Existing keys expire under their TTL. Remove optional dependency/binding changes in a follow-up only if needed.

## 2. Implementation

- **Status:** MERGED (direct publication explicitly requested by user)
- **Files actually changed:** `.dev.vars.example`, `apps/api/src/cache/redis.ts`, `apps/api/src/cache/redis.test.ts`, `apps/api/src/modules/profile/index.ts`, `apps/api/src/modules/profile/index.test.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`, `apps/api/src/modules/profile/profile.test.ts`, `package.json`, `package-lock.json`, `docs/cachingguide.md`, and this record.
- **Summary:** Added the optional Redis adapter and wired only the global curriculum (300-second) and academic semester (60-second) lookups in `profile.options`. Existing `createProfileRepository(query)` callers remain cache-free. P001 dependencies accept optional `CacheBindings` and construct the adapter without network I/O; the generated integration caller still typechecks without generator edits. Exact typed row validators reject extra keys, nonpositive/out-of-range IDs, malformed values, and semester number/type pairs that violate the existing database constraint. The subject and subject-group owner-scoped SQL remains unchanged and live. `save` validation remains unchanged and database-backed. Tests cover cross-student owner query separation, warm reference hits, empty references, invalid cached rows, write validation, fresh auth before warm-cache access, route `no-store`, and real SDK serialization over mocked fetch.
- **Decisions / deviations from plan:** `P001Bindings` is `AuthBindings & Partial<CacheBindings>`; the shared auth binding contract and auth verification behavior are unchanged. No integration generator changes were needed. No plan deviation.
- **Migrations / env / shared contracts:** No database migration or endpoint/response contract change. `.dev.vars.example` documents the disabled-by-default flag, namespace/dataset placeholders, and blank server-only URL/token values. No Wrangler binding/config or generated file was needed. No actual environment files or secrets changed. This change did not provision or enable a provider; verification uses mocked SDK HTTP only.
## 3. Review

- **Self-review checklist:** Adapter and profile wiring stay within the two global reference lookups. Cache construction is lazy; authorization precedes repository/cache access; session/role/suspension checks run on every request; denied warm-cache requests do no repository or cache work. Subject and subject-group SQL remains owner-scoped and unchanged; profile save validation is live SQL. Exact payload decoders reject wrong keys/types/IDs and invalid semester enum pairs. No private endpoint response, profile, identity, token, or write data is cached. HTTP remains `no-store`. Only example configuration/docs changed; actual environment files/secrets, migrations, generated artifacts, unrelated dependencies, and Wrangler config were not changed.
- **Test evidence:** Full `npm.cmd test` — PASS, 34 files/429 tests passed; 2 files/13 tests skipped with the explicit DB test environment variables omitted in the child process. `npm.cmd run typecheck` — PASS. `npm.cmd run lint` — PASS. `npm.cmd run test:integration` — PASS, 7 tests. `npm.cmd run build:local` — PASS. `npm.cmd run build` — PASS. `npm.cmd run check:cloudflare` — PASS; Wrangler `deploy --dry-run` exited without deployment. The mocked profile-options query count is four for a cold request and six total after a warm second request (two owner-scoped queries per request, with one total curricula and semester SELECT). Mocked SDK HTTP verifies numeric `lookupDurationMs` and `redisDurationMs`; no representative real latency benchmark was recorded. No live provider smoke run.
- **Manual checks:** Only the two global reference SQL statements are cached; subject and subject-group query text and save-time SQL remain live. `tools/integration/prepare.mjs` was not edited. Existing scripts regenerated ignored outputs. Coordinator independently verified the focused four-file suite (102 passed), all 13 expected source/doc files, the original browser-guide prefix against HEAD, all three local Markdown links, and `git diff --check`. A local unauthenticated `GET /api/profile/options` returned 401. No live Upstash/Neon calls or browser tests were run.
- **Defects found and fixes:** Repaired malformed Markdown in this record. Split invalid curriculum ID and extra-field cases so each fails independently. The save regression now warms semester 30 and confirms Neon rejects that cached UI choice. Added a repository-level clock test proving the 60-second semester list reloads independently while curricula remain cached through 61 seconds, then both refresh after 301 seconds. Semester validation follows `db/migrations/0001_initial_schema.sql` constraints without imposing a year-format policy. No remaining known phase B defect in self-review.
- **Review outcome:** PASS — SELF-REVIEW; PASS — COORDINATOR AI REVIEW for phases A, B, and C. Direct main publication was explicitly requested by the user.
- **Human reviewer / approval:** No human peer review was performed; publication followed the user's explicit direct-main instruction. Coordinator AI review is not represented as human approval.
## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Added, Tests, Docs
- **Added / Changed / Fixed / Removed:** Added the optional Redis adapter/tests and wired only the two global reference lookups into profile options. Added safe enabled-only aggregate telemetry and disabled-by-default example configuration. Updated the caching guide to distinguish implemented scope from proposed extensions. The remaining per-user data, authorization and writes stay live.
- **Affected routes / tables / consumers:** Affected route: authenticated `GET /api/profile/options`; its path and response contract are unchanged. No database tables changed.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Full suite 429 passed/13 skipped with DB test environment variables omitted; typecheck, lint, 7 integration tests, local build, API build, and Wrangler dry-run passed. Mocked query count confirms cold four queries and warm two owner queries; mocked observer emits timing fields. Coordinator additionally verified 102 focused tests, 13-path code scope, guide prefix, links, diff check, and local unauthenticated GET 401. No live provider smoke run. Commit `bca1f91264c4b99f507e27f986fbc623bcab90e8` is verified at local `main`, `origin/main`, `feature-redis-caching`, and remote `refs/heads/main`.
- **Outstanding blockers / follow-up:** No implementation blocker. Optional isolated live development smoke verification requires provider-supplied credentials and is not required for mocked/code-only implementation. No human peer review was performed; publication followed the user's explicit direct-main instruction.
- **Final status:** MERGED
