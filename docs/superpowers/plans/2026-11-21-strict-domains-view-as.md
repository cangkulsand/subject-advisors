# Strict role domains, owner on gmail and admin "View as" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One email domain per role, the protected owner on `sharhanarean@gmail.com`, and a System Admin "View as" mode (Coordinator: act in a chosen scope; Student: read-only for a chosen student).

**Architecture:** Domain rules live in `eligibleRoles` and flow to every grant and request. The owner move is one reviewed migration (0015) that is a no-op on databases without the pinned Clerk IDs. "View as" is a request header the web app adds to every API call; `authorize` validates it (caller must be an eligible SYSTEM_ADMIN) and returns a `Me` whose `clerkUserId` and role are the viewed identity's (student) or the admin's own with a pinned scope (coordinator). Read-only for student view is enforced once in `authorize`.

**Tech Stack:** TypeScript, Cloudflare Workers, Neon Postgres (plpgsql triggers), React 19, Vitest, Playwright UI scripts in `tools/*/test-ui.mjs`, embedded Postgres DB checks.

**Spec:** `docs/superpowers/specs/2026-11-21-strict-domains-view-as-design.md`

## Global Constraints

- Student: verified `@graduate.utm.my` only. Coordinator: verified `@utm.my` only. System Admin: verified `@gmail.com` only. No exceptions (the protected-owner Coordinator exception is gone at runtime).
- `+clerk_test` addresses are never System Admin (existing rule stays).
- Pinned IDs: account 1 = `user_3L9068HIQmPtA3AzFTo6bBpRAyO` (`sp-mohdsharhan.ag@graduate.utm.my`, owner today, keeps STUDENT only); account 2671 = `user_3MPgmlCxY4NFIuYgPaypFquJ0l6` (`sharhanarean@gmail.com`, owner after).
- View as Coordinator may do everything a coordinator can in the chosen programme × centre; all writes use the admin's own Clerk ID as actor.
- View as Student: any method other than `GET`/`HEAD` → `403 VIEW_AS_READ_ONLY`. Only students with a complete profile can be viewed.
- View-as header from a caller that is not an ACTIVE, domain-eligible SYSTEM_ADMIN → `403 VIEW_AS_DENIED`.
- Header name and syntax: `X-View-As: COORDINATOR;programme=<id>;centre=<id>` or `X-View-As: STUDENT;student=<studentId>` (positive integers).
- UI copy: banner "Viewing as coordinator — {programmeCode}, {centreName}" / "Viewing as student — {studentName} (read only)"; button "Exit view"; recorded-by suffix " (System Admin)"; read-only hint "Read only while viewing as a student".
- UI follows `docs/themeguide.md` typography and readability rules; run `tools/ui/readability.mjs` in UI tests. Commits carry no AI co-author trailer.
- Change ID: S3-P004-033. Change note `docs/changes/S3-P004-033-strict-domains-view-as.md`.

## Review Focus

1. A GET handler that writes (lazy status writes, `initialize`) reached in student view — expected: still no write for the viewed student. Test in Task 3 (`/api/me/initialize` with header is refused).
2. Account cache mixing a view-as `Me` with the admin's own `Me` after Exit view — expected: exit shows the admin workspace, not stale student data. Test in Task 5.
3. View-as scope for an inactive programme or centre, or a non-existent pair — expected: `403 SCOPE_NOT_ASSIGNED`, nothing listed. Test in Task 4.
4. Migration 0015 on a database in an unexpected state (2671 missing SYSTEM_ADMIN, or 1 not owner) — expected: abort with a clear message and no change; on a fresh test DB with neither ID: no-op. Test in Task 2.
5. Admin's own grants: granting COORDINATOR to a gmail account or SYSTEM_ADMIN to `@utm.my` — expected: `ROLE_NOT_ELIGIBLE`. Test in Task 1.

---

### Task 1: Strict domains

