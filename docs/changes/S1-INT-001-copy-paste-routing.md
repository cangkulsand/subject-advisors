# S1-INT-001 — Shared copy-paste profile, records and offerings routing

- Status: READY_FOR_REVIEW; user-authorized shared baseline publication
- Owner: integration / shared routing only
- Date: 2026-10-26
- User authorization: prepare P001/P002 paste-in integration before repository push;
  exclude p002/ feature source from that push. P001 stays in its manual handoff.
- Human review: pending

## 1. Plan

The current launcher is auth-only and P001's independent preview omits offerings.
Provide a shared student shell with /student/setup, /student/profile,
/student/records and /student/offerings, preserving staff/auth routes. Compose
/api/me with the real P001 ProfileReader and dispatch P001 and P002 owned APIs.

Feature modules remain separately delivered. A prepare script discovers complete
canonical apps/ overlays and generates ignored static API/web imports. With no
overlays the shared app must still build and fail closed; no demo adapters or fake
profile completion. Restart dev/build after paste to discover installed modules.
Reject incomplete overlays instead of hiding broken imports. Never load p002/ or
another developer's private checkout automatically.

Expected files: shared apps/api routing contract/dispatcher, shared student shell,
tools/integration prepare/tests, minimal existing local adapter/script/config/docs
edits. Reuse P004 verification and the reviewed owner exports. No feature business
logic, DDL, seed data or changes under p002/. Update the external P001 package to
use/delegate to the shared launcher, preserving existing user artifacts safely.

Verify no-overlay, P001-only, P002-only and combined generation; auth/route unit
tests; shared-shell browser navigation; typecheck/lint/build; isolated paste-in
build with both real overlays. Clearly distinguish mocked routing and live DB tests.
Review/stage explicit paths excluding p002/, environments, generated registries and
external handoffs, then push only after checks pass under the user's existing request.

Rollback uses scoped source changes; no schema reset, data deletion or force push.

## 2. Implementation

Added a shared student shell for setup/profile/records/offerings and an API
dispatcher for auth, P001 and P002. tools/integration/prepare.mjs discovers only
canonical pasted apps/ modules and generates ignored static registries under
.generated-integration/. The same real P001 ProfileReader feeds /api/me and P002.
Missing modules are unavailable; missing APIs still verify real student access.

The standard dev/build/typecheck/test commands prepare registries automatically.
Shared typecheck/tests include packages/shared so pasted P002 identifier/type tests
are covered. Local Worker bindings use the existing AuthBindings interface rather
than depending on an independently generated ambient LocalAuthEnv declaration.
No code under p002/ was edited or installed into the shared checkout. Both real
owner overlays were composed only in an isolated external review directory.

Publication review caught Git CRLF normalization changing applied migration bytes.
Added .gitattributes to preserve exact canonical SQL bytes across clones while
retaining the historical P004 file's existing normalization. No applied SQL was
edited. Imported Markdown hard breaks are retained as source formatting.

Updated shared setup/integration docs and corrected the old Neon production
onboarding snippet to the confirmed development workflow. The pre-existing
database baseline, source mapping, ERD, checks, tools and evidence are included
in this user-authorized repository publication; their earlier live execution
evidence remains in DB-FOUNDATION-001. No DB writes/migrations ran in this change.

The external integration-ready P001 ZIP delegates its local entry points and
launcher to this shared app instead of keeping an isolated auth/profile-only router.
It retains the same P001 business logic and is not included in this repo commit.

## 3. Review

PASS — SELF-REVIEW; independent peer review pending.

Actual checks:
- Root npm run typecheck, lint, build and build:local: PASS without owner modules.
- Root npm test: 59 PASS, 5 optional historical auth DB tests SKIPPED.
  The 12 new dispatcher tests cover both owners, real profile-state composition,
  missing-feature auth/role denial, forwarding and unchanged auth body rejection.
- npm run test:integration: 6 PASS for absent/P001/P002/combined registry generation,
  partial overlay rejection and deterministic preparation without source mutation.
- npm run test:ui:integration: 9 PASS with the actual shared app and mocked Clerk/API;
  all navigation links, profile-to-offerings transition, setup/staff guards and
  320px/1440px shell layout checked. Existing auth browser suite: 11 PASS.
- Isolated combined real P001/P002 overlays: typecheck, lint, Worker/frontend builds
  PASS; 186 unit tests PASS, 13 optional auth/offering DB tests SKIPPED. Includes
  P002 shared identifier tests. Installed-page shared browser suite: 9 PASS, with
  mocked Clerk/API, not real-account/live database acceptance.
- Refreshed P001-only handoff with shared launcher: check.mjs PASS, 108 tests PASS,
  5 optional historical auth DB tests SKIPPED; strict types/lint and both builds PASS.
- Database static review/source hash, 12 tooling tests and lint: PASS. Applied
  migration bytes/checksums remain unchanged; no repeated live SQL write test claimed.
- Final staged diff whitespace check: PASS. After applying the Git byte-preservation
  attributes, all three staged SQL blobs exactly match the actual applied SHA-256
  records. Explicit staged-path review excludes p002/, secrets and generated files.

Review findings fixed: adjusted generated relative imports after moving registry
files outside private .wrangler; the original Worker build caught this. The initial
isolated P002 paste omitted its demo test fixtures; copied the actual owned fixtures
and reran types/tests successfully. Removed the ambient binding dependency exposed
by P001's separate tsconfig. Vite continues denying all private .wrangler content.

Remaining: real two-user Clerk/browser/combined HTTP and DB acceptance, official
catalogue data, full concurrency/accessibility audit and peer review. No feature
code was invented to hide missing owner modules. Direct Git publication is explicitly
authorized by the user and does not constitute peer approval or production deployment.

## 4. Changelog

2026-10-26: Plan created before shared integration edits.

2026-10-26: Added shared routes, student navigation, optional installed-module
preparation, profile-reader composition, P002 dispatch and integration checks/docs.
Prepared the validated database foundation and shared routing for user-requested
main publication, excluding p002/, credentials, generated adapters and external
P001 handoff files. No production action, schema reset or feature implementation.
