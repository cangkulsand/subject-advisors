# Run the P004 auth preview locally

Use **Node.js 22.12+ and npm** from PowerShell, then open the app in your browser.

## Start

```powershell
Set-Location 'D:/sharhan/development/subject advisors'
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Ctrl+C stops the frontend and API.

This command starts Vite on port 5173 and the local Wrangler Worker on port 8787.
Vite proxies /api requests to the Worker. No Cloudflare login or public deployment is
needed to run these local servers. The launcher creates blank .env.local and .dev.vars
from templates only when those files do not exist; it never replaces existing settings.

On this machine the dependencies are available from the local package cache.
On a fresh checkout, first run `npm.cmd install`. Registry access was blocked in the
coding environment; the ignored local dependency links are not portable and no fresh
install/lockfile verification is claimed.

## Enable real signup and login

Without settings the browser displays a setup screen. Add values in your editor:

**.env.local** (public browser key only):
```dotenv
VITE_CLERK_PUBLISHABLE_KEY=<Clerk development publishable key>
```

**.dev.vars** (backend only, ignored by Git):
```dotenv
CLERK_PUBLISHABLE_KEY=<same development publishable key>
CLERK_SECRET_KEY=<matching development secret key>
DATABASE_URL=<Neon development/test branch connection string>
```

Use the existing Clerk application **app_3L8qWHdSOTcQ57axExEj4T6USV5**.
Use its **development** instance. Enable email/password registration and email
verification. Student access requires a verified primary @graduate.utm.my address.
The frontend and backend keys must belong to that same instance.
Do not paste secret keys into chat or put them in VITE variables.

For Neon project **still-waterfall-91972583**, use a development/test branch. The older
neonsetup.md command names production; it is not used by this local launcher.
Apply `db/migrations/20261024_p004_user_access_assignment.sql` once to the selected
development database using the Neon SQL editor or your migration runner. The local
launcher does not create tables, deploy services or apply production migrations.

Restart `npm.cmd run dev` after changing credentials. Open /sign-up or /sign-in.
After authentication, /auth/complete initializes account access and redirects to
/student/setup. That page is an explicit placeholder while P001's profile setup
is unavailable. Coordinator/admin access requires trusted provisioning as documented
in p004-auth-handoff.md.

## What runs

- Frontend: React/Vite at http://127.0.0.1:5173.
- API: Cloudflare Worker running locally via Wrangler at http://127.0.0.1:8787.
- Authentication: the real Clerk development service after configuration.
- Database: the real Neon development branch after configuration.

Clerk and Neon still require an internet connection. This is a local app connected to
those services, not an offline replacement. No mocked auth is included in the launcher.

The local entry points live under tools/auth/local; they are an isolated P004 preview.
No profile forms, records, offerings, pathway or later-sprint dashboards are implemented.

## Commands

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npm.cmd run test:ui
npm.cmd run types:local
```

build produces the reusable auth modules; build:local builds the preview frontend.
types:local regenerates Worker environment declarations after changing configuration.
Keep both generated types and credentials aligned when merging with FOUNDATION.

If port 5173 or 8787 is in use, stop the previous local instance and retry. Ports do
not silently change because the Clerk authorized origins must remain consistent.

Configuration presence is not a live-service verification. Real email delivery,
login/logout, Neon persistence and the migration still require testing with configured
development credentials.

References: [Wrangler local development](https://developers.cloudflare.com/workers/local-development/),
[Vite server configuration](https://vite.dev/config/server-options).

## Portable install verification — 2026-10-24

A registry-backed package-lock.json is now included. A fresh npm ci installed 204
packages without the original local dependency junctions. Typecheck, lint, module and
Vite builds passed in the clean installation, along with 47 unit tests and 11 mocked
browser checks. Five live database tests are opt-in and were skipped in that clean
installation; they passed separately against the configured Neon database earlier.
Use npm.cmd ci on a fresh checkout. Earlier cache-only/no-lock notes describe the
initial setup and are superseded by this verification.
