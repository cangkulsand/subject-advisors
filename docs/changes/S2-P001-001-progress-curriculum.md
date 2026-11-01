# S2-P001-001 Academic progress and curriculum management

- Owner: P001, Sprint 2; UC05 and UC06 only
- Status: READY_FOR_REVIEW; independent peer review pending
- Date: 2026-10-31
- Input: supplied shared main ZIP plus P001-Sprint1.zip; no Git metadata supplied

## 1. Plan

Implement UC05 (FR-A5) and UC06 (FR-B1/B2/B4/B5/B7). UC05 reads the authenticated student's existing curriculum and history, counts each subject credit entitlement once, separates completed and exempted credits, and distinguishes credit progress from prescribed-subject completion. UC06 permits SYSTEM_ADMIN accounts to maintain subject metadata, curriculum mappings, mandatory/co-requisite/advisory links and explicit per-subject semester restrictions against existing curricula.

UC07 graduation-requirement editing, programme credit totals and semester load configuration are excluded, along with eligibility/recommendation/scheduling engines, role management and other programmers' features. Existing programme, curriculum and graduation configuration is read only. No official institutional policies or catalogue records will be invented.

Use additive progress/curriculum modules and a dedicated authenticated Sprint 2 application adapter/launcher. Preserve all existing shared and Sprint 1 files. Provide typed handlers for shared-router integration, a collision/hash-checked handoff, a ZIP manifest and rollback instructions. No production deployment, remote database writes, migrations, credentials, commit or push.

Accept only verified Clerk identity and backend roles. Writes use parameterized SQL and atomic Neon transactions; existing database triggers enforce graph and historical-record integrity. Reject stale curriculum edits using a revision of the saved snapshot. Reference rules are explicit; classification/semester restrictions are administered rather than inferred from credit values alone.

Acceptance: own progress only; no duplicate credits across retakes; exemptions without credits still satisfy the subject; failed/withdrawn attempts earn zero; incomplete configuration is flagged; admin-only mutations; cycle/self/cross-curriculum/duplicate dependency rejection; co-requisites/advisory links remain distinct; safe failed writes; responsive accessible forms with review before save.

Verification: domain/route/repository contract tests, existing regressions, typecheck/lint, both application builds and mocked browser interaction tests, desktop/mobile image inspection, fresh ZIP installation/integrity check. Real Clerk/Neon acceptance requires privately supplied settings and is reported separately. Rollback removes only manifest-listed additive files.

## 2. Implementation

- Added `apps/api/src/modules/p001-sprint2/`: typed contracts, progress aggregation, strict validation, role-gated routes, Neon repositories and transaction adapter. UC05 uses one statement for a consistent owner-scoped source snapshot. UC06 uses revision checks, curriculum advisory locks, shared-subject row locks, atomic writes and the existing foundation integrity triggers.
- Added `apps/web/src/features/p001-sprint2/`: progress page, administrator curriculum page, authenticated client, scoped styles and guarded routes. Includes explicit review before writes, stale/error handling, cancel behavior and accessible controls. Retakes and exemptions have separate credit/satisfaction semantics.
- Added `tools/p001-sprint2/`: additive local app/Worker adapter, launcher, complete check runner, browser tests, isolated PostgreSQL tests and read-only handoff verification. Added separate TypeScript/Vite/Wrangler configs, handoff documentation, labeled review screenshots and a hash manifest.
- No existing shared or Sprint 1 files changed: SHA-256 comparison against both input ZIPs passed for all 141 supplied files. Root npm manifest/lockfile, auth policy, other owners' modules and schema are unchanged.
- No database migration, new runtime dependency, official curriculum seed, credentials, role assignment, remote database write, commit, push or deployment. Optional PGlite 0.5.14 is installed only in an isolated verification runtime, excluded from the payload.
- The additive launcher is the runnable integration. For a later merge into the shared main launcher, the documented handler/frontend entry points require a small reviewed router/navigation registration. No shared snapshots are supplied for replacement.
- Implementation choices: use existing curricula (a UC06 precondition); do not create/edit UC07 credit totals or requirement rows. Subject classifications/compulsory mapping flags and per-subject semester rules are UC06 data. Do not remove mappings or reconcile historical credits. Requirement progress is read-only and conservatively matches explicit category names.

## 3. Review

- Outcome: PASS — SELF-REVIEW. Independent human approval remains pending.
- `node tools/p001-sprint2/check.mjs`: PASS typecheck, lint, 153 tests (45 new + 108 existing), frontend build and Cloudflare Worker bundle; 5 optional historical live auth-database tests skipped. Final check repeated after adding all helper scripts and accessible form names.
- `node tools/p001-sprint2/test-ui.mjs`: 22 PASS with simulated Clerk/API, including role denial, progress filtering/retry/incomplete configuration, review-before-write, stale/cancel behavior, all relationship types, shared-edit acknowledgment, removal, 320/390/768/1440px layouts and 200% zoom/focus. Early test-selector failures were corrected by providing explicit select names and scoping the saved-subject assertion.
- `node tools/p001-sprint2/test-db.mjs`: 16 PASS using actual PostgreSQL SQL/triggers in isolated PGlite memory. New subject/mapping/semester persistence, duplicate rollback, stale-write prevention, invalid references, explicit FYP1 exception, mandatory chain/cycle rejection, distinct concurrent links, relationship editing/removal, shared-subject attachment, cross-curriculum rejection, student isolation, retake/zero-credit handling, historical-credit protection, shared revision changes and UC07 non-mutation verified.
- Screens inspected: progress desktop/mobile and curriculum desktop/mobile; readable forms, status text, controls and layout. Labeled test screenshots included as review evidence.
- ZIP installation verification: extracted package preflight, installed integrity and deliberate collision rejection are checked during final packaging. See the generated handoff manifest and final packaging results.
- Source/contract/scope review: all writes require active SYSTEM_ADMIN; progress requires active STUDENT plus setup and uses only verified identity. SQL is parameterized; errors redact internal details. UC07 write endpoints and editors are absent. All writes carry stale-revision guards and use one transaction. Existing academic credit/protection triggers remain authoritative.
- Runtime constraints: real Clerk/Neon account acceptance, deployed service permissions, independently concurrent database sessions and institutional catalogue/policy approval were not tested. Optional local PostgreSQL checks are not represented as live Neon tests. No real user data was modified.

## 4. Changelog

- Date: 2026-10-31; change ID S2-P001-001-progress-curriculum; owner P001.
- Type: Added, Tests, Docs.
- Added: UC05 academic credit/subject progress; UC06 administrator subject/catalogue mappings, mandatory/co-requisite/advisory relationships, cycle validation, per-subject semester configuration, review-before-save and revision conflict handling.
- Routes: `/api/p001-sprint2/progress`, `/api/p001-sprint2/curricula` and subject/dependency subresources; pages `/student/progress` and `/admin/curriculum` in the dedicated launcher.
- Compatibility: additive overlay requiring shared main plus P001 Sprint 1 and canonical database foundation. No existing file replacement, root dependency change or migration. Requires normal private Clerk/Neon development settings for live use.
- Verification: 153 unit/route/client tests, 22 mocked browser checks and 16 isolated PostgreSQL checks passed; typecheck/lint/build passed; existing-source SHA-256 comparison passed. Five optional live auth-database tests skipped.
- Remaining: real-account Neon acceptance, human peer review and reviewed registration in any separately maintained shared app launcher. No UC07 functionality added.
- Final status: READY_FOR_REVIEW.
