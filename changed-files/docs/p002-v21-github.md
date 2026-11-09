# P002 v2.1 GitHub handoff

Use this procedure to integrate the P002 v2.1 change into the team's working repository. The change record [`S2-P002-002`](changes/S2-P002-002-v21-semester-selection.md) is `READY_FOR_REVIEW`; the recorded checks are in [`p002-v21-verification.md`](p002-v21-verification.md). Human peer review and connected Neon development acceptance remain pending.

## Prepare the branch

In the working repository, inspect and protect any existing work before switching branches. Then update `main`, confirm the tree is clean, and create the delivery branch:

```powershell
git status --short
git switch main
git pull --ff-only
git status --short
git switch -c feature/idham-s1-s2-v21
```

If the tree contains intentional work, create a backup commit before adding the overlay. Extract the changed-files delivery outside the checkout. Read its `CHANGESET.json` list and compare the source revision recorded with the latest `main`. Copy only those listed paths into their matching locations, merging directories and preserving teammate files not listed. Do not replace the full project with the overlay, copy the overlay's entire directory wholesale, or overwrite a newer teammate change. If a listed shared file has moved or changed upstream, resolve that diff with its owner before proceeding.

## Review and verify

Inspect every changed file and the complete diff. Confirm the database manifest includes the intended additive `0010_p002_semester_selection.sql` after the existing history, while `0009` remains reserved for Package B and has not been renamed or fabricated. Review shared router and payload integration with the owners who consume or provide those contracts.

On Windows, use `npm.cmd` for npm commands:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npm.cmd run test:integration
node tools/p002/test-ui.mjs --serve
```

The UI command opens a fictional preview and prints its URL or URLs. The preview is not connected to a real database. It can save a proposed selection in an in-memory fixture, which is discarded when the preview stops. The optional PGlite integration procedure is in the setup guide. The recorded suite uses cached Chromium. Do not claim live database acceptance or deployment; neither occurred.

Before staging, inspect `git diff --check`, `git diff`, and `git status --short`. Stage the exact file paths listed in the delivered `CHANGESET.json`, plus any separately agreed correction paths. Do not use `git add -A` or `git add .`; that could stage credentials, generated outputs, or another developer's work.

```powershell
git diff --check
git diff --stat
git status --short
git add <each-reviewed-path-from-CHANGESET.json>
git diff --cached --check
git diff --cached
git status --short
```

Replace the placeholder with the explicit reviewed paths before running the command. Confirm ignored local environment files and target credentials are not staged. Commit and push the feature branch, then open a draft PR for team review:

```powershell
git commit -m "feat(p002): deliver v2.1 eligibility and selection"
git push -u origin feature/idham-s1-s2-v21
```

## Draft PR description

```markdown
## Scope
- P002 v2.1: UC09 eligibility and UC10 proposed semester selection, building on the initial UC08 demand filter.
- UC11/UC12 intelligent ranking, bottlenecks, and alternatives remain Sprint 3.

## Integration notes
- Review shared router changes and the candidate payload with Sharhan, who owns downstream refinement and coordinator adjustments.
- Review the interim Kuala Lumpur student-centre mapping with P001; Package B's profile learning-centre support is still required for multi-centre use.
- Migration 0010 is additive. Migration 0009 remains reserved for Package B and must not be renumbered by this branch.
- Any database application requires an approved development target, the dedicated DB_FOUNDATION_URL, and verified combined migration history.

## Verification
- `npm.cmd test`: 1,462 passed; 59 inherited database skips (74 files passed, 5 skipped).
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run build:local`: PASS.
- `npm.cmd run test:integration`: 10 passed; P002-focused ESLint: PASS; DB static review: PASS; DB tooling: 23 passed.
- P002 UI preview: 30 passed across 320, 375, 768, and 1440 px; readability and overflow checks passed.
- Isolated PGlite/PostgreSQL 18.6 integration: 11 scenario groups passed.
- Cloudflare asset build with `VITE_CLERK_PUBLISHABLE_KEY=TEST_ONLY_PUBLIC_KEY`: PASS, 663.68 kB JS chunk (over 500 kB warning); no real auth key or deployment.
- No live deployment or production migration is claimed.

## Review checklist
- [ ] Exact `CHANGESET.json` paths reviewed and staged; no credentials or generated files.
- [ ] Shared router and migration history reviewed with integration owners.
- [ ] Human peer review complete before merge.
```

Keep the PR draft until actual checks are recorded and the shared-router, migration-history, and downstream-payload owners have reviewed their integration points. A self-review is not peer approval.
