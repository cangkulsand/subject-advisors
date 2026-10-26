# Database foundation

Status: applied and SQL-validated on the shared Neon branch, 26 October 2026.
Shared name: `development` (user-selected rename from `p004-local`).
The user explicitly confirmed branch br-shy-cherry-azuzy9v5 in project
still-waterfall-91972583 as safe for development schema creation. The runner verified
those connected IDs before applying versions 0000–0002 to neondb.
Live inventory and 68 behavior/role-boundary checks passed; existing access data
and UUID history were preserved. Production freeze and independent review remain pending.

## Delivered artifacts

- [Schema decisions and open questions](schema-decisions.md)
- [All 26 entities / 171 fields](field-mapping.md)
- [P001–P004 contracts](data-contracts.md)
- [Versioned workflow and migration order](migrations.md)
- [Actual evidence and unrun tests](verification.md)
- [Full Mermaid ERD](../../db/erd/schema.mmd)
- [Machine-readable source mapping](../../db/schema-contract.json)
- [Four-stage change record](../changes/DB-FOUNDATION-001-schema-baseline.md)

The initial/check SQL files were missing from the supplied repository. Their replacements
were authored from the actual SRS/SDD v2.0 DOCX dictionary, which has 26 entities and
171 fields. SQL/PLpgSQL parsing is static evidence, not a successful database deployment.

## Commands that do not connect to a database

    npm.cmd run db:review
    npm.cmd run test:db-tooling
    npm.cmd run lint:db

Other db:* commands require an explicitly approved target file and dedicated
DB_FOUNDATION_URL. They never automatically use the application DATABASE_URL.
See migrations.md. No destructive reset or production default is supported.

## Adoption boundary

The historical P004 UUID migration is not changed. The new workflow preserves that
table/key history and copies users into canonical INTEGER-keyed access assignments
atomically, only with explicit legacy-adoption approval.
The approved development migration was executed. No production deployment, commit or
push occurred in this task. All programmers use development; obtain credentials privately.

The 26 public tables are the SRS entities. migration_meta tables are private technical
migration bookkeeping and legacy ID evidence, not additional academic/domain entities.
No real catalogue/student records or privileged users are seeded.
