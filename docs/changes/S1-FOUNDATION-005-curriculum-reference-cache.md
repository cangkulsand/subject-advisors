# S1-FOUNDATION-005 — Curriculum-scoped reference cache

- **Status:** IN_PROGRESS — user-authorized publication in progress
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 follow-up
- **Owner:** FOUNDATION / integration
- **Related UC / FR:** Supports P001 UC03/UC04 reference reads; no new SRS requirement
- **Branch / PR:** `feature-redis-caching` / not created
- **Reviewer:** Coordinator AI review PASS (A/B/C); human peer review pending

## 1. Plan

### Objective / problem
Plan an optional server cache for the curriculum-specific subject catalogue and category requirement/count options returned by the authenticated `profile.options` flow. Reuse current authoritative PostgreSQL data and current response contract while avoiding repeated curriculum reference reads.

### Scope and requirements
- In scope: an optional 300-second cache entry per current curriculum containing one combined bundle `{ curriculumId, subjects, subjectGroups }`; one Redis GET per lookup and a SET only after a valid successful miss load. Warm hits do not SET and do not slide TTL. Resolve the current curriculum association from Neon on every cache-enabled request.
- Preserve `ProfileOptions` fields and browser cache/HTTP behavior. Current authorization, role/suspension checks, owner identity handling, subject ordering, category aggregation, null/conflict results, and live write validation remain authoritative.
- Keep the cache reference-only and curriculum-scoped. The bundle contains no student identifiers or profile fields, current semester, academic records, outcomes, progress, offering selections, tokens, permissions, or authorization decisions.
- Out of scope: global curricula/semester cache changes, whole private response caching, schema/migration changes, admin/reference mutation routes, immediate invalidation guarantees, browser cache policy changes, forecasts/imports/jobs/rate limiting, new providers or dependencies.
- No official curriculum policy may be inferred. Retain the existing SQL semantics exactly.

### Current behavior and intended behavior
`createProfileRepository(query).options(userId)` currently runs four queries in parallel: global active curriculum options, owner-scoped subjects joined through `student_profile`, global semesters, and owner-scoped subject-group counts joined through `student_profile`. The global curricula and semesters use the existing optional Redis cache. `routes.ts` authorizes the current Clerk identity and student role before calling `options`; current saves validate against Neon.

With the new feature disabled or unconfigured, retain the phase-one owner-scoped SQL path and query count. When enabled with valid Redis configuration, first resolve the authenticated student's current `curriculum_id` using a live `student_profile` lookup by verified Clerk identity. Do not use a browser-supplied curriculum ID or a cached student-to-curriculum association. Missing profile/current curriculum yields empty `subjects` and `subjectGroups`, while global curriculum and semester options remain available and no personal/anonymous cache key is created.

For a present curriculum, use its live association result as the key scope, then load or read one combined internal cache bundle. On a miss, both bundle SQL loaders use that same resolved curriculum ID directly; never rejoin the live owner association inside the loader. If the profile changes from C1 to C2 while C1's load is in flight, only C1 data may fill the C1 key; a later request resolves C2 and uses its C2 key. The request uses the association observed at lookup start. Do not promise synchronization with another browser changing the profile mid-request. The internal bundle's `curriculumId` is for cache identity only: the route returns the existing public `subjects` and `subjectGroups` fields without exposing or spreading that metadata.

### Proposed implementation and expected files
- `apps/api/src/cache/redis.ts` and tests: add an optional curriculum-scoped cache kind/contract with a mandatory positive curriculum ID in its key and validated envelope identity. Global v1 keys remain unchanged. Wrong-scope keys/payloads, unknown schema, oversized payloads, and invalid TTL/age are misses. Do not log curriculum IDs or cache keys.
- `apps/api/src/modules/profile/repository.ts` and tests: preserve existing option decoders and SQL aggregation/order exactly; add the live association read and two curriculum-ID-based loaders for the cache-enabled path. Return the same `ProfileOptions` response fields. The current schema allows `subject.credit_hours=0`, requires a non-null `curriculum_subject.subject_category`, and constrains `is_compulsory` to 0/1; do not add a positive-credit rule or invented category enum.
- `apps/api/src/modules/profile/index.ts`, `index.test.ts`, and route tests: add the independent `REDIS_CURRICULUM_CACHE_ENABLED=false` rollout gate in addition to existing `REDIS_CACHE_ENABLED=true` and complete Redis config. Disabled/incomplete new-scope config retains the existing phase-one owner SQL path without an association query. This gate is a cache capability/configuration choice only, never authorization.
- `.dev.vars.example` and `docs/cachingguide.md` may later document the new flag and proposed/implemented status after runtime review. No generated integration changes are expected unless type flow requires them; preserve no-P001 and mixed-overlay fixtures if touched.

