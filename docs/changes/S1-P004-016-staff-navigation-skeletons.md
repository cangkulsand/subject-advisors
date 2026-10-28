# S1-P004-016 — Staff navigation skeletons

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-28
- **Owner / requirements:** P004, user-authorized M6/M7 navigation skeleton extension; coordinator UC20/23 and admin UC21/22, with UC06/07 academic setup destinations shown as planned.
- **Branch:** feature/p004-admin-overview (based on d678a49)
- **Reviewer:** Human peer review pending (coordinator review completed; not human peer approval)

## 1. Plan

### Objective / problem
Provide guarded, navigable workspaces for System Administrators and Academic Coordinators. Existing read-only admin pages remain functional; coordinator and future admin destinations are honest skeletons with no fabricated data or nonfunctional mutation controls.

### Scope and requirements
- In scope: shared responsive staff navigation shell; admin URLs `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/audit`, `/admin/semesters`, `/admin/curriculum`, `/admin/requirements`; coordinator URLs `/coordinator`, `/coordinator/imports`, `/coordinator/data-quality`, `/coordinator/forecasts`, `/coordinator/versions`, `/coordinator/comparison`, `/coordinator/decisions`, `/coordinator/audit`; exact role guards; nested-path role switching; focused route/role helper tests.
- Out of scope: forecast, import, validation, reviewer decision, curriculum, graduation, account mutation or audit business logic; API/database/account/owner policy changes; student UI changes.

### Proposed implementation
- Expected files: `apps/web/src/app/AppRoutes.tsx`, existing admin feature shell/routes/CSS, auth `role-access` helper and tests; add reusable staff shell/navigation configuration and coordinator route/page skeleton.
- APIs / database / interfaces: no API or database changes; future staff pages issue no feature API requests.
- Dependencies / shared-file impact: React Router substitute is the existing `AppLink`/`useAppLocation` SPA navigation. Staff shell shared by coordinator/admin; student routes remain untouched.

### Acceptance criteria
- [x] Admin live overview/users/account/audit screens remain available under SYSTEM_ADMIN guard.
- [x] All listed destinations are reachable and show concise Planned/Coming soon copy without fake metrics, row data or action controls.
- [x] Coordinator and nested coordinator routes require COORDINATOR; unknown staff paths show guarded in-shell 404.
- [x] Nested staff paths select the correct role in RoleSwitcher; student profile setup requirement does not apply to staff.
- [x] Shared shell has grouped, accessible navigation, active route state, breadcrumbs, skip link, mobile dialog close/Escape/focus-cycle/return-focus behavior, and remains usable at narrow widths.

### Verification plan
- Focused role/path and placeholder route tests, then `npm.cmd run typecheck`, focused Vitest, and `npm.cmd run lint` for changed source files. Browser/full build checks are deferred to coordinator review.

### Risk / assumptions / rollback
- Risks: shared staff shell touches existing admin wrapper/CSS and app route table; preserve all existing admin page content and query handling.
- Assumptions: labels and URL map are as specified by the coordinator; admin read screens are already implemented and should not be altered.
- Rollback: remove coordinator shell/routes/config and restore admin shell wrapper and prior exact-path role helper; no data migrations or external state changes.

