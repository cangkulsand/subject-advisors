# P004 auth handoff — UC01 and UC02

Status: auth feature modules implemented and locally checked; full application integration
and live-service acceptance remain pending. Source specification: `sprint1 (1).md`.
Only Programmer 4's tasks are covered.

## Files and scope

- `apps/api/src/modules/auth/`: contracts, Clerk verification, policy, Neon repository,
  two endpoint handlers, factory and tests.
- `apps/api/src/middleware/auth.ts`: reusable server-side authorization.
- `apps/web/src/features/auth/`: React provider/pages/guards/logout, API client, CSS and tests.
- `db/migrations/20261024_p004_user_access_assignment.sql`: P004's table only.
- `tools/auth/`: module build and mocked browser checks.
- `docs/p004-auth-plan.md`: implementation sequence and boundary decisions.

Shared additions: root `package.json`, `.gitignore`, `tsconfig.auth.json`,
`vitest.auth.config.ts`, `eslint.config.mjs`. These only validate the auth feature.
No shared app shell, Worker entry point, health check, catalogue, profile, records,
offerings or pathway implementation was created. Existing setup notes are untouched.

## Run the feature checks

From PowerShell:

```powershell
Set-Location 'D:\sharhan\development\subject advisors'
npm.cmd install
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:ui
```

Node >=22.12 is required by this harness's pinned tooling. Production dependencies:
Clerk backend/React, Neon serverless HTTP, React/React DOM. No application password
storage and no alternate auth/database implementation.

Installation during this session could not reach npm (network EACCES).
Local validation used ignored node_modules junctions to already installed packages
elsewhere in the workspace; those packages were not modified. package.json pins the
versions tested. There is no generated lockfile; generate/review one with `npm install`
when registry access is available. These local junctions are not a portable install.

`build` generates auth module bundles under ignored `dist-auth/`; it does not build
or deploy a full Vite app or Worker. A local-only `npm run dev` preview is now available; see p004-local.md. The production app still requires FOUNDATION
to supply its app entry points.

## Configuration

Wire these into FOUNDATION's existing configuration, using local ignored files for
development and Cloudflare secrets for server secrets. Do not put server secrets in
VITE variables or client props.

| Setting | Location | Purpose |
| --- | --- | --- |
| VITE_CLERK_PUBLISHABLE_KEY | Browser | Existing selected Clerk instance's public key |
| VITE_API_BASE_URL | Browser | API origin, or empty for same-origin / Vite proxy |
| CLERK_PUBLISHABLE_KEY | Worker | Same Clerk instance's public key |
| CLERK_SECRET_KEY | Worker secret | Session/user verification via Backend API |
| CLERK_AUTHORIZED_PARTIES | Worker | Comma-separated exact frontend origins, e.g. http://localhost:5173 |
| DATABASE_URL | Worker secret | Neon connection string for application database |
| AUTH_TEST_DATABASE_URL | Test process only | Optional dedicated Neon test database |

Use the existing selected Clerk application; do not initialize a replacement app.
In its development instance, configure email/password registration and mandatory email
verification. Disable username/phone-only registration for this flow. The backend
requires the current **primary** email to be verified and its exact domain to be
graduate.utm.my for student access. This deliberately rejects a personal primary
email even if an older institutional secondary email remains verified.

Clerk's UI handles email verification, duplicate accounts and sign-in errors.
Do not add UserProfile/UserButton account-editing controls to application forms.
If email is changed externally, the next protected request rechecks current Clerk
data and denies noncompliant students.

Configure Clerk sign-in/sign-up paths as /sign-in and /sign-up, and the home/post-auth
destination as /auth/complete. Both UI components force that destination. Configure
allowed frontend origins and production domains for the selected instance. Any optional
Clerk email allowlist is supplemental; it is not the authorization boundary.

