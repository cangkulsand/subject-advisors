# UC08 verification

Run root typecheck:offerings, lint:offerings, test:offerings, test:ui:offerings and
build:offerings commands. Run acceptance:offerings with an explicit unpooled
OFFERINGS_TEST_DATABASE_URL to include all eight PostgreSQL TEMP-fixture checks.
The strict report is written to dist-offerings/acceptance/result.json and cannot
grant human peer approval. Missing DB configuration remains a blocking result.

The original-layout development run passed 78 unit tests, eight PostgreSQL tests,
25 browser checks and builds/typecheck/lint. Its sanitized preservation evidence is
in evidence/original-layout-live.json and is historical, not proof of this relocation.
Relocated-code verification results are recorded in
../changes/S1-P002-005-root-overlay.md and any accompanying root-overlay evidence.

Tests cover ownership/semester separation, foreign/duplicate rejection, idempotent
row IDs/timestamps, commits/read-back, SQL-failure rollback, empty replacement,
Normal/Short labels, review/confirmation/cancel, responsive layout, keyboard flow
and mocked auth boundaries. TEMP fixtures do not prove live Clerk login or public
membership-trigger execution. Full integration still needs P001/data/routing,
approved real-session two-student review and human acceptance.
