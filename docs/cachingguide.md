# Project caching guideline

Use the shared academic cache for infrequently updated student data. Cache saved
server responses so navigating between pages or refreshing the tab does not repeat
the same reads. Remove cached data when the user successfully updates it.

## Retention policy

| Data | Retention | Invalidation |
| --- | --- | --- |
| Academic profile | Signed-in tab session; no timed expiry | Successful academic write, sign-out, session/account change, or access denial |
| Academic records | Signed-in tab session; no timed expiry | Successful academic write, sign-out, session/account change, or access denial |
| Curriculum options | Five minutes | Expiry or the same invalidation events above |
| Semester-offering context and saved selection | Five minutes | Expiry, successful offering write, successful academic write, sign-out, session/account change, or access denial |

Profile and record snapshots survive page navigation and refresh through
`sessionStorage`. Use memory as a fallback when browser storage is unavailable.
Do not replace this policy with a short TTL for profile or records without an
explicit change to the agreed project requirements.

## Implementation rules

1. Reuse `createAcademicClient` and the shared cache instead of adding independent
   caches inside page components.
2. Key entries by Clerk user ID, session ID, normalized API base URL and endpoint.
   Wait for the session identity before mounting private data consumers. Consumers
   without a known session must bypass caching.
3. Cache only successful GET response data. Never cache failed requests, tokens,
   credentials, or unsaved form drafts. Return copies so form edits cannot mutate
   a cached snapshot.
4. After a successful write, invalidate academic snapshots before subsequent
   reads. The current implementation clears all academic snapshots: a profile or
   curriculum change can affect records and options. Do not treat an attempted or
   failed save as confirmed data.
5. Clear snapshots on sign-out, missing authentication, or access denial. Discard
   previous users' and sessions' entries on identity changes. Preserve the same
   session's entries across page reloads.
6. Share concurrent reads. Cancelling one subscriber must not cancel another's
   request. Reject obsolete responses after invalidation so an older request cannot
   restore pre-update or previous-account data.
7. Keep HTTP requests authenticated and `cache: 'no-store'`. Application snapshots
   are not authorization: server-side identity, role and ownership checks remain
   mandatory for all private endpoints and writes.
8. UC08 caches only the authenticated `/api/semester-offerings` server response for
   five minutes, keyed by identity, normalized API base, response-contract version
   and semester query. Keep identity at key index zero. Increment the narrow UC08
   contract marker when additive context fields are introduced so older five-minute
   snapshots cannot hide fields without changing other academic cache behavior. Its
   current marker is `p002-context-v4-prerequisites`; prerequisite metadata keeps
   known-empty (`available` with no items) distinct from unavailable or legacy data.
   P001 academic-history read continues to use the session-long academic-records
   cache; do not put the composed page data or local selection draft into that
   snapshot. A successful offering PUT clears academic snapshots before response
   decoding because the server may have committed even if the response is invalid.

## Scope and limits

This policy covers academic profile, records and curriculum options. Choose and
document retention for other data according to how often it changes; do not apply
session-long retention automatically to every endpoint.

The cache is per tab. Updates from another tab/browser or an administrator are not
automatically synchronized. A page refresh deliberately retains existing snapshots;
do not describe it as a forced refresh. If a feature needs external-change detection,
add explicit invalidation, a refresh action, or a documented freshness policy.

## Verification when changing caching

Check that repeated navigation and page refresh reuse saved data, successful writes
cause fresh reads, and account changes cannot reuse another account's snapshots.
Cover failed responses, expired curriculum options, unavailable storage, concurrent
subscribers, and responses arriving after invalidation. Label mocked versus live
verification clearly.

Implementation: `apps/web/src/features/profile/data-cache.ts`,
`apps/web/src/features/profile/client.ts`, and
`apps/web/src/features/auth/account-cache.ts`.
See [the implementation record](changes/S1-INT-009-academic-session-cache.md).

## Multi-role account snapshots

Account access uses the v3 snapshot contract: explicit `roles`, email-eligible
`availableRoles`, and independent `studentProfileState`. Old stored v1/v2 account
snapshots are discarded. A workspace switch forces a current account read before
navigation and rejects results from a previous Clerk session. Profile saves update
student setup state even when the default view is staff. Role switching does not
change the academic profile/record retention policy above. Cached roles never
authorize backend calls; each API request checks current memberships and suspension.

