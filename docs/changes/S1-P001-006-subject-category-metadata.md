# S1-P001-006 — Subject category metadata and grouping helper

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-26
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03 / FR-A3; UC04 / FR-A4
- **Branch / PR:** Current working branch; no PR
- **Reviewer:** Coordinator review pending

## 1. Plan

### Objective / problem
Expose configured curriculum subject categories to the frontend so the UI can group subjects into Core, Elective, and Other tabs without guessing from subject codes.

### Scope and requirements
- In scope: optional subject category metadata in existing profile options; curriculum and verified-owner scoped read query; tested frontend helper mapping only explicit known category labels.
- Out of scope: UI tab wiring, schema changes, category enum/inference, `is_compulsory` fallback, live database access, other owner code.

### Proposed implementation
- Expected files: `apps/api/src/modules/profile/contracts.ts`, `apps/api/src/modules/profile/repository.ts`, focused profile repository tests, and `apps/web/src/features/records/subject-groups.ts` with tests.
- Select `curriculum_subject.subject_category` in the existing subject options query. Add `subjectCategory?: string | null` for backward compatibility.
- Helper normalizes case and whitespace and recognizes CORE / PROGRAMME CORE / TERAS and ELECTIVE / PROGRAMME ELECTIVE / ELEKTIF. Unknown/missing category remains Other; preserve every input subject exactly once.

### APIs / database / cross-programmer impacts
- Extends `/api/profile/options` subject entries with optional `subjectCategory`; consumers that ignore the field remain compatible. No schema changes.

### Acceptance criteria
- [ ] Subject options include the configured category and remain scoped to the authenticated student's saved curriculum.
- [ ] Helper recognizes explicit known labels case/spacing-insensitively and routes missing/unknown values to Other.
- [ ] Every subject is preserved exactly once in output.
- [ ] Focused tests, typecheck, lint, and diff checks pass.

### Verification plan
- Focused Vitest for repository query and grouping helper; P001 TypeScript check; focused ESLint; `git diff --check`.

### Risk / assumptions / rollback
- Category contents are configured free text, not an enum. Only documented equivalents are recognized; no curriculum convention is inferred. Revert code-only; no persisted changes.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/api/src/modules/profile/contracts.ts`, `apps/api/src/modules/profile/repository.ts`, `apps/api/src/modules/profile/repository.test.ts`, `apps/web/src/features/records/subject-groups.ts`, and `apps/web/src/features/records/subject-groups.test.ts`.
- **Summary:** Profile options subjects now include optional `subjectCategory`, selected from the current student's curriculum membership query. The exported grouping helper recognizes CORE / PROGRAMME CORE / TERAS and ELECTIVE / PROGRAMME ELECTIVE / ELEKTIF after trimming, collapsing whitespace and case normalization. Missing or unknown values stay in Other.
- **Decisions / deviations from plan:** No category is inferred from code, compulsory flag, or any unknown label. The helper preserves input rows once each.
- **Migrations / env / shared contracts:** Backward-compatible additive profile-options field; no schema changes.

## 3. Review

- **Self-review checklist:** Scope is limited to metadata read and helper; query remains bound to verified Clerk user and current profile curriculum; helper has a conservative known-label whitelist; no UI or schema changes.
- **Test evidence:** `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/api/src/modules/profile/repository.test.ts apps/web/src/features/records/subject-groups.test.ts` — PASS, 14 tests. `node node_modules/typescript/bin/tsc -p tsconfig.p001.json` — PASS. Focused ESLint — PASS. `git diff --check` — PASS (Git emitted line-ending notices for unrelated concurrent files).
- **Manual checks:** Inspected existing `subject_category` use in canonical schema and confirmed it is free text, non-null, and there is no enum. No database command used.
- **Defects found and fixes:** None.
- **Review outcome:** PASS — SELF-REVIEW; coordinator review pending.
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-26
- **Type:** Added; Changed; Tests
- **Added / Changed / Fixed:** Added optional `subjectCategory` to subject options and selected curriculum metadata from `curriculum_subject`; added `SubjectGroup`, `SubjectGroups`, `subjectGroupForCategory`, and `groupSubjectsByCategory` helper exports with focused tests.
- **Affected routes / tables / consumers:** `/api/profile/options` subject entries, `curriculum_subject.subject_category`, future records tab integration.
- **Breaking changes / migration steps:** None; field is optional for backward compatibility; no migration.
- **Verification summary:** 14 focused tests, P001 TypeScript check, focused ESLint, and diff whitespace check passed.
- **Outstanding blockers / follow-up:** UI wiring remains with the active UI mini-task. Coordinator review pending.
- **Final status:** READY_FOR_REVIEW
