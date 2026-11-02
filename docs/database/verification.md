# Database verification evidence

Executed 26 October 2026, DATABASE_FOUNDATION scope. Source: supplied SRS/SDD v2.0 DOCX.
Status: approved shared development application and SQL validation complete for the
historical 0000-0002 baseline below. Later follow-ups have separately scoped evidence.
Independent review and production freeze remain pending.

## Confirmed target

The user explicitly confirmed Neon branch br-shy-cherry-azuzy9v5, originally named
p004-local, safe for development schema creation. The user subsequently selected
`development` as its shared name for all programmers and will rename it in Neon.
Project: still-waterfall-91972583; database: neondb; PostgreSQL version: 180006.
The runner verified these actual server settings before schema changes.
No production target was selected. Friendly-name changes do not change the branch ID.

The ignored .wrangler/db-foundation/target.json records the user's approval,
legacy-adoption flag and rollback-only test approval. An ignored local launcher
supplied DB_FOUNDATION_URL from the selected private development configuration;
credentials were neither printed nor copied into versioned files. The shared CLI
itself never loads application environment files or defaults to DATABASE_URL.

## Real commands and results

| Command | Actual result |
| --- | --- |
| npm.cmd run db:review | PASS: 26 entities, 171 columns, 39 source FKs; PostgreSQL 18 SQL/PLpgSQL parsing; source hash matches |
| npm.cmd run test:db-tooling | 12 PASS; static/mocked workflow tests, not PostgreSQL integration tests |
| npm.cmd run lint:db | PASS |
| node .wrangler/db-foundation/run-approved.mjs status | Before application: no applied versions, pending 0000/0001/0002 |
| node .wrangler/db-foundation/run-approved.mjs migrate | Applied 0000, 0001 and 0002 atomically |
| node .wrangler/db-foundation/run-approved.mjs verify | PASS: actual 26-table/171-column/39-FK inventory, required types/keys, constraints, triggers, indexes and PUBLIC privilege checks |
| node .wrangler/db-foundation/run-approved.mjs test | 59 behavior assertions + 9 non-owner role-boundary assertions PASS; 0 SKIP; transactions rolled back |
| node .wrangler/db-foundation/run-approved.mjs migrate | Replay PASS: applied [] |
| npm.cmd test | 47 PASS, 5 optional historical auth-database tests SKIPPED |
| npm.cmd run typecheck | PASS |
| npm.cmd run lint | PASS |
| npm.cmd run build | PASS |
| git diff --check | PASS; Git line-ending conversion notices only |

The ignored launcher invokes tools/db/cli.mjs with the requested command and
--target .wrangler/db-foundation/target.json. Portable npm equivalents and target
requirements are in migrations.md. Static/app checks preceded the application;
database static/tooling checks were repeated after adding the role-boundary suite.

The first behavior attempt failed with SQLSTATE 22P02 because a synthetic JSON
literal was incorrectly escaped. Its transaction rolled back. The fixture was
corrected and the complete suite passed. No applied migration was edited.

## Live checks and preservation

- Before adoption, a read-only SELECT saved the original access row in an ignored
  local JSON file. No account values are included in this published evidence.
- Read-only Node/pg assertions compared every archived row to that snapshot and
  compared canonical Clerk ID, role, status and created/updated timestamps to the
  original values: PASS. Original UUID retained, one valid UUID/integer mapping.
- Final read-only inspection checked migrationStatus against repository checksums,
  queried migration_meta.schema_migrations, pg_roles for the probe role, and each
  canonical table's PK for synthetic negative IDs: no pending versions, no probe
  role and zero synthetic rows. Sanitized actual server results and application
  timestamps are in [development-application-2026-10-26.json](development-application-2026-10-26.json).
- Inventory verifies source column mappings/FKs plus 71 named CHECK/UNIQUE
  constraints, 35 enabled integrity triggers and 45 explicit valid indexes.
- Behavior tests cover curriculum/owner isolation, retakes, failed/exempted credit
  rules, rejected invalid values/duplicates/FKs, prerequisite cycles, last-admin
  preservation, immutable audit writes, import snapshots, capacity exceptions,
  forecast version/parent scope and finalized/superseded/archived read-only payloads.
- The NOLOGIN role probe demonstrates default denial and explicit access-reader
  grants, while denying cohort/metadata reads, role/audit writes, helper execution
  and trigger-disabling DDL. Role, membership and grants were rolled back.

The named initial/check SQL files were absent at initial inspection; replacements
were authored from the supplied dictionary. Both required guides were read fully.
The historical P004 migration is unchanged; untracked P002 code was not modified.

## Not executed / remaining review