### API, data, and shared-contract impact
No API schema, database schema, or migration change. Preserve the existing `curricula`, `subjects`, `semesters`, and `subjectGroups` JSON shape and `Cache-Control: no-store` response. The new internal bundle stores its curriculum key identity and the two curriculum reference arrays; it does not store the owner association and its key identity is not added to the public response. Database loader queries run separately, so the pair is not an atomic PostgreSQL snapshot. Continue to describe the 300-second bounded-staleness window and current browser retention; do not imply instant mutation invalidation or end-to-end freshness.

### Cache, authorization, and freshness rules
- Check fresh Clerk session, role, account state, suspension, and protected-owner access before repository/cache reads on every request, including hits.
- Resolve curriculum membership live by verified owner identity every request when this cache mode is enabled. A warm cache must never decide or authorize the curriculum association.
- Cache only `{ curriculumId, subjects, subjectGroups }` reference data. Validate exact fields/types, curriculum ID and envelope/key scope; accept valid empty arrays. Apply the existing 64 KiB payload cap and 300-second non-sliding TTL/age checks.
- Preserve the existing shared per-request 200 ms Redis-only budget across global and curriculum lookups/fills. A third GET may exhaust it; do not extend the budget, add retries, or leave timed-out work running. Redis read/timeout failure calls the relevant Neon loader once; fill failure returns already-loaded data without a duplicate loader call. Database errors propagate unchanged.
- Subject/requirement SQL must use the same resolved curriculum ID used in the cache key. Preserve subject-code ordering, category counts, null/conflicting requirement semantics, `credit_hours=0`, nullable requirement values, and `is_compulsory` 0/1 behavior. Do not add a category enum or infer new academic rules.
- All profile writes and business validation continue against current Neon data. Existing academic-record save eligibility uses the verified user ID and current `student_profile.curriculum_id` joined to curriculum subjects; add a regression that a C1-only subject is rejected after the student's current curriculum changes to C2. Do not change the record-save path in this plan. Same-tab cache invalidation and live save checks remain in force. Direct edits and another browser's profile change do not receive an immediate cross-app invalidation guarantee; future immediate-fresh admin editing still requires reliable DB revisions/outbox and race-safe generation handling.

### Performance and observability targets
Query counts below describe only `profile.options` repository SQL, excluding Clerk/access checks and any existing profile-reader queries:

| Mode | Expected repository SQL behavior |
| --- | --- |
| New curriculum flag off/missing/incomplete config | Preserve phase-one path: 2 owner-scoped queries plus the two global lookups (the global lookups may still hit their existing cache). No curriculum association query. |
| New mode enabled, all cache entries warm | 1 live owner-to-curriculum association query; no subject or category bundle SQL. |
| New mode enabled, full cold miss | 1 association query + 2 global-reference queries on global misses + 2 curriculum bundle loader queries = 5 queries. |

These are mocked query-count targets, not latency guarantees. Redis outage can add the live association read compared with the old owner-query path. Keep `dbLoads` defined as loader-function invocations; the combined bundle loader may execute two SQL queries, so telemetry must not label one loader call as one SQL query. Existing timing fields report total lookup duration and Redis command duration; they do not provide a dedicated Neon-latency field, and their difference also includes queue wait. Optional live provider latency evaluation may inform rollout before enabling the new flag.

