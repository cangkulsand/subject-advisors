# S1-FOUNDATION-006 — Network Security reference data schema support

- **Status:** READY_FOR_REVIEW — migration applied; coordinator review passed; human peer review pending
- **Date:** 2026-10-31
- **Sprint:** Sprint 1 / Foundation
- **Owner:** DATABASE_FOUNDATION
- **Related UC / FR:** Shared reference catalogue and database migration tooling; no new student-facing SRS domain entity
- **Branch / PR:** Current workspace branch; no PR
- **Reviewer:** Coordinator review passed; human peer review pending

## 1. Plan

### Objective / problem

Add additive schema support for curriculum-specific English display names, complete structured prerequisite metadata, and private durable receipts for a future reference-data import. Preserve the frozen 26-entity / 171-source-attribute SRS contract and existing records.

### Scope and requirements

- In scope: forward migration `0005_network_security_reference_support.sql`; migration manifest registration; engineering-extension registration for the two `curriculum_subject` columns (no new public domain entity); schema verification allowances for exactly these additive columns; read-only database check `007_network_security_reference.sql`; review CLI registration; static migration tests for version/checksum and destructive-write boundaries; application of only 0005 to the explicitly approved exact development target after verifying migration history; read-only post-apply verification; change record.
- Out of scope: any database target other than the explicitly approved development project/branch/database; importer or reference data writes; application/API/UI consumers; curriculum data import/activation; production, deployment, commits; edits to migrations `0000`–`0004` or `db/schema-contract.json`. The existing approved runner may read `.dev.vars` in memory solely to bind its dedicated migration credential; it must not print or modify that value.

### Proposed implementation

- Expected files: `docs/changes/S1-FOUNDATION-006-network-security-reference-support.md`, `db/migrations/0005_network_security_reference_support.sql`, `db/migrations/manifest.json`, `db/engineering-extensions.json`, `db/checks/001_schema_verification.sql`, `db/checks/007_network_security_reference.sql`, `tools/db/review.mjs`, `tools/db/cli.mjs`, `tools/db/migrations.test.mjs`.
- APIs / database / interfaces: Add nullable `curriculum_subject.display_name varchar(255)` with nonblank-if-present check and nullable `prerequisite_details jsonb` with an object/shape check requiring `expression` (JSON null allowed), `conditions` array, `fixedCourseEdgesShown` boolean, and `sourcePrerequisiteStatus` string. Add private `migration_meta.reference_data_imports` receipt table with the specified dataset/curriculum/hash/manifest/receipt/import timestamp fields and checks. Revoke PUBLIC schema/table privileges. No app consumer is changed in this mini-task.
- Dependencies / shared-file impact: Static tooling must preserve exactly 26 baseline public domain entities and 171 source-contract columns while recognizing exactly two additive columns on `curriculum_subject`; audit table belongs to migration metadata and is not an SRS entity.

### Acceptance criteria

- [x] Migration 0005 is additive, includes no writes or deletes to current public rows, and preserves nullable legacy behavior.
- [x] Manifest and engineering extension inventory register 0005 and both CS columns with purpose; schema contract remains unchanged.
- [x] Schema verification allows exactly the two approved curriculum_subject additions while still checking the frozen 171 source attributes.
- [x] New read-only SQL verification checks both columns, no defaults, audit table shape/constraints, and PUBLIC privilege revocations.
- [x] Static review/CLI parses and registers check 007; migration tests reject destructive/unexpected writes and assert version 0005.
- [x] `node --test tools/db/migrations.test.mjs`, `npm run db:review`, `npm run lint:db`, and SQL check parse all pass.
- [x] The approved runner applied only 0005 to the exact approved development target after confirming 0000–0004 applied and 0005 pending; runner verification passed; aggregate post-apply checks show all existing mappings remain NULL in both new fields.

### Verification plan

- Run the three requested commands above.
- `db:review` must parse all migration/check SQL and report the frozen baseline plus additive extension counts.
- After authorized application, verify target identity, migration history/checksum, extension checks, and counts only; do not read or print student data.
- Confirm scoped whitespace checks and verify files 0000–0004/checksums and schema-contract remain unchanged.

### Risk / assumptions / rollback

- Risks: widening schema verification too much could hide accidental changes to the frozen baseline; PUBLIC access to metadata would expose operational receipts; extension registration could incorrectly count metadata as a public entity.
- Assumptions / blockers: migration_meta schema is provisioned by existing migration tooling/baseline; new receipt table is technical metadata only. Future runtime/importer validation must recursively validate prerequisite expressions.
- Rollback: migration has no data backfill and is transaction-runner-owned. A failed migration rolls back atomically. A post-application rollback would require a separately reviewed compensating migration; this task applies nothing.

## 2. Implementation

