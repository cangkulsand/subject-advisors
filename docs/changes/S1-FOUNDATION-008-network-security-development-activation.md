# S1-FOUNDATION-008 — Activate Network Security in development

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 1
- **Owner:** FOUNDATION
- **Related UC / FR:** UC03, UC04, UC08, UC17; shared curriculum reference
- **Branch / PR:** Shared development workspace; no PR created
- **Reviewer:** Coordinator review passed for guarded execution; human peer review pending

## 1. Plan

### Objective / problem

Activate the already imported SECRH English curriculum on the explicitly authorized development database so compatible development readers can select it.

### Scope and requirements

- In scope: Activate the approved development target, pin the reviewed manifest SHA-256, acknowledge reader compatibility, preserve importer reconciliation/readiness/locking gates, and independently verify programme, curriculum, and receipt state.
- Out of scope: Production, deployment, migrations, manifest/source edits, student or account data, unrelated curricula, and commits.

### Proposed implementation

- Expected files: This change record; ignored activation/preflight SQL and helper files plus sanitized evidence under .wrangler/reference-import/activation/.
- APIs / database / interfaces: Existing importer CLI first; due local PostgreSQL network denial, a coordinator-reviewed, single guarded Neon SQL block equivalent to the activation transaction.
- Dependencies / shared-file impact: Approved development project/branch/database, matching import receipt, current migration history, and reviewed readers.

### Acceptance criteria

- [x] SECRH English curriculum is ACTIVE on the exact approved development target, with the manifest-matched receipt updated.
- [x] Offline importer reconciliation and readiness checks pass before the guarded update.
- [x] Verify target identity, curriculum status, receipt status and stable reference row counts after the update.
- [x] Inspect legacy SECJ state without applying corrective writes.

### Verification plan

- Review helper and target binding before invocation.
- Validate raw manifest SHA, full migration hashes, import replay plan and reference readiness offline.
- Execute only the reviewed, pinned, guarded SQL once through Neon on the exact development branch.
- Run scoped read-only verification of SECRH and SECJ; capture sanitized evidence.

### Risk / assumptions / rollback

- Risks: Persistent development-database status update; SQL must fail closed on target, snapshot, receipt, migration or readiness drift.
- Assumptions / blockers: User explicitly authorized activation. Local Node PostgreSQL access is denied by the sandbox (EACCES); Neon MCP can access the approved target.
- Rollback: Guarded DO statement is atomic and raises on any failed assertion. No compensating write was issued.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** This tracked record; ignored local artifacts under .wrangler/reference-import/activation/.
- **Summary:** The existing importer CLI invocation returned generic IMPORT_REFERENCE_FAILED; a separate local read-only connection check returned EACCES. Captured the full reference catalogue and migration state through Neon read-only access, validated the pinned manifest, importer replay reconciliation, all six migration hashes, and expected 79 mappings / 7 requirements / 26 prerequisite edges offline. The coordinator-reviewed guarded SQL ran once on the pinned development branch and returned successfully. Independent read-only verification confirmed SECRH programme 7 and English curriculum 3 are ACTIVE, 128 credits, effective year NULL, with receipt activation fields set.
- **Decisions / deviations from plan:** Because the sandbox denied direct PostgreSQL sockets, used the reviewed Neon SQL fallback with a strict full-catalogue snapshot hash inside the same locked DO block; existing importer source was not changed.
- **Migrations / env / shared contracts:** No migration, source manifest, environment, or application contract changes. Credential was not emitted.

## 3. Review

- **Self-review checklist:** Scope limited to SECRH activation. SQL pins project, branch, database, manifest, receipt, row IDs and readiness; uses advisory and table locks, exact snapshot SHA comparison and row-count assertions. Only SECRH programme/curriculum and its receipt are explicitly updated.
- **Test evidence:** No application test suite run; importer implementation was unchanged. node --check passed for the activation and offline-preflight helpers. Offline preflight passed: pinned source hash, six migration hashes including 0005, clean replay plan and 79/7/26 readiness. Guarded Neon SQL returned content: [] without error. Read-only verification confirmed ACTIVE curriculum and receipt plus global counts of 2 programmes, 2 curricula, 96 subjects, 157 mappings, 12 requirements and 55 prerequisite edges.
- **Manual checks:** Exact Neon target identity matched. SECJ curriculum 1 remains version 1, 131 credits, effective year 2020, status NULL, with 78 mappings, 5 requirements and 29 prerequisite edges. SECJ programme 5 was NULL in the preflight snapshot but read as ACTIVE afterward; its current xmin is 150540 while the SECRH activation curriculum and receipt xmin are 150539, and SECJ curriculum xmin remains 6227. This is consistent with a separate subsequent programme-row write, but the cause is unverified. No corrective write was made. No user-defined triggers on programme/curriculum were found.
- **Defects found and fixes:** Direct CLI access was blocked (EACCES); switched to the reviewed Neon fallback. The SECJ programme status discrepancy was recorded for review and left untouched.
- **Review outcome:** PASS — coordinator-reviewed guarded SQL and runtime verification; human peer review pending.
- **Human reviewer / approval:** Coordinator reviewed and authorized the exact fallback. Human peer review pending.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Changed
- **Added / Changed / Fixed / Removed:** Activated the SECRH English curriculum and updated its import receipt on the approved development target using a guarded Neon transaction.
- **Affected routes / tables / consumers:** public.programme, public.curriculum, migration_meta.reference_data_imports; curriculum consumers can now see SECRH as ACTIVE.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Offline preflight passed; guarded SQL executed once; read-only verification confirms SECRH and receipt ACTIVE with expected IDs, credits, manifest and counts.
- **Outstanding blockers / follow-up:** Human peer review pending. SECJ programme status changed from captured NULL to observed ACTIVE in a later row version; cause unverified and no correction attempted.
- **Final status:** READY_FOR_REVIEW