### Acceptance criteria
- [x] The new gate defaults off and requires the existing Redis master flag plus complete explicit Redis configuration; disabled/incomplete configuration performs zero new Redis I/O and retains the phase-one owner-query path and counts.
- [x] Current Clerk identity and authorization are checked before any cache access. The live curriculum association is resolved on every enabled request; no student identity/association is stored in cache.
- [x] The cache key contains namespace, dataset, contract version, curriculum ID, and a distinct curriculum-options kind. Envelope validation rejects wrong curriculum/scope; global keys and values remain compatible and cannot be confused with this bundle.
- [x] One combined 300-second internal entry contains `{ curriculumId, subjects, subjectGroups }`; only `subjects` and `subjectGroups` are copied into the existing API response, and the curriculum key metadata is not exposed. Exact payload validation, 64 KiB cap, non-sliding expiry, and slow-fill age bounds apply. Empty arrays and nullable/conflicting requirement aggregates preserve current behavior.
- [x] Bundle miss loaders query by the same resolved curriculum ID, preserve existing ordering/count/null semantics and valid zero-credit/0-or-1 compulsory values, and cannot fill another curriculum's key if the profile association changes mid-load.
- [x] Two students in the same curriculum share only the curriculum reference bundle; different curricula are isolated; missing profile returns empty subject/group arrays without an anonymous key.
- [x] Warm hits, cold misses, expired/corrupt/oversized payloads, Redis failure/budget exhaustion, fill failure, and Neon errors have focused tests; no database loader is called twice after a fill failure. The live academic-record path rejects a stale C1-only subject after a current C2 association change.
- [x] Mocked exact query counts match the table. Existing global key behavior remains unchanged. Fresh authorization on warm hit, `no-store`, live write validation, response shape, and current browser regressions pass.
- [x] Logs do not include curriculum ID, identity, keys, payloads, PII, tokens, or raw errors; database read counts are not misreported as cache-loader counts.

