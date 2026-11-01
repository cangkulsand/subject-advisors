# P002 semester offerings (UC08)

> **Superseded in part by [S2-P004-006](../changes/S2-P004-006-confirmed-offerings-rule.md) (2026-11-01).** UC08 is no longer student-reported. The page will list only subjects **confirmed by the coordinator** for the student's programme + learning centre + next semester ("Confirmed by coordinator"); students pick from that list. The table, GET/PUT adapters and tests described below are the legacy implementation until the planned P002 package replaces them. See [integration](integration.md).

Start with [the root handoff guide](../../P002-HANDOFF.md). No manual file relocation,
import edits or package-script merge is needed for the recorded Git baseline.

| Path | Contents |
| --- | --- |
| apps/api/src/modules/offerings/ | Protected GET/PUT adapters, SQL context/repository and tests |
| apps/web/src/features/offerings/ | Offering page, authenticated route/client and browser harness |
| packages/shared/src/offerings/ | Decimal-string INTEGER IDs and UC08 contracts/tests |
| tools/offerings/ | Demo, checks, builders and test-only canonical DDL fixture |
| db/checks/p002-semester-offering.sql | Read-only metadata query, never a migration |
| dist-offerings/demo/ | Compiled fictional preview |

Use the existing canonical INTEGER database schema; no migrations are delivered.
Fictional fixtures are confined to demo/tests, not exported by the production API/UI.
See [integration](integration.md) and [acceptance](acceptance.md).