### Authorized branch publication plan (added after implementation review)
- User explicitly authorized commit and push after completion. Commit one reviewed change on `feature/p004-admin-overview` and push only that branch to `origin`; do not merge, push `main`, deploy, or change production data.
- Stage only the reviewed paths named in the coordinator's handoff: admin API integration/feature/shared DTOs, staff app routes and role helper, admin/coordinator frontend, the relevant auth/integration/admin harness updates, `package.json` admin validation/preview script changes, and change records `S1-INT-017` plus `S1-P004-013` through `016`. Preserve all unrelated or newly concurrent files unstaged.
- Verify staged inventory/stat and whitespace, scan staged additions for credentials, access tokens, connection strings, real email addresses or real Clerk IDs without emitting matched values, commit with repository hooks, then push with upstream tracking to `origin feature/p004-admin-overview` (no force).
- Verify the pushed branch SHA and working tree; confirm `main` remains at `7d4cde7`. If normal push is denied by network restrictions, report the sanitized command failure and stop without escalation or alternate transport.
- Rollback: before push, amend or reset the local commit only if safe and with no concurrent work; after push, use a new revert commit and normal push. No force-push.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `apps/web/src/app/AppRoutes.tsx`; `apps/web/src/features/auth/role-access.ts` and `role-access.test.ts`; `apps/web/src/features/admin/AdminRoutes.tsx`, `AdminShell.tsx`, new `staff-navigation.tsx`, and `admin.css`; new `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`; updated staff-route assertions in `tools/admin/test-ui.mjs` and `tools/integration/test-ui.mjs`.
- **Summary:** Replaced duplicated admin-only shell wiring with a staff shell shared by guarded admin/coordinator routes. Added grouped navigation initialized expanded, preserving collapse state and reopening the group containing the active nested route. Added mobile dialog focus handling, active route indicators and breadcrumbs. Existing admin overview/users/account/audit screens remain as-is; new admin semester/curriculum/requirements URLs show planned pages. Coordinator routes have quick links and planned skeleton pages only. Updated nested staff role detection and the relevant existing harness assertions.
- **Decisions / deviations from plan:** Updated the coordinator-only integration assertion and admin UI assertion to match their new skeleton destinations/navigation. Coordinator placeholders call only the normal account-access check; admin overview retains its existing read-only API behavior. No feature-specific placeholder requests were added. Other pre-existing changes in these harness files belong to earlier dirty admin work and are not attributed to this record.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** Source and actual browser output reviewed for scope, auth guards, unchanged student route table, absence of placeholder feature API calls, responsive shell structure, semantic grouped navigation initialized expanded, 44px grouped-nav targets, active nested-route handling, preservation of collapse choices, focus-visible states, native dialog Escape/backdrop/focus cycling and return behavior. Sidebar nav and mobile dialog scroll their contents at short heights. Coordinator and unknown nested paths remain behind the coordinator role guard; admin nested paths remain behind SYSTEM_ADMIN. No data, account, owner policy, or secret state was changed.
- **Test evidence:** `npm.cmd run test:ui:admin` — 24 passed. `npm.cmd run test:ui:integration -- --installed` — 34 passed with fictional/mock Clerk and API services. `npm.cmd test` — 400 passed, 13 skipped in two existing suites (32 test files passed, 2 skipped). `npm.cmd run typecheck` — passed. `npm.cmd run lint` — passed. `npm.cmd run build:local` — passed. `npm.cmd run check:cloudflare` with workspace-local `WRANGLER_LOG_PATH` — production build and Worker deployment dry-run passed; no deployment occurred. Focused role-path Vitest — 10 passed. Vite 5173 served `/`, transformed `AppRoutes.tsx`, `staff-navigation.tsx`, `CoordinatorRoutes.tsx` and `admin.css` with HTTP 200 and no Vite import error; unauthenticated `/api/me` returned 401. `git diff --check` — passed (Git emitted only the existing CRLF normalization warning for `apps/web/src/app/navigation.tsx`).
- **Manual checks:** Inspected generated fictional-data screenshots at `.wrangler/staff-menu-review/admin-desktop.png`, `admin-mobile.png`, `coordinator-desktop.png`, and `coordinator-mobile.png`. Browser acceptance tests cover admin's three planned destinations and coordinator's seven, account-only/overview request boundaries, no placeholder save/upload/generate controls, route history/active states, all role combinations, student setup independence, sign-out, unknown paths, duplicate IDs, mobile dialog keyboard/backdrop/navigation close, internal short-height scrolling, 320/375/768/1280 widths, and touch-target heights.
- **Defects found and fixes:** Source re-review identified that nested admin user details did not mark/reopen Users & Access, menu disclosure groups initially hid harness-targeted links, and the sidebar could clip expanded groups on short screens. Added boundary-aware descendant active matching, initialized groups expanded while preserving manual collapse and reopening the active group only, and enabled sidebar/drawer scrolling. Re-review also caught an acceptance assertion that omitted the `/api/me` access check; it now expects the exact `/api/me` plus `/api/admin/overview` GET sequence.
- **Review outcome:** PASS — SELF-REVIEW; coordinator source and visual review passed; human peer review pending.
- **Human reviewer / approval:** Pending human peer review. Coordinator inspection is not human peer approval.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Added / Changed / Tests
- **Added / Changed / Fixed / Removed:** Added coordinator workspace skeleton and shared staff navigation shell. Made the scoped admin academic setup destinations clickable planned pages; preserved existing admin data screens. Nested staff route roles now resolve from path prefixes at route boundaries.
- **Affected routes / tables / consumers:** Admin `/admin/*`; coordinator `/coordinator/*`; shared app route table and RoleSwitcher active selection. No database tables or API endpoints changed.
- **Breaking changes / migration steps:** None. Existing coordinator root changes from generic placeholder to workspace overview.
- **Verification summary:** Both staff browser suites, the full 400-pass/13-existing-skip unit suite, typecheck, lint, local build and Cloudflare dry-run passed. Actual running Vite modules returned 200 and unauthenticated account access returned 401. Four screenshots saved in the ignored `.wrangler/staff-menu-review/` directory.
- **Outstanding blockers / follow-up:** Human peer review pending. Two existing credential-dependent unit suites remain skipped; all browser Clerk/API behavior uses fictional mocks. Staff-menu scope changes no student UI, access policy, API, DB, or secrets. The same consolidated commit also includes the separately recorded admin/API and owner-helper work in S1-P004-013 through -015.
- **Final status:** READY_FOR_REVIEW
