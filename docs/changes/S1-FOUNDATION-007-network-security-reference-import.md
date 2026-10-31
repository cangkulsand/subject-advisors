# S1-FOUNDATION-007 — Network Security reference importer

- **Status:** READY_FOR_REVIEW — reference data import committed and reconciled on the approved development database; curriculum remains INACTIVE; human peer review pending
- **Date:** 2026-10-31
- **Sprint:** Foundation / shared reference data
- **Owner:** DATABASE_FOUNDATION / integration
- **Related UC / FR:** P001 curriculum/profile options, P002 offerings, P003 pathway/prerequisite display; reference data import
- **Branch / PR:** Current shared development workspace; no PR
- **Reviewer:** Coordinator review passed; human peer review pending

## 1. Plan

### Objective / problem

Implement an offline-first, dry-run-first importer for the reviewed `db/reference-data/network-security/english/manifest.json`. The importer must validate the source, preview an exact explicitly approved development target, apply reference rows atomically after an operator confirms the preview digest, persist an audit receipt, and support a separately gated activation action.

### Scope and requirements

- Offline source validation and pure plan/preview functions; strict CLI parsing; explicit target file and dedicated `DB_FOUNDATION_URL`; reuse the canonical migration helpers; never load app environment files or fall back to `DATABASE_URL`.
- Validate the 79 unique source subjects, 195 pool credits, 128-credit curriculum minimum, 7 exact exclusions, category rules, English labels/provenance, bounded prerequisite expressions, conditions, graph endpoints/cycles, and the explicit legacy code crosswalk.
- Preview and apply must match exact target identity, catalogue state, and manifest; preserve shared subjects; insert only missing shared subjects and new curriculum mappings; persist English display labels and complete prerequisite JSON; do not flatten OR groups into mandatory edges.
- Apply only when migration 0005 is applied without history/checksum drift; perform transactional locks, re-preview/digest comparison, insert-only operations, reconciliation and durable receipt. Create a new programme as ACTIVE and the curriculum as INACTIVE. Implement activation as a separate CLI mode requiring explicit compatibility acknowledgement and readiness checks; executing it is out of scope. Expose an explicit rollback-only core option for later approved shared-target SQL validation, gated by `allowRollbackOnlyTests`; do not invoke it in this mini-task.
- Preserve exact manifest file bytes across Git checkouts because durable receipt hashes are calculated over the raw source file; do not normalize line endings or alter the approved manifest.
- Out of scope: editing source manifest, migrations/schema, application consumers, deployment, credentials, live target reads/writes, schema/import execution, and activation/rollback-only execution in this mini-task.

### Expected files

- `tools/db/import-reference.mjs`
- `tools/db/import-reference.test.mjs`
- `.wrangler/reference-import/rollback-only-validation.mjs` (ignored operator helper, prepared for coordinator review; not executed as part of code implementation)
- This change record.

No dependencies or schema changes are planned. The approved manifest and migration 0005 are inputs owned by parallel work and will not be edited.

### Acceptance criteria

- Manifest validation is offline and rejects malformed counts, credits, categories, names, exclusions, prerequisite trees, conditions, graph references, cycles, and provenance declarations.
- Pure preview planning identifies exact reuse/insert/conflict cases, reports name differences as display overrides, detects duplicate requirement types and legacy-code collisions, and produces deterministic target-bound digests.
- CLI requires explicit target and action, rejects unknown flags, reports sanitized failures, has no implicit credential/target fallback, and provides preview/apply/activate gates.
- Apply code is transaction-scoped, insert-only for shared subjects and curriculum data, checks pending migration/checksum state before writes, persists durable receipt, verifies preserved reference data, and never updates profiles/student data.
- Activation reruns full receipt/target/manifest/curriculum-version/global-credit replay reconciliation under locks before any status change; activation and apply waits are timeout-bounded. CLI binds activation to the exact loaded manifest file hash.
- An explicit rollback-only core call requires `target.allowRollbackOnlyTests === true`, exercises import plus durable receipt SQL in one transaction, then returns `persisted:false` after ROLLBACK; the committing CLI path remains normal apply only.
- The ignored operator helper binds only the approved development project/branch/database, reads `.dev.vars` in memory, saves complete before/after previews plus reference-only counts, and requires rollback-only success with identical post-rollback state. It must not run until coordinator review.
- Offline tests use manifest and isolated fixtures, exercise malformed inputs/conflicts/replay/drift/transaction rollback, and require no database connection.
- Verify with `node --test tools/db/import-reference.test.mjs`, `npm run lint:db`, and `node --check tools/db/import-reference.mjs`.