## Server-side Redis reference cache - IMPLEMENTED, DISABLED BY DEFAULT

The adapter and P001 integration are implemented for the global active programme/curriculum list, academic semester list, and curriculum-scoped subject and category-requirement bundle returned by `profile.options`. Both cache stages are individually disabled by default. `REDIS_CACHE_ENABLED=false` is the master gate; `REDIS_CURRICULUM_CACHE_ENABLED=false` is an additional gate for the curriculum-scoped bundle. The new scope is available only when both are `true` and the existing Redis URL, token, namespace, and dataset are fully configured. With the curriculum gate off, the existing phase-one owner-scoped subject queries remain in use. The current application cache described above remains the browser behavior. Redis must never become an authority for identity, authorization, curriculum rules, or business decisions. Neon PostgreSQL remains authoritative. Verification uses mocked SDK HTTP only; no live provider smoke run was performed.

### Rollout and authorization boundary

- Keep the feature flag off by default. Workers may use optional `@upstash/redis` over HTTP when enabled and configured; disabled, missing, or unavailable Redis behaves as a cache miss.
- Resolve a fresh Clerk session and current account state for each protected request. Check current role/membership, suspension, and protected-owner authorization before any cached reference read. A cache hit never grants access.
- Cache only internal, read-only reference lookups needed by private endpoints. Do not cache whole private endpoint responses.
- Never cache authentication or authorization decisions, tokens, errors, unsaved drafts, personal profiles, academic records, saved offerings, or administrator Users/Audit data in the first rollout.
- Resolve the student's curriculum from the live database. Keep all business write validation live against Neon. Never trust cached data for semester availability, limits, or academic rules.

### Reference TTLs and failure behavior

| Internal reference lookup | Server TTL | Status / notes |
| --- | ---: | --- |
| Global active programmes and curricula | 300 seconds | Implemented for the `profile.options` reference list; disabled by default |
| Subject catalogue and category requirements, scoped to curriculum | 300 seconds | Implemented; additional `REDIS_CURRICULUM_CACHE_ENABLED` gate defaults off. See [S1-FOUNDATION-005](changes/S1-FOUNDATION-005-curriculum-reference-cache.md). |
| Global semester reference list | 60 seconds | Implemented for `profile.options`; not semester availability or business validation |

### Curriculum-scoped profile options

When both flags and complete Redis configuration are present, each authorized
`profile.options` request first resolves the student's current curriculum through
a live `student_profile` lookup using the verified Clerk identity. This association
is resolved on every enabled request, including a warm cache hit. A missing profile
returns empty `subjects` and `subjectGroups` while keeping the global options. The
association and student identity are never stored in Redis. The cache contains one
combined internal bundle `{ curriculumId, subjects, subjectGroups }`; only the two
arrays are returned in the existing API response.

The bundle key adds the resolved curriculum ID to the existing namespace, dataset,
contract version, and distinct `curriculum-options` kind. Existing global v1 keys
and envelopes remain unchanged. Both miss loaders use the ID captured by the live
association lookup directly. If the profile association changes while a C1 load is
in flight, that load can only populate C1's key; the next request resolves C2 and
uses C2's key. The two PostgreSQL loader queries are not an atomic snapshot, and
this design does not add immediate invalidation for direct database changes.

For `profile.options` repository SQL only (excluding authorization and any existing
profile-reader queries), a full cold miss performs five queries: one live association
lookup, two global-reference loads, and two curriculum-bundle loads. A fully warm
request performs one live association query. The previous phase-one warm path used
two owner-scoped subject/category queries. These are mocked query counts, not a
latency guarantee or a claim of a measured speedup.

All Redis lookups and fills share the existing 200 ms request budget, including the
global and curriculum entries. On Redis failure or budget exhaustion, loaders run
once and PostgreSQL remains authoritative; a failed fill returns the already-loaded
data without running a loader twice. Database errors still propagate. The `dbLoads`
observation counts loader-function calls: the combined curriculum loader executes
two SQL queries. Existing timing fields do not provide a dedicated Neon latency;
the difference between lookup and Redis duration also includes queue wait. Turning
`REDIS_CURRICULUM_CACHE_ENABLED` off rolls back only the new scope to the phase-one
owner-query path. Turning the master `REDIS_CACHE_ENABLED` off disables both server
cache stages.

