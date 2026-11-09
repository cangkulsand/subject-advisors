# P002 v2.1 verification — 9 November 2026

Status: local verification passed; `READY_FOR_REVIEW`. Human peer review and acceptance against the connected Neon development database remain pending. No live migration, production build with a real Clerk key, deployment, push, or merge was performed.

## Checks recorded

| Check | Result |
|---|---|
| `npm test` | PASS: 1,462 passed, 59 inherited database-dependent skips; 74 files passed and 5 skipped. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npm run build:local` | PASS. |
| `npm run test:integration` | PASS: 10 integration-preparation checks. |
| P002-focused ESLint | PASS for the P002 tooling, policy, and projection files. |
| `npm run db:review` | PASS: static migration/schema review only; database execution was not performed. |
| `npm run test:db-tooling` | PASS: 23 checks. |
| P002 UI preview | PASS: 30 checks, including readability and no-overflow at 320, 375, 768, and 1440 px. Cached Chromium was used. Desktop and mobile views were visually inspected. |
| Isolated PGlite integration | PASS: PostgreSQL 18.6 WASM; 11 scenario groups covering migration setup and the actual reader, repository, and route writer. |
| Cloudflare asset build | PASS using `VITE_CLERK_PUBLISHABLE_KEY=TEST_ONLY_PUBLIC_KEY`; all entries bundled. The 663.68 kB JavaScript chunk produced Vite's over-500 kB warning. No real auth key was tested. |

Per-command captured output is included in the outer delivery archive under `verification-results/`; it is not part of the application source overlay. The exact npm command outcomes and PGlite result were reviewed locally by the implementation owner. The `npm test` skipped tests match the inherited optional database-dependent skip set.

## PGlite coverage

The isolated PostgreSQL WASM run used fictional rows in an in-memory database. It applied the migrations and exercised the actual P002 eligibility reader, selection repository, and route handling. The 11 writer cases were save/reload/edit/clear; a permitted concurrent pair; rejection preserving previous rows; stale confirmation/source rejection; plan revision race rejection; own-student isolation; sequential prerequisite co-selection rejection; expired deadline; rollback after a forced post-delete error; uniqueness of the metadata row; and unchanged academic records.

During integration, PostgreSQL constant-folded a SQL guard sentinel expression earlier than expected. The expression was corrected and the actual PostgreSQL integration scenarios then passed. This fix is included in the P002 implementation. PGlite is an isolated compatibility check, not a substitute for the maintainer-approved Neon development acceptance.

## Scope and limitations

- The UI preview uses a test-only session and 50 fictional students. Proposed selections can persist in its in-memory fixture until the preview process stops; it has no real database write path.
- No live `db:migrate` was run. On the supplied main, additive migration 0010 can follow 0008 directly; 0009 is not a prerequisite and no placeholder is supplied. If Package B later introduces 0009, a maintainer must reconcile the combined migration history. Any live application still requires an approved exact development target.
- Migration 0010 follows the `REVOKE PUBLIC` pattern. The maintainer must verify that the runtime application database role has the required access through the approved grants before connected app use; this delivery does not guess or add broad role grants.
- The production asset build used a test-only publishable key. No real Clerk authentication, Neon database, deployment configuration, or hosted route was verified.
- The inherited Kuala Lumpur student-centre mapping remains pending P001 Package B's profile learning-centre field. Sharhan must integrate the new initial candidate payload in his refinement stage.
- UC11/UC12 intelligent ranking, bottleneck warnings, and alternatives remain Sprint 3 scope. The student selection is proposed guidance, not official registration or automatic SMP publication.

The captured logs are `test.log`, `typecheck.log`, `lint.log`, `build.log`, `build-local.log`, `test-integration.log`, `db-review.log`, `db-tooling.log`, `eslint-p002.log`, `ui.log`, `selection-db.log`, and `build-cloudflare-fixture.log` under `verification-results/`.
