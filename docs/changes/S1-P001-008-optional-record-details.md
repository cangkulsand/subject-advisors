# S1-P001-008 — Optional initial record details

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator review pending

## 1. Plan

### Objective / problem
Allow students to initially save an Exempted subject with zero recognized credits before they have optional supporting details, in line with the user's explicit decision.

### Scope and requirements
- In scope: record request validation for optional grade/remarks on every status; EXEMPTED missing/null credits default to zero; focused validation and authenticated route tests.
- Out of scope: UI changes, schema/migration changes, live student-record writes, changing allowed statuses, credit ceilings, FAILED/WITHDRAWN zero-credit rules, COMPLETED derived credits, owner/single-record/undated rules.

### Proposed implementation
- Expected files: `apps/api/src/modules/records/validation.ts`, focused profile route/validation tests, and this change record.
- Treat omitted/null EXEMPTED recognized credits as 0. Other malformed values remain rejected. Make grade and remarks nullable/optional for all statuses while retaining existing type/length validation when present.

### APIs / database / cross-programmer impacts
- Existing POST/PUT request and response shapes remain compatible. No DB changes; schema permits nullable grade and remarks. EXEMPTED 0 is accepted by existing credit constraints.

### Acceptance criteria
- [ ] Minimal EXEMPTED setup without details saves as credits=0, grade=null, remarks=null.
- [ ] Positive-credit EXEMPTED records may omit remarks; values remain bounded by subject credits in repository SQL.
- [ ] COMPLETED remains derived; FAILED/WITHDRAWN remain explicitly zero; negative, fractional, string, or overlarge credits are rejected by request validation.
- [ ] Focused tests and checks pass without DB access.

### Verification plan
- Focused profile/record repository tests, focused TypeScript/lint, and `git diff --check`.

### Risk / assumptions / rollback
- This reflects the user's explicit choice that detail fields are optional. No exemption rationale is fabricated. Code-only rollback; no live writes.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/api/src/modules/records/validation.ts`, `apps/api/src/modules/profile/profile.test.ts`, and this change record.
- **Summary:** EXEMPTED with omitted/null recognized credits now normalizes to 0. Grade and remarks are optional for every status and normalize to null when absent/blank. Supplied invalid credit values remain rejected; existing status-specific credit validation is unchanged.
- **Decisions / deviations from plan:** No explanation is fabricated for an exemption. Positive-credit exemptions may omit remarks; repository SQL continues enforcing the configured subject-credit ceiling.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** Only input validation and focused API tests changed. Required subject/status and strict allowlist remain. COMPLETED remains derived; FAILED/WITHDRAWN remain explicitly zero; EXEMPTED default applies only to null/omitted values. Existing ownership, undated creation and single-record repository behavior untouched.
- **Test evidence:** `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/profile/profile.test.ts apps/api/src/modules/records/repository.test.ts` — PASS, 65 tests. Focused strict TypeScript invocation over affected API modules/tests — PASS. Focused ESLint — PASS. `git diff --check` — PASS (line-ending notices only for concurrent unrelated frontend files).
- **Manual checks:** No database/provider access or writes.
- **Defects found and fixes:** Replaced prior test expectation that exemptions require remarks/explicit credits with coverage for user's optional-details decision; added malformed-value and authenticated POST normalization tests.
- **Review outcome:** PASS — SELF-REVIEW; coordinator review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Changed; Tests
- **Added / Changed / Fixed:** EXEMPTED with absent/null credits defaults to zero; grade and remarks are optional for all record statuses and normalize to null when missing/blank. Added direct validator and authenticated route coverage.
- **Affected routes / tables / consumers:** POST/PUT `/api/academic-records`; existing academic_record columns.
- **Breaking changes / migration steps:** None; this relaxes request requirements and preserves response/database shape.
- **Verification summary:** 65 focused tests, strict TypeScript, focused ESLint, and diff whitespace check passed.
- **Outstanding blockers / follow-up:** Coordinator review pending; frontend may now autosave Exempted as zero credits without requiring details.
- **Final status:** READY_FOR_REVIEW
