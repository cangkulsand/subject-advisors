# S1-P004-013 — Read-only administration workspace

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-28
- **Owner / requirements:** P004, user-authorized first M7 administration slice; UC21 / FR-I1, FR-I6 and read-only UC22. This is an explicit extension beyond the original Sprint 1 authentication deliverable.
- **Scope:** UC21 overview; read-only UC22 account lookup and access history.
- **Branch:** feature/p004-admin-overview, based on reviewed multi-role commit d678a49.
- **Execution:** User explicitly requested direct coordinator implementation.

## 1. Plan

Build the admin shell, Overview, searchable Users & Access, account detail and read-only Audit screens. Reuse the existing visual system and multi-role authorization. Every admin API request must verify active SYSTEM_ADMIN membership on the server; student profile completion is independent. Do not expose academic histories, passwords, secrets, or mutation actions.

Use existing account, membership and immutable audit tables (migration 0004 already applied to development). Clerk supplies optional identity enrichment; provider failures must be explicit rather than fabricate names/emails or hide authorization failures. Bound searches and pagination. Dashboard counts are real database aggregates, with unique accounts distinguished from overlapping role memberships. Admin reads are no-store and not persisted in browser storage.

Risks/dependencies: require the existing Clerk/Neon bindings, reviewed multi-role commit d678a49 and migration 0004 on the target environment. Counts describe application account rows, rather than every account in the Clerk instance. Name/email searches with more than 100 provider matches require narrowing; account IDs remain searchable during provider search outages. Rollback: remove this feature's routes/registry hook and restore the prior admin placeholder; no database rollback is required.

Routes: /admin, /admin/users, /admin/users/:id, /admin/audit; GET-only /api/admin/overview, /api/admin/users, /api/admin/users/:id, /api/admin/audit. Planned curriculum/semester menu items remain clearly unavailable. No role grants, suspension changes, schema migration, merge to main, push or deployment.

Verification: server authorization/query validation and privacy regressions, parameterized repositories, identity/session changes, browser read-only navigation/search/details/audit, loading/empty/error/denial states, 375px/desktop layout and keyboard navigation. Run integrated typecheck/lint/unit/build plus relevant browser and Cloudflare dry-run checks. All fixture identities are fictional; no live account enumeration or role changes.

## 2. Implementation

- Added scoped responsive administration shell, aggregate Overview, paged Users & Access, account detail/membership history and Audit Log. Academic Semesters and Curriculum are visibly planned and unavailable. Existing student screens and coordinator placeholder remain intact.
- Added GET-only `/api/admin/overview`, `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/audit`, shared DTOs, parameterized SELECT repositories and minimal Clerk identity enrichment. Every request authorizes active SYSTEM_ADMIN membership before data access, independently of student profile setup. Overview omits identity details, actors, targets and free-text reasons.
- Added role/access filters, bounded search, pagination (20 rows), explicit missing/provider-degraded identities, loading/empty/retry states and date validation. Audit date ranges are inclusive UTC calendar dates, independent of database timezone; displayed event times use the browser timezone.
- Admin reads use bearer tokens, `no-store`, cancellation, a 15-second deadline and session-change checks; admin datasets are not written to browser storage. Role and access mutations are unavailable.
- Shared integration changes are limited to the admin registry/dispatch, AppRoutes, a query-aware navigation hook and updated integration fixtures. Added npm scripts `test:ui:admin` and `preview:admin`; lint includes `tools/admin`. No dependencies, schema or environment bindings changed.
- Added fictional-only browser fixtures and a loopback preview on port 5175, isolated from production entry points. No Clerk or database credentials are read by the preview. Screenshots are ignored under `.wrangler/admin-review/`.

## 3. Review

**Outcome: PASS — SELF-REVIEW; human peer review pending.** Inspected actual implementation and shared-file diffs for scope, compatibility, authorization, privacy, parameter binding, session changes and accessible states. Fixed issues found during verification: precise filter accessible names; empty-list reset refresh; mobile drawer focus cycling; original installed-owner test semantics; deterministic UTC audit boundaries and PostgreSQL-incompatible year zero validation. The API sanitization regression now uses a generic redacted database error string rather than a connection URL. Inspected desktop Overview and mobile Users screenshots.

Verification performed:

- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed, including the new admin tools.
- `npm.cmd test` — final run: 390 passed, 13 skipped across two existing credential-dependent database suites; no new skipped admin tests. Focused admin API/provider tests also passed (27 tests).
- `npm.cmd run test:integration` — 7 passed, including admin registry generation and absence/presence combinations.
- `npm.cmd run test:ui:admin` — 12 passed with actual application components and mocked Clerk/API. Covers overview privacy, search/filter/pagination, memberships/history, literal untrusted audit text, empty/degraded/loading/error/retry states, student/coordinator denial before admin requests, 320/375/768/1280px layouts, modal keyboard behavior and keyboard table scrolling.
- `npm.cmd run test:ui:integration -- --installed` — 34 passed with both actual student owner modules and mocked services, including role switching, setup guards, preserved drafts, records, offerings and caching.
- `npm.cmd run build` — passed.
- `npm.cmd run check:cloudflare` with `WRANGLER_LOG_PATH=.wrangler/logs/admin-dry-run.log` — production frontend build and Worker deployment dry run passed. The initial dry run completed but reported an unwritable external log path; repeated with workspace-local logs successfully. No deployment occurred.
- `git diff --check` — passed. Main and origin/main remain at 7d4cde7.
- Running `npm.cmd run preview:admin` — verified the fictional-data label, loaded Overview from the loopback fixture server and navigated to Users successfully, without Playwright API interception.

Limits: live Clerk identity search and real PostgreSQL execution of the new SELECT queries were not exercised. SQL was parsed using libpg-query and projections checked against canonical migrations; all API/browser service responses in these tests are fixtures. No live identities were enumerated, memberships granted, accounts suspended, database migrations run, commits pushed to `main`, or services deployed for this change. Feature-branch publication is tracked separately in S1-P004-016. An explicitly assigned eligible SYSTEM_ADMIN account is required for live `/admin` access; the fictional preview does not grant any access.

## 4. Changelog

2026-10-28 — S1-P004-013 — **Added / Security / Tests / Docs:** implemented the first read-only M7 administration workspace with real aggregate/account/audit API boundaries and server-side admin authorization. Added responsive screens, minimal provider identities, validation, session isolation and fictional preview tooling. Compatible with existing student features and migration 0004; no new migrations, dependencies or bindings. Status READY_FOR_REVIEW; peer review, live-service acceptance and any later merge/deployment remain outstanding.

Local review: run `npm.cmd run preview:admin`, then open `http://127.0.0.1:5175/admin`. The page is visibly labelled as fictional and makes no live-service connections. For normal development, use `npm.cmd run dev` and an already provisioned eligible SYSTEM_ADMIN account.
