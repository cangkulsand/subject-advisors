# S3-P004-016 — "Students in the system" snapshot failed for large programmes (Workers subrequest limit)

- **Status:** MERGED to main (fast-forward, ed6d141) and deployed to dev and prod on 2026-11-18
- **Date:** 2026-11-18
- **Sprint:** Sprint 3 (hotfix)
- **Owner:** P004 (M6, UC20)
- **Related UC / FR:** UC20, FR-H1, FR-H3
- **Branch / PR:** `hotfix/system-snapshot-centres`; no PR
- **Reviewer:** Pending

## 1. Problem

On prod, Data Imports → Students in the system → Create snapshot for SECJ (programme 5) at KL showed
"Forecasting data is unavailable. Please retry." (the generic 503 for an unexpected error).

## 2. Root cause

`buildSystemSnapshot` asked for each student's learning centre one at a time, and each call was its own Neon HTTP
query (`SELECT learning_centre_id FROM student_profile WHERE student_id = $1`). A Cloudflare Worker may make only
50 subrequests per request on the free plan. The development database has 148 SECJ students (86 at centre 1) and 55
SECRH students, so one snapshot needed about 150 queries; the Worker stopped the request part way. That lookup sat
outside the repository's error mapping, so the client got the generic message instead of a specific one.

## 3. Change

- `ScopeProvider.studentLearningCentreId(id)` replaced by `studentLearningCentres(ids)`: one query
  `... WHERE student_id = ANY($1::int[])` for the whole list (`index.ts`, `scope-provider.ts`).
- `buildSystemSnapshot` filters ACTIVE students first, then looks up all their centres in that one call
  (`system-snapshot.ts`; used by both the system and the combined snapshot in `routes.ts`).
- Behaviour unchanged: same students, same exclusions (inactive access, other or missing centre), same fingerprint.

## 4. Tests

- New `system-snapshot.test.ts` case: 120 eligible students → the centre lookup is called exactly once with all 120 ids,
  and the coverage still splits them by centre (written first; failed before the change).
- Updated the test scope provider and the stubs in `scope-provider.test.ts`, `system-snapshot.test.ts` and
  `repository.database.test.ts` to the batched method.
- Results: typecheck, lint, check:cloudflare pass; `npm test` 1842 passed (65 skipped).

## 5. Changelog

- 2026-11-18 - Type: Fixed. "Students in the system" snapshots work for programmes with more than about 40 students.