### Verification plan and results
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test` with only `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` omitted from the child process
- `npm.cmd run test:integration` if generator composition changes
- `npm.cmd run build:local`
- `npm.cmd run build`
- `npm.cmd run check:cloudflare` (dry-run only)
- Focused tests: curriculum key/envelope isolation; same/different curriculum sharing; profile-change in-flight race; missing profile; exact decoder and aggregation/order including zero credits and 0/1 compulsory flags; 300-second age/expiry; oversized/invalid data; Redis failure/no-double-loader/shared-budget exhaustion; feature-flag/config matrix and exact query counts; fresh auth, no-store, live profile and record-write validation including stale C1 subject under C2.
- Full checks were run for mini-task C. Fixture database variables `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` were omitted only from the `npm.cmd test` child process. No shared Neon fixture database was used. Live provider smoke/latency evaluation was not performed.

### Risks, dependencies, assumptions, and rollback
- Risks: a curriculum association can change during a request; mitigate by capturing the live association once and using that exact ID for both cache key and loader. Reference reads may be stale for their TTL and the browser may retain responses longer; keep freshness limits explicit and validate writes live.
- Dependencies: compatible extension of the current typed reference-cache contract and its shared request budget. Confirm SDK/deadline semantics remain unchanged during later implementation.
- Assumptions: current subject and group SQL expresses the supported requirements/category behavior; no extra official policy is inferred. The two bundle SQL reads are not promised to be atomic.
- Rollback: keep `REDIS_CURRICULUM_CACHE_ENABLED=false` by default; disabling it restores the phase-one owner-scoped query path without data migration or key cleanup.

## 2. Implementation

- **Status:** IN_PROGRESS — user-authorized publication in progress
- **Files actually changed:** `.dev.vars.example`, `apps/api/src/cache/redis.ts`, `apps/api/src/cache/redis.test.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`, `apps/api/src/modules/profile/index.ts`, `apps/api/src/modules/profile/index.test.ts`, `apps/api/src/modules/profile/profile.test.ts`, `docs/cachingguide.md`, and this record. Existing browser-guide prefix remains unchanged.
- **Summary:** Mini-task A added the typed curriculum scope, scoped key/envelope/source guards, capability predicate, adapter dual-flag enforcement, and runtime kind/scope checks. Mini-task B wired the capability through composition and implemented the opt-in live-association/captured-ID loaders with exact validation, public response projection, failure behavior, and focused tests. Mini-task C added the second default-off example flag and updated the server-cache guide for rollout, query counts, TTL, privacy, race behavior, budget, telemetry, and rollback.
- **Decisions / deviations from plan:** Retained existing 200 ms shared Redis-only budget, retry settings, SDK/client lifecycle, global v1 keys, observation fields, and owner query path when the new capability is off. Loader identity mismatch preserves the loader return value but reports `invalid-source` and skips SET. No records repository implementation, DB schema, frontend, provider, actual environment, or deployment changes.
- **Migrations / env / shared contracts:** No migration or actual environment mutation. Added `REDIS_CURRICULUM_CACHE_ENABLED=false` only to the checked-in example. HTTP response and shared API types remain unchanged.

## 3. Review

- **Self-review checklist:** Pass on plan, scope, captured-ID loaders, exact data validation, global compatibility, default-off flag/config matrix, response projection, auth-before-cache, live record validation, privacy, failure handling, browser-guide preservation, and diff quality. Coordinator AI review passed for minis A, B, and C. Human peer review remains pending.
- **Test evidence:** `npm.cmd run typecheck` — PASS. `npm.cmd run lint` — PASS. `npm.cmd test` with only `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` omitted from the child process — PASS, 34 test files passed, 2 skipped; 459 tests passed, 13 skipped (472 total). `npm.cmd run test:integration` — PASS, 7/7. `npm.cmd run build:local` — PASS, 132 modules. `npm.cmd run build` — PASS. `npm.cmd run check:cloudflare` — PASS, Cloudflare assets build and Wrangler 4.148.0 dry-run exited without deployment. Focused adapter/profile/route/composition/record suite — PASS, 141 tests; coordinator independently reran the five-file focused suite, also 141 passed. P001 TypeScript check, targeted ESLint, and `git diff --check` — PASS. Coordinator's optional local unauthenticated `GET /api/profile/options` sanity check returned 401. No live provider or DB fixture run.
- **Manual checks:** Reviewed implementation guide, Sprint 1 FOUNDATION/P001 scope, adapter, repository SQL, route authorization order, current records write query, schema contract, Workers best-practices/runtime-patterns, and guide changes. Coordinator parsed all eight static SELECT/WITH templates with installed `libpg-query`; syntax passed without a DB connection. Four local Markdown links pass; no control bytes; original browser-cache guide prefix is unchanged. Coordinator confirmed the final diff is within the approved 10-file scope. `HEAD` and `main` remain `40e3e2d406fd661a3d8987f8211426806c5ee2d5`.
- **Defects found and fixes:** A review corrections added adapter-boundary feature gating, source curriculum identity validation, and runtime kind whitelist. B review requested stronger warmed-route denial coverage and a mocked real-SDK composition test with live association; both were added. C added an explicit oversized curriculum-envelope regression after acceptance audit. No runtime defect remains known.
- **Review outcome:** PASS — SELF-REVIEW; coordinator AI review PASS for A, B, and C. Publication commit/sync review pending. Human peer review pending.
- **Human reviewer / approval:** Pending; implementation was authorized by the user. No human peer review is claimed.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Added / Changed / Tests / Docs
- **Added / Changed / Fixed / Removed:** Implemented a default-off curriculum-scoped reference bundle under `profile.options`, with live association resolution, captured-ID miss queries, typed isolation and no public metadata. Added the rollout flag to `.dev.vars.example` and documented gates, freshness, query counts, failure behavior, telemetry, and rollback. Existing browser cache policy and HTTP response shape remain intact.
- **Affected routes / tables / consumers:** Internal `GET /api/profile/options` repository/cache behavior and configuration documentation. No database table, migration, record repository, or public API schema change.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Full required test, typecheck, lint, integration, local build, build, Cloudflare dry-run, focused tests, SQL parse, local documentation links, guide-prefix comparison, control-byte and diff checks passed. Verification used mocks; no provider or shared Neon fixture database was contacted.
- **Outstanding blockers / follow-up:** User authorized commit/merge/sync. Local feature commit and coordinator review are in progress; no merge or push has occurred. Human peer review remains pending.
- **Final status:** IN_PROGRESS
