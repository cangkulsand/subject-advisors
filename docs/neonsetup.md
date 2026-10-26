# Neon development setup

Use the existing shared development database; obtain its credentials privately.
Branch name: development (formerly p004-local). Fixed branch ID:
br-shy-cherry-azuzy9v5; project still-waterfall-91972583; database neondb.

Canonical versions 0000–0002 were applied and verified on 26 October 2026.
See database/README.md and database/migrations.md for the explicit-target workflow,
checksum tracking, verification evidence and safe reuse instructions.

The previous provider onboarding snippet targeted production and is superseded.
Do not initialize a new Neon project, deploy services or reapply dated feature SQL
as part of local feature integration. Use DATABASE_URL only in the ignored backend
.dev.vars; the migration runner requires a separately approved target and dedicated
DB_FOUNDATION_URL. No live schema action occurs merely by starting npm run dev.
