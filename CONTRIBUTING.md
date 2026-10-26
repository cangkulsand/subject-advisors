# Contributing

Use `main` as the shared starting branch. Develop on a feature branch and open a
pull request back to main.

## Before changes

Read [Sprint 1](<docs/sprint1 (1).md>), [the implementation workflow](docs/implementationguide.md)
and, for UI work, [the theme guide](docs/themeguide.md). Select exactly one programmer
or FOUNDATION scope for the task.

Create a docs/changes record before implementation, then complete its Plan,
Implementation, Review and Changelog sections with actual evidence. Self-review is
not peer approval.

## Start a branch

```powershell
git switch main
git pull --ff-only
git switch -c feature/p002-s1-offerings
```

Use the corresponding owner name from the README. Work in the directories assigned
by Sprint 1. Integrate into this checkout instead of copying a second standalone
application, package manager or authentication service into it.

Coordinate changes to package.json, lockfile, common contracts, app/API entry points,
routing, migrations and shared UI configuration. Include their impact in the change record
and PR. This main baseline supplies working P004 auth; it does not mark the remaining
FOUNDATION or other programmer tasks complete.

## Authentication contracts

Use P004's server-side authorize middleware before private handlers. Scope owned
data using the returned clerkUserId. Never take a browser-provided owner ID or role
as authorization.

P001 profile/setup handlers allow authenticated students before profile completion.
Academic feature handlers also require profile completion. P001 implements ProfileReader;
until then, profile-dependent access remains blocked.

Read [the auth handoff](docs/p004-auth-handoff.md) for endpoint shapes, role decisions,
profile integration and trusted staff provisioning.

## Local services and secrets

Run npm.cmd ci, configure local development settings, then npm.cmd run dev.
Use the shared Neon development branch and approved Clerk development instance.
Do not change production resources as part of local feature setup.

For manual P001/P002 delivery, follow [copy-paste integration](docs/integration-copy-paste.md).
The shared launcher prepares ignored owner registries automatically; profile, records
and offerings use one navigation and Worker. Preserve shared package/router files when
merging overlays, and include owner tests/fixtures. Run prepare:integration before a
direct tsc/Vite command. The private p002/ tree is not auto-loaded or part of this baseline.

.env.local and .dev.vars are ignored. Commit only blank examples. Obtain credentials
privately from the project maintainer, and never add real student records to fixtures.

## Before a PR

Run checks appropriate to the changed module and the repository's typecheck, lint,
test and build commands. Unit tests skip the optional live database checks unless
AUTH_TEST_DATABASE_URL is configured. Label mocked and live test results separately.

Review git diff and staged paths. Stage your own files explicitly; do not include
another programmer's uncommitted work. Update the associated change record and list
integration dependencies. A teammate/integration lead should review before merging.
