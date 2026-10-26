# S1-INT-005 — Keep Clerk initialized during student navigation

- Status: READY_FOR_REVIEW
- Date: 2026-10-26
- Scope: shared frontend navigation; no backend/data/permission changes
- Human review: pending

## 1. Plan

The session account cache removes repeated /api/me reads, but ordinary anchor
navigation reloads the entire document and restarts Clerk, showing Loading sign-in.
Use a small native History API navigation adapter in the existing shared app, without
adding a routing package. Student links retain normal hrefs, modified-click/new-tab
behavior and direct-link reload support. Browser back/forward updates the page.
The Clerk provider stays mounted; auth redirects and profile setup completion use
the same adapter when the app router is mounted, with a full-page fallback in
standalone owner/test hosts. Existing first-load SDK/auth guards remain unchanged.

Register existing profile/record/offering dirty-state checks with the shared adapter.
Confirm discard before link or back/forward navigation; retain native beforeunload
warnings for reload/close. Auth-driven redirects may bypass discard prompts to keep
permission/session guards authoritative. Preserve current user/session component keys.

Verify actual document/provider identity across pages, one account request, history,
cancel/discard behavior, setup redirect and existing frontend/backend regressions.
No new dependency, schema/API change, commit, push or production deployment.
Rollback is a scoped source revert; preserve all earlier uncommitted cache work.

## 2. Implementation

Added apps/web/src/app/navigation.tsx with a native History API store, AppLink,
internal navigation and back/forward handling. The local route host subscribes to
the pathname while its Clerk provider remains mounted. Student links, auth
redirects and profile setup completion use this adapter. Standalone feature hosts
retain ordinary document navigation when no shared router is subscribed.

Profile, record and offering forms register their existing dirty state with the
adapter. Cancelled navigation preserves the draft; reload/close still uses the
native beforeunload warning. Profile/setup instances reset on an accepted route
change. Auth redirects preserve permission enforcement.

Preserved the concurrent student shell work: its extracted StudentShell component
uses AppLink for sidebar, brand, search and account links. Browser tests open the
responsive drawer before clicking and inspect closed navigation as hidden content.
The test-only Clerk mock simulates SDK initialization and counts provider mounts.
No production Clerk provider behavior, backend or dependency changes.

## 3. Review

PASS — self-review; independent human acceptance pending.

Actual commands and results in the integration checkout:

- npm.cmd run typecheck: PASS; npm.cmd run lint: PASS.
- npm.cmd test: 203 PASS, 13 optional database checks SKIPPED.
- node tools/integration/test-ui.mjs --installed: 15 PASS. Explicit mocked
  Clerk/API with the actual shared route host and installed P001/P002 pages.
  Checks document identity, provider mount count, one /api/me request, absence
  of repeated Loading sign-in, back/forward, cancelled/discarded dirty forms,
  setup save navigation, permission/setup guards and responsive shell overflow.
- node tools/auth/test-ui.mjs: 11 PASS.
- node tools/auth/test-account-cache.mjs: 7 PASS.
- node tools/p001/test-ui.mjs: 19 PASS.
- node tools/offerings/test-ui.mjs: 25 PASS.
- npm.cmd run build and npm.cmd run build:local: PASS.
- git diff -- apps/api: empty. No backend changes or database execution.
- Running Vite /main.tsx and the navigation/StudentShell modules: HTTP 200,
  serving useAppPathname, navigateApp and AppLink respectively. An initial nested
  main-module URL returned the HTML fallback; verified the correct /main.tsx URL.
- git diff --check: PASS after removing one extra trailing blank line in the
  shared browser script. Concurrent shell styling remains preserved.

An initial npm invocation was blocked by PowerShell's npm.ps1 execution policy;
used npm.cmd without changing that policy. Early shared browser runs failed on
closed mobile navigation selectors; tests now open the drawer before user clicks.
A type/build attempt encountered the concurrent shell extraction before its new
file existed; typecheck, lint and build subsequently passed with that file present.

These are mock browser regressions, not a claim of real Clerk login acceptance.
First entry, hard refresh and a new browser tab still initialize Clerk. Normal
student navigation keeps the provider mounted; individual feature data loads
remain independent. No commit, push, schema operation or deployment performed.

## 4. Changelog

2026-10-26: Plan created before navigation edits.

2026-10-26: Implemented in-app student navigation and dirty-form guards; verified
203 unit checks and 77 mocked browser checks (15 shared, 11 auth, 7 cache, 19 P001,
25 offerings). Both build targets, typecheck and lint passed. Ready for review.