On a miss, invalid/expired payload, disabled cache, or Redis outage, read from Neon. Bound total Redis overhead (lookup, retries, and cache fill) with a request-level timeout; per-attempt timeouts alone are insufficient. A cache timeout must still allow the Neon fallback, without changing existing Neon timeout or error handling. Distinguish Redis/cache failures from Neon/database failures. Do not swallow database failures or turn them into successful-looking cache responses. Upstash eventual consistency is acceptable only for these bounded-staleness reference reads.

Validate cached payload shape and schema/contract version before use; invalid data is a miss and is replaced from Neon where possible. Namespaces must include deployment, non-secret dataset identity, cache contract version, and curriculum identity when applicable. Never put secrets or PII in keys or logs. Use separate deployment credentials and namespaces. The current two workspaces share Neon, so workspace namespace separation does not provide immediate cross-workspace invalidation: explicitly document the expiry-bounded staleness this creates.

### Invalidation and freshness limits

This tranche has no reference-data mutation route or immediate post-write invalidation guarantee. Any later successful reference-data mutation must invalidate affected namespace entries only after the PostgreSQL transaction commits. Direct database edits bypass application invalidation. After a server entry expires, the next server cache miss is eligible to reload current PostgreSQL data; existing browser retention still applies, so this gives no instant or hard end-to-end freshness guarantee. Do not claim immediate cross-app freshness. Before adding admin editing that requires immediate freshness, introduce database-backed revisions and reliable retry/outbox delivery. Use generation/revision keys so an in-flight stale refill cannot repopulate an invalidated generation; delete-only invalidation is insufficient.

Server-side TTLs do not override browser snapshot lifetimes documented above, and do not by themselves define end-to-end freshness. For `profile.options`, the existing five-minute browser options cache adds its own retention after the server response. Redis does not synchronize already-open browser tabs or invalidate their session-long profile/record snapshots. Preserve the existing HTTP `cache: 'no-store'` contract; server-side reference caching is an internal implementation detail.

### Configuration, telemetry, and implementation checks

Optional server configuration uses `REDIS_CACHE_ENABLED`, `REDIS_CURRICULUM_CACHE_ENABLED`, `REDIS_CACHE_NAMESPACE`, `REDIS_CACHE_DATASET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. The checked-in [.dev.vars.example](../.dev.vars.example) leaves both flags off and the URL/token blank; supply real credentials only through ignored local variables or a server-side secret store. Never use a `VITE_` variable for Redis values.

When enabled, P001 emits one structured `reference_cache` event per lookup with only `kind`, `outcome`, `lookupDurationMs`, `redisDurationMs`, and `dbLoads`. `lookupDurationMs` includes the Neon loader when called; `redisDurationMs` counts Redis command time and excludes Neon work and queue wait. Disabled cache lookups emit no cache events. These aggregates contain no PII, keys, namespace/dataset values, URLs, tokens, payloads, or raw errors. Verification covers cache hits/misses, non-sliding expiry and slow-fill age limits, invalid payload and failure fallback, namespace isolation, authorization on hits, live write validation, and the existing browser cache policy. Current runtime verification is mocked; no live provider smoke run was performed.

No migration is needed for the first cache rollout. Reliable database-backed revisions/outbox support is a future additive migration if required. Coordinator immutable aggregate forecasts are future work only after a backend exists; raw imported identities are excluded, and PostgreSQL decisions/run data remain durable. Rate limits and jobs are outside phase one.

References:

- [Upstash Redis quickstart for Cloudflare Workers](https://upstash.com/docs/redis/quickstarts/cloudflareworkers)
- [Upstash Redis consistency](https://upstash.com/docs/redis/features/consistency)
- [Upstash Redis TypeScript SDK deployment](https://upstash.com/docs/redis/sdks/ts/deployment)

Implementation plan: [S1-FOUNDATION-004 - Optional Redis reference cache for profile options](changes/S1-FOUNDATION-004-redis-reference-cache.md).
