# Local Sprint 1 integration workspace

This checkout lives at D:\sharhan\development\production\subject advisors on
integration/sprint-1. The folder name does not select a production database or hosting.
Use the approved shared Neon development branch for development and tests.

## Source and repository

The shared source main was fetched from
https://github.com/cangkulsand/subject-advisors.git and fast-forwarded locally to
0ccac62c14e563fd5ba461a5002f48e71d99069c on 26 October 2026.
Origin remains the separate integration repository:
https://github.com/cangkulsand/subject-advisors-prod.git.
No commit or push of the local feature overlays was performed during this update.

The local P001 v1 files were checked against their manifest and upgraded using
P001-Sprint1-integrated.zip. Existing P002 source and its nine package commands
were preserved. Shared database/integration commands and dependency updates were
merged with those owner commands; root package/config snapshots were not blindly
replaced. The shared launcher detects both canonical owner modules.

## Settings and recovery

Private .env.local and .dev.vars retain their pre-update hashes and are ignored by
Git. Existing Clerk development keys and the shared Neon development endpoint remain
in use. No provider resource, schema migration or production deployment was performed.

Uncommitted source was backed up without secrets at:
D:\sharhan\development\handoffs\production-before-main-0ccac62
A Git autostash of the original tracked changes is retained as recovery evidence.
The package.json autostash conflict was resolved by preserving both the shared
scripts/dependencies and the existing P002 scripts. Do not pop the old stash as a
normal integration step; it represents the older baseline's package changes.

## Shared app

From this project root:

```powershell
npm.cmd run dev
```

Open http://127.0.0.1:5173. One shared local Worker uses port 8787. Ctrl+C stops the
launcher and its servers. Sign in using the existing development Clerk application.

- /student/setup and /student/profile: P001 profile setup/editing.
- /student and /student/records: P001 academic record attempts.
- /student/offerings: P002 student-reported semester offerings.

The shared Worker dispatches auth, profile/records and offerings requests and uses
P001's real ProfileReader for /api/me and P002 authorization. The P002 fictional demo
commands remain available separately; they are not the shared authenticated app.
P003's pathway feature has not been pasted or integrated in this checkout.

Approved programme/curriculum/subject/semester data is still required for a real
academic flow. Empty configuration is shown truthfully; no demo data is seeded.
Do not rerun retired feature migrations or reset the shared database.

## Verification and review

Follow docs/changes/S1-INT-003-pull-shared-main-and-p001.md for the current update's
actual test results. Run the shared typecheck/lint/tests/build commands, plus
npm.cmd run test:ui:integration for mocked browser navigation. Human review and
real two-student Clerk/browser acceptance remain pending. Feature overlays and local
integration documentation remain uncommitted until explicitly reviewed/published.
