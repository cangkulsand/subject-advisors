# S1-FOUNDATION-003 — Redis cache guideline

- **Status:** MERGED
- **Date:** 2026-10-29
- **Sprint:** Sprint 1
- **Owner:** FOUNDATION
- **Related UC / FR:** UC03, UC04, UC08; supports P001 and P002 reference reads
- **Branch / PR:** `main` / direct main publication explicitly requested by user; documentation work was initially made on `main` and carried forward when the implementation branch was created
- **Reviewer:** Coordinator AI feedback incorporated; no human peer review performed

## 1. Plan

### Objective / problem
Document a proposed optional server-side Redis cache policy that complements the current browser cache and preserves Neon PostgreSQL as authoritative. Record cache safety, freshness, invalidation, outage, and rollout boundaries before implementation.

### Scope and requirements
- In scope: docs-only update to `docs/cachingguide.md`; create this four-stage change record. Support P001 UC03/UC04 and P002 UC08 without inventing SRS requirements.
- Out of scope: runtime code, package installation, Redis provisioning, environment/secret changes, migrations, implementation planning for a later task, and edits to other repository files.

### Proposed implementation
- Expected files: `docs/changes/S1-FOUNDATION-003-redis-cache-guideline.md`, then `docs/cachingguide.md`.
- APIs / database / interfaces: No implementation changes. Describe optional `@upstash/redis` HTTP access from Workers; Neon remains authoritative.
- Dependencies / shared-file impact: Documentation consumed by P001/P002 and future backend work. Preserve current browser retention policy and distinguish it from proposed server caching.

### Acceptance criteria
- [x] Existing session-long profile/record behavior, five-minute browser options/offerings behavior, role v3 snapshot rules, and per-tab boundaries remain intact.
- [x] New server Redis policy is explicitly PROPOSED / NOT IMPLEMENTED and covers allowed/excluded data, authorization, TTLs, fallback/timeouts, validation/namespaces, invalidation/staleness, flags/configuration, observability, and implementation verification.
- [x] No cached auth decision or business rule becomes authoritative; failures do not mask Neon errors; freshness limits and existing HTTP `no-store` contract are explicit.
- [x] This record contains Plan, Implementation, Review, and Changelog with truthful evidence and publication/reviewer status accurately stated.

### Verification plan
- `git diff --check`
- Check local Markdown links in edited documents and inspect diff for scope and consistency. No runtime tests.

### Risk / assumptions / rollback
- Risks: readers could mistake a proposal for deployed infrastructure; label the server-side section clearly and state feature flag defaults off.
- Assumptions / blockers: agreed policy in task brief is the decision input; authoritative SRS/SDD remains unchanged.
- Rollback: revert the two documentation files; no runtime or data state is affected.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `docs/cachingguide.md`; this change record.
- **Summary:** Added a clearly proposed/not implemented server Redis policy covering scope, auth boundary, TTLs, failure handling, namespaces, invalidation/freshness, configuration, telemetry, and future checks.
- **Decisions / deviations from plan:** No deviations. Current browser profile/records, curriculum/options/offerings cache rules, role v3 snapshots, and per-tab behavior remain unchanged.
- **Migrations / env / shared contracts:** None; only future optional server configuration is documented.

## 3. Review

- **Self-review checklist:** Scope is docs-only; proposal is labeled not implemented; existing browser policies remain untouched; Neon and live authorization/validation remain authoritative; no secrets/PII are specified for keys or logs; no runtime or external state changed.
- **Test evidence:** `git diff --check` passed (exit 0). No runtime tests run because this is documentation-only.
- **Manual checks:** Inspected diff and verified the existing local implementation-record link resolves to `docs/changes/S1-INT-009-academic-session-cache.md`; new references are external links supplied in the task brief.
- **Defects found and fixes:** Coordinator review identified five documentation corrections, all incorporated: replaced a mojibake heading separator with ASCII; clarified the Redis budget covers lookup/retries/fill while preserving Neon fallback and existing Neon timeout/error handling; corrected direct-DB freshness language to account for browser retention and avoid an end-to-end guarantee; added spacing after References; and recorded coordinator corrections separately from pending human peer review. Coordinator independently verified the existing guide prefix exactly matches HEAD.
- **Review outcome:** PASS — SELF-REVIEW
- **Human reviewer / approval:** No human peer review was performed; direct main publication was explicitly requested by the user. Coordinator feedback on the documentation corrections was incorporated and is not represented as human approval.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Docs
- **Added / Changed / Fixed / Removed:** Added proposed server-side Redis reference-cache guidance to `docs/cachingguide.md`; added this per-change record and linked the separate PLANNED implementation record `docs/changes/S1-FOUNDATION-004-redis-reference-cache.md`. The link records planned work; no cache implementation was delivered.
- **Affected routes / tables / consumers:** Future P001/P002 reference-read implementation guidance; no runtime routes or tables changed.
- **Breaking changes / migration steps:** None.
- **Verification summary:** `git diff --check` passed; local implementation-record link checked; runtime tests not applicable and not run.
- **Outstanding blockers / follow-up:** The policy documented here remains distinct from the implemented, disabled-by-default two-query cache recorded in `docs/changes/S1-FOUNDATION-004-redis-reference-cache.md`. This docs record and the later implementation were published in commit `bca1f91264c4b99f507e27f986fbc623bcab90e8` under the user's direct-main instruction. No human peer review is claimed.
- **Final status:** MERGED
