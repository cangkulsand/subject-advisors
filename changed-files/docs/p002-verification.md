# Historical: P002 verification — 7 November 2026

These results cover the earlier UC08 initial-demand and UC09 eligibility delivery only. They predate v2.1 UC10 implementation and do not verify its selection lifecycle or migration. Current verification is pending the implementation owner and code freeze; update [the v2.1 change record](changes/S2-P002-002-v21-semester-selection.md) with actual evidence. Current setup and branch instructions: [P002 v2.1 setup](p002-v21-setup.md) and [GitHub handoff](p002-v21-github.md).

The unchanged uploaded-main baseline passed typecheck, lint, unit tests, API build, local web build and integration preparation checks. Baseline: 1,375 tests passed, 59 skipped across 67 passing / 5 skipped files.

The adjusted source was checked with:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 1,434 passed, 59 skipped; 72 passing / 5 skipped files |
| `npm run build` | PASS: integrated Worker API and auth entry bundled |
| `npm run build:local` | PASS: integrated React application bundled |
| `npm run test:integration` | PASS: 10 registry/preparation tests |
| `node node_modules/eslint/bin/eslint.js tools/p002 packages/shared/src/forecasting/initial-demand.ts packages/shared/src/forecasting/student-eligibility.ts packages/shared/src/forecasting/p002-eligibility-policy.ts packages/shared/src/forecasting/p002-demo-fixture.ts packages/shared/src/forecasting/p002-projections.test.ts --max-warnings 0` | PASS |
| `node tools/p002/export-demo.mjs` | PASS: 50 fictional students and derived JSON outputs |
| `node tools/p002/test-ui.mjs` | PASS: 19 real-route UI cases with test-only Clerk/API fixtures |

For UI checks, install Playwright Chromium with `npx playwright install chromium`, or supply an existing compatible executable using `P002_CHROMIUM_EXECUTABLE_PATH`. This review used Chromium 153 through that override, with no browser files added to the source archive.

## Coverage and review

- Threshold 29/30/31; distinct references, duplicates/conflicts, multiple curricula and unresolved curricula; full 50-student endpoint exercise; rejected rows and incomplete history; no capacity allocation/finalized-run prerequisite; denied roles, scopes and mismatched/unaccepted batches before cohort access.
- Completed/exempted/failed/in-progress history, zero-credit exemption and retakes; maintained mandatory/AND/OR prerequisites; completed-credit and unavailable CGPA evidence; unsupported notes, topic-dependent/corequisite rules; catalogue and semester exclusions.
- Own-profile query binding and one-statement snapshot, current/next semester ordering, no confirmation, persisted confirmation without forecast status joins, fresh records, no manual selection query, credit clamp, valid prerequisite mappings, malformed metadata and safe errors. SQL was parsed offline with `libpg-query`; this is syntax verification, not live schema execution.
- Real production reader/factory composition uses the supplied profile-aware auth; integrated route dispatch and optional feature registries tested. Client tests cover fresh tokens, no-store reads, cancellation/timeouts while token acquisition is pending, account change after token/body boundaries, public-field validation and identity-field exclusion.
- UI checks cover coordinator filtering/search/sort and JSON export, missing assignments/current semester/snapshot and retry; student eligibility explanations, not-confirmed/empty/no-next states, retry, refresh/withdrawal and offering-route alias. Mandatory readability and no page overflow assertions run at 320, 375, 768 and 1440 pixels for both screens. Keyboard sort navigation was exercised. Desktop and phone screenshots were visually inspected; new mobile filter labels use two rows to remain readable.
- Inspected source comparison against the uploaded main: no deleted source files, no dependency/lockfile changes, no migrations, no unrelated owner module replacements. Shared router/registry/shell changes are limited to feature registration and navigation.

## Practical limits

The 59 skipped tests are inherited database-dependent checks; the baseline skipped the same number. No real Clerk account, authenticated live session or development PostgreSQL database was used. The supplied product URL redirected to sign-in, so only public access behavior was observed there. No deployment, live mutation, dummy account creation, push or merge was performed. Cloudflare production build requires the owner's public Clerk build setting and was not claimed as verified.

The interim Kuala Lumpur student-centre mapping and Sharhan's downstream consumption of the new initial candidate subset remain explicit team integration items (see `p002-revised-sprints.md`). Final status: READY_FOR_REVIEW; human peer review and connected-environment acceptance pending.