- **Status:** Implemented and applied to the explicitly approved development target
- **Files actually changed:** `db/migrations/0005_network_security_reference_support.sql`; `db/migrations/manifest.json`; `db/engineering-extensions.json`; `db/checks/001_schema_verification.sql`; `db/checks/007_network_security_reference.sql`; `tools/db/review.mjs`; `tools/db/cli.mjs`; `tools/db/migrations.test.mjs`; this change record.
- **Summary:** Added two nullable curriculum_subject metadata fields and validated shape/nonblank checks, plus a private technical receipt table with strict dataset/hash/JSON/key constraints and PUBLIC revocations. Registered migration 0005 and its two columns without adding a public SRS entity. Schema verification preserves the 171-column frozen source baseline and permits exactly the one existing 0003 profile extension plus the two named 0005 mapping extensions. Added a read-only verification check and included it in CLI verification and static SQL review. Added static migration inventory and no-destructive-write assertions. Applied only migration 0005 to approved development project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`.
- **Decisions / deviations from plan:** Kept the audit table in the existing migration_meta schema; did not add it to engineering public-table inventory. `reviewSchema` now reports source-contract and engineering-extension column counts separately (171 and 2).
- **Migrations / env / shared contracts:** Migration 0005 is applied to approved development project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`; versions 0000–0005 are applied with none pending. The existing approved wrapper read `.dev.vars` only in memory to bind `DB_FOUNDATION_URL`; the URL was never output and the file was not changed. `db/schema-contract.json` and migrations/checksums 0000–0004 remain untouched.

## 3. Review

- **Self-review checklist:** PASS for scoped migration/tooling and authorized application; frozen 26-table/171-column source contract remains separately counted; migration adds no current-row DML; both added columns are nullable with no defaults; receipt metadata is private; verification ran transactionally read-only; no reference data or student data was written.
- **Test evidence:** `node --test tools/db/migrations.test.mjs` — PASS (13 tests). `npm run db:review` — PASS (26 domain tables; 171 source-contract columns; 2 registered extension columns; SQL/PLpgSQL checks parsed; static review did not execute the database). `npm run lint:db` — PASS. Approved runner status before application confirmed applied `0000`–`0004`, pending `0005`; migrate applied only `0005`; verify passed with 26 domain tables, 171 columns, 39 source FKs; post-application status is applied `0000`–`0005`, no pending migrations. Repository-wide `git diff --check` reported concurrent unrelated trailing whitespace at `packages/shared/src/offerings/offerings.ts:67`; scoped task-file whitespace checks passed.
- **Manual checks:** Exact project, branch, database, and Neon identity were validated by the existing approved wrapper before each operation. Migration checksum recorded as `ac58ab7856291e60a7b4175d370c6514679870d03c911cbf2b22e4abc6654cc8`. Read-only counts from ignored SQL evidence `.wrangler/db-foundation/verify-0005-post-apply.sql`: programme 1; curriculum 1; subject 78; curriculum_subject 78; curriculum_requirement 5; subject_prerequisite 29; subject_semester_rule 0; import receipts 0. All 78 existing mappings have NULL `display_name` and NULL `prerequisite_details`; mappings with either new field non-NULL: 0. These are existing catalogue counts only, not source-to-target equivalence counts; no catalogue/reference rows were written by this mini-task. Confirmed 0000–0004 migration files and `db/schema-contract.json` have no diff.
- **Defects found and fixes:** Coordinator review identified that PostgreSQL CHECK accepts NULL, so missing JSON metadata keys could evade the original predicate. Updated the shape check to require all four keys with `?& ARRAY[...]`; JSON null remains allowed for `expression`, while the other values must have their required JSON types. Added a static regression assertion for required-key presence.
- **Review outcome:** PASS — COORDINATOR REVIEW; human peer review pending.
- **Human reviewer / approval:** Pending human peer review; coordinator review is not recorded as human approval.

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Added
- **Added / Changed / Fixed / Removed:** Added forward migration `0005`, registered its two curriculum_subject extensions, private reference import receipt schema, read-only SQL verification, tooling integration, and static migration regression checks.
- **Affected routes / tables / consumers:** `curriculum_subject` and private `migration_meta.reference_data_imports`; no app routes or consumers changed.
- **Breaking changes / migration steps:** Additive migration 0005 applied to the exact approved development target. Existing rows remain NULL in new fields.
- **Verification summary:** 13 migration tooling tests passed; `db:review`, `lint:db`, target-bound migration verify, post-migration status, and approved read-only count/checksum queries passed. No curriculum or student data was written.
- **Outstanding blockers / follow-up:** Importer/runtime validation and reference-data import remain later tasks. Human peer review is pending.
- **Final status:** READY_FOR_REVIEW — migration applied; coordinator review passed; human peer review pending