**Files:**
- Modify: `packages/shared/src/admin/admin.ts` (`SYSTEM_ADMIN_EMAIL_DOMAINS`, `SYSTEM_ADMIN_EMAIL_RULE`)
- Modify: `apps/api/src/modules/auth/policy.ts` (`eligibleRoles`)
- Modify: `tools/auth/role-provisioning.mjs` (drop owner student-coordinator path; SYSTEM_ADMIN requires gmail)
- Modify: `apps/web/src/features/admin/AdminPages.tsx` (membership shows "Not usable: email domain" when the role is not eligible for the account's email)
- Test: `apps/api/src/modules/auth/multi-role.test.ts`, `apps/api/src/modules/auth/auth.test.ts`, `apps/api/src/modules/admin/*eligib*` or `mutations.test.ts`, `tools/auth/role-provisioning.test.mjs`, shared `admin.test.ts`

**Interfaces:**
- Produces: `SYSTEM_ADMIN_EMAIL_DOMAINS = ['gmail.com'] as const`; `SYSTEM_ADMIN_EMAIL_RULE = 'System Administrator: verified @gmail.com'`; `eligibleRoles(identity, assignment)` unchanged signature, ignores `coordinatorStudentException`.
- Produces (API detail payload): each membership gains `usable: boolean` (`AdminMembership.usable`), computed with `checkRoleEligibility` against the account's verified email.

- [ ] **Step 1: Write failing tests**
  - `eligibleRoles`: `a@gmail.com` with `[SYSTEM_ADMIN, STUDENT, COORDINATOR]` → `[SYSTEM_ADMIN]`; `a@utm.my` with all three → `[COORDINATOR]`; `a@graduate.utm.my` with all three and `coordinatorStudentException: true, protectedOwner: true` → `[STUDENT]`.
  - `checkRoleEligibility({address:'a@utm.my',verified:true}, ['SYSTEM_ADMIN']).eligible === false`; `'x+clerk_test@gmail.com'` + SYSTEM_ADMIN → false.
  - Invitation route: SYSTEM_ADMIN to `a@graduate.utm.my` → 409/422 `ROLE_NOT_ELIGIBLE`.
  - Provisioning tool: `--owner` with a graduate email and COORDINATOR → `ProvisionError`; SYSTEM_ADMIN with `@utm.my` → `ProvisionError`.
  - Update existing tests that assert the old exception or old admin domains (search `OWNER_STUDENT_COORDINATOR`, `coordinatorStudentException`, `graduate.utm.my` + `SYSTEM_ADMIN` in `*.test.*`).
- [ ] **Step 2: Run** `npm test -- apps/api/src/modules/auth apps/api/src/modules/admin packages/shared/src/admin` and `node --test tools/auth/role-provisioning.test.mjs`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the constants, `eligibleRoles`, the provisioning rules (provisioning always writes `email_policy='ROLE_DOMAIN'`), `usable` on memberships in the admin `detail()` route, and the AdminPages label (`admin-pill` muted "Not usable: email domain").
- [ ] **Step 4: Run** the same commands plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): one email domain per role, admin gmail only (S3-P004-033)`.

### Task 2: Migration 0015 — owner moves to gmail

**Files:**
- Create: `db/migrations/0015_owner_to_gmail.sql`
- Modify: `db/migrations/manifest.json` (version `0015`, description "Protected owner moves to the gmail System Admin; graduate account keeps STUDENT only")
- Create: `db/checks/020_owner_to_gmail.sql`
- Modify: `tools/db/migrations.test.mjs` (manifest count/order), the DB check runner list if checks are enumerated

**Interfaces:**
- Consumes: trigger `user_role_audit_guard` / function `db_user_role_audit_and_last_admin` (0004/0006), audit table `user_role_audit_log` (`action` `PROTECT_OWNER`, `REVOKE`).
- Produces: nothing new for the app; schema unchanged.

**Migration algorithm (all in the migration's transaction):**
```
old := id of user_access_assignment where clerk_user_id='user_3L9068HIQmPtA3AzFTo6bBpRAyO'
new := id where clerk_user_id='user_3MPgmlCxY4NFIuYgPaypFquJ0l6'
IF old IS NULL AND new IS NULL: RAISE NOTICE 'skipped: pinned accounts absent'; done   -- fresh/test DBs
IF new already has the owner row: RAISE NOTICE 'skipped: already moved'; done          -- idempotent
IF old IS NULL OR new IS NULL OR new has no SYSTEM_ADMIN row OR old's SYSTEM_ADMIN row is not owner: RAISE EXCEPTION
ALTER TABLE user_role_assignment DISABLE TRIGGER user_role_audit_guard
  UPDATE owner=false on old SYSTEM_ADMIN; UPDATE owner=true on new SYSTEM_ADMIN
  INSERT two user_role_audit_log rows, action 'PROTECT_OWNER', actor '__MIGRATION_0015__',
    reason 'Owner moved to gmail (S3-P004-033)', protected_owner false (old) / true (new)
