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
