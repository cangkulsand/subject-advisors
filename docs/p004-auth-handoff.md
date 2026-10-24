# P004 auth integration handoff — UC01 and UC02

The initial main branch includes working P004 authentication and a local preview.
User-reported signup/domain, logout/sign-in, role-page denial and idempotency checks
passed. The remaining FOUNDATION and other programmer integrations are separate work.

## Modules and schema

- apps/api/src/modules/auth: contracts, Clerk verification, policy, Neon repository and endpoints.
- apps/api/src/middleware/auth.ts: server-side role/status/profile authorization.
- apps/web/src/features/auth: React provider/pages/guards/logout and bearer API client.
- db/migrations/20261024_p004_user_access_assignment.sql: access assignments only.
- tools/auth/local: local browser and Worker adapters.
- docs/changes: implementation and operational history, including initial setup limitations
  and the subsequent fixes/verification that superseded them.

The table has UUID primary key, unique Clerk user ID, role/status checks, nonempty identity
check, and timestamps. Initialization inserts STUDENT/ACTIVE with ON CONFLICT DO NOTHING,
then reads the persisted assignment. It never upgrades an existing role or reactivates
suspension. No StudentProfile or fake curriculum is created.

## Local setup

See [p004-local.md](p004-local.md). npm.cmd ci is supported by the committed registry-backed
lockfile and was verified in a clean directory without the initial machine's dependency links.

Browser key: VITE_CLERK_PUBLISHABLE_KEY in .env.local.
Backend: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY and DATABASE_URL in .dev.vars.
The local Wrangler config supplies CLERK_AUTHORIZED_PARTIES for the two localhost origins.
Production bindings must be configured separately; no production deployment is included.

## API contract

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| GET | /api/me | Clerk bearer session token | 200 { data: Me } |
| POST | /api/me/initialize | Clerk bearer token; no payload bytes | 200 { data: Me } |

Cookie-only API requests are rejected. Empty incoming HTTP body streams are accepted;
any nonempty initialization payload is rejected before identity binding. User IDs, roles,
status and profile completion are never taken from browser parameters or metadata.

Me contains clerkUserId, appRole, accessStatus, profileState and landingPath.
Roles: STUDENT, COORDINATOR, SYSTEM_ADMIN. Statuses: ACTIVE, SUSPENDED.
Suspended accounts receive 403 rather than a successful Me response.
Profile states: COMPLETE, SETUP_REQUIRED, UNAVAILABLE, NOT_APPLICABLE.
Destinations: /student, /student/setup, /coordinator, /admin.

Errors use { error: { code, message } }; responses use Cache-Control: no-store.
Typical codes: SESSION_REQUIRED / SESSION_INVALID / SESSION_ENDED (401);
EMAIL_UNVERIFIED / EMAIL_DOMAIN_DENIED / ACCOUNT_SUSPENDED / ROLE_DENIED /
ACCESS_NOT_ASSIGNED / IDENTITY_DISABLED / PROFILE_SETUP_REQUIRED (403);
BODY_NOT_ALLOWED (400), METHOD_NOT_ALLOWED (405), and sanitized configuration/provider/
database/profile failures (503). No raw SDK/DB errors, tokens or connection URLs are logged.

## Backend registration and authorization

Create dependencies per request with createAuthDependencies(env, profileReader).
Call handleAuthRequest(request, deps); null delegates to another owner's routes.
Wrap dependency creation and handlers in error handling using authErrorResponse.
An auth error must never fall through into a protected handler.

FOUNDATION's shared router must provide exact-origin CORS/OPTIONS when using a separate
API origin. The current Vite proxy avoids browser CORS for local /api requests.

For academic APIs:

```ts
const me = await authorize(request, deps, {
  roles: ['STUDENT'],
  requireProfile: true,
});
// Use me.clerkUserId in the owner's data query.
```

P001 setup/profile handlers use roles: ['STUDENT'] without requireProfile.
The records/offerings/pathway handlers require a valid profile. Staff handlers specify
their intended role list; SYSTEM_ADMIN does not implicitly become another role.

Clerk verification uses its backend SDK, session tokens only, exact authorized parties,
a live session lookup and the current user. Student primary email is rechecked on
every protected request. Ended sessions cannot reuse a still-unexpired signed token.
This deliberately adds provider calls and fails closed during an outage.

## P001 profile interface

Implement ProfileReader.stateFor(verifiedClerkUserId).
Return COMPLETE only for a persisted profile with the required valid curriculum;
SETUP_REQUIRED for incomplete setup; UNAVAILABLE for missing integration.
Real database failures must fail closed.

Without a reader, Me reports UNAVAILABLE and directs the student to /student/setup.
Academic authorization returns 503. No default or fictional profile is synthesized.

## Frontend registration

AuthProvider wraps the app with only the public key. Register:

| Route | Component/guard |
| --- | --- |
| /sign-in/* | AuthPage mode=sign-in |
| /sign-up/* | AuthPage mode=sign-up |
| /auth/complete | AuthGate complete |
| /student/setup | AuthGate roles={['STUDENT']} around P001 setup |
| Student academic routes | AuthGate roles={['STUDENT']} requireProfile |
| /coordinator | AuthGate roles={['COORDINATOR']} |
| /admin | AuthGate roles={['SYSTEM_ADMIN']} |

The current local adapters provide explicit missing-feature placeholders.
For a client router, pass current pathname into AuthGate for revalidation.
Pass apiBaseUrl if the API is not served via /api on the browser origin.
The redirect adapter uses location.replace and requires SPA path fallback.
AuthGate cancels stale requests and rechecks on route changes and window focus.
The backend remains authoritative for all API access.

## Trusted staff provisioning

A trusted database owner must identify the specifically approved Clerk user out of band,
inspect its existing assignment, and provision that exact identity in a private development
SQL session. Never select an arbitrary first/latest registrant or accept browser role input.

For an unassigned approved identity:

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

Use COORDINATOR for an approved coordinator. A conflict is not a successful grant:
inspect it instead of overwriting/re-activating it. Changing an existing assignment
requires the operator's explicit authorization and predicates matching the expected
old role/status, plus an updated timestamp and row-count verification.
No public privileged-role endpoint or role editor is provided.

## Verification and remaining work

- Clean npm ci, typecheck, lint, 47 unit tests, module build and Vite build passed.
- Eleven browser checks passed using explicitly mocked Clerk/API.
- Ten real HTTP checks confirmed empty initialization requests reach authentication and
  nonempty bodies fail.
- Five live Neon migration/constraint tests passed using temporary test tables.
- Clerk development credentials and the configured database connection were verified.
- The user reported real domain/signup, logout/sign-in, privileged-page denial and
  idempotent STUDENT/ACTIVE account behavior passed.

Default unit-test runs skip live DB tests unless AUTH_TEST_DATABASE_URL is supplied.
No provider credentials, test identities or local database URL are committed.
Other developers must verify their own local settings/database branch.

Human peer review, the shared production app/API shell, catalogue data, P001 setup,
P002 offerings and P003 pathway remain separate integration responsibilities.
