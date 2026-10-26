# DB-FOUNDATION-001 — Initial 26-entity schema baseline

- **Status:** APPLIED / SQL-VALIDATED on shared Neon development branch; independent review pending
- **Owner:** DATABASE_FOUNDATION (explicit user designation)
- **Date:** 2026-10-24
- **Updated:** 2026-10-26
- **Scope:** SRS/SDD v2.0, entire database; no application features.
- **Branch / review:** main with untracked user material preserved; peer review pending.

## PLAN

### Objective and current state
Create/review a single versioned 26-entity database foundation, SQL verification,
behavior tests, ERD and contracts shared by all four programmers.
Read databaseimplementation.md (573 lines) and implementationguide.md completely.
Inspected Git status and database consumers. Existing P004 UUID migration is already
applied to an app database; untracked P002 code proposes UUID foreign keys. New guide
and SRS model propose INTEGER IDs. Preserve existing data and do not silently cast IDs.
The named 0001_initial_schema.sql and 001_schema_verification.sql were not present
at inspection; record any newly authored files as reconstructed, not reviewed supplied SQL.

### Source and decisions
Newly supplied source: docs/UTMSPACE_SRS_SDD_v2.0_Formatted_Technical_Diagram_Titles (2).docx.
Extract/read the data dictionary and relevant requirements; compare all 26 entities and
fields against Appendix A. Keep exactly 26 domain tables. Migration bookkeeping is
technical metadata in a separate schema, not a 27th SRS entity.
Document source decisions, source deviations, legacy UUID compatibility, unresolved academic
policies and production freeze blockers before claiming an approved schema.
If authoritative SQL bundle appears, inspect and preserve it before making changes.

### Proposed implementation and files
- db/migrations/0000_preserve_legacy_p004.sql, 0001_initial_schema.sql and
  0002_copy_legacy_access.sql: ordered, forward-only preservation and baseline.
- db/migrations/manifest.json and tools/db/: one checksum-tracked workflow.
- db/checks/001_schema_verification.sql, 002_behavior_tests.sql and
  003_role_boundary_tests.sql.
- db/erd/schema.mmd, docs/database/schema-decisions.md, data-contracts.md, migration
  runbook and actual verification evidence.
- Static/unit tests for migration gating, order/checksums and exact schema inventory.
- Minimal package scripts/dependencies needed for database-only tooling.
- Minimal corrections to README.md, docs/p004-local.md and docs/p004-auth-handoff.md
  so shared setup instructions point to the canonical workflow.
Preserve the historical P004 migration byte-for-byte; exclude superseded feature DDL
from the canonical manifest. Do not modify the user's untracked P002 implementation.
No UI, APIs, authentication screens, forecasting algorithms, real catalogue seeds,
privileged-user provisioning, Git commits/pushes or production changes.

### Safety, migration and rollback
Do not load/connect the app DATABASE_URL as a default migration target.
Require an explicitly selected disposable/local/confirmed Neon development target.
Initial execution was gated pending target confirmation; Docker's daemon was unavailable.
The user subsequently confirmed the configured Neon ID as safe on 26 October and
selected development as its shared name (formerly p004-local).
Only that confirmed development target is authorized; no production default is allowed.
Runner must verify target, forbid accidental existing-schema bootstrap, use transaction
and advisory locking, record checksums exactly once, detect drift and fail closed.
Existing populated databases require an explicitly reviewed forward reconciliation;
never reset/drop/recreate them to make baseline migration pass.
Behavior fixtures are synthetic and transaction-rolled-back; no real student data.

### Acceptance and verification
Compare 26-table/column/PK/FK/type/nullability manifest with source; verify keys/checks,
role enforcement boundaries, owner/curriculum isolation and prerequisite cycles;
test invalid inserts, audit immutability, forecast version/lineage and finalized-run
read-only payloads. Check concurrency-sensitive boundaries and clearly distinguish
database constraints from Worker authorization.
Run actual PostgreSQL migration/checks only after safe-target approval and capture
sanitized results. Run relevant repo checks for tooling changes.
Publish schema/ERD, migration order, decisions and per-programmer handoff.
Missing source, approvals or official policies remain explicit blockers; no fabricated pass.

## IMPLEMENTATION
Implemented the source contract, 26-table baseline, preservation migrations,
verification SQL, rollback-only behavior fixtures, gated migration runner, static
review/unit tests, full Mermaid ERD, exhaustive field mapping, decisions, runbook
and handoff contracts for P001–P004. The initial/check SQL files were absent, so
they were newly authored from the supplied source rather than reviewed as supplied SQL.

The source inventory is 26 entities, 171 columns and 39 explicit foreign keys.
Migration history and legacy UUID mapping use the separate migration_meta schema.
The three canonical versions execute atomically with advisory locking and SHA-256
history; replay skips applied versions and rejects unknown/changed history.
Existing P004 access data is preserved in an archive and mapped to canonical
INTEGER IDs; this path requires explicit adoption approval and is not live-tested.
No destructive reset is provided. The historical P004 migration remains unchanged.

