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
4. 0003_profile_current_semester.sql: adds nullable `student_profile.current_semester_id`
   referencing `academic_semester.semester_id` with `ON DELETE RESTRICT`; no existing
   profile is backfilled and no default is assigned.
5. 0004_multi_role_access.sql: explicit role memberships and immutable role history.
6. 0005_network_security_reference_support.sql: nullable curriculum reference metadata
   and private import receipts.
7. 0006_admin_user_management.sql: pending invitations and access-status auditing.
8. 0008_admin_academic_setup.sql: faculty/programme links, centre activation, explicit
   system current semester, coordinator assignment history and immutable academic audit.
   This branch's manifest intentionally skips absent 0007 for isolated local testing only.
9. 0010_department.sql (applies after 0009): additive `department` table (faculty -> department -> programme),
   nullable `programme.department_id`, faculty-consistency and department-move guards, and audit coverage of
   department rows; static check `db/checks/015_department.sql`. No department rows are seeded.
10. 0011_student_programme_change.sql (applies after 0010): admin-controlled student programme change. Adds only
   `migration_meta.programme_change_context`, `public.db_change_student_programme(student_id, curriculum_id)` and a
   replaced `db_preserve_membership()` whose student-curriculum guard stands aside inside that function (same
   transaction-context pattern as `db_set_current_semester`); no public table or column. The change is audited in
   `academic_setup_audit_log` (`entity_type='student_programme'`). Static check
   `db/checks/016_student_programme_change.sql`.
11. 0012_programme_curriculum_admin.sql (applies after 0011): admin programme and curriculum maintenance. No table or
   column added; sets NULL `curriculum.status` to ACTIVE, audits programme/curriculum changes made under an admin actor
   context in `academic_setup_audit_log` (importer writes without context stay unaudited) and rejects creating a
   curriculum under an inactive programme (`REFERENCE_INACTIVE`). Static check
   `db/checks/017_programme_curriculum_admin.sql`.

### Academic setup integration gate (0008)

The disposable local runner applies exactly 0000-0006 plus 0008, with the numeric gap
accepted. Migration 0008 does not reference forecast tables from 0007. This standalone
history proves local compatibility; it does not authorize applying this branch's manifest
to shared development. Integrate the forecast owner's exact 0007 bytes/checksum and
ordered manifest prefix first, then 0008, then Package B 0009. Verify target identity and
the complete applied prefix/checksums before shared `db:migrate`; changed, missing or
unknown applied versions must fail closed. Never insert a sentinel version, rewrite an
applied checksum, edit historical SQL or reset metadata to bypass the gate. If numbering
must change, resolve it with the integration owner before any shared application.

0008 seeds no catalogue, faculty mapping or current semester. Existing centres become
active; programme faculty remains nullable; current markers default false. A partial
unique index enforces zero or one current semester. `public.db_set_current_semester(integer)`
returns void, serializes switches and audits one transition; the repository reads back
the selected row in the same transaction. All academic writes require transaction-local
`app.access_actor` and `app.access_reason` from the verified backend actor and normalized
reason. Coordinator assignments are ended rather than deleted; audit is append-only.
Runtime permission grants require separate reviewed configuration; the migration revokes
PUBLIC privileges and does not provision service roles.

All pending versions and their checksum records commit in one transaction, with a
transaction advisory lock. Failure rolls back the entire batch, including legacy DDL.
Repeated runs do not reapply versions. Changed/missing/unknown checksums fail closed.
Versions 0000–0002 were applied to development on 26 October 2026 and are frozen.
Version 0003 is the profile-owned current-semester extension. Never edit applied
migration files; add a new forward version for subsequent schema changes.

.gitattributes preserves migration bytes across operating systems. Do not normalize
line endings of applied SQL: that changes its recorded SHA-256 and must be rejected
as migration drift. The historical dated P004 source keeps its prior text handling.

Technical tables are in migration_meta: schema_migrations, legacy_access_id_map,
legacy_user_access_assignment only when adoption is needed, and the 0008 private
academic_switch_context helper. They do not change
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

Networks that block PostgreSQL port 5432 (for example the UKM campus network, which
resets the connection with ECONNRESET) can add --websocket to status, migrate, verify or
test. The same commands then run over the Neon WebSocket driver on port 443 with identical
target validation, checksums and migration records. It is allowed only for
kind:neon-development targets:

  npm.cmd run db:status -- --target .wrangler/db-foundation/target.json --websocket

The runner never reads env files, so load DB_FOUNDATION_URL into the shell first (it
is kept in the ignored .wrangler/db-foundation/neon-dev.env). When a check script raises
an error, the output names the check file and its message.

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

001_schema_verification.sql asserts the frozen 26-table/171-column/39-source-FK
baseline, enabled triggers, valid indexes and absence of PUBLIC grants. It narrowly
allows the registered engineering tables/columns, including the 0008 additions;
004_profile_current_semester.sql
asserts the exact 0003 nullable integer, no-default field and validated FK target and
delete action. The baseline schema contract and migrations 0000–0002 remain unchanged.
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

012_admin_academic_setup.sql raises on incorrect 0008 columns/defaults, restrictive
FKs, partial unique indexes, enabled triggers and PUBLIC privileges.
013_admin_academic_setup_behavior.sql exercises rollback-only academic mutations.
`node tools/admin/test-academic-database.mjs` creates a fresh loopback PostgreSQL cluster,
applies the isolated manifest, runs structural/behavior checks, the concrete repository
suite and two-session lock-observed races, then stops the cluster in `finally`. It never
reads `.dev.vars` or application `DATABASE_URL`. Prepared binaries default to
`.wrangler/multi-role-postgres/node_modules/@embedded-postgres/windows-x64/native/bin`;
`MULTI_ROLE_POSTGRES_BIN` can select an existing compatible binary directory. The runner
does not install/download PostgreSQL. Repository tests use only the runner-provided
`ACADEMIC_TEST_DATABASE_URL`, guarded to loopback `utm_db_foundation_*_test` targets,
and wrap fixtures in rollback transactions. No shared/Neon 0008 application is claimed.
