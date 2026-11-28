# S3-P004-044: Curriculum subject search and credit check

- **Status:** merged to `main` and deployed to dev and prod on 2026-11-28. No migration.
- **Owner:** P004, for Harraz's review item. To be handed over to Harraz.
- **Design:** `docs/superpowers/specs/2026-11-28-curriculum-credit-check-design.md`
- **Plan:** `docs/superpowers/plans/2026-11-28-curriculum-credit-check.md`

## Plan

The 21 Nov review asked to "follow up on subject-list search and validation of total subject credits against the curriculum credit requirement".

**Owner decisions (2026-11-28):**
- **Comparison:** the minimum path to graduate against the total (option 1).
- **Warning only:** the check never blocks saving.

## Implementation

**Shared function:** `creditCheck()` in `packages/shared/src/curriculum/credit-check.ts`. It works out the compulsory credits, then for each requirement group the fewest extra optional credits that meet its subject count and credits. It returns the minimum, a status (Matches, Short, Over, Not set), and unmet-group messages. Groups match categories by the progress-page rule.

**API:** the curriculum snapshot carries `requirements` from `curriculum_requirement`, outside the revision.

**Page:** the Subject List tab of Subjects & Prerequisites and of Curriculum & Subjects:
- **Credit check panel:** "Credit check: required N credits", the compulsory and group lines, and "Minimum to graduate M · Short by X credits". It also lists unmet groups and notes that it never blocks.
- **Search:** a shared table toolbar search ("Search subjects", by code or name), a count line ("N of M subjects"), Clear, and "No subjects match the search."

## Review

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2165 passed, 67 skipped |
| `npm run test:ui:coordinator` | 67 PASS |
| `node tools/p001-sprint2/test-uc24-ui.mjs` | 2 new checks pass. All checks pass until the 200% zoom check, which also fails on `main`. |

## Data the check flags today

**SECJ curriculum 1:** the requirement `INDUSTRIAL_TRAINING` asks for **92** credits, but its two industrial training subjects add up to 12. This is likely a data entry error (12). It has not been changed here. Fixing it is a data decision for the owner or Harraz.