### Risks, assumptions, rollback, and exclusions

- Shared catalogue identity is code plus credit; names and global flags are preserved. Credit/code or legacy identity conflicts must stop the preview.
- A failed transaction rolls back all changes. Activation is a distinct explicit operation and may only alter this curriculum's status.
- No live database operation or rollback-only path is invoked in this mini-task. Any later shared-target rollback validation requires explicit `allowRollbackOnlyTests` target approval and coordinator review of the actual code.
- Current target approval is explicit but the importer must still require its exact file and dedicated connection environment value.

## 2. Implementation

- **Status:** Import committed and reconciled on the approved development target; curriculum remains INACTIVE. Human peer review pending; activation not run.
- **Files actually changed:** `.gitattributes` (preserve raw source manifest bytes for receipt hashing), `tools/db/import-reference.mjs`, `tools/db/import-reference.test.mjs`, ignored `.wrangler/reference-import/rollback-only-validation.mjs`, ignored `.wrangler/reference-import/apply-approved.mjs`, this change record.
- **Summary:** Added an offline manifest validator, deterministic conflict planner and preview digest; an explicit target CLI for preview/apply/activate; read-only repeatable-read preview; migration-0005 and checksum gates; transaction-scoped locks, insert-only reference import, complete OR-prerequisite JSON retention, mandatory allOf edges, durable receipt, reconciliation, no-op replay, and separately confirmed programme/curriculum activation. Prerequisite expression/text/cell bounds match or are stricter than the shared reader parser. New programmes are inserted ACTIVE while their curriculum is INACTIVE. Existing programme status and shared subject rows are preserved during import. Core apply exposes a sixth `rollbackOnly` options argument that requires target approval, executes the complete transactional path including receipt insert, and finishes with ROLLBACK without reporting a durable receipt. Added an ignored operator helper that loads the exact approved target, holds private connection material only in memory, records before/after previews and reference counts under `.wrangler`, and aborts unless rollback-only execution preserves state.
- **Decisions / deviations:** Source subject names remain as English display labels on every curriculum mapping. Existing shared subjects are reused only by exact code and credit; their global names, status, category, forecast flag and class type are not updated. New subjects use English global names and the schema-required forecast boolean baseline. `anyOf` branches are retained in prerequisite metadata and never converted into mandatory edges. Programme status in the manifest is INACTIVE; the importer creates the new programme as ACTIVE so an inactive curriculum can become selectable later without a permanently inactive programme. Activation only changes this dataset's curriculum and programme plus its import receipt.
- **Migrations / env / shared contracts:** No migration or package change. `.gitattributes` now marks `db/reference-data/**/manifest.json` as `-text` with the same whitespace handling used for checksum-tracked migrations, preserving exact source bytes for receipt hashes across operating systems. CLI calls the existing `validateTarget`, `verifyConnectedTarget`, `loadMigrations`, and `migrationStatus` helpers; it requires explicit `--target-file` and the target's dedicated `DB_FOUNDATION_URL` key. The ignored helper follows the already-reviewed approved-target runner pattern: it reads only `DATABASE_URL` from `.dev.vars` in memory and passes that value as `DB_FOUNDATION_URL` to `validateTarget`; it never prints or persists the URL.

## 3. Review

