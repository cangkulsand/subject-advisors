# P002 UC08 - paste into the project root

This archive is a project-root overlay for Git baseline 01cee06c3e3dd5b8dbddf4bd9ff1fc350a56fd63.
It contains apps/, packages/, tools/, docs/, db/, root offering configs, a merged
package.json and .gitignore. There is no enclosing p002/ package.

1. Extract the ZIP into a temporary folder.
2. Copy ALL extracted contents into the root of the cloned subject-advisors project
   (the folder containing its existing package.json). Merge folders and replace the
   supplied package.json and .gitignore. Do not replace the entire apps/ folder;
   let the file manager merge it. No existing auth source is replaced.
3. Use Node 24.14+ for source commands (native TypeScript config loading). Run
   npm.cmd ci from that root, then npm.cmd run dev:offerings.
4. Open http://127.0.0.1:5174/student/offerings.

The development page is the labelled fictional prototype with browser-only storage.
For the included compiled preview, Node alone is sufficient:

    node tools/offerings/serve-preview.mjs

Open http://127.0.0.1:5184/student/offerings. No npm install is needed for this preview.

Root commands:

    npm.cmd run typecheck:offerings
    npm.cmd run lint:offerings
    npm.cmd run test:offerings
    npm.cmd run test:ui:offerings
    npm.cmd run build:offerings

For strict database acceptance, explicitly set OFFERINGS_TEST_DATABASE_URL privately
to the approved unpooled Neon development/test endpoint and run:

    npm.cmd run acceptance:offerings

Ordinary tests skip the eight optional DB checks without that variable. The strict
gate reports a blocker instead. It uses session-local TEMP fixtures, not public
student writes. Do not apply the SQL under tools/offerings/fixtures as a migration.
The public offering table already exists in the canonical development baseline.

All original auth commands and dependencies are preserved. npm.cmd run dev still
starts the existing auth preview; dev:offerings starts the P002 fictional prototype.
No package-lock replacement is needed because dependencies are unchanged.

Real application integration still requires P001's real ProfileReader, approved
catalogue/semester data and shared router/shell mounting. This ZIP supplies correctly
located modules and imports; it does not invent those absent owner services. See
docs/offerings/integration.md. There is no live Clerk-to-Neon acceptance claim.

The two root replacement files are based on the revision above. If your branch has
subsequent edits to those files, compare them before replacement. Existing local
secrets are excluded and are not replaced. Human peer review remains pending.

Delivery inventory and replacement hashes: docs/offerings/overlay.json.
File hashes: P002-MANIFEST.sha256. Source change record:
docs/changes/S1-P002-005-root-overlay.md.
