# S1-INT-002 — Shared UI-only handoff

- Status: READY_FOR_REVIEW
- Date: 2026-10-26
- Owner: Integration / UI scaffolding only
- Source baseline: shared subject-advisors/main 0ccac62
- Branch: ui/shared-main-template; destination shared main
- Authorization: User requested publishing only UI for developers who will paste
  their own feature ZIPs. Do not merge the production application's full main.

## 1. Plan

Publish the burgundy template, responsive student sidebar/header/search, existing
student route shell and P003 pathway placeholder. Keep shared main's auth, DB,
API, generated integration contracts and dependency manifests intact. Only add
Clerk appearance variables and focus CSS to authentication-owned files.

Use an isolated worktree from shared main. Copy reviewed presentation files from
the production checkout, adapting internal links to ordinary anchors and keeping
the existing route host behavior. This preserves incoming feature ZIPs' native
beforeunload guards without requiring new caching/navigation imports in their
owned code. Do not copy native-history routing, auth/data caches, P001/P002
implementation files, APIs, DB changes, secrets or generated output.

Update themeguide.md with the user-approved palette/template override, provide
docs/ui-handoff.md, and create a project-root overlay ZIP with a file/hash manifest.
Keep existing P001/P002 feature ZIPs separate and unchanged.

Acceptance: sidebar, search, responsive/dark styles, correct guards and truthful
missing-page states compile on shared main without feature modules; P003 menu
opens its placeholder after profile setup. Old feature ZIPs can still use the
same page/token/API registration contracts. No production implementation leaks.

Verify typecheck/lint/unit/build, shared shell/auth browser checks, diff allowlist
and ZIP hashes. Smoke-check the UI with pasted owner modules in a disposable
verification folder if feasible; no DB operations. Normal fast-forward push to
https://github.com/cangkulsand/subject-advisors.git main only; never force push or
change the production checkout's origin. Preserve original checkout private files.

## 2. Implementation

Prepared 14 changed/new files: StudentShell, StudentRoutes, shared CSS, pathway
placeholder/index, local route host/preview CSS, Clerk appearance/focus styling,
third-party attribution, UI browser checks, theme guide, handoff guide and this
record. Existing document navigation is preserved; no cache/history modules or
P001/P002 implementations copied. Auth.tsx has only one added appearance prop.

Created a disposable .wrangler/ui-owner-smoke copy and applied the actual
P001-Sprint1-integrated.zip unchanged for compatibility verification. This ignored
copy is not part of the UI handoff or Git update. Package the 14 source/doc/test
files under payload/ with root README and SHA256 manifest in
Shared-UI-template.zip; keep the existing feature ZIPs unchanged.

## 3. Review

PASS — SELF-REVIEW; peer review pending. User-authorized direct shared-main push.

Actual commands/results in the isolated UI worktree:

- npm.cmd ci --no-audit --no-fund: installed 220 packages. Existing ESLint version
  deprecation notice; no dependency change or upgrade performed.
- npm.cmd run typecheck; npm.cmd run lint: PASS.
- npm.cmd test: 59 PASS, 5 optional live database checks SKIPPED.
- npm.cmd run build:local; npm.cmd run build: PASS.
- node tools/integration/test-ui.mjs: 14 PASS without owner overlays.
- node tools/auth/test-ui.mjs: 11 PASS.
- git diff --check: PASS (normal line-ending notices only).
- Diff of apps/api, db, tools/db, integration preparation, package/lockfile: empty.

Actual compatibility check: copied the shared UI snapshot to an ignored disposable
folder, extracted P001-Sprint1-integrated.zip without replacing existing files, and
ran npm.cmd run typecheck, npm.cmd run build:local and
node tools/integration/test-ui.mjs there: PASS; 14 UI browser checks PASS.
Registry correctly detects P001 API/web and no P002. No shared-file collision
occurred during the P001 ZIP extraction. P002 ZIP was not available for this
separate smoke test; its entry contract is unchanged, not claimed live-verified.

Browser checks use explicit mocked Clerk/API. No credentials/private settings,
actual login, migrations or database writes were used. Production main remains
separate. Shared-main UI only is an additive fast-forward update, not a merge of
the production feature commits. ZIP manifest verification is recorded in the
external Shared-UI-template-verification.txt generated during packaging.

## 4. Changelog

2026-10-26: Recorded the UI-only scope before copying presentation files.

2026-10-26: Added the burgundy shared student UI and protected pathway placeholder,
updated theme/handoff guidance and checked compatibility with the P001 feature
ZIP. Shared UI/auth browser, type/lint/unit/build checks passed as above. No new
backend, feature implementation, caching, dependency or schema work included.
Ready for user-authorized publication to shared main and manual UI overlay use.