References: [Clerk authenticateRequest](https://clerk.com/docs/reference/backend/authenticate-request),
[Clerk getSession](https://clerk.com/docs/reference/backend/sessions/get-session),
[Clerk SignUp](https://clerk.com/docs/react/reference/components/authentication/sign-up),
[Neon HTTP driver](https://neon.com/docs/serverless/serverless-driver).

## Migration and trusted role provisioning

Apply the migration once through FOUNDATION's migration runner. It has no dependency
on catalogue or profile tables. Until that runner exists, the database owner can execute
its SQL in the **development** Neon SQL editor. No migration was applied to an external
database during this implementation.

The table is `user_access_assignment`, with UUID primary key, unique `clerk_user_id`,
role/status checks and timestamps. Student initialization always inserts STUDENT/ACTIVE
with ON CONFLICT DO NOTHING, then reads the persisted row. It cannot change roles,
reactivate suspended users or replace timestamps. The unique constraint resolves insert
races; the subsequent read uses a fresh statement snapshot.

Manual first administrator/approved coordinator provisioning:

1. In the existing Clerk development dashboard, identify the specifically approved
   person's account. Confirm its exact user ID and intended role out of band. Never
   select the earliest/newest registrant automatically.
2. As a trusted database owner, inspect any row for that exact ID. Do not take role or
   ID inputs from a browser request, public metadata or an application endpoint.
3. For an identity with no assignment, execute the following in a private development
   SQL session, replacing the placeholder only in that session:

```sql
BEGIN;
INSERT INTO user_access_assignment (clerk_user_id, app_role, access_status)
VALUES ('<approved Clerk user ID>', 'SYSTEM_ADMIN', 'ACTIVE')
ON CONFLICT (clerk_user_id) DO NOTHING;
SELECT clerk_user_id, app_role, access_status
FROM user_access_assignment
WHERE clerk_user_id = '<approved Clerk user ID>';
COMMIT;
```

Use COORDINATOR for an approved coordinator. If a conflicting assignment exists,
the insert leaves it unchanged. Inspect and resolve it manually; do not treat a
conflict as a successful grant. For an explicitly approved existing ACTIVE student,
a trusted operator can change only that exact row using an UPDATE with predicates
on clerk_user_id, app_role = 'STUDENT' and access_status = 'ACTIVE', setting updated_at
= now(). Verify exactly one row changed. Suspended identities require a separate
explicit review; provisioning must not reactivate them.

Keep real IDs, credentials and SQL-session contents outside source control and logs.
There is no admin-bootstrap environment variable consumed at runtime and no role
editor/API in this sprint.

## API integration

FOUNDATION's request handler constructs `createAuthDependencies(env, profileReader)`
inside the request and calls `handleAuthRequest(request, deps)`. This returns a Response
for /api/me routes or null for another owner's route. Wrap both construction and
handler calls in try/catch, returning `authErrorResponse(error)` for failure. Do not
catch an auth error and continue to a protected handler.

All API authentication is **Authorization: Bearer <Clerk session token>**. Cookies alone
are rejected. Configure Vite's /api proxy or FOUNDATION's exact-origin CORS/OPTIONS handler
for cross-origin requests; allow Authorization and GET/POST as needed. Never use wildcard
credentialed CORS. The auth route adapter itself does not implement shared CORS.

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| GET | /api/me | Bearer token; no ownership ID | 200 { data: Me } |
| POST | /api/me/initialize | Bearer token; **no request body** | 200 { data: Me } |

The POST creates a student only if a valid institutional email exists and no assignment
is present. Existing approved staff can also use the completion flow without being
converted to students. Suspended accounts are rejected on both endpoints.

`Me` contains clerkUserId, appRole, accessStatus, profileState and landingPath.
Roles: STUDENT / COORDINATOR / SYSTEM_ADMIN. Status: ACTIVE / SUSPENDED (suspended users
receive 403, never a successful account response). Profile states: COMPLETE,
SETUP_REQUIRED, UNAVAILABLE, NOT_APPLICABLE. Landing paths: /student, /student/setup,
/coordinator, /admin. No email, JWT or provider secrets are returned.

Errors use `{ error: { code, message } }`. Auth errors are sanitized and no raw SDK/DB
errors are logged. Responses use Cache-Control: no-store.

- 400 BODY_NOT_ALLOWED: initialization payload supplied.
- 401 SESSION_REQUIRED / SESSION_INVALID / SESSION_ENDED: missing, expired or ended session.
- 403 EMAIL_UNVERIFIED / EMAIL_DOMAIN_DENIED / ACCOUNT_SUSPENDED / ROLE_DENIED /
  ACCESS_NOT_ASSIGNED / IDENTITY_DISABLED / PROFILE_SETUP_REQUIRED.
- 405 METHOD_NOT_ALLOWED with Allow header.
- 503 AUTH_UNAVAILABLE / AUTH_CONFIGURATION / CLERK_UNAVAILABLE / PROFILE_UNAVAILABLE:
  verification, persistence or integration unavailable; no claimed success.

Clerk token validation is restricted to session tokens and configured authorized parties.
Every request also checks live session status and the current user, so an ended session
cannot reuse a still-unexpired token. This intentionally depends on Clerk availability
and adds Backend API calls; do not cache verification if immediate logout rejection
must be preserved.

Other owners must call `authorize` before accessing private data:

```ts
const me = await authorize(request, deps, {
  roles: ['STUDENT'],
  requireProfile: true,
});
// Owner's repository query must use me.clerkUserId, never a browser-supplied owner ID.
```

P001's setup/profile handlers use roles: ['STUDENT'] without requireProfile, so the
student can complete setup. Academic records, offerings and pathway use requireProfile.
Coordinator/admin handlers use their explicit role list. A SYSTEM_ADMIN is not implicitly
a COORDINATOR or STUDENT. Explicitly include multiple roles only where intended.

P001 supplies `ProfileReader.stateFor(verifiedClerkUserId)`. Return COMPLETE only when
the persisted profile and required valid curriculum are present; SETUP_REQUIRED when
setup is incomplete; UNAVAILABLE only when integration is unavailable. Real read errors
must fail closed. If no reader is supplied, account access reports UNAVAILABLE and
/student/setup; academic authorization returns 503. No synthetic profile is created.

## UI integration

Mount `AuthProvider` around the existing React application, passing only the public key.
Register these components with FOUNDATION's router:

| Route | Element / guard |
| --- | --- |
| /sign-in/* | AuthPage mode="sign-in" |
| /sign-up/* | AuthPage mode="sign-up" |
| /auth/complete | AuthGate complete |
| /student/setup | AuthGate roles={['STUDENT']} around P001 setup or AuthDependencyPlaceholder area="setup" |
| /student and academic routes | AuthGate roles={['STUDENT']} requireProfile |
| /coordinator | AuthGate roles={['COORDINATOR']} around its placeholder |
| /admin | AuthGate roles={['SYSTEM_ADMIN']} around its placeholder |

Pass apiBaseUrl to every AuthGate if using a separate API origin. For a client router,
pass its current pathname to AuthGate, ensuring navigation triggers revalidation.
The provided redirect adapter uses full-page location.replace with a normal link
fallback; configure Vite/hosting SPA fallback for these paths. FOUNDATION may adapt it
to its router without changing authorization decisions.

AuthGate fetches account state after Clerk loads, avoids rendering a prior session's
result, cancels stale requests, rechecks on navigation/window focus and offers Retry
and Sign out on failures. 401 responses display session recovery; 403 responses
remain blocked. The backend must still guard every protected API request, including
requests after a role/email/status change while a page is open.

Only guarded placeholders are provided. The setup placeholder explicitly says profile
integration is unavailable; it cannot unlock academic features. Privileged placeholders
contain no dashboards or role editor.

## Verification and remaining acceptance

Checks executed in this session:
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd test`: 41 passed, 5 Neon tests skipped.
- `npm.cmd run build`: passed for browser and Worker-compatible auth module bundles.
- `npm.cmd run test:ui`: 11 checks passed in headless Chromium at a mobile viewport,
  using **mocked Clerk/API**, including keyboard retry, wrong-role denial, setup routing,
  expired-session recovery and logout failures.

The five optional Neon tests run when AUTH_TEST_DATABASE_URL is supplied to the test
process. They use a transaction-local temporary table with the migration's constraints;
the table drops on commit. No credentials are embedded. Real database uniqueness and
concurrent HTTP initialization still require development-service acceptance.

Not verified: real institutional email delivery/signup, real Clerk logout/token replay,
Neon persistence/migration execution, production Worker integration and full integrated Vite app build,
and integrated P001 setup. Module bundling is not a Worker runtime or deployment test.

After FOUNDATION and P001 integration, use approved test identities to verify:
1. New verified institutional signup initializes one student and reaches setup.
2. Wrong-domain/unverified primary email and external noncompliant email changes fail
   direct student API requests.
3. Repeated/concurrent initialization preserves one row, all existing roles and suspension.
4. Students get 403 on coordinator/admin APIs regardless of browser navigation or metadata.
5. A real expired token gets 401. After Clerk signOut resolves, replay the former token:
   the live session check must return 401.
6. Clerk/Neon outage yields a retryable failure without a success message or data leak.
7. A valid saved P001 profile/curriculum unlocks academic routes for that same identity.

No deployment, remote role provisioning, production changes, Git commit or PR was made.

## Local runner follow-up

See [p004-local.md](p004-local.md) for npm run dev. The local-only Vite page and real Wrangler/workerd API now pass browser/API smoke checks. Real Clerk and Neon acceptance still requires development credentials. See changes/S1-P004-004-local-auth-runner.md for the updated review and changelog.

## Database migration completion — 2026-10-24

P004 migration applied to project still-waterfall-91972583, branch
br-shy-cherry-azuzy9v5, database neondb. Live inspection confirmed the table, six
columns, defaults and constraints. All 5 Neon database tests passed, including after
the user's connection update. The current URL still resolves to the same endpoint/branch.
See changes/S1-P004-005-apply-access-migration.md. Restart local servers to reload the
updated environment; real browser signup/login acceptance remains separate.

## Empty initialization request fix — 2026-10-24

Incoming Workers can expose a non-null body stream for a zero-byte POST. The initializer
now checks actual bytes and continues to reject all nonempty payloads. Validation:
47 unit tests, 10 real HTTP regressions and typecheck/lint/module build passed.
See changes/S1-P004-007-empty-initialize-stream.md. Refresh the page and retry.

## User acceptance and Git handoff — 2026-10-24

The user reported that all four manual account/logout/role/idempotency checks passed,
following their Gmail and graduate-domain registration checks. This is user-reported
acceptance, distinct from automated browser tests. The P004 branch is prepared locally;
see p004-pr.md and changes/S1-P004-008-github-handoff.md. Human peer review is pending.

## Portable install verification — 2026-10-24

A registry-backed package-lock.json is now included. A fresh npm ci installed 204
packages without the original local dependency junctions. Typecheck, lint, module and
Vite builds passed in the clean installation, along with 47 unit tests and 11 mocked
browser checks. Five live database tests are opt-in and were skipped in that clean
installation; they passed separately against the configured Neon database earlier.
Use npm.cmd ci on a fresh checkout. Earlier cache-only/no-lock notes describe the
initial setup and are superseded by this verification.
