# S1-P001-004 — Single initial subject record API

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator review pending

## 1. Plan

### Objective / problem
Support one saved initial setup row per authenticated student and curriculum subject. A blank row can be cleared explicitly, and edits update that same record without changing its identity.

### Scope and requirements
- In scope: undated initial record creation, reject existing same-subject records of any semester, immutable identity on updates, owner/curriculum-scoped one-row deletion, focused tests and profile client DELETE support.
- Out of scope: UI/table edits, migrations/schema changes, live database writes/tests, attempt reconciliation/deletion, changing status/credit rules, provider calls, commit/push.

### Proposed implementation
- Expected files: P001 record contracts/repository, profile routes and tests, profile client, and this record.
- Reuse the existing unique `(student_id, subject_id) WHERE semester_id IS NULL` index to serialize new initial-row creation. Check all existing same-subject rows before insert, including dated legacy rows. Updates target the existing row and never assign identity columns. DELETE returns only the deleted `{recordId, subjectId}`.
- Derive owner only from verified Clerk identity; validate curriculum membership in SQL.

### APIs / database / cross-programmer impacts
- POST `/api/academic-records` accepts only `semesterId: null`; PUT `/api/academic-records/:recordId` updates mutable outcome fields while requiring the supplied identity to match; DELETE on that path clears one scoped row and returns `{data:{recordId,subjectId}}`.
- No schema changes. The undated unique index prevents concurrent duplicate new setup rows; it does not add database-wide uniqueness against legacy dated rows.

### Acceptance criteria
- [ ] New dated POST is rejected; same-subject rows, including dated legacy data, prevent a new initial row.
- [ ] Existing initial records update in place; subject/semester identity cannot move.
- [ ] DELETE removes only one record owned by the caller and in their current curriculum; missing/foreign IDs are 404.
- [ ] Existing auth/profile gates, four statuses, exemption and credit rules remain intact; API errors use accurate status codes.
- [ ] Focused tests and relevant local type/lint checks pass without database/provider access.

### Verification plan
- Run focused Vitest profile/repository tests, P001 typecheck/lint, and `git diff --check`. No live DB commands.

### Risk / assumptions / rollback
- Legacy multiple attempts are never auto-selected, overwritten, or removed; explicit reconciliation is required. No DB-wide constraint is introduced. Rollback is a code-only revert; no persisted changes occur during development.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/api/src/modules/records/contracts.ts`, `apps/api/src/modules/records/repository.ts`, `apps/api/src/modules/records/repository.test.ts`, `apps/api/src/modules/profile/routes.ts`, `apps/api/src/modules/profile/profile.test.ts`, and `apps/web/src/features/profile/client.ts`.
- **Summary:** Added POST restriction to undated-only records, rejection of any same-owner/same-subject existing row, immutable subject/semester identity for PUT, owner/current-curriculum scoped one-row DELETE returning the deleted identity, and DELETE client support using existing successful-write cache invalidation.
- **Decisions / deviations from plan:** Existing duplicate check is owner plus subject across all existing rows, including records not currently in the selected curriculum. If same-subject legacy duplicates exist, POST safely refuses; it never selects, overwrites or deletes them. Coordinator review found the bound `$3` in INSERT had no SQL type context after the literal NULL change; restored `$3::integer` (the request guard guarantees null), added a regression assertion, and expanded DELETE auth/method gate tests. No schema change.
- **Migrations / env / shared contracts:** None. Existing undated unique index handles concurrent initial row creation; legacy dated rows are guarded by the application check and no DB-wide uniqueness guarantee is claimed.

## 3. Review

- **Self-review checklist:** Scope limited to the requested API/client boundary. Verified owner from auth context, curriculum membership in SQL, safe identity immutability, status/credits remain governed by existing validation and SQL rules, errors remain 400/404/409 as applicable, and no schema/data/provider changes occurred.
- **Test evidence:** `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/profile/profile.test.ts apps/api/src/modules/records/repository.test.ts` — PASS, 54 tests. `node node_modules/typescript/bin/tsc -p tsconfig.p001.json` — PASS. Focused ESLint over all six implementation/test files — PASS. `git diff --check` — PASS (Git reports only its standard LF-to-CRLF notice for profile client).
- **Manual checks:** Inspected the existing `academic_record_undated_attempt_key` and dated index definitions in `db/migrations/0001_initial_schema.sql`; no DB command or live data access was run.
- **Defects found and fixes:** Initial test run exposed fixture type/lint issues, corrected before final checks. Coordinator review identified an untyped bound `$3` in INSERT after use of a literal NULL; restored explicit `$3::integer` and added a binding regression assertion. DELETE route tests now cover expired auth (401), wrong role/incomplete profile (403), invalid ID, not-found, and unsupported methods.
- **Review outcome:** PASS — SELF-REVIEW; coordinator re-review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Added; Changed; Tests
- **Added / Changed / Fixed:** Initial record POST is undated-only and refuses an existing same-owner/same-subject record. PUT updates mutable outcome values while preserving identity. Added scoped DELETE returning `{recordId, subjectId}` and expanded profile client methods to include DELETE.
- **Affected routes / tables / consumers:** `/api/academic-records`, `/api/academic-records/:recordId`, `academic_record` query logic, and profile AcademicClient consumers. No schema changes.
- **Breaking changes / migration steps:** Dated POST requests now return 400; callers must use PUT to update an existing record. Identity mismatch on PUT returns not found. No migration required.
- **Verification summary:** 54 focused route/repository tests, P001 TypeScript check, focused ESLint, and diff whitespace check passed after the coordinator SQL binding correction. No live DB tests/writes or provider calls.
- **Outstanding blockers / follow-up:** UI owner must require confirmation before DELETE and send DELETE only for a user's explicit clear action. Multiple legacy attempts need explicit reconciliation. Human peer review pending.
- **Final status:** READY_FOR_REVIEW
