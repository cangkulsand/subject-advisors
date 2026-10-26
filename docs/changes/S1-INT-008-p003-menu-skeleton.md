# S1-INT-008 — P003 academic pathway menu skeleton

- Status: READY_FOR_REVIEW
- Date: 2026-10-26
- Sprint: Sprint 1
- Owner: Integration; P003 handoff scaffolding only
- Related UC / FR: UC17 / FR-G1, FR-G2 (reserved, not implemented)
- Branch / PR: local main; no commit or push requested
- Reviewer: Pending

## 1. Plan

### Objective / problem

The student shell exposes P001/P002 pages but no entry point for P003. Add a
working, clearly unfinished Academic pathway page and explain where P003 starts.

### Scope and requirements

Integration scaffolding only: /student/pathway, sidebar/search/breadcrumb labels,
same-document navigation, active STUDENT and completed-profile guards, a small
replaceable feature entry, and developer handoff instructions from Sprint 1 §7.
Exclude graph rendering, status/eligibility calculations, live graph reads, APIs,
schema/data changes, new packages, other programmers' features and later sprints.

### Proposed implementation

Add features/pathway/PathwayPage.tsx and index.ts with the existing StudentPageProps
contract. Import this always-present skeleton directly into StudentRoutes; no
optional overlay detection or generated registry change is necessary. Add the
shared route in tools/auth/local/main.tsx and one sidebar entry/icon in
StudentShell.tsx (also feeds existing page search). Use the current shell styling.
Add docs/p003-sprint1-handoff.md and extend shared browser checks for the route,
menu navigation, setup/role guard and absence of graph/API activity.

No API, migration, environment or dependency changes. Existing Clerk/session
cache and P001/P002 behavior remain shared dependencies, not reimplementations.

### Acceptance criteria

- Academic pathway is reachable through sidebar/search and direct URL.
- The placeholder explains the feature is upcoming; no fictional graph/statuses.
- Incomplete setup redirects to setup; staff cannot render this student page.
- Navigation reuses Clerk and account cache, and displays the active menu entry.
- P003 has an owned replacement file, exact scope and integration checklist.

### Verification plan

Run npm.cmd run typecheck, npm.cmd run lint, node tools/integration/test-ui.mjs
--installed, npm.cmd run build:local and git diff --check. Verify actual Vite
route/module responses. Browser tests use explicit Clerk/API mocks, not live login.

### Risk / assumptions / rollback

The working tree contains earlier uncommitted integration/auth/shell work;
preserve it. P003's real implementation and read-only API remain future work.
No data operations needed. Rollback only this menu/route/import and new scaffold.

## 2. Implementation

Implemented the planned menu and placeholder. Files added:

- apps/web/src/features/pathway/PathwayPage.tsx and index.ts: typed replaceable
  UC17 entry, Coming soon state, profile/records links and advisory notice.
- docs/p003-sprint1-handoff.md: owner scope, component/token contract, read-only
  endpoint still to implement, dependencies, schema references and acceptance.

Shared edits: StudentShell.tsx adds the menu/icon (also used by page search),
StudentRoutes.tsx adds the pathway area/title/component and complete-profile guard,
tools/auth/local/main.tsx registers /student/pathway. Existing shell CSS is reused.
tools/integration/test-ui.mjs extends route/menu/cache and guard coverage, proves
no feature read/write activity, and checks page search and signed-out behavior.
docs/integration-copy-paste.md links the P003 handoff and lists the placeholder.

No generated integration, page-prop type, API, migration, dependency or environment
changes. No graph or status computation. No deviation from scaffolding scope;
the existing integration guide was updated to make the new handoff discoverable.

## 3. Review

PASS — SELF-REVIEW; human peer review pending.

Actual commands/results:

- npm.cmd run typecheck: PASS.
- npm.cmd run lint: PASS.
- node tools/integration/test-ui.mjs --installed: 23 PASS with explicit mocked
  Clerk/API and the real shared app/installed P001/P002 pages. Includes direct
  pathway route and sidebar presence, complete-profile guard, same-document
  navigation with one account read, no graph requests/mutations from the skeleton,
  search navigation, both staff roles denied and signed-out redirect to sign-in.
  Existing form discard/history and responsive shell checks also pass.
- npm.cmd run build:local: PASS (108 transformed modules).
- git diff --check: PASS (Git line-ending notices only).
- Invoke-WebRequest against the actual local Vite /student/pathway,
  StudentRoutes.tsx and PathwayPage.tsx module URLs: all HTTP 200; no import error.

Scope/contracts/privacy review: P003 behavior is explicitly unfinished; no
fictional subjects, academic statuses, graphs, data writes or auth bypasses added.
Existing student/session key and SDK/account cache are preserved. No secrets or
environment files touched. Backend and database checks are not applicable to this
frontend skeleton; no real-account UC17 acceptance or full graph testing claimed.
No blockers for the requested menu scaffold. UC17 feature work remains P003's task.

## 4. Changelog

2026-10-26: Plan recorded before implementation. Local integration scaffold only.

2026-10-26 — Added protected /student/pathway menu/search/breadcrumb and replaceable
placeholder; documented P003's owned entry and remaining UC17 checklist. Shared
frontend registration only; no breaking API/schema/env changes. Typecheck, lint,
frontend build, 23 mock-browser checks and served-module verification passed.
Status READY_FOR_REVIEW, human review pending. Local only; no commit or push.