- Multi-session competing-write races for prerequisite cycles, last-admin removal,
  parent/curriculum changes and finalized-run/source-snapshot mutation.
- Production service-role provisioning and authentication/owner/audit coupling
  through the deployed Worker against this new baseline.
- Fresh empty-database migration on a second PostgreSQL target; this live run used
  the approved existing P004-only adoption path.
- Independent peer review, institutional policy approval and official catalogue import.

The test role is a limited permission probe, not a production grants configuration.
No production readiness, complete concurrency proof or full security audit is claimed.

## Follow-up: required current academic semester (2026-10-28)

Migration 0003 was later added through the canonical manifest and applied to the
same development target after coordinator review. Its checksum and the exact
project/branch/database were independently read back. The column and validated
RESTRICT foreign key were verified without reading student rows. The frozen
baseline check 001 and registered extension check 004 both passed in read-only
transactions.

The local canonical runner's `db:status` connection attempt returned sandbox
`EACCES` before querying the database. After review, the canonical migration SQL
and ledger checksums were applied using the Neon transaction tool with advisory
locking, bounded timeouts and exact target/ledger guards. The transaction applied
only migration 0003 and its canonical ledger row; no student data was modified.
The optional live fixture database suite was not run. This follow-up does not
change the historical 2026-10-26 foundation evidence above.

## Follow-up: Package A academic setup (2026-11-02, disposable local only)

Coordinator reviewed the concrete backend diff and accepted its checkpoint after the
following checks. This is local implementation evidence; human peer review remains
pending and no Neon/shared-development 0008 application occurred.

| Command / scope | Actual result |
| --- | --- |
| `node tools/admin/test-academic-database.mjs` | PASS on fresh PostgreSQL 18.4 loopback cluster: 0000-0006+0008 applied; repeated apply no-op; structural assertions; 135 behavior assertions; 13 concrete repository tests; 16 two-session lock-observed races. Cluster stopped in finally. |
| Focused Vitest: academic repository, factory/dispatch, academic routes, existing admin reads/mutations | PASS: 5 files / 318 tests, including 24 new SQL/error-boundary tests and 5 new Neon-factory/dispatch tests. |
| `npm.cmd run typecheck` | PASS after backend integration. |
| `npm.cmd run lint` | PASS after backend integration and separate fixture fix. |
| `git diff --check` | PASS after backend checkpoint. |
| Earlier `npm.cmd run test:db-tooling`, `npm.cmd run db:review`, `npm.cmd run lint:db` | PASS: 21 tooling tests; 26 baseline entities/171 source fields/39 source FKs plus 5 registered extension columns; SQL/PLpgSQL parsing and source hash checks. |

The 135 behavior assertions comprise 59 baseline, 9 role-boundary, 19 multi-role,
38 admin-user and 10 academic cases. Structural checks 001/004/005/007/008/012 also
passed. Repository tests cover all sixteen operations and the live scope reader:
audited transaction context, sparse PATCH and merged invariants, explicit no-current,
atomic switch/readback, missing/duplicate errors, assignment history, live role/access/
reference invalidation and mismatched programme/faculty denial. Fixtures run under
outer rollback transactions with savepoints for each exact repository transaction.
The Neon HTTP transaction transport is unit-tested with mocks; real SQL uses `pg` on
loopback PostgreSQL. No deployed Worker-to-Neon coupling result is claimed.

The race suite observed `pg_stat_activity` Lock waits and blocking PIDs for concurrent
current switches and duplicate live assignment; programme reassignment in both orders;
centre/faculty/programme-status/account-suspension/role-deletion in both orders; and
programme link/faculty deactivation in both orders. It also checked switch audit counts,
rollback/failed-target preservation and ended assignment history. This is evidence for
these tested scenarios, not a general concurrency/security proof.

The runner never reads application credentials. It initializes a new disposable
`utm_db_foundation_admin_academic_test` database and stops its cluster in `finally`.
`MULTI_ROLE_POSTGRES_BIN` optionally overrides the prepared binary directory documented
in migrations.md. The repository suite accepts only explicit `ACADEMIC_TEST_DATABASE_URL`
loopback URLs with the guarded disposable database name; there is no DATABASE_URL fallback.

Backend checkpoint review PASS is coordinator review, not human peer approval.
Separate UI/browser evidence and screenshot review are recorded in
`docs/changes/S2-P004-008-admin-academic-setup.md`. Final documentation review, build and
full combined suite remain pending at this evidence checkpoint. Before any shared application, integrate and verify
the exact applied 0007 manifest prefix/checksum, then 0008, then Package B 0009; confirm
the private development target identity. Never rewrite applied history to fit the
isolated local gap. No production action, deployment or official data import occurred.
