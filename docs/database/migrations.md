# One versioned database workflow

The authoritative ordered manifest is db/migrations/manifest.json.
Use npm db:* commands for all future schema work. Do not run dated feature migrations
alongside this baseline. The old P004 file is historical evidence only.

## Migration order

1. 0000_preserve_legacy_p004.sql: no-op on empty databases; preserve only the exact,
   explicitly approved P004 UUID table in migration_meta on a legacy target.
2. 0001_initial_schema.sql: creates the 26 canonical INTEGER-keyed domain tables,
   constraints, indexes and integrity triggers.
3. 0002_copy_legacy_access.sql: copies access by Clerk identity, preserving roles,
   suspension and timestamps; retains original UUID-to-INTEGER mappings.

All pending versions and their checksum records commit in one transaction, with a
transaction advisory lock. Failure rolls back the entire batch, including legacy DDL.
Repeated runs do not reapply versions. Changed/missing/unknown checksums fail closed.
Versions 0000–0002 were applied to development on 26 October 2026 and are frozen.
Add 0003_... for subsequent schema changes; never edit applied migration files.

.gitattributes preserves migration bytes across operating systems. Do not normalize
line endings of applied SQL: that changes its recorded SHA-256 and must be rejected
as migration drift. The historical dated P004 source keeps its prior text handling.

Technical tables are in migration_meta: schema_migrations, legacy_access_id_map,
and legacy_user_access_assignment only when adoption is needed. They do not change
the 26-entity public model. Metadata has no PUBLIC grants.

## Target approval

The runner does not load app .env files and never defaults to DATABASE_URL.
Supply a dedicated DB_FOUNDATION_URL and an ignored explicit target file:

  npm.cmd run db:review
  npm.cmd run test:db-tooling
  npm.cmd run db:status -- --target .wrangler/db-foundation/target.json
  npm.cmd run db:migrate -- --target .wrangler/db-foundation/target.json
  npm.cmd run db:verify -- --target .wrangler/db-foundation/target.json
  npm.cmd run db:test -- --target .wrangler/db-foundation/target.json

Copy db/target.example.json only after actual approval. Set development:true,
approvedForSchemaCreation:true and approvedBy to the real decision.
Local targets must be disposable loopback databases named utm_db_foundation_*.
Neon targets require kind:neon-development, exact host/port/database/projectId/branchId
and encrypted transport. The connected PostgreSQL IDs must match the target file.

The user selected `development` as the shared Neon branch name on 26 October 2026
(renaming the approved p004-local branch):
project still-waterfall-91972583, branch br-shy-cherry-azuzy9v5, database neondb.
The connected IDs were checked and versions 0000–0002 applied successfully.
Other developers must bind their private target file/credential to these exact IDs;
the runner must not guess or connect production.
allowLegacyP004Adoption:true is required for the known existing P004-only table.
Any other existing schema is rejected for separate forward migration design.

Only db:status is read-only metadata inspection. db:verify runs in a READ ONLY
transaction. db:test additionally requires allowRollbackOnlyTests:true and runs only
synthetic fixtures inside BEGIN/ROLLBACK. Tests can advance identity sequences even
though rows roll back; use only the explicitly approved development target.

## Existing data and recovery

Do not reset, truncate, drop, overwrite or silently cast existing account IDs.
Adoption keeps the UUID archive and an explicit key map. If other feature schemas or
foreign references already exist, stop and design a forward reconciliation.
A failed batch rolls back. After successful adoption, reversal requires a reviewed
forward fix/restore plan, not an automatic destructive down migration.

Do not use app-level snapshots or schema_migrations alone as a data backup. Before
adopting shared populated environments, the operator must verify recovery procedures.
No production execution or official data import is authorized by this runbook.

## SQL checks

001_schema_verification.sql asserts table/field types/nullability/PK/FK/unique structure,
enabled triggers, valid indexes and absence of PUBLIC table grants.
002_behavior_tests.sql uses synthetic, rollback-only fixtures for valid/invalid writes,
attempts, curriculum isolation, audit immutability, source snapshots, forecast lineage
and frozen finalized payloads. Its result rows distinguish PASS from SKIP.
Last-admin removal is skipped if existing non-test admins would invalidate the test;
existing accounts are never altered to force a passing test.

003_role_boundary_tests.sql creates a NOLOGIN probe role and limited access-reader
grants inside BEGIN/ROLLBACK. It verifies denied access to cohorts, migration metadata,
role/audit writes, internal helpers and trigger-disabling DDL; explicit reader grants
are also tested. The development operator needs CREATEROLE. A pre-existing probe role
causes failure rather than being dropped/reused. The role, membership and grants roll
back; these tests do not provision production/runtime service roles.

DB schema tests do not prove Clerk authentication, owner authorization or service-level
actor audit coupling. Existing auth unit tests verify those implemented API guards;
future privileged services need their own end-to-end and concurrent tests.
