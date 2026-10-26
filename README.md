# Subject Advisors

Initial `main` baseline for the AI-Powered Academic Advisory System for UTMSPACE
part-time students. Teammates can clone this repository, run it locally and develop
their assigned modules on separate feature branches.

This baseline includes **Programmer 4's Sprint 1 authentication (UC01 and UC02)**:
Clerk signup/login/logout, verified institutional email checks, server-side roles and
access status, and Neon account binding. Academic profile, records, offerings and
pathway features remain assigned to their respective programmers.

## Clone and run

Requirements: Node.js 22.12+ and npm.

```powershell
git clone https://github.com/cangkulsand/subject-advisors.git
cd subject-advisors
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Press Ctrl+C to stop the frontend and API.
On macOS/Linux, use `npm` instead of `npm.cmd`.

The launcher creates local settings from the committed blank templates only when
the files do not exist. With no browser key, the page shows setup instructions.

Set the Clerk **development** publishable key in `.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=<development publishable key>
```

Set backend credentials in `.dev.vars`:

```dotenv
CLERK_PUBLISHABLE_KEY=<same development publishable key>
CLERK_SECRET_KEY=<matching development secret key>
DATABASE_URL=<Neon development database connection URL>
```

Obtain development access from the project maintainer. All developers use the shared
Neon development branch development (br-shy-cherry-azuzy9v5, database neondb).
The DATABASE_FOUNDATION baseline now provides
a single migration workflow: see docs/database/README.md. Do not apply dated feature
migrations alongside the canonical baseline. Existing app data must be preserved.
Restart the servers after editing environment files. Credentials remain local and
are excluded by Git.

The frontend uses React/Vite on port 5173 and proxies /api to the Cloudflare Worker
running locally on port 8787. Clerk and Neon require an internet connection.
See [local setup](docs/p004-local.md) for provider and migration steps.

## Start your assigned work

```powershell
git switch main
git pull --ff-only
git switch -c feature/p001-s1-profile
```

Use the branch for your assigned owner:

| Owner | Branch example | Sprint 1 scope |
| --- | --- | --- |
| P001 | feature/p001-s1-profile | UC03 profile; UC04 academic records |
| P002 | feature/p002-s1-offerings | UC08 semester offerings |
| P003 | feature/p003-s1-pathway | UC17 pathway prototype |
| P004 | feature/p004-s1-auth-followup | UC01/UC02 authentication follow-up |
| FOUNDATION | chore/foundation-s1 | Shared app/API/catalogue/tooling integration |

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing shared files. Open feature PRs
against `main`; keep each PR within its selected owner scope.

## Current integration boundaries

- Shared auth identity and role checks: apps/api/src/modules/auth and middleware/auth.ts.
- Private data must be scoped to the Clerk user ID returned by server authorization.
- P001 supplies ProfileReader and the academic profile setup form. Missing profile
  integration keeps academic access blocked.
- Frontend components: apps/web/src/features/auth.
- tools/auth/local supplies the shared local app and API dispatcher. P001/P002
  canonical overlays are detected when npm run dev/build/typecheck/test starts.
- Database foundation: the 26-entity baseline is applied and SQL-validated on the
  confirmed Neon development branch; see docs/database/README.md for evidence.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npx.cmd playwright install chromium
npm.cmd run test:ui
```

With local servers running, `npm.cmd run test:init-http` exercises real HTTP body handling.
test:ui uses explicitly mocked Clerk/API responses. The five optional live database
tests require AUTH_TEST_DATABASE_URL and use temporary tables rather than persistent
test accounts.

The baseline passed a fresh npm ci, 47 unit tests, 11 mocked browser checks, lint,
typecheck and module/Vite builds. Five live Neon tests and ten real HTTP regressions
passed separately. The user also reported passing signup/domain, logout/sign-in,
privileged-page denial and account-idempotency checks. Peer review remains pending.

## Team documentation

- [Database foundation and execution gate](docs/database/README.md)
- [Paste-in P001/P002 routing integration](docs/integration-copy-paste.md)

- [Sprint 1 ownership and requirements](<docs/sprint1 (1).md>)
- [Mandatory implementation workflow](docs/implementationguide.md)
- [Shared theme guide](docs/themeguide.md)
- [Contributing](CONTRIBUTING.md)
- [Local setup](docs/p004-local.md)
- [Auth API, schema and integration handoff](docs/p004-auth-handoff.md)
- [P004 delivery summary](docs/p004-pr.md)
- [Change records](docs/changes)
