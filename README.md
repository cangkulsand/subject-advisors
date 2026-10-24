# Subject Advisors — Programmer 4, Sprint 1

P004 implements **UC01 registration** and **UC02 login/logout** for the UTMSPACE
academic advisory project. It includes Clerk identity verification, institutional
email checks, application roles/access status, Neon account binding, and a local
React/Vite + Cloudflare Worker authentication preview.

## Run locally

Requirements: Node.js 22.12+ and npm.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Stop both local servers with Ctrl+C.

The launcher creates blank local settings from templates only if the settings files
do not already exist. Without a browser key, the page displays setup instructions.

Set your selected Clerk application's **development** publishable key in
`.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=<development publishable key>
```

Set backend credentials in `.dev.vars`:

```dotenv
CLERK_PUBLISHABLE_KEY=<same development publishable key>
CLERK_SECRET_KEY=<matching development secret key>
DATABASE_URL=<Neon development database connection URL>
```

Apply `db/migrations/20261024_p004_user_access_assignment.sql` once to the chosen
development database if the table does not exist. Never rerun CREATE TABLE blindly.
Restart the local servers after editing settings.

The local preview needs internet access to Clerk and Neon. Its private API uses
the real provider/session checks, with no authentication bypass.

## P004 behavior

- Student primary email must be verified and have the exact domain graduate.utm.my.
- Initialization creates one STUDENT/ACTIVE assignment and preserves existing roles
  or suspended status.
- Session validation checks the current Clerk session, including ended/revoked sessions.
- Roles are STUDENT, COORDINATOR and SYSTEM_ADMIN, enforced on the backend.
- New students reach /student/setup; the actual profile form belongs to P001.
- Coordinator/admin routes are protected placeholders for later work.

The frontend uses port 5173 and proxies /api to the local Worker on port 8787.
This is an isolated P004 preview awaiting FOUNDATION integration.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npm.cmd run test:ui
npm.cmd run test:init-http
```

test:init-http requires the local servers. It sends deliberately invalid tokens to
verify bodyless initialization reaches session validation and nonempty payloads fail.
test:ui uses explicitly mocked Clerk/API responses in Chromium. Install its browser
once with `npx.cmd playwright install chromium`.

The five optional live database tests run when AUTH_TEST_DATABASE_URL points to an
approved test database. They use transaction-local temporary tables and do not create
persistent test accounts.

## Integration and review

- [Local setup](docs/p004-local.md)
- [API, schema, provisioning and integration handoff](docs/p004-auth-handoff.md)
- [P004 implementation plan](docs/p004-auth-plan.md)
- [Change records](docs/changes)
- [Prepared PR description](docs/p004-pr.md)

User-reported manual checks passed: registration/domain behavior, logout and sign-in,
student denial on privileged pages, and reuse of the existing STUDENT/ACTIVE record.
Human peer review and the shared FOUNDATION/P001 integration remain pending.

Secrets, dependency folders and generated output are ignored. Other programmers'
features are outside this P004 handoff.
