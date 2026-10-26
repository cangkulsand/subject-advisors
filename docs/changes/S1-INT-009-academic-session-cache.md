# S1-INT-009 — Cache academic profile and records for the signed-in tab session

- Status: IMPLEMENTED; validation passed
- Date: 2026-10-26
- Scope: academic read caching in the local production checkout

## Plan and implementation

Cache successful profile and academic-record GET responses for the signed-in tab
session with no timed expiry, per user request. Store snapshots in sessionStorage
with a memory fallback, keyed by Clerk user/session identity, API base and path.
Keep curriculum-option reads on a five-minute TTL. No credentials are cached.
Profile and records survive page navigation and refresh. Unsaved form drafts remain
component state and are not cached. Standalone consumers without a known account
session retain uncached behavior.

Successful writes invalidate all academic snapshots so profile/curriculum changes
also refresh dependent options and records. Logout, access denial, or missing auth
clears the snapshots. A different user/session prunes previous identities; the same
session preserves storage on reload. AuthGate waits for session initialization
before mounting academic consumers. Concurrent reads share one request; subscriber
abort does not cancel others. A generation check prevents pre-save or pre-logout
reads from repopulating the cache. Failed reads are never cached.

This is a per-tab cache. Updates from another browser/tab or administrative edits
are not pushed into it. Storage restrictions fall back to memory; refresh then
refetches. Server authorization still applies to every network request and write.

## Review

Type checking, targeted ESLint, production build, 26 targeted unit tests and all
24 installed integration browser checks passed. Browser coverage uses mocked
Clerk/API data and confirms one GET each for profile/options/records across
repeated navigation AND page reload, then fresh reads after a profile save.
Unit coverage includes expiry of options, long-lived profile reads, isolation,
concurrent requests, cancellation, failed requests, access denial and stale reads
racing with session changes or successful saves. No live DB data was changed.

## Changelog

Guideline follow-up plan: document the agreed retention and invalidation policy in
docs/cachingguide.md and link it from contributor and implementation instructions.
Review documentation against the implemented cache; no runtime change is needed.

2026-10-26: Added docs/cachingguide.md and linked it from CONTRIBUTING.md and
docs/implementationguide.md. Reviewed retention, storage, invalidation and known
per-tab limits against the code. Documentation links and git diff --check passed;
runtime tests were not rerun for this documentation-only follow-up. Peer review pending.

2026-10-26: Added caching and validation; changed profile/record retention from a
five-minute TTL to session retention with update-triggered invalidation as requested.
No commit, push or deployment.
