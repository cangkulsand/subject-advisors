# S1-P002-005 - Project-root overlay handoff

- **Status:** READY_FOR_REVIEW (root-overlay delivery); full application acceptance pending
- **Date / owner / scope:** 2026-10-26 / P002 / Sprint 1 UC08
- **Branch / PR:** No commit, push, branch or PR created.
- **Reviewer:** Human peer review pending.

## 1. Plan

The user requests a ZIP whose contents can be pasted directly into the cloned
project root, replacing supplied shared files without a top-level p002 package or
manual relocation/import/config edits. Current delivery requires an isolated p002/
directory; imports/config/tool paths assume that layout.

Generate the root overlay from the existing owned sources, leaving the working
tree's unrelated foundation changes untouched. Target the locally available Git
HEAD baseline, record its exact revision, and compare replacement files against
that baseline. Place API/UI in apps/api/src/modules/offerings and
apps/web/src/features/offerings, scoped shared contracts in
packages/shared/src/offerings, demo/tools in tools/offerings, and docs under
docs/offerings plus this change record under docs/changes. Rewrite all relative
imports, mock paths and tooling/config paths. Supply root tsconfig/vite/vitest
offering configs and root package.json with additive :offerings commands, retaining
every baseline command/dependency. Include a baseline .gitignore with owned output
paths appended. No dependency upgrades, new package manager or nested package.json.

The historical baseline lacks canonical migrations. Bundle only the exact canonical
offering-table DDL as a TEST-ONLY fixture under tools/offerings/fixtures so database
tests work after extraction without shipping another owner's unapplied migrations.
Retain explicit test URL gating, temporary tables and real P004 authorization.
Include the read-only public-schema check; do not seed or migrate any database.

Include a compiled fictional preview and a concise root P002-HANDOFF.md explaining
paste/replace, run commands and remaining P001/routing/reference-data dependencies.
This is source-layout integration, not authorization to implement P001 or fabricate
profile completion. Do not change the existing auth launcher or claim live academic
route mounting that the baseline cannot support yet.

Verify safe paths/hashes/exclusions and additive package changes. Extract Git HEAD
into an isolated local review directory, apply the actual ZIP, and run offering
typecheck/lint/unit/browser/build plus baseline checks. Exercise relocated database
tests on the already approved development branch with temporary fixtures and compare
persistent counts when network access is available. Smoke the extracted preview.
Keep old fixture/live evidence clearly distinct from results of the relocated code.

Risks: overlay replacement is specific to the recorded Git baseline; unmerged local
changes in a recipient's root package.json need review. Rollback is restoration of
the two replaced baseline files and removal of added owned paths. No persistent
schema/runtime deployment changes. All credentials, .git, caches, dependencies and
other programmers' uncommitted work stay outside the ZIP.

## 2. Implementation

- Added `p002/tools/stage-root-overlay.mjs`; the established stage-handoff.mjs now
  delegates to it. It reads the committed baseline rather than copying unrelated
  uncommitted root manifests or foundation implementation into the delivery.
- Relocated API/UI/contracts/demo and rewrote relative imports, mock references,
  canonical test-fixture URL, build/test/dev/preview paths and configuration.
- Root package.json preserves every baseline script, dependency and engine setting
  and adds nine :offerings commands. .gitignore appends only owned output ignores.
  These are the only two files that replace baseline files. No auth source is replaced.
  Dependency changes and package-lock replacement are unnecessary.
- Added current root-copy instructions, integration/acceptance documentation,
  read-only schema SQL, exact canonical offering DDL as a labelled TEST-ONLY fixture,
  historical/live relocation evidence and a SHA-256 inventory. No migrations shipped.
- The compiled preview, current review screenshots and strict report are included.
  Private settings, dependencies, Git metadata and original p002 wrapper are excluded.
- The existing manual-handoff ZIP filename is refreshed with the same root layout;
  the preferred filename is P002-UC08-root-overlay.zip.
- Local original-layout sources and all unrelated working-tree changes are preserved.

## 3. Review

- Baseline: 01cee06c3e3dd5b8dbddf4bd9ff1fc350a56fd63. Extracted via git archive into
  an isolated local directory, then applied the actual delivery ZIP. Sandbox denied
  creation initially; explicitly approved local execution created the review copy.
- Dependencies were reused through a node_modules junction. Every declared baseline
  dependency's installed version was checked against its exact pin. A fresh npm ci
  was not performed; no dependency or lockfile changes were made.
- `node .wrangler/p002-acceptance.mjs root-overlay`: PASS. This private launcher
  verified the approved development server identity and ran the extracted
  `tools/offerings/acceptance.mjs` with an explicit unpooled test connection.
  Typecheck/lint PASS; 86 P002 tests PASS (78 unit + eight actual PostgreSQL),
  no skips; 25 browser checks PASS; API/web/route/demo builds PASS; strict status
  READY_FOR_REVIEW, exit 0. Seven persistent public table counts stayed zero.
- `node .wrangler/p002-acceptance.mjs root-overlay-baseline`: PASS. The extracted
  root retained every auth command/dependency; baseline typecheck/lint PASS;
  broad apps tests 103 PASS, 13 opt-in DB checks SKIPPED without their dedicated
  variables (the eight P002 DB checks passed separately in the strict run above).
  Baseline auth module and local Vite builds PASS. Native config loading was used
  for the test/Vite invocations when reusing installed dependencies.
- Compiled extracted preview: four HTTP checks PASS; browser selection, confirmation,
  save and reload PASS; no external requests or page exceptions. This remains a
  fictional preview, not real Clerk application acceptance.
- Root package replacement is additive; only package.json/.gitignore overlap the
  Git baseline. Canonical offering fixture is isolated under tools/offerings/fixtures.
  No real routes are silently opened without the missing P001/shared-router service.
- Final ZIP inventory/path/hash/private-value checks PASS: 60 content hashes plus
  P002-MANIFEST.sha256, 61 root-relative entries. No enclosing p002 package or nested
  package.json. Both delivered filenames contain the same root-overlay archive.
- Self-review PASS; human peer review pending. No persistent DB mutation, migration,
  grant, commit, push or deployment. Real P001/data/routing/Clerk acceptance remains open.

## 4. Changelog

2026-10-26: Changed the P002 handoff from an isolated package to a project-root
overlay with corrected imports/config/tools and merged baseline root commands.
Verified the actual ZIP on an isolated Git baseline: 86 P002 tests, 25 browser checks,
baseline checks and preview save/reload pass. Sanitized evidence distinguishes
the new relocated execution from historical source-layout results. The original
working tree's shared files are untouched. Final status READY_FOR_REVIEW; human
and real-session application acceptance pending. No commit or push performed.
