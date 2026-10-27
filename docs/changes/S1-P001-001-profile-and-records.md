# S1-P001-001 — Academic profile and self-reported attempts

- Status: READY_FOR_REVIEW (manual handoff; catalogue/account acceptance dependencies below)
- Date: 2026-10-26
- Owner: P001, Sprint 1; UC03/FR-A3 and UC04/FR-A4
- Branch/PR: isolated manual handoff; no commit or push
- Human reviewer: pending

## 1. Plan

Implement profile setup/editing and academic record create/read/update in P001-owned
modules against the existing integer-ID schema. Reuse verified P004 identity and
ProfileReader; enforce owner scope, curriculum membership and attempt uniqueness.
Completed credits derive from configured subjects, exemptions require explicit
recognition, failed/withdrawn earn zero. No graduation totals or other owner features.

Use new tools/p001 local adapters/configuration instead of overwriting shared P004
preview files. This additive integration is a deliberate refinement of the standalone
plan and makes paste-in manual delivery safe. No root package/dependency changes.
Read-only form options under /api/profile/options are a narrow P001 form contract
using existing reference tables, not a catalogue-management API. Empty configured
data stays empty; labeled fixtures exist only in tests. No production auth bypass.
Use scoped CSS semantic tokens because the shared Tailwind foundation is absent;
do not install Tailwind or rewrite global styles. Employment hours use existing
columns; no new employment-text column is invented.

Setup completion requires name, valid curriculum and both nonnegative integer hour
values, with optional matric number. Exemptions require explanation in remarks.
These are explicit data-entry decisions, not newly asserted university policies.
Different-semester attempts are retained; no silent overwrite/double counting.

Expected files: apps/api/src/modules/{profile,records}, apps/web/src/features/
{profile,records}, tools/p001, P001-specific tsconfig/Vite/Wrangler configs and docs.
No existing shared files need replacement. Database migrations are not required.

Acceptance: setup persists/reloads and updates /api/me; records are own-only and
curriculum-scoped; invalid/duplicate writes fail safely; all four outcomes distinct;
zero-credit exemptions work; cancel/errors preserve data; mobile/keyboard forms;
read contract exposes attempts to P003 without implementing its graph.

Verification: targeted unit/route tests, strict typecheck/lint/build; opt-in actual
PostgreSQL repository tests on the already confirmed development branch with every
fixture inside rollback; mocked browser tests at mobile/desktop widths. Disclose
unrun real-Clerk/two-account browser checks and missing approved catalogue data.

Rollback: remove additive files in a review copy; no reset, down migration or data
deletion. Handoff contains only new P001 files, manifest, instructions and ZIP;
never secrets, unrelated changes, generated dependencies or real data.

## 2. Implementation

Implemented P001 profile repository, ProfileReader, strict validation, owner-scoped
profile/options routes, attempt-based record repository/routes, bearer API client,
profile/setup form, records list/create/edit form and scoped light-theme styles.
Added new P001-only Vite/Wrangler/local preview adapters, validation/build/browser/
database test scripts, manifest collision checker and handoff instructions.

No existing shared files, P004 modules, package files or migrations were modified.
The additive preview is launched by node tools/p001/dev.mjs, not npm run dev.
Reference selectors are read-only and never seed data. All fixture data is labeled.
P003 receives raw attempts and a successful-save notification, not a new graph API.
The full edited-file inventory and SHA-256 hashes are in p001-handoff-manifest.json.

Explicit decisions: setup requires both integer hour values; exemptions require
remarks; null/ACTIVE programme/curriculum status is selectable; other statuses
are omitted. These are documented engineering decisions, not official credit policy.
Retakes use the already-applied constraints. No DB schema or real access data changed.

## 3. Review

PASS — SELF-REVIEW; independent human approval pending.

Actual verification:
- node tools/p001/check.mjs: strict typecheck, lint, frontend and Worker builds PASS;
  96 unit/route/client tests PASS (49 P001, 47 existing auth); 5 optional historical
  auth database tests SKIPPED because their separate credentials were not supplied.
- node tools/p001/test-ui.mjs: 19 browser checks PASS with explicitly mocked Clerk
  and API responses. Setup-to-records refresh, error/cancel state, credit-free
  exemption, editing/conflicts and keyboard focus verified; no page overflow at
  320/375/768/1024/1440px, plus profile widths and 200% CSS page zoom.
- node tools/p001/test-db.mjs --target <explicit approved development target>:
  15 actual Neon repository assertions PASS; connected project/branch validated;
  every synthetic write inside BEGIN/ROLLBACK and no fixture profile/reference rows
  remain. Dedicated DB_FOUNDATION_URL was supplied only to the test process.
- Desktop/mobile records screenshots visually inspected; profile screenshots also
  included for review. Screenshots show only DEMO / NOT OFFICIAL fixtures.

Findings fixed: beforeunload state could interrupt successful setup navigation;
fixed it before browser acceptance. Made select accessible names explicit after a
browser selector mismatch. Scoped status assertions to saved attempts instead of
also matching option labels. Serialized the pg test adapter's concurrent option
reads to avoid pg 9's future single-client query restriction. Reran affected tests.

Scope/ownership, bearer-only identity, payload allowlists, safe errors, single atomic
write SQL, retake uniqueness and no credential logging reviewed. No DB/SDK errors
are returned to clients. No real-user browser session was used.

Remaining: approved catalogue data, real two-user Clerk browser acceptance,
multi-session competing-write tests, full accessibility audit, shared shell/router
integration and institutional/peer review. No graduation/status projection policy
is invented. Additional free-text employment persistence would need DB-owner review.

## 4. Changelog

2026-10-26: Plan created before implementation. Scope UC03/UC04 only.

2026-10-26: Added profile/record APIs and forms, ProfileReader integration, attempt
contracts, read-only selectors, new isolated preview/configuration and tests.
Recorded 96 passing unit/route/client checks, 19 mocked browser checks and 15 actual
rollback-only Neon checks. Packaged new files only for manual paste/review. No shared
file replacement, schema migration, official seeds, deployment, commit or push.
