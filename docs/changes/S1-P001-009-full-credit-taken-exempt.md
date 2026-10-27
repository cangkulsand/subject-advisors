# S1-P001-009 — Full configured credits for Taken and Exempted

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator reviewed and accepted the API contract; final combined checks recorded below. Human peer review pending.

## 1. Plan

### Objective / problem
Apply the user's latest explicit credit policy: Taken and Exempted both recognize the subject's full configured credits; students cannot report a partial amount for a subject.

### Scope and requirements
- In scope: record input validation, repository credit derivation/equality checks, and focused tests.
- Out of scope: UI changes, schema/migration changes, bulk repair of existing data, live student-record writes, unrelated status/auth/delete behavior.

### Proposed implementation
- Expected files: `apps/api/src/modules/records/validation.ts`, `apps/api/src/modules/records/repository.ts`, focused profile/repository tests, and this record.
- Missing/null credits for COMPLETED and EXEMPTED normalize to null in the API input and derive full `subject.credit_hours` in SQL. Explicit credits for either status must equal configured subject credits. FAILED/WITHDRAWN continue requiring zero. Grade/remarks remain optional.

### APIs / database / cross-programmer impacts
- No payload/schema change; POST/PUT continue accepting `recognizedCredits` optionally. Repository enforces full-credit policy against the configured curriculum subject. Existing owner, identity, undated and unique-index behavior is untouched.
- Supersedes S1-P001-008's interim zero-credit exemption default per latest user policy. Existing zero/partial-credit database values are not auto-migrated.

### Acceptance criteria
- [x] Minimal EXEMPTED input has normalized `recognizedCredits: null`; successful save derives full configured subject credits.
- [x] Explicit partial credit is rejected by repository eligibility SQL for COMPLETED/EXEMPTED.
- [x] FAILED/WITHDRAWN remain zero-only; grade/remarks remain optional.
- [x] Focused tests, strict typecheck/lint and diff checks pass without DB access.

### Verification plan
- Focused route/record repository Vitest; strict TypeScript over affected files; focused ESLint; `git diff --check`.

### Risk / assumptions / rollback
- This is the user's latest credit decision and supersedes earlier accepted zero/partial exemption behavior. Existing rows are preserved as-is; no cleanup is performed. Revert code-only.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/api/src/modules/records/validation.ts`, `apps/api/src/modules/records/repository.ts`, `apps/api/src/modules/profile/profile.test.ts`, `apps/api/src/modules/records/repository.test.ts`, and this change record.
- **Summary:** COMPLETED and EXEMPTED omitted/null credits normalize to null and SQL derives `subject.credit_hours`; any explicitly supplied amount for either status must equal the configured subject credits. FAILED/WITHDRAWN remain zero-only. Grade and remarks remain optional.
- **Decisions / deviations from plan:** Supersedes S1-P001-008's interim rule that omitted EXEMPTED credits defaulted to zero and permitted partial-credit exemptions. Existing records are untouched and may retain historical zero/partial values; no reconciliation was authorized.
- **Migrations / env / shared contracts:** No schema, migration, or environment changes.

## 3. Review

- **Self-review checklist:** Request validation retains allowed-status/field checks; only COMPLETED/EXEMPTED permit absent credit for derivation, FAILED/WITHDRAWN require zero; SQL derives full credits for both statuses and enforces exact configured amount for explicit values. Query remains owner/current-curriculum scoped and leaves existing single-initial/identity/undated predicates untouched. No bind parameter lost type context.
- **Test evidence:** Focused route/repository Vitest — PASS, 69 tests. Focused strict TypeScript over affected API modules/tests — PASS. Focused ESLint — PASS. `git diff --check` — PASS (line-ending notices only in concurrent unrelated UI files). Final root `npm.cmd test` — PASS, 260 passed and 13 skipped (21 test files passed, 2 skipped; 273 total). Final `npm.cmd run test:integration` — PASS, 6 generator tests passed.
- **Manual checks:** No database/provider access or writes.
- **Defects found and fixes:** Updated the earlier optional-details tests and added SQL-predicate coverage for full-credit derivation and partial-credit rejection for both statuses; retained owner/saved-ID tests.
- **Review outcome:** PASS — SELF-REVIEW; coordinator reviewed and accepted the full-credit API semantics. Human peer review pending.
- **Human reviewer / approval:** Coordinator review accepted; human peer review pending.

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Changed; Tests
- **Added / Changed / Fixed:** Full configured subject credits are now recognized for both Taken/COMPLETED and EXEMPTED. Partial explicit values are rejected; absent/null values derive the configured full amount. Optional grade/remarks and zero-only FAILED/WITHDRAWN remain.
- **Affected routes / tables / consumers:** POST/PUT `/api/academic-records`; `academic_record.recognized_credits` is set from `subject.credit_hours` for COMPLETED/EXEMPTED writes.
- **Breaking changes / migration steps:** New/updated saves reject zero or partial EXEMPTED amounts when they differ from the configured subject credit hours. Existing historical records are not changed; no migration required.
- **Verification summary:** 69 focused route/repository tests; focused strict TypeScript, focused ESLint and diff check passed. Root unit suite passed 260 with 13 skipped. Generator contracts passed 6/6.
- **Outstanding blockers / follow-up:** UI should not offer editable partial credits. Historical rows are not automatically repaired. Full UI typecheck/lint/build/browser checks are owned by the concurrent UI task and were not run here; no live DB checks were run.
- **Final status:** READY_FOR_REVIEW — coordinator API review accepted; human peer review pending.