The runner requires a dedicated DB_FOUNDATION_* credential variable plus a target
file approving schema creation and matching the connected database/Neon IDs.
It never defaults to the application's DATABASE_URL. Read-only inspection reported
Neon project still-waterfall-91972583, branch br-shy-cherry-azuzy9v5, database neondb,
with only the historical UUID user_access_assignment table in public. The user then
explicitly confirmed that ID as p004-local, safe for schema creation, and selected
development as its new shared name. The ignored approved target file was bound to
the exact project/branch/database and verified against live server settings.
All three versions applied in one transaction. The original access row was saved
privately before adoption and compared afterward: UUID archive, canonical
identity/role/status/timestamps and key mapping all matched. Migration replay
applied no versions. The applied SQL/checksums are now frozen.

Decisions D01–D24 explicitly cover source anomalies, integer/UUID compatibility,
timestamp mapping, added uniqueness/immutability policies and authorization boundaries.
In particular, the source leaves 36 non-PK fields' nullability unspecified; the
chosen NOT NULL baseline is documented as a review decision, not a source requirement.
Database ownership bypass and trusted-service actor authorization remain deployment
boundaries. Runtime least-privilege grants and human policy review are pending.

No application feature code, untracked P002 code, real seeds, privileged-user
provisioning, commit, push or deployment was performed.
The test-only NOLOGIN role and limited grants were created and rolled back; no
runtime/application role was provisioned. Temporary fixtures left zero rows behind.

## REVIEW
Static/self-review completed; independent human review remains pending.
Actual commands/results:

- `npm.cmd run db:review`: PASS; source hash matches, inventory 26/171/39,
  PostgreSQL 18 SQL and PL/pgSQL parser checks pass. This is not database execution.
- `npm.cmd run test:db-tooling`: 12 PASS; mocked migration safety/history/rollback
  checks and static source/SQL checks, not PostgreSQL integration tests.
- `npm.cmd run lint:db`: PASS.
- `npm.cmd test`: 47 PASS, 5 optional historical database tests SKIPPED.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: PASS.
- `git diff --check`: PASS; only Git line-ending conversion notices.
- `node .wrangler/db-foundation/run-approved.mjs status`: initially pending 0000–0002.
- `node .wrangler/db-foundation/run-approved.mjs migrate`: applied 0000/0001/0002.
- `node .wrangler/db-foundation/run-approved.mjs verify`: live inventory PASS.
- `node .wrangler/db-foundation/run-approved.mjs test`: 68 PASS, 0 SKIP
  (59 behavior assertions and 9 actual non-owner role-boundary assertions).
- Repeated `migrate`: applied []; checksum/history replay PASS.
- Final read-only preservation/cleanup assertions: one original access row and key
  mapping preserved; zero synthetic rows and no test probe role remain.

The SQL inventory check covers all source columns/keys plus named CHECK/UNIQUE
constraints, triggers, indexes and PUBLIC privileges. The behavior suite covers
valid/invalid inserts, roles, curriculum/ownership isolation, prerequisite cycles,
audit immutability, import snapshots, forecast lineage and finalized payloads.
The first behavior execution exposed an incorrectly escaped synthetic JSON literal
(22P02); the transaction rolled back. Corrected the fixture and reran successfully.
Applied migrations were not changed. The role-boundary suite uses a temporary
NOLOGIN role to test default denial and explicit reader permissions, not production
runtime-role provisioning. Detailed commands/evidence are in docs/database/verification.md
and sanitized server results in docs/database/development-application-2026-10-26.json.

Multi-session competing-write races, a second fresh-empty PostgreSQL target,
deployed Worker integration against this baseline and actual runtime-role grants
remain untested. Institutional decisions and independent review remain open.
This is a validated development baseline, not a production readiness claim.

## CHANGELOG
2026-10-24 — Plan created before implementation. Existing files and live app DB preserved.

2026-10-24–26 — Reconciled supplied DOCX; authored canonical migrations, SQL checks,
runner/tracking, source contract, ERD and programmer handoffs. Completed static,
tooling and existing application checks. Read-only metadata inspected; no migration
or database behavior suite executed. Recorded live execution BLOCKED pending the
selected development branch's ID confirmation; no commit or push.

2026-10-26 — User confirmed the exact Neon branch as shared p004-local, then selected
development as its new name and will rename it in Neon. Applied 0000–0002 atomically,
preserved existing access data/UUID history, verified live inventory and no-op replay.
Fixed JSON in a behavior fixture; 68 SQL behavior/role checks passed. Confirmed all
fixtures and the test role rolled back. Updated shared setup, decisions and handoffs;
applied migration bytes/checksums frozen. No production changes, commit or push.