ALTER TABLE user_role_assignment ENABLE TRIGGER user_role_audit_guard   -- the 0004 lock is back
set_config('app.access_actor','__MIGRATION_0015__',true); set_config('app.access_reason','Graduate account keeps STUDENT only (S3-P004-033)',true)
DELETE old's SYSTEM_ADMIN and COORDINATOR rows   -- the trigger audits REVOKE and checks last-admin
```
Ruling vs spec 7.2 step 5: the `OWNER_STUDENT_COORDINATOR` constraint value and trigger branch stay in the schema, dormant (runtime never honours them after Task 1; dropping them means redefining the 0004/0006 function and rewriting check 006). Restoring the lock = re-enabling the unchanged trigger.

- [ ] **Step 1: Write the DB check** `020_owner_to_gmail.sql` that, on the embedded DB, seeds both pinned Clerk IDs in the starting state (account A: STUDENT + owner SYSTEM_ADMIN; account B: SYSTEM_ADMIN), runs the 0015 body, and asserts: B owner; A has only STUDENT; two `PROTECT_OWNER` audit rows and REVOKE rows; updating B's owner row afterwards still raises "Protected owner administrator membership cannot be changed"; running the body a second time is a no-op; a variant where B has no SYSTEM_ADMIN raises and changes nothing. Wrap the body in a reusable function or `\i`-free DO block the check can call (follow how existing checks exercise migrations).
- [ ] **Step 2: Run** `node tools/admin/test-academic-database.mjs` (or the runner that executes `db/checks`). Expected: FAIL (migration missing).
- [ ] **Step 3: Write** `0015_owner_to_gmail.sql` and the manifest entry.
- [ ] **Step 4: Run** the DB runner and `npm run test:db-tooling`. Expected: PASS; the fresh-DB apply logs the "skipped" notice. Record the pre-existing failure "allows NULL and mixed-case active programme status…" if it still appears (it fails on main too).
- [ ] **Step 5: Commit** `feat(db): migration 0015 moves the protected owner to the gmail admin (S3-P004-033)`.

### Task 3: View-as in `authorize`

**Files:**
- Create: `apps/api/src/modules/auth/view-as.ts`
- Modify: `apps/api/src/modules/auth/contracts.ts` (`Me.viewAs`, `AccessRepository.studentClerkUserId`)
- Modify: `apps/api/src/modules/auth/repository.ts` (implement `studentClerkUserId`)
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `packages/shared` auth `Me` type if the web shares it (`apps/web/src/features/auth/contracts.ts`)
- Test: `apps/api/src/modules/auth/view-as.test.ts`, `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ViewAs = { role: 'COORDINATOR'; programmeId: number; learningCentreId: number } | { role: 'STUDENT'; studentId: number };
  export function parseViewAs(header: string | null): ViewAs | null   // throws AuthError(400,'VIEW_AS_INVALID') on bad syntax
  // Me gains: viewAs?: ViewAs & { adminClerkUserId: string; studentName?: string }
  // AccessRepository gains: studentClerkUserId(studentId: number): Promise<{ clerkUserId: string; studentName: string } | null>
  ```
- `authorize` behaviour with a valid header:
  1. Resolve the caller as today. Caller's eligible roles must include SYSTEM_ADMIN and status ACTIVE, else `403 VIEW_AS_DENIED`.
  2. `options.initialize` with a header → `403 VIEW_AS_READ_ONLY`.
  3. COORDINATOR: if `options.roles` is set and excludes COORDINATOR → `403 ROLE_DENIED`. Return `{...admin, appRole:'COORDINATOR', availableRoles:['SYSTEM_ADMIN','COORDINATOR'], landingPath:'/coordinator', viewAs:{...v, adminClerkUserId}}` (clerkUserId stays the admin's).
  4. STUDENT: method not `GET`/`HEAD` → `403 VIEW_AS_READ_ONLY`. Resolve `studentClerkUserId`; null → `404 VIEW_AS_STUDENT_NOT_FOUND`. Profile state of that Clerk ID must be `COMPLETE`, else `403 VIEW_AS_PROFILE_INCOMPLETE`. Return `{ clerkUserId: student's, appRole:'STUDENT', accessStatus:'ACTIVE', roles:['STUDENT'], availableRoles:['SYSTEM_ADMIN','STUDENT'], profileState:'COMPLETE', studentProfileState:'COMPLETE', landingPath:'/student', viewAs:{...v, adminClerkUserId, studentName} }`.
  5. Log one line `console.info(JSON.stringify({ event:'view_as', admin, role, programmeId?, learningCentreId?, studentId?, method, path }))`.

- [ ] **Step 1: Write failing tests** (`view-as.test.ts` with the fake deps pattern of `auth.test.ts`): parse valid/invalid headers; coordinator header from a STUDENT-only caller → VIEW_AS_DENIED; from a `@utm.my` caller holding SYSTEM_ADMIN (ineligible) → VIEW_AS_DENIED; admin + coordinator header on a `roles:['COORDINATOR']` route → Me with admin clerkUserId and viewAs; admin + student header GET → Me.clerkUserId is the student's; same with POST/PATCH/DELETE → VIEW_AS_READ_ONLY; incomplete profile → VIEW_AS_PROFILE_INCOMPLETE; unknown student → 404; `initialize` + header → VIEW_AS_READ_ONLY; no header → unchanged behaviour (existing tests stay green).
- [ ] **Step 2: Run** `npm test -- apps/api/src/modules/auth`. Expected: FAIL.
- [ ] **Step 3: Implement** `view-as.ts`, contract additions, repository query (`SELECT p.clerk_user_id, p.student_name FROM public.student_profile p WHERE p.student_id=$1`), and the `authorize` branch. Allow the `X-View-As` request header in the Worker's CORS `Access-Control-Allow-Headers` (find it with `grep -rn "Allow-Headers" apps/api/src`).
- [ ] **Step 4: Run** `npm test -- apps/api/src/modules/auth apps/api/src/integration` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): System Admin view-as context in authorize (S3-P004-033)`.

### Task 4: Coordinator scope in view-as, and "(System Admin)" on recorded-by

**Files:**
- Modify: `apps/api/src/modules/admin/academic-contracts.ts` and `academic-repository.ts` (`scopeFor`)
- Modify: `apps/api/src/modules/forecasting/scope-provider.ts` (`viewAsScopeProvider`)
- Modify: `apps/api/src/modules/forecasting/routes.ts` (use the view-as provider when `me.viewAs?.role === 'COORDINATOR'`)
- Modify: `apps/api/src/modules/forecasting/decisions-routes.ts` / `decisions-repository.ts` and shared `OfferingDecision` types (`recordedByAdmin: boolean`)
- Modify: `apps/web/src/features/coordinator/ForecastsPage.tsx:188`
- Test: `apps/api/src/modules/forecasting/routes.test.ts`, `decisions-routes.test.ts`, `scope-provider` test

**Interfaces:**
- Consumes: `Me.viewAs` (Task 3).
- Produces:
  ```ts
  // AcademicScopeReader
  scopeFor(programmeId: number, learningCentreId: number): Promise<CoordinatorAssignment | null> // null unless both exist and are active
  // scope-provider.ts
  export function viewAsScopeProvider(base: ScopeProvider, scope: ScopeOption | null): ScopeProvider
  // listScopes -> scope ? [scope] : []; isScopeAssigned(_, p, c) -> scope matches p and c; other methods delegate to base
  ```
  `ForecastingDependencies` is shallow-copied per request with `scopes` replaced; nothing else in the handlers changes. Decision rows gain `recordedByAdmin` = `recorded_by` holds a SYSTEM_ADMIN role row (one query over the distinct recorders).

- [ ] **Step 1: Write failing tests**: admin view-as for an active pair → `forecast-context` lists exactly that programme and centre; for an inactive centre or unknown pair → context empty and a decision POST → `403 SCOPE_NOT_ASSIGNED`; a decision recorded in view-as has `recorded_by` = admin Clerk ID and `recordedByAdmin: true`; a real coordinator's decision has `recordedByAdmin: false`.
- [ ] **Step 2: Run** `npm test -- apps/api/src/modules/forecasting apps/api/src/modules/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** the reader, provider, route wiring, flag, and the UI suffix `{entry.recordedBy}{entry.recordedByAdmin ? ' (System Admin)' : ''}`.
- [ ] **Step 4: Run** the same plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(coordinator): admin view-as scope; admin decisions marked (System Admin) (S3-P004-033)`.

### Task 5: Web view-as state and headers

**Files:**
- Create: `apps/web/src/features/auth/view-as.ts`
- Modify: the seven API clients: `features/admin/academic-client.ts`, `features/admin/client.ts`, `features/auth/client.ts`, `features/coordinator/client.ts`, `features/offerings/client.ts`, `features/pathway/client.ts`, `features/profile/client.ts`
- Modify: `apps/web/src/features/auth/account-cache.ts` (cache key includes the view-as value)
- Test: `apps/web/src/features/auth/view-as.test.ts`, `account-cache.test.ts`, `client.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WebViewAs = { role: 'COORDINATOR'; programmeId: number; learningCentreId: number; label: string } | { role: 'STUDENT'; studentId: number; label: string };
  export function readViewAs(): WebViewAs | null            // sessionStorage 'sa.viewAs', try/catch, null on bad JSON
  export function startViewAs(v: WebViewAs): void           // writes, clears account cache, navigates to /coordinator or /student
  export function exitViewAs(): void                        // removes, clears account cache, navigates to /admin
  export function viewAsHeaders(): Record<string, string>   // {} or { 'X-View-As': 'COORDINATOR;programme=..;centre=..' | 'STUDENT;student=..' }
  ```
  Admin clients (`admin/client.ts`, `academic-client.ts`) never send the header (admin endpoints are not viewed-as); all others spread `...viewAsHeaders()`.

- [ ] **Step 1: Write failing tests**: header strings for both roles; bad storage JSON → null and `{}`; account cache key differs with and without view-as, and `exitViewAs` clears it (Review Focus 2); auth client sends the header when set.
- [ ] **Step 2: Run** `npm test -- apps/web/src/features/auth`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same plus `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): view-as state and request header (S3-P004-033)`.

### Task 6: Web "View as" picker, banner and read-only hints

**Files:**
- Create: `apps/web/src/features/admin/ViewAsDialog.tsx`, `apps/web/src/features/auth/ViewAsBanner.tsx`
- Modify: `apps/web/src/features/admin/staff-navigation.tsx` (a "View as" button in the admin shell; banner in both staff shells), `apps/web/src/app/StudentShell.tsx` (banner), student edit surfaces that offer saves (planning board, records, profile, graduation confirmations) — disable with the hint when `me.viewAs` is set
- Test: `tools/admin/test-ui.mjs`, `tools/coordinator/test-ui.mjs`, `tools/integration/test-ui.mjs` (mocked API), readability guard

**Interfaces:**
- Consumes: `startViewAs`, `exitViewAs`, `readViewAs` (Task 5); `Me.viewAs` (Task 3); `academic.programmes()`, `academic.centres()` (existing), admin user search `client.users({ q, role:'STUDENT' })` (existing).
- Dialog: radio Coordinator / Student. Coordinator → select programme (active), select centre (active), "Start view". Student → search box, results list name + matric; rows without a complete profile disabled with "Profile not set up yet"; "Start view". Native `<dialog>` like `DummyUserDialog.tsx`.
- Banner: fixed top bar, `role="status"`, copy from Global Constraints, "Exit view" button; visible on every page while `readViewAs()` is set.

- [ ] **Step 1: Write failing UI tests**: admin opens View as → Coordinator → picks pair → lands on `/coordinator` with banner text and can open Forecasts; Exit view → `/admin`, no banner. Student → picks a complete student → `/student` with "(read only)" banner; plan save controls disabled with the hint; a mocked POST returns VIEW_AS_READ_ONLY and is shown as an error, not a crash. 375px: no horizontal overflow; readability guard passes in light and dark.
- [ ] **Step 2: Run** `npm run test:ui:admin`, `npm run test:ui:coordinator`, `npm run test:ui:integration`. Expected: new checks FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three UI suites, `npm test`, `npm run typecheck`, `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): admin View as picker, banner and read-only student view (S3-P004-033)`.

### Task 7: Docs and change note

**Files:**
- Create: `docs/changes/S3-P004-033-strict-domains-view-as.md` (plan, implementation, verification table, changelog, rollout order with the Neon apply step)
- Modify: `README.md` change table row; `docs/clerk.md` (domain rules, owner); `docs/api/admin-users.openapi.json` (`usable`); `docs/database/data-contracts.md` (0015, view-as actor rule)

- [ ] **Step 1:** Write the docs. **Step 2:** Run the full set: `npm run typecheck && npm run lint && npm test`, the three UI suites, `node tools/admin/test-academic-database.mjs`, `npm run test:db-tooling`. Expected: PASS (except the known pre-existing DB failure, named in the note). **Step 3: Commit** `docs: S3-P004-033 change note and doc refresh`.

### Rollout (needs the owner's go-ahead at each step; not part of task execution)

1. Owner confirms; apply 0015 to Neon with the repo's migration CLI (`tools/db/cli.mjs` with the approved target). Dev and prod share it.
2. Merge to main, push dev, verify, push prod, sync the local prod clone.
3. Owner signs in as `sharhanarean@gmail.com` and checks admin, View as Coordinator, View as Student.
