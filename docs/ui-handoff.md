# Shared UI template handoff

This update provides **only the shared presentation and page skeletons** on top
of the existing shared main foundation. P001/P002 feature code and production
session/data caching are not part of this update. Existing backend, database,
Clerk session/access policy and package manifests are unchanged.

## For developers starting from a clone

Before starting feature edits:

```powershell
git switch main
git pull --ff-only origin main
npm.cmd ci
```

Use the private environment files already supplied by the maintainer. They are
not included in the UI ZIP or Git commit. Paste your own feature ZIP's owned
files into the project root, preserving the shared router, shell, package.json,
lockfile and environment files. Use the P001 integrated ZIP, not its older router
snapshot. Review collisions before replacing files. Then run:

```powershell
npm.cmd run prepare:integration
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:local
npm.cmd run dev
```

If you have pulled this UI update, **do not also paste the UI ZIP**: it contains
the same shared files for offline/manual delivery. A developer still on base
`0ccac62` can instead extract `Shared-UI-template.zip` outside the project, copy
the contents of `payload/` into the project root, and review its manifest. Apply
the UI overlay before the feature ZIP. Never copy a wrapper folder as the app.

No new migration or environment variable is needed for the UI. Use the team's
already selected development database and migration workflow; do not reset it.

## What is present

- Burgundy #521f28 primary theme with coordinated light/dark tokens.
- Responsive sidebar/header, mobile drawer, page search, account dropdown and
  existing Clerk sign out. Layout component: `apps/web/src/app/StudentShell.tsx`.
- Profile/setup, records and offerings route slots for the installed owner ZIPs.
- Academic pathway menu at `/student/pathway` with a clearly unfinished P003 page.
  Replace `apps/web/src/features/pathway/PathwayPage.tsx`, keeping the named export
  and `StudentPageProps` interface. P003's graph/API work remains unimplemented.

Student academic routes retain existing active-STUDENT/profile-setup guards.
Without P001/P002 modules, the corresponding pages show an unavailable message;
that is intentional and not a completed feature. Without P001's real profile
reader, profile-dependent access remains unavailable until that feature is pasted.
The skeleton does not pretend an academic profile exists.

## Preserve feature contracts

Keep `app/feature-contracts.ts`, `tools/integration/prepare.mjs` and the existing
API dispatcher. The generated registry still detects only canonical owner files.
Do not copy `.generated-integration/`, backend code or API clients from the separate
production checkout to install a theme. P001/P002 own their feature behavior.

This UI-only handoff uses ordinary links and the existing document routing. It
does not introduce cached account/data behavior or native History API navigation.
Incoming feature forms' existing beforeunload warnings therefore continue to work.
The production checkout's SPA/session-cache improvements are a separate change.

Use the shared CSS variables for new feature colors. If your feature CSS contains
fixed colors, map its local tokens to `--color-brand`, `--color-brand-hover`,
`--color-accent`, `--color-focus`, `--color-surface`, `--color-body`, and semantic
status tokens. Do not replace the shell or add a second Clerk provider.

## Git impact

This is an additive commit on shared main, not a merge of the production repo's
full history. Developers who have not started work can pull and then apply their
feature ZIP. Existing branches retain their commits; future merges can require
review when they touch the same shared UI files. Do not use force push or reset
teammates' local changes. The separate production repository is unaffected.
