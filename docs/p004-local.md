# Run the authentication baseline locally

Requirements: Node.js 22.12+ and npm. From a checkout of main:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Ctrl+C stops both servers. On macOS/Linux, use npm.

Vite runs on port 5173 and proxies /api to the local Wrangler Worker on port 8787.
Cloudflare deployment/login is not required for this local preview. Real Clerk and
Neon services still require internet access.

## Configure credentials

The launcher creates .env.local and .dev.vars from the committed blank examples
only if the local files do not exist. It never overwrites existing settings.

.env.local contains only the public development key:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=<Clerk development publishable key>
```

.dev.vars contains backend settings:

```dotenv
CLERK_PUBLISHABLE_KEY=<same development publishable key>
CLERK_SECRET_KEY=<matching development secret key>
DATABASE_URL=<Neon development/test database URL>
```

Get access to the team's selected Clerk development application and intended Neon
development branch from the maintainer. All Clerk keys must belong to the same instance.
Enable email/password registration with email verification. Student access requires
the **current primary email** to be verified and end in the exact domain @graduate.utm.my.

Do not copy a secret key into any VITE variable or commit the local settings.
Restart npm.cmd run dev after changing those files.

## Database migration

On the selected development database, check whether public.user_access_assignment
already exists. Apply db/migrations/20261024_p004_user_access_assignment.sql once
only if absent. The launcher does not automatically migrate or deploy services.
Branches cloned from a migrated branch already include its schema.

The maintainer applied this migration on the originally configured Neon branch;
that does not prove it exists on a different developer's branch.

## Try the flow

Open /sign-up or /sign-in. After a verified institutional login,
/auth/complete initializes account access and directs students to /student/setup.
The setup form is a P001 dependency, so the current route displays an explicit placeholder.
Staff placeholders require approved assignments; see p004-auth-handoff.md.

The setup screen appears when no frontend public key is configured.
A generic configuration-presence check is available at /api/auth/local-status.
configured=true only means required settings were loaded; it is not a live-service test.

## Troubleshooting

- Configuration is incomplete: verify .dev.vars, then restart both servers.
- Database table missing: apply the P004 migration to the branch named by DATABASE_URL.
- Wrong/unverified email: resolve the current primary email in Clerk.
- Port 5173 or 8787 occupied: stop the previous local preview before starting another.
- Profile setup unavailable: expected until P001 integration; academic access stays blocked.

The auth preview entry points are under tools/auth/local; other modules remain owned
by their programmers. See README.md and CONTRIBUTING.md for the team workflow.