- **Self-review checklist:** Scope limited to the new importer, offline tests, ignored helpers, `.gitattributes`, and this record; no source manifest, migration, application consumer, target config, or unrelated in-progress file changed. Validation is exact-code/credit and fail-closed for duplicate requirements, existing curriculum pairs, partial replay, source aliases, and mismatched receipts. SQL uses parameters for every data value; apply is transaction-scoped; preview rolls back its read-only transaction; activation is separately gated and scoped. Existing subjects/records are not rewritten; student tables are never queried. The manifest’s Git attributes preserve raw bytes used by the durable source hash.
- **Test evidence:** `node --check tools/db/import-reference.mjs` PASS; `node --check tools/db/import-reference.test.mjs` PASS; `node --check .wrangler/reference-import/rollback-only-validation.mjs` PASS; `node tools/db/import-reference.mjs validate` PASS (79 courses, 195 pool credits, 7 categories); `node --test tools/db/import-reference.test.mjs` PASS (13 tests); `npm run lint:db` PASS; `node .wrangler/reference-import/rollback-only-validation.mjs` PASS (`ROLLBACK_ONLY_VALIDATED`, exact pinned target, 61 reuse / 18 inserts / 79 mappings / 7 requirements, preview SHA `603006a2045f4e463afb39d1eaf8d1979000f0a821a24e016b390c9ffa4cd0a1`, unchanged digest/counts, no receipt persisted).
- **Manual checks:** Inspected the migration helper contracts, source manifest shape, importer transaction boundaries, prepared SQL, CLI target parsing, shared reader parser bounds, and test fixtures. The coordinator-reviewed rollback-only helper exercised reference inserts and durable receipt SQL, then confirmed ROLLBACK, unchanged state and no persisted receipt; evidence is in `.wrangler/reference-import/live-validation/2026-10-31T10-04-39.229Z-5381e361-f73d-40d5-8679-09922d6d02ce`. The normal apply was authorized against the exact approved preview SHA `603006a2045f4e463afb39d1eaf8d1979000f0a821a24e016b390c9ffa4cd0a1` and manifest SHA `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`. It inserted programme ID 7 (ACTIVE), curriculum ID 3 (English, 128 credits, effective year NULL, INACTIVE), 18 subjects and 79 curriculum mappings; reused 61 existing subjects; created 7 requirements and 26 mandatory prerequisite edges; and persisted one receipt. Final reference counts are 96 subjects, 157 curriculum mappings, 12 requirements, 55 prerequisite edges and 1 import receipt. Fresh read-only replay preview SHA is `0a0e0e1fd16931b662993aa4b82f085febd7b3812fc02f62538776acf0e5209d`, with `replayNoop=true` and zero conflicts. The existing SECJ curriculum remains ID 1, version `1`, 131 credits, effective year 2020. Local receipt and evidence are in `.wrangler/reference-import/committed/2026-10-31T10-11-10.071Z-3c36c3da-eced-47f8-bd66-e80df2a19b72`; receipt SHA-256 is `1b23ff59cf4ad10e917c4e0becc910745ba0dee2c5e1930e5b09043ca6e0fca1`. A first apply-wrapper attempt stopped before database writes due to a duplicate exclusive evidence-file creation; baseline was confirmed unchanged, the duplicate call was removed and reviewed, and the approved retry committed and reconciled successfully. No activation or deployment was run.
- **Defects found and fixes:** Adjusted validator to preserve the manifest's actual name-provenance and prerequisite shapes; corrected fixture assumptions to account for existing baseline rows; made preview digest use exact source-file bytes in CLI workflow; activation now rechecks exact target, manifest hash, curriculum version, global credit reuse, complete receipt and mappings under table locks; JSON activation value parameter is explicitly cast; transaction timeouts now precede advisory-lock acquisition; rollback-only mode is approval-gated and nonpersistent.
- **Review outcome:** PASS — self-review and coordinator review of importer, rollback helper, apply helper and saved preview; approved normal apply committed and passed fresh reconciliation. Human peer review pending. Curriculum activation remains a separate operation and was not run.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Added
- **Actual changes:** Added offline manifest validation, deterministic preview planning, explicit-target CLI gates, atomic insert-only importer logic, durable receipt/replay checks, separately gated activation, offline tests, and this record.
- **Compatibility/impact:** No schema or migration edits. Requires migration 0005 before apply/activation; importer leaves the curriculum inactive until a separate readiness-gated action. The new programme is active to make later curriculum activation meaningful.
- **Verification:** Offline validation, 13 offline tests, Node syntax checks, `npm run lint:db`, rollback-only rehearsal, authorized normal apply and fresh replay reconciliation passed. Durable receipt persisted; new curriculum is INACTIVE and existing SECJ reference data was preserved. `git check-attr` reports `text: unset` and `whitespace: cr-at-eol,-blank-at-eof` for the manifest, and `git hash-object --path=...` equals `git hash-object --no-filters` (raw manifest SHA-256 remains `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`).
- **Outstanding items:** Human peer review and any future activation after consumer/readiness checks.
- **Status:** READY_FOR_REVIEW
