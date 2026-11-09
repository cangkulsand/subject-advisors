# P002 v2.1 setup and review guide

This guide covers the P002 v2.1 UC09/UC10 overlay prepared against the latest supplied `main`. The implementation plan is in [`S2-P002-002`](changes/S2-P002-002-v21-semester-selection.md), and the requirement mapping is in [`p002-v21-requirement-map.md`](p002-v21-requirement-map.md). The change is `READY_FOR_REVIEW`; its checks and limits are recorded in [`p002-v21-verification.md`](p002-v21-verification.md). Human peer review and connected Neon development acceptance remain pending.

## Choose the workspace layout

The full project archive contains the complete current baseline source tree and teammate modules; it does not contain Git history. The changed-files overlay contains only delivery changes intended to be copied into that baseline. Use the full project when you need the complete current application to run, inspect, or integrate. Use the overlay only to transfer P002 files into a fresh checkout of the same latest `main` revision. Do not treat the overlay as a replacement repository or unzip it over a teammate's newer changes.

In the actual Git checkout, inspect the current branch and working tree before switching branches. Commit or otherwise back up intentional work first; then update `main`, confirm the tree is clean, and create the feature branch:

```powershell
git status --short
git switch main
git pull --ff-only
git status --short
git switch -c feature/idham-s1-s2-v21
```

Make a backup commit of any intentional local work before overlaying files. Extract the delivered changed-files archive outside the working tree. Review its `CHANGESET.json`, then copy the listed files into the matching paths in the checkout, merging folders and preserving any teammate files that are not listed. Keep a copy of the original archive and source revision for rollback. Review the resulting diff before installing or running anything.

## Install and run the fictional preview

Use the repository lockfile and Node.js 22.12 or later. On Windows PowerShell, use `npm.cmd` for npm scripts; this avoids PowerShell execution-policy problems with `npm.ps1`.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
node tools/p002/test-ui.mjs --serve
```

The preview prints the URL or URLs to open. It uses the real P002 routes and feature components with a test-only session and 50 fictional student records. It does not create accounts or write to a real database. A proposed selection can be saved in the preview's in-memory fixture and is lost when the preview restarts; it does not publish an offering. Use the printed URL and stop the preview with Ctrl+C. Demo identities are not real accounts.

## Connected local application

`npm.cmd run dev` starts the application and API with the local Clerk and database configuration. It requires private development credentials in ignored `.env.local` and `.dev.vars` files. Obtain them from the maintainer through the team's approved channel. Never commit those files, put credential values in command arguments, or paste them into documentation. Follow [`p004-local.md`](p004-local.md) for the common local settings.

Connected application use expects the existing migrated main through migration 0008 and this P002 additive migration, `0010_p002_semester_selection.sql`. Migration 0009 is reserved for Package B and is not provided in this delivery. Keep the gap; do not renumber another owner's history or create a substitute migration. Confirm the combined manifest and exact history with the integration maintainer before applying schema changes.

The database command-line tools require both an explicit approved target file and the dedicated `DB_FOUNDATION_URL`. They do not infer a target from the app's `DATABASE_URL`. The example below uses the existing target-file path; the file must identify the actual approved development target and its credentials must be supplied privately:

```powershell
npm.cmd run db:review
npm.cmd run db:status -- --target .wrangler/db-foundation/target.json
npm.cmd run db:migrate -- --target .wrangler/db-foundation/target.json
```

`db:review` is local schema review; `db:status` inspects the explicit target; `db:migrate` applies pending migrations. A developer or maintainer must select and approve the development target and confirm its migration history before migration. On the supplied main, P002 migration 0010 can follow the existing history through 0008; migration 0009 is not a prerequisite and no placeholder is supplied. If the team later introduces Package B's 0009, reconcile the combined manifest and applied history with the maintainer. Do not point these commands at production, blindly execute migrations, or rerun baseline SQL manually. If target approval, credentials, exact history, or checksum prefix is unclear, stop and ask the integration maintainer to resolve it.

Migration 0010 follows the database foundation's `REVOKE PUBLIC` pattern. Before connected app use, the maintainer must verify that the application's runtime database role has the necessary access to the new selection metadata table under the approved grants. Do not guess or add broad role grants as part of the P002 overlay.

No live migration was performed for this delivery. The isolated PostgreSQL WASM integration run passed 11 scenarios; see the verification report and the outer delivery's `verification-results/selection-db.log` for scope and captured output. Do not infer live-database acceptance, deployment, merge, or publication from the preview or local checks.

### Optional isolated PostgreSQL integration run

The checked-in runner uses PGlite when `@electric-sql/pglite` is importable. To keep this optional dependency outside the project manifest and lockfile, install it in a temporary tooling folder and set `P002_PGLITE_MODULE` to its module file URL. On Windows PowerShell:

```powershell
$pgliteRoot = Join-Path $env:TEMP 'p002-pglite'
npm.cmd install --prefix $pgliteRoot --no-save --package-lock=false @electric-sql/pglite@0.5.15
$pgliteEntry = (Resolve-Path (Join-Path $pgliteRoot 'node_modules/@electric-sql/pglite/dist/index.js')).Path.Replace('\', '/')
$env:P002_PGLITE_MODULE = 'file:///' + $pgliteEntry
node tools/p002/test-selection-db.mjs
Remove-Item Env:P002_PGLITE_MODULE
```

On POSIX shells, `npm install --prefix /tmp/p002-pglite --no-save --package-lock=false @electric-sql/pglite@0.5.15`, then set `P002_PGLITE_MODULE=file:///tmp/p002-pglite/node_modules/@electric-sql/pglite/dist/index.js` while running `node tools/p002/test-selection-db.mjs`. This runner creates only an in-memory synthetic database and does not read application credentials or open a network connection. Do not add PGlite to the application's package files solely for this check.

## Product boundary for review

- **UC08 / initial demand:** the first filter counts distinct students who still need a subject and positively satisfy maintained eligibility conditions. The discussion's threshold is at least 30. Seed data is fictional. Sharhan owns the second-stage resource refinement and coordinator adjustments.
- **UC09 / student eligibility:** evaluate a student's records and maintained prerequisites against the finalised next-semester offering list. Unknown evidence remains uncertain and should be explained.
- **UC10 / proposed selection:** students can work with a proposed semester selection subject to maintained caps, eligibility and prerequisite rules. A saved plan is advisory; it is not official registration.
- **UC11/UC12:** intelligent ranking, bottleneck warnings and alternative recommendations are Sprint 3 scope. UC09 eligibility filtering does not claim to implement those features.
- **Semester limits:** the SRS presents three subjects per semester, Normal 10 credits, and Short 6 credits as guidance pending verified programme configuration. Treat defaults as provisional. A two-credit subject in a Normal semester needs explicit maintained `NORMAL` permission; do not infer an exception from the subject code. Sequential mandatory prerequisites must already be passed; selecting the next subject alongside it does not satisfy the sequence. Genuine co-requisites are evaluated as combinations.
- **Integration dependencies:** current Kuala Lumpur student-centre mapping remains interim pending P001 Package B's learning-centre field. Sharhan must consume the new candidate payload in the downstream refinement stage; it is not automatically applied to his optimizer. Coordinator approval and SMP publication remain outside the automated feature claim.

See [`p002-revised-sprints.md`](p002-revised-sprints.md) and [`p002-verification.md`](p002-verification.md) for the earlier reviewed UC08/UC09 work, both clearly marked historical. Current v2.1 evidence is in [`p002-v21-verification.md`](p002-v21-verification.md).
