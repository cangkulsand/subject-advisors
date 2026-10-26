# Shared integration and copy-paste feature handoffs

Use the updated main repository as the shared starting point. The Git branch and
Neon branch are different concepts: main is the shared Git baseline; development
is the selected Neon database branch (br-shy-cherry-azuzy9v5).

## Install owner packages

1. Obtain the latest main source with these routing changes. Preserve local work
   before updating a checkout. Use the updated integration-ready P001 ZIP.
2. Extract owner ZIPs outside the project, then merge their owned apps/, packages/,
   tools/, docs/ and test fixture files into the project root. Review collisions.
   P002's root overlay must include its shared types and tools/offerings/demo test
   fixtures as well as API/UI source; copying only the offering module omits tests.
3. Preserve the shared package.json, lockfile, .gitignore, auth files and router.
   Older P002 overlays contain snapshots of root package.json/.gitignore: merge
   only missing owner scripts, or regenerate that overlay against updated main.
   Replacing those root snapshots would erase shared integration/database scripts.
4. Configure the existing private Clerk/Neon development settings and run:

```powershell
npm.cmd ci
npm.cmd run prepare:integration
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:local
npm.cmd run dev
```

Open http://127.0.0.1:5173. One shared Worker runs on 8787. Stop a previous preview
with Ctrl+C before starting another one on those ports. Restart dev after pasting
modules; no hand-editing of the shared router is needed.

No schema migration is required for either feature overlay. Canonical versions
0000–0002 are already applied to the selected development DB. Do not apply retired
feature-level SQL or replace tables. Approved curriculum/semester data remains a
separate prerequisite; no fictional catalogue is inserted by the integration shell.

## Canonical module contracts

| Owner | API entry | Web entry |
| --- | --- | --- |
| P001 | apps/api/src/modules/profile/index.ts: createP001Dependencies, handleP001Request | features/profile/ProfilePage.tsx, profile/client.ts, records/RecordsPage.tsx under apps/web/src |
| P002 | apps/api/src/modules/offerings/index.ts: createOfferingHandler | apps/web/src/features/offerings/index.ts: OfferingsPage, createOfferingClient |

P001's generated auth dependencies include its actual ProfileReader. The same reader
is used by /api/me and supplied to P002's createOfferingHandler. If P001 is missing,
the P002 reader reports UNAVAILABLE and academic authorization fails closed. No
mock identity, profile, completion flag or demo client is used in generated adapters.

Only the canonical apps/ locations are detected. A private p002/ directory or an
unextracted ZIP is not installed automatically. API and web presence are detected
independently; incomplete entry-point copies raise a readable preparation error.

## Shared routes

| Web route | Shared guard / owner |
| --- | --- |
| /student/setup | Active STUDENT; P001 setup form without requiring prior completion |
| /student/profile | Active STUDENT; P001 profile form |
| /student and /student/records | Active STUDENT with complete profile; P001 records |
| /student/offerings | Active STUDENT with complete profile; P002 offering page |
| /student/pathway | Active STUDENT with complete profile; P003 placeholder until UC17 is implemented |

Profile, records and offerings links share the same student navigation. Page state
is remounted on Clerk user/session change. Authentication and staff routes retain
their existing implementation. Missing pages show a truthful unavailable state.

| API route | Handler |
| --- | --- |
| /api/me and /api/me/initialize | Existing P004 handler with installed ProfileReader |
| /api/profile, /api/profile/options, /api/academic-records and record-ID updates | P001 handler |
| /api/semester-offerings GET/PUT | P002 createOfferingHandler / handleOfferingRequest |

The dispatcher forwards the original Request, including queries and body. Owners
retain validation, role/profile checks and owner-scoped persistence. Missing owned
APIs still verify real student access before returning 503 FEATURE_NOT_INSTALLED;
they do not produce fake successful reads/saves.

## P003 pathway skeleton

Academic pathway is already registered in the student sidebar, page search and
shared route host. Its replaceable entry is
`apps/web/src/features/pathway/PathwayPage.tsx`, exported by the adjacent `index.ts`.
The route passes the existing `StudentPageProps` contract and keeps Clerk mounted.
This skeleton is imported directly; it does not require generated registry edits.
No graph, graph API handler, React Flow dependency or status calculations have
been added. See [P003 Sprint 1 handoff](p003-sprint1-handoff.md) for the owned paths,
read-only API integration still needed and acceptance checklist.

## Generated adapters and checks

tools/integration/prepare.mjs generates ignored .generated-integration/api.ts,
web.tsx and status.json. These contain static imports of installed modules, not
credentials or feature implementations. Do not commit the generated files.
The standard dev/build/typecheck/test commands prepare them automatically.
For a direct tsc/Vite invocation, run prepare:integration first.

Additional checks:

```powershell
npm.cmd run test:integration
npm.cmd run test:ui:integration
```

The browser check uses explicit Clerk/API mocks. In an isolated review copy with
both real owner overlays installed, run node tools/integration/test-ui.mjs --installed
to exercise the actual combined profile/record/offering pages and navigation.
This is not real-account/live database acceptance. Independent review and two-user
real Clerk/browser testing remain required before release.

Keep each owner's files/change record in that owner's reviewed commit. The shared
repo push excludes the private p002/ tree and separately delivered P001 feature code.
